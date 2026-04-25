import { User } from "firebase/auth";
import { onValue, push, ref, remove, set } from "firebase/database";
import { auth, database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import { TrackTrailRoute } from "../models/alerts";
import { loadOfflineCache, saveOfflineCache } from "../storage/offlineCache";

const OFFLINE_CACHE_OFFICIAL_ROUTES_KEY = "official_routes";
const OFFLINE_CACHE_USER_ROUTES_PREFIX = "user_routes:";
const isPermissionDeniedMessage = (message?: string | null) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("permission_denied") || normalized.includes("permissão");
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toCoordinate = (value: any): { latitude: number; longitude: number } | undefined => {
  if (Array.isArray(value) && value.length >= 2) {
    const first = toNumber(value[0]);
    const second = toNumber(value[1]);
    if (first !== null && second !== null) {
      // Compatibilidade com formatos [lat, lng] e [lng, lat].
      if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        return { latitude: first, longitude: second };
      }
      if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
        return { latitude: second, longitude: first };
      }
    }
  }

  const latitude = toNumber(value?.latitude);
  const longitude = toNumber(value?.longitude);

  if (latitude === null || longitude === null) {
    return undefined;
  }

  return { latitude, longitude };
};

const toCoordinates = (value: any): { latitude: number; longitude: number }[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toCoordinate(item))
    .filter((item): item is { latitude: number; longitude: number } => Boolean(item));
};

const normalizeRegionToken = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const buildRegionKey = (city?: string, state?: string, country?: string) => {
  const normalizedCity = normalizeRegionToken(city);
  const normalizedState = normalizeRegionToken(state);
  const normalizedCountry = normalizeRegionToken(country);
  if (!normalizedState && !normalizedCountry) return "";
  return `${normalizedCity}|${normalizedState}|${normalizedCountry}`;
};

const toStringSafe = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
};

const toNullableNumber = (value: unknown): number | null => {
  const parsed = toNumber(value);
  return parsed === null ? null : parsed;
};

const toBooleanSafe = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "sim" || normalized === "1") return true;
    if (normalized === "false" || normalized === "nao" || normalized === "não" || normalized === "0") {
      return false;
    }
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toStringSafe(item))
    .filter((item): item is string => Boolean(item));
};

const normalizeRoute = (id: string, raw: any): TrackTrailRoute => {
  const city = toStringSafe(raw?.city || raw?.cidade);
  const state = toStringSafe(raw?.state || raw?.estado || raw?.uf);
  const country = toStringSafe(raw?.country || raw?.pais || raw?.país || "Brasil");
  const normalizedRegionKey = toStringSafe(raw?.regionKey) || buildRegionKey(city, state, country);
  const regionalLabel = [city, state].filter(Boolean).join(" - ") || state || country;
  const isAmbassadorCurated =
    toBooleanSafe(raw?.isAmbassadorCurated ?? raw?.curadoriaLocal ?? raw?.rotaEmbaixador) || false;

  const path = toCoordinates(raw?.rotaCompleta);
  const fallbackStartPoint = path[0];
  const fallbackEndPoint = path.length > 1 ? path[path.length - 1] : undefined;

  return {
    id,
    titulo: String(raw?.titulo || raw?.nome || "Rota sem nome"),
    tipo: String(raw?.tipo || "Trilha"),
    userId: toStringSafe(raw?.userId || raw?.sugeridoPor),
    userEmail: toStringSafe(raw?.userEmail || raw?.emailAutor) || null,
    visibility:
      raw?.visibility === "friends" || raw?.visibility === "private"
        ? raw.visibility
        : "public",
    descricao: raw?.descricao ? String(raw.descricao) : "Sem descrição disponível.",
    dificuldade: raw?.dificuldade ? String(raw.dificuldade) : "Não informada",
    distancia: raw?.distancia ? String(raw.distancia) : undefined,
    tempoEstimado: toStringSafe(raw?.tempoEstimado || raw?.tempo_estimado) || null,
    duracaoSegundos: toNullableNumber(raw?.duracaoSegundos ?? raw?.duracao_segundos),
    terreno: toStringSafe(raw?.terreno) || null,
    elevacaoGanhoM: toNullableNumber(raw?.elevacaoGanhoM ?? raw?.elevacao_ganho_m),
    elevacaoPerdaM: toNullableNumber(raw?.elevacaoPerdaM ?? raw?.elevacao_perda_m),
    city,
    state,
    country,
    regionKey: normalizedRegionKey || undefined,
    regionalLabel: regionalLabel || undefined,
    isAmbassadorCurated,
    curatorName: toStringSafe(raw?.curatorName || raw?.curador),
    localHighlights: toStringArray(raw?.localHighlights || raw?.destaquesLocais),
    startPoint: toCoordinate(raw?.startPoint) || fallbackStartPoint,
    endPoint: toCoordinate(raw?.endPoint) || fallbackEndPoint || fallbackStartPoint,
    rotaCompleta: path,
  };
};

type SaveManualRouteInput = {
  title: string;
  type: string;
  difficulty?: string;
  estimatedTime?: string | null;
  terrain?: string | null;
  durationSeconds?: number | null;
  elevationGainM?: number | null;
  elevationLossM?: number | null;
  description?: string;
  visibility?: "public" | "friends" | "private";
  points: { latitude: number; longitude: number }[];
  distanceKm: number;
};

export const subscribeOfficialRoutes = (
  onChange: (routes: TrackTrailRoute[]) => void,
  onError?: (message: string) => void
) => {
  const routesRef = ref(database, "rotas_oficiais");

  // Carrega cache local imediatamente para evitar tela vazia ou erro de timeout
  loadOfflineCache<TrackTrailRoute[]>(OFFLINE_CACHE_OFFICIAL_ROUTES_KEY).then((cache) => {
    if (cache?.data?.length) {
      onChange(cache.data);
    }
  }).catch(() => {});

  return onValue(
    routesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        saveOfflineCache(OFFLINE_CACHE_OFFICIAL_ROUTES_KEY, []);
        return;
      }

      const raw = snapshot.val();
      const routes = Object.keys(raw)
        .map((key) => normalizeRoute(key, raw[key]))
        .filter((route) => route.startPoint && (route.visibility || "public") === "public");

      onChange(routes);
      saveOfflineCache(OFFLINE_CACHE_OFFICIAL_ROUTES_KEY, routes);
    },
    async (error) => {
      const fallback = await loadOfflineCache<TrackTrailRoute[]>(OFFLINE_CACHE_OFFICIAL_ROUTES_KEY);
      const cachedOfficialRoutes = fallback?.data || [];
      const errorMessage = normalizeFirebaseErrorMessage(error);
      const permissionDenied = isPermissionDeniedMessage(errorMessage);

      // Em erro de permissão, não exibir cache para evitar "rotas fantasmas" após remoção no backend.
      if (permissionDenied) {
        onChange([]);
        onError?.(errorMessage);
        return;
      }

      if (cachedOfficialRoutes.length) {
        onChange(cachedOfficialRoutes);
        // Mensagem padronizada que a HomeScreen ignora na UI (via isOfflineFallbackMessage)
        onError?.("Sem conexão. Exibindo rotas em cache offline.");
        console.log("[routes] Falling back to offline cache due to connection issue.");
        return;
      }
      onError?.(normalizeFirebaseErrorMessage(error, "Falha ao carregar rotas."));
    }
  );
};

export const subscribeUserRoutes = (
  userId: string,
  onChange: (routes: TrackTrailRoute[]) => void,
  onError?: (message: string) => void
) => {
  const routesRef = ref(database, `users/${userId}/rotas_tracadas`);
  const cacheKey = `${OFFLINE_CACHE_USER_ROUTES_PREFIX}${userId}`;

  // Carrega cache local imediatamente
  loadOfflineCache<TrackTrailRoute[]>(cacheKey).then((cache) => {
    if (cache?.data?.length) {
      onChange(cache.data);
    }
  }).catch(() => {});

  return onValue(
    routesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        saveOfflineCache(cacheKey, []);
        return;
      }

      const raw = snapshot.val();
      const routes = Object.keys(raw)
        .map((key) => {
          const normalized = normalizeRoute(key, raw[key]);
          return normalized.userId ? normalized : { ...normalized, userId };
        })
        .filter((route) => route.startPoint);

      onChange(routes);
      saveOfflineCache(cacheKey, routes);
    },
    async (error) => {
      const fallback = await loadOfflineCache<TrackTrailRoute[]>(cacheKey);
      const cachedUserRoutes = fallback?.data || [];
      const errorMessage = normalizeFirebaseErrorMessage(error);
      const permissionDenied = isPermissionDeniedMessage(errorMessage);

      if (permissionDenied) {
        onChange([]);
        onError?.(errorMessage);
        return;
      }

      if (cachedUserRoutes.length) {
        onChange(cachedUserRoutes);
        onError?.("Sem conexão. Exibindo suas rotas salvas em cache offline.");
        return;
      }
      onError?.(normalizeFirebaseErrorMessage(error, "Falha ao carregar suas rotas."));
    }
  );
};

export const calculateDistanceKm = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number => {
  const R = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const saveManualRoute = async (input: SaveManualRouteInput, user: User | null) => {
  if (!user) {
    throw new Error("Você precisa estar logado para salvar uma rota.");
  }
  if (!auth.currentUser?.uid || auth.currentUser.uid !== user.uid) {
    throw new Error("Sessão inválida para salvar rota.");
  }

  const routeName = input.title?.trim();
  if (!routeName) {
    throw new Error("Informe um nome para a rota.");
  }

  if (!Array.isArray(input.points) || input.points.length < 2) {
    throw new Error("Defina ao menos dois pontos no mapa.");
  }

  const normalizedPoints = input.points
    .map((point) => toCoordinate(point))
    .filter((point): point is { latitude: number; longitude: number } => Boolean(point));

  if (normalizedPoints.length < 2) {
    throw new Error("Coordenadas inválidas para salvar a rota.");
  }

  const startPoint = normalizedPoints[0];
  const endPoint = normalizedPoints[normalizedPoints.length - 1];
  const distanceLabel = `${Math.max(input.distanceKm, 0).toFixed(2)} km`;
  const createdAt = new Date().toISOString();
  const visibility =
    input.visibility === "public" || input.visibility === "private" || input.visibility === "friends"
      ? input.visibility
      : "public";

  const payload = {
    nome: routeName,
    titulo: routeName,
    tipo: input.type || "Trilha",
    dificuldade: input.difficulty || "Média",
    tempoEstimado: input.estimatedTime?.trim() || null,
    duracaoSegundos:
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? Math.max(0, Math.round(input.durationSeconds))
        : null,
    terreno: input.terrain?.trim() || null,
    descricao: input.description?.trim() || "Rota criada manualmente pelo usuário.",
    elevacaoGanhoM:
      typeof input.elevationGainM === "number" && Number.isFinite(input.elevationGainM)
        ? Number(input.elevationGainM.toFixed(1))
        : null,
    elevacaoPerdaM:
      typeof input.elevationLossM === "number" && Number.isFinite(input.elevationLossM)
        ? Number(input.elevationLossM.toFixed(1))
        : null,
    distancia: distanceLabel,
    startPoint,
    endPoint,
    rotaCompleta: normalizedPoints,
    visibility,
    origem: "manual_trace",
    criadoEm: createdAt,
    country: "Brasil",
    userId: user.uid,
    sugeridoPor: user.uid,
    emailAutor: user.email || null,
    userEmail: user.email || null,
  };

  if (visibility === "public") {
    const pendingRouteRef = push(ref(database, "rotas_pendentes"));
    await set(pendingRouteRef, {
      ...payload,
      status: "pendente",
    });

    return {
      id: pendingRouteRef.key,
      reviewRequired: true,
      ...payload,
    };
  }

  const userRouteRef = push(ref(database, `users/${user.uid}/rotas_tracadas`));
  await set(userRouteRef, {
    ...payload,
    status: visibility === "private" ? "privada" : "friends_only",
  });

  return {
    id: userRouteRef.key,
    reviewRequired: false,
    ...payload,
  };
};

export const deleteUserRoute = async (userId: string, routeId: string) => {
  if (!userId?.trim()) {
    throw new Error("Usuário inválido para excluir rota.");
  }
  if (!routeId?.trim()) {
    throw new Error("Rota inválida para exclusão.");
  }
  const currentUid = auth.currentUser?.uid || "";
  if (!currentUid || currentUid !== userId) {
    throw new Error("Operação não autorizada para este usuário.");
  }

  try {
    await remove(ref(database, `users/${userId}/rotas_tracadas/${routeId}`));
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível excluir a rota."));
  }
};

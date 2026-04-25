import { User } from "firebase/auth";
import { get, onValue, push, ref, remove, set } from "firebase/database";
import { database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import { ensureUserRole } from "../../services/adminService";
import { PointOfInterest, POIType } from "../models/poi";
import { loadOfflineCache, saveOfflineCache } from "../storage/offlineCache";

const OFFLINE_CACHE_POIS_KEY = "pois";

type CreatePOIInput = {
  titulo: string;
  descricao?: string;
  tipo: POIType;
  coordenadas: {
    latitude: number;
    longitude: number;
  };
};

type UserProfileSnapshot = {
  fullName?: string;
  username?: string;
  email?: string;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toCreatorDisplay = (raw: any, userProfile?: UserProfileSnapshot): string => {
  const name = String(raw?.criadoPorNome || "").trim();
  if (name) return name;

  const fullName = String(userProfile?.fullName || "").trim();
  if (fullName) return fullName;

  const username = String(userProfile?.username || "").trim();
  if (username) return `@${username}`;

  const email = String(raw?.criadoPorEmail || "").trim();
  if (email) return email;

  const profileEmail = String(userProfile?.email || "").trim();
  if (profileEmail) return profileEmail;

  const uid = String(raw?.criadoPor || "").trim();
  if (!uid) return "Usuário";
  return `Usuário ${uid.slice(0, 6)}`;
};

const normalizePOI = (
  id: string,
  raw: any,
  usersByUid?: Record<string, UserProfileSnapshot>
): PointOfInterest | null => {
  const latitude = toFiniteNumber(raw?.coordenadas?.latitude);
  const longitude = toFiniteNumber(raw?.coordenadas?.longitude);
  if (latitude === null || longitude === null) return null;

  const tipo = String(raw?.tipo || "").trim() as POIType;
  if (!["cachoeira", "academia_ar_livre", "mirante", "ponto_agua"].includes(tipo)) {
    return null;
  }

  const createdByUid = String(raw?.criadoPor || "").trim();
  const creatorProfile = createdByUid ? usersByUid?.[createdByUid] : undefined;

  return {
    id,
    titulo: String(raw?.titulo || "POI sem título"),
    descricao: String(raw?.descricao || "Sem descrição."),
    tipo,
    coordenadas: { latitude, longitude },
    criadoPor: createdByUid || "unknown",
    criadoPorNome:
      typeof raw?.criadoPorNome === "string" && raw.criadoPorNome.trim()
        ? raw.criadoPorNome.trim()
        : null,
    criadoPorEmail:
      typeof raw?.criadoPorEmail === "string" && raw.criadoPorEmail.trim()
        ? raw.criadoPorEmail.trim()
        : null,
    criadoPorDisplay: toCreatorDisplay(raw, creatorProfile),
    dataCriacao: String(raw?.dataCriacao || new Date().toISOString()),
  };
};

const loadUserProfileByUid = async (uid: string): Promise<UserProfileSnapshot | null> => {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return null;
  try {
    const snapshot = await get(ref(database, `users/${safeUid}`));
    if (!snapshot.exists()) return null;
    const data = snapshot.val() || {};
    return {
      fullName: typeof data?.fullName === "string" ? data.fullName : undefined,
      username: typeof data?.username === "string" ? data.username : undefined,
      email: typeof data?.email === "string" ? data.email : undefined,
    };
  } catch {
    return null;
  }
};

const loadUsersByUid = async (): Promise<Record<string, UserProfileSnapshot>> => {
  try {
    const snapshot = await get(ref(database, "users"));
    if (!snapshot.exists()) return {};
    const raw = snapshot.val() || {};
    return Object.keys(raw).reduce<Record<string, UserProfileSnapshot>>((acc, uid) => {
      const item = raw[uid] || {};
      acc[uid] = {
        fullName: typeof item?.fullName === "string" ? item.fullName : undefined,
        username: typeof item?.username === "string" ? item.username : undefined,
        email: typeof item?.email === "string" ? item.email : undefined,
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export const createPOI = async (input: CreatePOIInput, user: User | null) => {
  if (!user) {
    throw new Error("Você precisa estar logado para registrar um ponto de interesse.");
  }

  const titulo = input.titulo?.trim();
  if (!titulo) {
    throw new Error("Informe um título para o ponto de interesse.");
  }

  const latitude = toFiniteNumber(input.coordenadas?.latitude);
  const longitude = toFiniteNumber(input.coordenadas?.longitude);
  if (latitude === null || longitude === null) {
    throw new Error("Coordenadas inválidas para o ponto de interesse.");
  }

  const userProfile = await loadUserProfileByUid(user.uid);
  const creatorName =
    String(user.displayName || "").trim() ||
    String(userProfile?.fullName || "").trim() ||
    String(userProfile?.username || "").trim();
  const creatorEmail = String(user.email || "").trim() || String(userProfile?.email || "").trim();

  const payload = {
    titulo,
    descricao: input.descricao?.trim() || "Sem descrição.",
    tipo: input.tipo,
    coordenadas: {
      latitude,
      longitude,
    },
    criadoPor: user.uid,
    criadoPorNome: creatorName || null,
    criadoPorEmail: creatorEmail || null,
    dataCriacao: new Date().toISOString(),
  };

  try {
    const poiRef = push(ref(database, "pois"));
    await set(poiRef, payload);

    return {
      id: poiRef.key,
      ...payload,
      criadoPorDisplay:
        payload.criadoPorNome || payload.criadoPorEmail || `Usuário ${user.uid.slice(0, 6)}`,
    } as PointOfInterest;
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível salvar o ponto de interesse."));
  }
};

export const fetchPOIs = async (): Promise<PointOfInterest[]> => {
  try {
    const [snapshot, usersByUid] = await Promise.all([
      get(ref(database, "pois")),
      loadUsersByUid(),
    ]);
    
    if (!snapshot.exists()) {
      saveOfflineCache(OFFLINE_CACHE_POIS_KEY, []);
      return [];
    }

    const raw = snapshot.val();
    const pois = Object.keys(raw)
      .map((id) => normalizePOI(id, raw[id], usersByUid))
      .filter((item): item is PointOfInterest => Boolean(item));
    
    saveOfflineCache(OFFLINE_CACHE_POIS_KEY, pois);
    return pois;
  } catch (error) {
    const fallback = await loadOfflineCache<PointOfInterest[]>(OFFLINE_CACHE_POIS_KEY);
    if (fallback?.data?.length) {
      console.warn("[pois] Falling back to offline cache due to connection issue.");
      return fallback.data;
    }
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível carregar os pontos de interesse."));
  }
};

export const subscribePOIs = (
  onChange: (pois: PointOfInterest[]) => void,
  onError?: (message: string) => void
) => {
  loadOfflineCache<PointOfInterest[]>(OFFLINE_CACHE_POIS_KEY)
    .then((cache) => {
      if (!cache?.data?.length) return;
      onChange(cache.data);
    })
    .catch(() => {});

  return onValue(
    ref(database, "pois"),
    async (snapshot) => {
      if (!snapshot.exists()) {
        saveOfflineCache(OFFLINE_CACHE_POIS_KEY, []);
        onChange([]);
        return;
      }

      const raw = snapshot.val();
      const usersByUid = await loadUsersByUid();
      const pois = Object.keys(raw)
        .map((id) => normalizePOI(id, raw[id], usersByUid))
        .filter((item): item is PointOfInterest => Boolean(item));

      saveOfflineCache(OFFLINE_CACHE_POIS_KEY, pois);
      onChange(pois);
    },
    async (error) => {
      const fallback = await loadOfflineCache<PointOfInterest[]>(OFFLINE_CACHE_POIS_KEY);
      if (fallback?.data?.length) {
        onChange(fallback.data);
        onError?.("Sem conexão. Exibindo POIs em cache offline.");
        return;
      }

      onError?.(normalizeFirebaseErrorMessage(error, "Não foi possível carregar os pontos de interesse."));
    }
  );
};

export const deletePOI = async (poiId: string, user: User | null): Promise<void> => {
  if (!user) {
    throw new Error("Você precisa estar logado para excluir o ponto de interesse.");
  }

  const safePoiId = String(poiId || "").trim();
  if (!safePoiId) {
    throw new Error("POI inválido.");
  }

  const poiRef = ref(database, `pois/${safePoiId}`);

  try {
    const snapshot = await get(poiRef);
    if (!snapshot.exists()) {
      throw new Error("Ponto de interesse não encontrado.");
    }

    const raw = snapshot.val() || {};
    const ownerUid = String(raw?.criadoPor || "").trim();
    const role = await ensureUserRole(user.uid, user.email || "");
    const isAdmin = role === "admin";
    const isOwner = ownerUid !== "" && ownerUid === user.uid;

    if (!isAdmin && !isOwner) {
      throw new Error("Você não tem permissão para excluir este ponto de interesse.");
    }

    await remove(poiRef);
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível excluir o ponto de interesse.")
    );
  }
};

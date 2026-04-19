import { User } from "firebase/auth";
import { get, push, ref, set } from "firebase/database";
import { database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
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

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizePOI = (id: string, raw: any): PointOfInterest | null => {
  const latitude = toFiniteNumber(raw?.coordenadas?.latitude);
  const longitude = toFiniteNumber(raw?.coordenadas?.longitude);
  if (latitude === null || longitude === null) return null;

  const tipo = String(raw?.tipo || "").trim() as POIType;
  if (!["cachoeira", "academia_ar_livre", "mirante", "ponto_agua"].includes(tipo)) {
    return null;
  }

  return {
    id,
    titulo: String(raw?.titulo || "POI sem título"),
    descricao: String(raw?.descricao || "Sem descrição."),
    tipo,
    coordenadas: { latitude, longitude },
    criadoPor: String(raw?.criadoPor || "unknown"),
    dataCriacao: String(raw?.dataCriacao || new Date().toISOString()),
  };
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

  const payload = {
    titulo,
    descricao: input.descricao?.trim() || "Sem descrição.",
    tipo: input.tipo,
    coordenadas: {
      latitude,
      longitude,
    },
    criadoPor: user.uid,
    dataCriacao: new Date().toISOString(),
  };

  try {
    const poiRef = push(ref(database, "pois"));
    await set(poiRef, payload);

    return {
      id: poiRef.key,
      ...payload,
    } as PointOfInterest;
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível salvar o ponto de interesse."));
  }
};

export const fetchPOIs = async (): Promise<PointOfInterest[]> => {
  try {
    const snapshot = await get(ref(database, "pois"));
    
    if (!snapshot.exists()) {
      saveOfflineCache(OFFLINE_CACHE_POIS_KEY, []);
      return [];
    }

    const raw = snapshot.val();
    const pois = Object.keys(raw)
      .map((id) => normalizePOI(id, raw[id]))
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

import AsyncStorage from "@react-native-async-storage/async-storage";

type OfflineCacheEnvelope<T> = {
  savedAt: string;
  data: T;
};

const CACHE_PREFIX = "@tracktrail_cache:";

const buildKey = (key: string) => `${CACHE_PREFIX}${key}`;

export const saveOfflineCache = async <T>(key: string, data: T) => {
  try {
    const payload: OfflineCacheEnvelope<T> = {
      savedAt: new Date().toISOString(),
      data,
    };
    await AsyncStorage.setItem(buildKey(key), JSON.stringify(payload));
  } catch {
    // Falha silenciosa de cache não pode quebrar fluxo principal.
  }
};

export const loadOfflineCache = async <T>(key: string): Promise<OfflineCacheEnvelope<T> | null> => {
  try {
    const raw = await AsyncStorage.getItem(buildKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as OfflineCacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TrackTrailRoute, TrailAlert } from "../models/alerts";

const OFFLINE_ROUTES_KEY = "@tracktrail_offline_routes:v1";

export type OfflineRouteEntry = {
  route: TrackTrailRoute;
  downloadedAt: string;
  routeFingerprint: string;
  alertsSnapshot: TrailAlert[];
};

type OfflineRoutesMap = Record<string, OfflineRouteEntry>;

const loadOfflineRoutesMap = async (): Promise<OfflineRoutesMap> => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_ROUTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as OfflineRoutesMap;
  } catch {
    return {};
  }
};

const saveOfflineRoutesMap = async (map: OfflineRoutesMap) => {
  await AsyncStorage.setItem(OFFLINE_ROUTES_KEY, JSON.stringify(map));
};

const buildRouteFingerprint = (route: TrackTrailRoute): string => {
  const pointsSignature = (route.rotaCompleta || [])
    .slice(0, 50)
    .map((point) => `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`)
    .join("|");

  return [
    route.id,
    route.titulo || "",
    route.descricao || "",
    route.distancia || "",
    route.tempoEstimado || "",
    route.dificuldade || "",
    route.tipo || "",
    route.visibility || "",
    pointsSignature,
  ].join("::");
};

export const isOfflineRouteOutdated = (
  currentRoute: TrackTrailRoute,
  offlineEntry: OfflineRouteEntry | null
): boolean => {
  if (!offlineEntry) return false;
  return buildRouteFingerprint(currentRoute) !== offlineEntry.routeFingerprint;
};

export const saveOfflineRoute = async (
  route: TrackTrailRoute,
  alertsSnapshot: TrailAlert[] = []
): Promise<OfflineRouteEntry> => {
  if (!route?.id) {
    throw new Error("Rota inválida para download offline.");
  }

  const hasAnyPath =
    (Array.isArray(route.rotaCompleta) && route.rotaCompleta.length > 1) || Boolean(route.startPoint);
  if (!hasAnyPath) {
    throw new Error("A rota não possui geometria suficiente para uso offline.");
  }

  const map = await loadOfflineRoutesMap();
  const entry: OfflineRouteEntry = {
    route,
    downloadedAt: new Date().toISOString(),
    routeFingerprint: buildRouteFingerprint(route),
    alertsSnapshot,
  };
  map[route.id] = entry;
  await saveOfflineRoutesMap(map);
  return entry;
};

export const removeOfflineRoute = async (routeId: string): Promise<void> => {
  if (!routeId?.trim()) return;

  const map = await loadOfflineRoutesMap();
  if (!map[routeId]) return;
  delete map[routeId];
  await saveOfflineRoutesMap(map);
};

export const getOfflineRoute = async (routeId: string): Promise<OfflineRouteEntry | null> => {
  if (!routeId?.trim()) return null;
  const map = await loadOfflineRoutesMap();
  return map[routeId] || null;
};

export const listOfflineRoutes = async (): Promise<OfflineRouteEntry[]> => {
  const map = await loadOfflineRoutesMap();
  return Object.values(map).sort(
    (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
  );
};

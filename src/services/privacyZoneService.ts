import { get, ref, set } from "firebase/database";
import { database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import { PrivacyZone, SanitizedRouteResult } from "../models/privacyZone";
import { calculateDistance2DMeters } from "../utils/activityMetrics";

const DEFAULT_RADIUS_METERS = 180;

export const getUserPrivacyZone = async (userId: string): Promise<PrivacyZone | null> => {
  if (!userId) return null;
  try {
    const snapshot = await get(ref(database, `users/${userId}/privacyZone`));
    if (!snapshot.exists()) return null;
    const row = snapshot.val() || {};

    return {
      centerLatitude: Number(row.centerLatitude || 0),
      centerLongitude: Number(row.centerLongitude || 0),
      radiusMeters: Number(row.radiusMeters || DEFAULT_RADIUS_METERS),
      enabled: row.enabled !== false,
      updatedAt: row.updatedAt || undefined,
    };
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível carregar a zona de privacidade.")
    );
  }
};

export const saveUserPrivacyZone = async (userId: string, zone: PrivacyZone) => {
  if (!userId) throw new Error("Usuário inválido.");
  if (!Number.isFinite(zone.centerLatitude) || !Number.isFinite(zone.centerLongitude)) {
    throw new Error("Centro da zona de privacidade inválido.");
  }

  try {
    await set(ref(database, `users/${userId}/privacyZone`), {
      centerLatitude: zone.centerLatitude,
      centerLongitude: zone.centerLongitude,
      radiusMeters:
        Number.isFinite(zone.radiusMeters) && zone.radiusMeters > 30
          ? Number(zone.radiusMeters)
          : DEFAULT_RADIUS_METERS,
      enabled: zone.enabled !== false,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível salvar a zona de privacidade.")
    );
  }
};

export const sanitizeRouteForPublicView = (
  points: { latitude: number; longitude: number; altitude?: number | null }[],
  zone: PrivacyZone | null
): SanitizedRouteResult => {
  if (!Array.isArray(points) || points.length === 0 || !zone || !zone.enabled) {
    return {
      publicPoints: Array.isArray(points) ? points : [],
      removedFromStart: 0,
      removedFromEnd: 0,
      sanitized: false,
    };
  }

  const isInsideZone = (point: { latitude: number; longitude: number }) => {
    const distance = calculateDistance2DMeters(
      point.latitude,
      point.longitude,
      zone.centerLatitude,
      zone.centerLongitude
    );
    return distance <= zone.radiusMeters;
  };

  let startIndex = 0;
  while (startIndex < points.length && isInsideZone(points[startIndex])) {
    startIndex += 1;
  }

  let endIndex = points.length - 1;
  while (endIndex >= startIndex && isInsideZone(points[endIndex])) {
    endIndex -= 1;
  }

  const trimmed = points.slice(startIndex, endIndex + 1);
  const fallbackPublicPoints = trimmed.length >= 2 ? trimmed : points.slice(0, Math.min(2, points.length));

  return {
    publicPoints: fallbackPublicPoints,
    removedFromStart: startIndex,
    removedFromEnd: Math.max(0, points.length - 1 - endIndex),
    sanitized: startIndex > 0 || endIndex < points.length - 1,
  };
};

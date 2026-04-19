import { ActivityType } from "../models/activity";

const EARTH_RADIUS_METERS = 6371000;

export const calculateDistance2DMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

export const calculateDistance3DMeters = (
  lat1: number,
  lon1: number,
  alt1: number | null | undefined,
  lat2: number,
  lon2: number,
  alt2: number | null | undefined
): number => {
  const horizontal = calculateDistance2DMeters(lat1, lon1, lat2, lon2);

  if (!Number.isFinite(alt1 as number) || !Number.isFinite(alt2 as number)) {
    return horizontal;
  }

  const vertical = Number(alt2) - Number(alt1);
  return Math.sqrt(horizontal * horizontal + vertical * vertical);
};

export const metersToKm = (meters: number) => meters / 1000;

export const calculatePace = (distanceKm: number, durationSeconds: number): number | null => {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSeconds)) return null;
  if (distanceKm <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / 60 / distanceKm;
};

export const formatPace = (paceMinPerKm: number | null | undefined): string => {
  if (!Number.isFinite(paceMinPerKm as number) || (paceMinPerKm as number) <= 0) return "--";
  const totalSeconds = Math.round(Number(paceMinPerKm) * 60);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")} min/km`;
};

export const formatSpeedKmh = (speedKmh: number | null | undefined): string => {
  if (!Number.isFinite(speedKmh as number) || (speedKmh as number) < 0) return "--";
  return `${Number(speedKmh).toFixed(1)} km/h`;
};

export const getPerformancePrimary = (
  activityType: ActivityType,
  avgSpeedKmh: number,
  paceMinPerKm: number | null
) => {
  if (activityType === "bike") {
    return { label: "Velocidade média", value: formatSpeedKmh(avgSpeedKmh) };
  }

  if (activityType === "corrida" || activityType === "caminhada") {
    return { label: "Pace médio", value: formatPace(paceMinPerKm) };
  }

  return {
    label: "Pace / Velocidade",
    value: `${formatPace(paceMinPerKm)} • ${formatSpeedKmh(avgSpeedKmh)}`,
  };
};


import { ActivityPoint } from "../models/activity";
import { calculateDistance3DMeters } from "./activityMetrics";

export type ChartPoint = {
  index: number;
  x: number;
  y: number;
  label: string;
  coordinate: { latitude: number; longitude: number };
};

const toDurationLabel = (totalSeconds: number) => {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.max(0, Math.floor(totalSeconds % 60));
  return `${min}:${String(sec).padStart(2, "0")}`;
};

const toPaceLabel = (paceMinPerKm: number) => {
  const sec = Math.max(0, Math.floor(paceMinPerKm * 60));
  const minPart = Math.floor(sec / 60);
  const secPart = sec % 60;
  return `${minPart}:${String(secPart).padStart(2, "0")} min/km`;
};

export const buildElevationChartData = (points: ActivityPoint[]): ChartPoint[] => {
  if (!Array.isArray(points) || points.length < 2) return [];

  let coveredMeters = 0;
  return points
    .map((point, index) => {
      if (index > 0) {
        const previous = points[index - 1];
        coveredMeters += calculateDistance3DMeters(
          previous.latitude,
          previous.longitude,
          previous.altitude,
          point.latitude,
          point.longitude,
          point.altitude
        );
      }
      return {
        index,
        x: coveredMeters / 1000,
        y: Number.isFinite(point.altitude as number) ? Number(point.altitude) : NaN,
        label: `${(coveredMeters / 1000).toFixed(2)} km`,
        coordinate: { latitude: point.latitude, longitude: point.longitude },
      };
    })
    .filter((item) => Number.isFinite(item.y));
};

export const buildPaceChartData = (points: ActivityPoint[]): ChartPoint[] => {
  if (!Array.isArray(points) || points.length < 3) return [];

  let coveredMeters = 0;
  const result: ChartPoint[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const deltaMeters = calculateDistance3DMeters(
      previous.latitude,
      previous.longitude,
      previous.altitude,
      current.latitude,
      current.longitude,
      current.altitude
    );
    coveredMeters += deltaMeters;

    const deltaSec = Math.max(1, (Number(current.timestamp || 0) - Number(previous.timestamp || 0)) / 1000);
    const speedKmh = (deltaMeters / 1000) / (deltaSec / 3600);
    if (!Number.isFinite(speedKmh) || speedKmh <= 0) continue;

    const paceMinPerKm = 60 / speedKmh;
    result.push({
      index: result.length,
      x: coveredMeters / 1000,
      y: paceMinPerKm,
      label: `${toPaceLabel(paceMinPerKm)} • ${toDurationLabel(Number(current.timestamp || 0) / 1000)}`,
      coordinate: { latitude: current.latitude, longitude: current.longitude },
    });
  }

  return result;
};


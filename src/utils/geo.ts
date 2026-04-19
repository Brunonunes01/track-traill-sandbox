export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type MapRegion = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export const FALLBACK_COORDINATE: Coordinate = {
  latitude: -15.7942,
  longitude: -47.8822,
};

export const FALLBACK_REGION: MapRegion = {
  ...FALLBACK_COORDINATE,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const toCoordinate = (value: any): Coordinate | null => {
  const latitude = toFiniteNumber(value?.latitude);
  const longitude = toFiniteNumber(value?.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
};

export const toCoordinateArray = (value: any): Coordinate[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toCoordinate(item))
    .filter((item): item is Coordinate => Boolean(item));
};

export const toRegion = (
  value: any,
  deltas: { latitudeDelta?: number; longitudeDelta?: number } = {}
): MapRegion | null => {
  const coordinate = toCoordinate(value);
  if (!coordinate) {
    return null;
  }

  const latitudeDelta = toFiniteNumber(deltas.latitudeDelta) ?? 0.05;
  const longitudeDelta = toFiniteNumber(deltas.longitudeDelta) ?? 0.05;

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta,
    longitudeDelta,
  };
};

export const getRegionWithFallback = (
  value: any,
  fallback: MapRegion = FALLBACK_REGION,
  deltas: { latitudeDelta?: number; longitudeDelta?: number } = {}
): MapRegion => {
  return toRegion(value, deltas) || fallback;
};

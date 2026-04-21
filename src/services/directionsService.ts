type Coordinate = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
};

export type GraphHopperProfile = "mtb" | "bike" | "foot" | "hike" | "car";

type DirectionsMode = "walking" | "bicycling" | "driving";

type FetchDirectionsInput = {
  origin: Coordinate;
  destination: Coordinate;
  waypoints?: Coordinate[];
  mode?: DirectionsMode;
  profile?: GraphHopperProfile;
};

export type DirectionsResult = {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
  unpavedRatio?: number | null;
};

export type RoundTripResult = DirectionsResult & {
  score: number;
  distanceDeltaMeters: number;
};

const GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route";
const MAX_WAYPOINTS = 23;
const EARTH_RADIUS_METERS = 6371000;
const UNPAVED_KEYWORDS = ["unpaved", "dirt", "gravel", "ground", "earth", "mud", "sand", "path"];
const GRAPH_HOPPER_RATE_LIMIT_TEXT = "minutely api limit heavily violated";

const getGraphHopperApiKey = () => {
  const key = process.env.EXPO_PUBLIC_GRAPHHOPPER_API_KEY;
  if (!key || key.startsWith("SET_VIA_")) {
    throw new Error("GraphHopper API key não configurada (EXPO_PUBLIC_GRAPHHOPPER_API_KEY).");
  }
  return key;
};

const encodeCoordinate = (point: Coordinate) => `${point.latitude},${point.longitude}`;

const mapActivityMode = (activityType?: string): DirectionsMode => {
  const normalized = String(activityType || "").toLowerCase();
  if (normalized.includes("cicl")) return "bicycling";
  if (normalized.includes("carro")) return "driving";
  return "walking";
};

const pickWaypoints = (waypoints: Coordinate[]): Coordinate[] => {
  if (waypoints.length <= MAX_WAYPOINTS) return waypoints;

  const step = waypoints.length / MAX_WAYPOINTS;
  const sampled: Coordinate[] = [];
  for (let i = 0; i < MAX_WAYPOINTS; i += 1) {
    const index = Math.floor(i * step);
    sampled.push(waypoints[index]);
  }
  return sampled;
};

const decodeGraphHopperPolyline = (encoded: string, withElevation = false): Coordinate[] => {
  if (!encoded) return [];

  const points: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  let ele = 0;

  while (index < encoded.length) {
    // GraphHopper usa encoded polyline no mesmo padrão de lat/lng com precisão 1e5.
    // Quando elevation=true, o terceiro valor é codificado com precisão de 1e2.
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    if (withElevation) {
      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const deltaEle = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      ele += deltaEle;
    }

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
      altitude: withElevation ? ele / 100 : null,
    });
  }

  return points;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const distanceBetween = (a: Coordinate, b: Coordinate) => {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
};

const moveCoordinateByBearing = (origin: Coordinate, bearingDeg: number, distanceMeters: number): Coordinate => {
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(origin.latitude);
  const lng1 = toRadians(origin.longitude);
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAd = Math.sin(angularDistance);
  const cosAd = Math.cos(angularDistance);

  const lat2 = Math.asin(sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * sinAd * cosLat1,
      cosAd - sinLat1 * Math.sin(lat2)
    );

  return {
    latitude: toDegrees(lat2),
    longitude: toDegrees(lng2),
  };
};

const buildPolylineCumulativeDistances = (coordinates: Coordinate[]) => {
  const cumulative: number[] = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distanceBetween(coordinates[i - 1], coordinates[i]));
  }
  return cumulative;
};

const isUnpavedSurface = (surface: unknown) => {
  const text = String(surface || "").toLowerCase();
  if (!text || text === "paved" || text === "asphalt" || text === "concrete") return false;
  return UNPAVED_KEYWORDS.some((keyword) => text.includes(keyword));
};

const extractUnpavedRatio = (path: any, coordinates: Coordinate[], totalDistanceMeters: number) => {
  const surfaceDetails = path?.details?.surface;
  if (!Array.isArray(surfaceDetails) || coordinates.length < 2 || totalDistanceMeters <= 0) return null;

  const cumulative = buildPolylineCumulativeDistances(coordinates);
  let unpavedMeters = 0;

  for (const entry of surfaceDetails) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const fromIndex = clamp(Number(entry[0]) || 0, 0, cumulative.length - 1);
    const toIndex = clamp(Number(entry[1]) || 0, 0, cumulative.length - 1);
    if (toIndex <= fromIndex) continue;

    const meters = Math.max(0, cumulative[toIndex] - cumulative[fromIndex]);
    if (meters <= 0) continue;
    if (isUnpavedSurface(entry[2])) {
      unpavedMeters += meters;
    }
  }

  if (unpavedMeters <= 0) return 0;
  return clamp(unpavedMeters / totalDistanceMeters, 0, 1);
};

const isGraphHopperRateLimitError = (error: unknown) => {
  const message = String((error as any)?.message || "").toLowerCase();
  return message.includes(GRAPH_HOPPER_RATE_LIMIT_TEXT);
};

const buildOutAndBackRoute = (oneWay: DirectionsResult): DirectionsResult => {
  const outward = oneWay.coordinates;
  if (!Array.isArray(outward) || outward.length < 2) {
    return oneWay;
  }

  const returnPath = outward
    .slice(0, outward.length - 1)
    .reverse()
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude ?? null,
    }));

  const coordinates = [...outward, ...returnPath];
  const distanceMeters = oneWay.distanceMeters * 2;
  const durationSeconds = oneWay.durationSeconds * 2;

  return {
    coordinates,
    distanceMeters,
    durationSeconds,
    distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
    durationText: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
    unpavedRatio: oneWay.unpavedRatio ?? null,
  };
};

export const travelModeFromActivity = mapActivityMode;
export const travelProfileFromActivity = (activityType?: string): GraphHopperProfile => {
  const mode = mapActivityMode(activityType);
  if (mode === "bicycling") return "mtb";
  if (mode === "driving") return "car";
  return "foot";
};

const graphHopperProfileFromMode = (mode?: DirectionsMode): GraphHopperProfile => {
  if (mode === "bicycling") return "bike";
  if (mode === "driving") return "car";
  return "foot";
};

const extractPathCoordinates = (path: any): Coordinate[] => {
  const points = path?.points;

  if (typeof points === "string") {
    return decodeGraphHopperPolyline(points, true);
  }

  if (Array.isArray(points?.coordinates)) {
    return points.coordinates.map((coord: number[]) => ({
      latitude: Number(coord?.[1]),
      longitude: Number(coord?.[0]),
      altitude: Number.isFinite(coord?.[2]) ? Number(coord[2]) : null,
    }));
  }

  throw new Error("Rota sem geometria retornada pela API.");
};

/**
 * Busca rotas usando a API do GraphHopper, ideal para trilhas e caminhos não pavimentados.
 * Perfil padrão: "mtb" para priorizar trilhas e vias não asfaltadas.
 */
export const fetchGraphHopperDirections = async ({
  origin,
  destination,
  waypoints = [],
  profile = "mtb",
}: FetchDirectionsInput): Promise<DirectionsResult> => {
  const apiKey = getGraphHopperApiKey();
  const sampledWaypoints = pickWaypoints(waypoints);

  const params = new URLSearchParams({
    key: apiKey,
    profile,
    elevation: "true",
    points_encoded: "true",
    calc_points: "true",
    instructions: "false",
    locale: "pt-BR",
  });
  params.append("details", "surface");

  params.append("point", encodeCoordinate(origin));
  sampledWaypoints.forEach((wp) => {
    params.append("point", encodeCoordinate(wp));
  });
  params.append("point", encodeCoordinate(destination));

  try {
    const response = await fetch(`${GRAPHHOPPER_URL}?${params.toString()}`);
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.message) {
      const apiError = data?.message || data?.hints?.[0]?.message || response.statusText;
      const profileNotAllowed =
        typeof apiError === "string" &&
        apiError.includes("profile parameter can only be one of") &&
        apiError.includes("car, bike, foot");

      // Fallback para contas/plano sem suporte ao profile "mtb".
      if (profile === "mtb" && profileNotAllowed) {
        console.warn("[GraphHopper] Profile mtb indisponível nesta conta. Recalculando com bike.");
        return fetchGraphHopperDirections({
          origin,
          destination,
          waypoints,
          profile: "bike",
        });
      }

      throw new Error(`GraphHopper: ${apiError || "falha ao calcular rota."}`);
    }

    if (!data?.paths || data.paths.length === 0) {
      throw new Error("Nenhuma rota encontrada pelo GraphHopper.");
    }

    const path = data.paths[0];
    const coordinates = extractPathCoordinates(path);
    if (coordinates.length === 0) {
      throw new Error("Rota sem pontos válidos retornada pela API.");
    }

    const distanceMeters = Number(path.distance || 0);
    const durationSeconds = Math.round(Number(path.time || 0) / 1000);
    const unpavedRatio = extractUnpavedRatio(path, coordinates, distanceMeters);

    console.log(`[GraphHopper] Rota calculada: ${distanceMeters}m, ${coordinates.length} pontos.`);

    return {
      coordinates,
      distanceMeters,
      durationSeconds,
      distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
      durationText: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
      unpavedRatio,
    };
  } catch (error: any) {
    console.error("Erro ao buscar rota no GraphHopper:", error?.message || String(error));
    throw error;
  }
};

type FetchRoundTripInput = {
  origin: Coordinate;
  targetDistanceKm: number;
  profile?: GraphHopperProfile;
  alternatives?: number;
  toleranceRatio?: number;
};

export const fetchRoundTripByDistance = async ({
  origin,
  targetDistanceKm,
  profile = "mtb",
  alternatives = 3,
  toleranceRatio = 0.2,
}: FetchRoundTripInput): Promise<{ best: RoundTripResult; alternatives: RoundTripResult[] }> => {
  const targetMeters = Math.max(1000, Number(targetDistanceKm || 0) * 1000);
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) {
    throw new Error("Meta de distância inválida.");
  }

  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const oneWayTargetMeters = clamp(targetMeters / 2, 700, 35000);
  const candidates: RoundTripResult[] = [];
  const targetAlternatives = Math.max(1, alternatives);
  const maxAttempts = Math.min(bearings.length, Math.max(3, targetAlternatives));

  for (let i = 0; i < maxAttempts; i += 1) {
    const bearing = bearings[i];
    const destination = moveCoordinateByBearing(origin, bearing, oneWayTargetMeters);

    try {
      const outwardRoute = await fetchGraphHopperDirections({
        origin,
        destination,
        profile,
      });
      const route = buildOutAndBackRoute(outwardRoute);

      const delta = Math.abs(route.distanceMeters - targetMeters);
      const normalizedDistanceScore = clamp(1 - delta / (targetMeters * Math.max(0.05, toleranceRatio)), 0, 1);
      const terrainScore = route.unpavedRatio ?? (profile === "mtb" || profile === "foot" ? 0.55 : 0.3);
      const score = terrainScore * 0.65 + normalizedDistanceScore * 0.35;

      candidates.push({
        ...route,
        score,
        distanceDeltaMeters: delta,
      });

      if (candidates.length >= targetAlternatives) {
        break;
      }
    } catch (error) {
      if (isGraphHopperRateLimitError(error)) {
        // Retorna o melhor que já conseguiu calcular ao invés de falhar tudo.
        if (candidates.length > 0) break;
        throw new Error(
          "Limite de requisições do GraphHopper atingido agora. Aguarde 1 minuto e tente novamente."
        );
      }
      throw error;
    }
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    throw new Error("Não foi possível gerar rota circular para a meta informada.");
  }

  return {
    best: sorted[0],
    alternatives: sorted.slice(0, targetAlternatives),
  };
};

/**
 * Compatibilidade retroativa para chamadas antigas que usavam Google Directions.
 * A engine de roteamento foi migrada para GraphHopper.
 */
export const fetchGoogleDirections = async ({
  origin,
  destination,
  waypoints = [],
  mode = "walking",
}: FetchDirectionsInput): Promise<DirectionsResult> => {
  return fetchGraphHopperDirections({
    origin,
    destination,
    waypoints,
    profile: graphHopperProfileFromMode(mode),
  });
};

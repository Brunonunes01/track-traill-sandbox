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
};

const GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route";
const MAX_WAYPOINTS = 23;

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

    console.log(`[GraphHopper] Rota calculada: ${distanceMeters}m, ${coordinates.length} pontos.`);

    return {
      coordinates,
      distanceMeters,
      durationSeconds,
      distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
      durationText: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
    };
  } catch (error: any) {
    console.error("Erro ao buscar rota no GraphHopper:", error?.message || String(error));
    throw error;
  }
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

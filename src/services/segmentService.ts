import { get, onValue, push, ref, set } from "firebase/database";
import { database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import { ActivityPoint } from "../models/activity";
import {
  Segment,
  SegmentAttempt,
  SegmentMatchingConfig,
  SegmentPoint,
} from "../models/segment";
import { calculateDistance2DMeters } from "../utils/activityMetrics";

const SEGMENTS_PATH = "segments";
const SEGMENT_ATTEMPTS_PATH = "segmentAttempts";

const DEFAULT_MATCHING_CONFIG: SegmentMatchingConfig = {
  startToleranceMeters: 35,
  endToleranceMeters: 35,
  minDurationSec: 5,
  maxDurationSec: 4 * 3600,
  minTrackPointsInside: 3,
};

const toSegmentPoint = (value: any): SegmentPoint | null => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    altitude: Number.isFinite(value?.altitude) ? Number(value.altitude) : null,
  };
};

const mapSegmentSnapshot = (snapshot: any): Segment[] => {
  if (!snapshot.exists()) return [];
  const data = snapshot.val() || {};

  return Object.keys(data)
    .map((id) => {
      const row = data[id] || {};
      const polyline = Array.isArray(row.polyline)
        ? row.polyline
            .map((item: any) => toSegmentPoint(item))
            .filter((item: SegmentPoint | null): item is SegmentPoint => Boolean(item))
        : [];
      const startPoint = toSegmentPoint(row.startPoint) || polyline[0];
      const endPoint = toSegmentPoint(row.endPoint) || polyline[polyline.length - 1];
      if (!startPoint || !endPoint || polyline.length < 2) return null;

      return {
        id,
        title: String(row.title || "Segmento"),
        description: String(row.description || ""),
        createdBy: String(row.createdBy || ""),
        startPoint,
        endPoint,
        polyline,
        distanceMeters: Number(row.distanceMeters || 0),
        elevationGainMeters: Number(row.elevationGainMeters || 0),
        activityTypesAllowed: Array.isArray(row.activityTypesAllowed)
          ? row.activityTypesAllowed.map((item: any) => String(item))
          : ["corrida", "caminhada", "trilha", "bike"],
        visibility: row.visibility === "private" || row.visibility === "friends" ? row.visibility : "public",
        createdAt: String(row.createdAt || new Date(0).toISOString()),
      } as Segment;
    })
    .filter((item): item is Segment => Boolean(item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const mapAttemptsSnapshot = (snapshot: any): SegmentAttempt[] => {
  if (!snapshot.exists()) return [];
  const data = snapshot.val() || {};

  return Object.keys(data)
    .map((id) => {
      const row = data[id] || {};
      if (!row.segmentId || !row.userId) return null;
      return {
        id,
        segmentId: String(row.segmentId),
        activityId: String(row.activityId || ""),
        userId: String(row.userId),
        activityType: String(row.activityType || "trilha"),
        enteredAt: Number(row.enteredAt || 0),
        exitedAt: Number(row.exitedAt || 0),
        durationSec: Number(row.durationSec || 0),
        distanceMeters: Number(row.distanceMeters || 0),
        avgSpeedKmh: Number(row.avgSpeedKmh || 0),
        createdAt: String(row.createdAt || new Date(0).toISOString()),
      } as SegmentAttempt;
    })
    .filter((item): item is SegmentAttempt => Boolean(item))
    .sort((a, b) => a.durationSec - b.durationSec);
};

export const subscribeSegments = (
  onChange: (segments: Segment[]) => void,
  onError?: (error: Error) => void
) => {
  return onValue(
    ref(database, SEGMENTS_PATH),
    (snapshot) => onChange(mapSegmentSnapshot(snapshot)),
    (error) => onError?.(new Error(normalizeFirebaseErrorMessage(error, "Falha ao carregar segmentos.")))
  );
};

export const subscribeSegmentAttempts = (
  segmentId: string,
  onChange: (attempts: SegmentAttempt[]) => void,
  onError?: (error: Error) => void
) => {
  return onValue(
    ref(database, SEGMENT_ATTEMPTS_PATH),
    (snapshot) => {
      const all = mapAttemptsSnapshot(snapshot);
      onChange(all.filter((item) => item.segmentId === segmentId));
    },
    (error) => onError?.(new Error(normalizeFirebaseErrorMessage(error, "Falha ao carregar tentativas.")))
  );
};

export const createSegment = async (
  payload: Omit<Segment, "id" | "createdAt" | "distanceMeters">
) => {
  const normalizedTitle = String(payload.title || "").trim();
  if (!normalizedTitle) throw new Error("Informe um nome para o segmento.");
  if (!payload.createdBy) throw new Error("Usuário inválido.");
  if (!Array.isArray(payload.polyline) || payload.polyline.length < 2) {
    throw new Error("É preciso ao menos dois pontos para criar um segmento.");
  }

  const distanceMeters = payload.polyline.slice(1).reduce((acc, point, index) => {
    const previous = payload.polyline[index];
    return (
      acc +
      calculateDistance2DMeters(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude
      )
    );
  }, 0);

  const segmentRef = push(ref(database, SEGMENTS_PATH));
  const createdAt = new Date().toISOString();

  await set(segmentRef, {
    title: normalizedTitle,
    description: payload.description || "",
    createdBy: payload.createdBy,
    startPoint: payload.startPoint,
    endPoint: payload.endPoint,
    polyline: payload.polyline,
    distanceMeters: Number(distanceMeters.toFixed(1)),
    elevationGainMeters: Number(payload.elevationGainMeters || 0),
    activityTypesAllowed:
      Array.isArray(payload.activityTypesAllowed) && payload.activityTypesAllowed.length > 0
        ? payload.activityTypesAllowed
        : ["corrida", "caminhada", "trilha", "bike"],
    visibility: payload.visibility || "public",
    createdAt,
  });

  return segmentRef.key;
};

export const createSegmentFromRoute = async ({
  route,
  userId,
  title,
  description,
  visibility,
}: {
  route: any;
  userId: string;
  title: string;
  description?: string;
  visibility?: Segment["visibility"];
}) => {
  const polyline = Array.isArray(route?.rotaCompleta)
    ? route.rotaCompleta
        .map((item: any) => toSegmentPoint(item))
        .filter((item: SegmentPoint | null): item is SegmentPoint => Boolean(item))
    : [];

  if (polyline.length < 2) {
    throw new Error("A rota não possui pontos suficientes para virar segmento.");
  }

  return createSegment({
    title,
    description: description || route?.descricao || "",
    createdBy: userId,
    startPoint: toSegmentPoint(route?.startPoint) || polyline[0],
    endPoint: toSegmentPoint(route?.endPoint) || polyline[polyline.length - 1],
    polyline,
    elevationGainMeters: Number(route?.elevacaoGanhoM || 0),
    activityTypesAllowed: [String(route?.tipo || "trilha").toLowerCase()],
    visibility: visibility || "public",
  });
};

export const detectSegmentAttempt = (
  points: ActivityPoint[],
  segment: Segment,
  config?: Partial<SegmentMatchingConfig>
) => {
  const safeConfig = { ...DEFAULT_MATCHING_CONFIG, ...(config || {}) };
  if (points.length < safeConfig.minTrackPointsInside + 1) return null;

  let startIndex = -1;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const distanceToStart = calculateDistance2DMeters(
      point.latitude,
      point.longitude,
      segment.startPoint.latitude,
      segment.startPoint.longitude
    );

    if (distanceToStart <= safeConfig.startToleranceMeters) {
      startIndex = index;
      break;
    }
  }

  if (startIndex < 0 || startIndex >= points.length - safeConfig.minTrackPointsInside) {
    return null;
  }

  for (let index = startIndex + safeConfig.minTrackPointsInside; index < points.length; index += 1) {
    const point = points[index];
    const distanceToEnd = calculateDistance2DMeters(
      point.latitude,
      point.longitude,
      segment.endPoint.latitude,
      segment.endPoint.longitude
    );
    if (distanceToEnd > safeConfig.endToleranceMeters) continue;

    const enteredAt = Number(points[startIndex].timestamp || 0);
    const exitedAt = Number(point.timestamp || 0);
    const durationSec = Math.floor((exitedAt - enteredAt) / 1000);
    if (durationSec < safeConfig.minDurationSec || durationSec > safeConfig.maxDurationSec) {
      continue;
    }

    const coveredDistance = points
      .slice(startIndex + 1, index + 1)
      .reduce((acc, currentPoint, reducedIndex) => {
        const previousPoint = points[startIndex + reducedIndex];
        return (
          acc +
          calculateDistance2DMeters(
            previousPoint.latitude,
            previousPoint.longitude,
            currentPoint.latitude,
            currentPoint.longitude
          )
        );
      }, 0);
    const avgSpeedKmh = durationSec > 0 ? (coveredDistance / 1000) / (durationSec / 3600) : 0;

    return {
      enteredAt,
      exitedAt,
      durationSec,
      distanceMeters: Number(coveredDistance.toFixed(1)),
      avgSpeedKmh: Number(avgSpeedKmh.toFixed(2)),
    };
  }

  return null;
};

export const registerSegmentAttemptsForActivity = async ({
  userId,
  activityId,
  activityType,
  points,
}: {
  userId: string;
  activityId: string;
  activityType: string;
  points: ActivityPoint[];
}) => {
  if (!userId || !activityId || points.length < 2) return [];

  const segmentsSnapshot = await get(ref(database, SEGMENTS_PATH));
  const segments = mapSegmentSnapshot(segmentsSnapshot).filter((segment) =>
    segment.activityTypesAllowed.includes(activityType)
  );
  if (segments.length === 0) return [];

  const attemptsSaved: string[] = [];
  for (const segment of segments) {
    const attempt = detectSegmentAttempt(points, segment);
    if (!attempt) continue;

    const attemptRef = push(ref(database, SEGMENT_ATTEMPTS_PATH));
    await set(attemptRef, {
      segmentId: segment.id,
      activityId,
      userId,
      activityType,
      enteredAt: attempt.enteredAt,
      exitedAt: attempt.exitedAt,
      durationSec: attempt.durationSec,
      distanceMeters: attempt.distanceMeters,
      avgSpeedKmh: attempt.avgSpeedKmh,
      createdAt: new Date().toISOString(),
    });
    attemptsSaved.push(attemptRef.key || "");
  }

  return attemptsSaved.filter(Boolean);
};

export const getSegmentById = async (segmentId: string) => {
  if (!segmentId) return null;

  const snapshot = await get(ref(database, `${SEGMENTS_PATH}/${segmentId}`));
  if (!snapshot.exists()) return null;

  const list = mapSegmentSnapshot({
    exists: () => true,
    val: () => ({ [segmentId]: snapshot.val() }),
  });
  return list[0] || null;
};

export const buildSegmentLeaderboards = (
  attempts: SegmentAttempt[],
  currentUserId?: string,
  friendIds?: Set<string>
) => {
  const sorted = [...attempts].sort((a, b) => a.durationSec - b.durationSec);
  const global = sorted.slice(0, 20);
  const friends = friendIds
    ? sorted.filter((item) => friendIds.has(item.userId)).slice(0, 20)
    : [];
  const mine = currentUserId ? sorted.filter((item) => item.userId === currentUserId) : [];
  return { global, friends, mine };
};

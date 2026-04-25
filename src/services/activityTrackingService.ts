import * as Location from "expo-location";
import * as SQLite from "expo-sqlite";
import * as TaskManager from "expo-task-manager";
import { get, push, ref, set } from "firebase/database";
import { auth, database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import {
  ActiveActivitySession,
  ActivityPoint,
  ActivityStatus,
  ActivityType,
  PauseReason,
  TrackingMode,
} from "../models/activity";
import {
  calculateDistance3DMeters,
  metersToKm,
  calculatePace,
} from "../utils/activityMetrics";
import { toCoordinate } from "../utils/geo";
import { getUserPrivacyZone, sanitizeRouteForPublicView } from "./privacyZoneService";

export type {
  ActiveActivitySession,
  ActivityPoint,
  ActivityStatus,
  ActivityType,
  PauseReason,
  TrackingMode,
};

type ActiveActivitySessionMeta = Omit<ActiveActivitySession, "points">;

type StartTrackingInput = {
  userId: string;
  activityType: ActivityType;
  initialPoint?: { latitude: number; longitude: number; altitude?: number | null };
};

type SaveRouteInput = {
  routeName: string;
  description?: string;
  activityType?: ActivityType;
  difficulty?: string;
  estimatedTime?: string | null;
  terrain?: string | null;
  visibility?: "public" | "friends" | "private";
};

const TRACKING_TASK_NAME = "tracktrail-background-location";
const TRACKING_DB_NAME = "tracktrail_tracking.db";
const MIN_POINT_DISTANCE_METERS = 4;
const MAX_GPS_JUMP_METERS = 250;
const ELEVATION_NOISE_THRESHOLD_METERS = 1.5;
const AUTO_PAUSE_IDLE_MS = 5000;
const MAX_SYNC_ATTEMPTS = 7;

const MAX_GPS_JUMP_METERS_BY_ACTIVITY: Record<ActivityType, number> = {
  caminhada: 90,
  corrida: 140,
  trilha: 120,
  bike: 260,
};

const MAX_REASONABLE_SPEED_MPS_BY_ACTIVITY: Record<ActivityType, number> = {
  caminhada: 2.8,
  corrida: 7.5,
  trilha: 5.5,
  bike: 22,
};

const AUTO_PAUSE_THRESHOLD_KMH_BY_ACTIVITY: Record<ActivityType, number> = {
  caminhada: 0.8,
  corrida: 1.2,
  trilha: 0.9,
  bike: 2.4,
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let processingSyncQueue = false;

const getTrackingDb = async () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(TRACKING_DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS active_session (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tracking_points (
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          altitude REAL,
          accuracy REAL,
          timestamp INTEGER NOT NULL,
          PRIMARY KEY (session_id, seq)
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          next_retry_at INTEGER DEFAULT 0,
          last_error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tracking_points_session_seq
          ON tracking_points(session_id, seq);
      `);

      try {
        await db.execAsync("ALTER TABLE tracking_points ADD COLUMN altitude REAL;");
      } catch {
        // Coluna já existe.
      }

      try {
        await db.execAsync("ALTER TABLE tracking_points ADD COLUMN accuracy REAL;");
      } catch {
        // Coluna já existe.
      }

      try {
        await db.execAsync("ALTER TABLE sync_queue ADD COLUMN next_retry_at INTEGER DEFAULT 0;");
      } catch {
        // Coluna já existe.
      }

      try {
        await db.execAsync("ALTER TABLE sync_queue ADD COLUMN last_error TEXT;");
      } catch {
        // Coluna já existe.
      }

      return db;
    })();
  }

  return dbPromise;
};

const resolveMaxReasonableSpeedMps = (activityType: ActivityType) => {
  return MAX_REASONABLE_SPEED_MPS_BY_ACTIVITY[activityType] || 10;
};

const resolveMaxJumpMeters = (activityType: ActivityType) => {
  return MAX_GPS_JUMP_METERS_BY_ACTIVITY[activityType] || MAX_GPS_JUMP_METERS;
};

const buildDefaultSessionMeta = (
  input: Pick<StartTrackingInput, "userId" | "activityType">,
  mode: TrackingMode,
  now: number
): ActiveActivitySessionMeta => ({
  id: `${input.userId}-${now}`,
  userId: input.userId,
  activityType: input.activityType,
  status: "recording",
  trackingMode: mode,
  startedAt: now,
  pausedDurationMs: 0,
  pausedAt: undefined,
  lastPauseReason: null,
  distanceKm: 0,
  createdAt: new Date(now).toISOString(),
  elevation: {
    gainMeters: 0,
    lossMeters: 0,
    minAltitude: null,
    maxAltitude: null,
    currentAltitude: null,
  },
  autoPause: {
    enabled: true,
    speedThresholdKmh: AUTO_PAUSE_THRESHOLD_KMH_BY_ACTIVITY[input.activityType] || 1,
    idleMsBeforePause: AUTO_PAUSE_IDLE_MS,
    belowThresholdSince: null,
  },
});

const normalizeLegacyMeta = (raw: any): ActiveActivitySessionMeta | null => {
  if (!raw || typeof raw !== "object") return null;

  const activityType = (raw.activityType || "trilha") as ActivityType;
  const legacyStatus = String(raw.status || "recording");
  const status: ActivityStatus =
    legacyStatus === "paused"
      ? "paused_manual"
      : legacyStatus === "paused_manual" || legacyStatus === "paused_auto" || legacyStatus === "finished"
        ? (legacyStatus as ActivityStatus)
        : "recording";

  return {
    id: String(raw.id || ""),
    userId: String(raw.userId || ""),
    activityType,
    status,
    trackingMode: raw.trackingMode === "background" ? "background" : "foreground",
    startedAt: Number(raw.startedAt || Date.now()),
    endedAt: typeof raw.endedAt === "number" ? raw.endedAt : undefined,
    pausedAt: typeof raw.pausedAt === "number" ? raw.pausedAt : undefined,
    pausedDurationMs: Number(raw.pausedDurationMs || 0),
    lastPauseReason:
      raw.lastPauseReason === "manual" || raw.lastPauseReason === "auto"
        ? (raw.lastPauseReason as PauseReason)
        : null,
    distanceKm: Number(raw.distanceKm || 0),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    elevation: {
      gainMeters: Number(raw?.elevation?.gainMeters || 0),
      lossMeters: Number(raw?.elevation?.lossMeters || 0),
      minAltitude:
        typeof raw?.elevation?.minAltitude === "number" ? Number(raw.elevation.minAltitude) : null,
      maxAltitude:
        typeof raw?.elevation?.maxAltitude === "number" ? Number(raw.elevation.maxAltitude) : null,
      currentAltitude:
        typeof raw?.elevation?.currentAltitude === "number"
          ? Number(raw.elevation.currentAltitude)
          : null,
    },
    autoPause: {
      enabled: raw?.autoPause?.enabled !== false,
      speedThresholdKmh:
        typeof raw?.autoPause?.speedThresholdKmh === "number"
          ? Number(raw.autoPause.speedThresholdKmh)
          : AUTO_PAUSE_THRESHOLD_KMH_BY_ACTIVITY[activityType] || 1,
      idleMsBeforePause:
        typeof raw?.autoPause?.idleMsBeforePause === "number"
          ? Number(raw.autoPause.idleMsBeforePause)
          : AUTO_PAUSE_IDLE_MS,
      belowThresholdSince:
        typeof raw?.autoPause?.belowThresholdSince === "number"
          ? Number(raw.autoPause.belowThresholdSince)
          : null,
    },
  };
};

const isInvalidGpsJump = (
  previous: ActivityPoint,
  current: ActivityPoint,
  segmentMeters: number,
  activityType: ActivityType
): boolean => {
  const maxJumpMeters = resolveMaxJumpMeters(activityType);
  const elapsedMs = current.timestamp - previous.timestamp;
  if (elapsedMs <= 0) {
    return true;
  }

  if (segmentMeters <= MIN_POINT_DISTANCE_METERS) {
    return false;
  }

  const elapsedSec = elapsedMs / 1000;
  const speedMps = segmentMeters / elapsedSec;
  const maxReasonableSpeedMps = resolveMaxReasonableSpeedMps(activityType);

  // Ponto com baixa precisão e salto relevante tende a ser ruído. Tornamos o descarte mais agressivo.
  const poorAccuracy =
    (typeof current.accuracy === "number" && current.accuracy > 65) ||
    (typeof previous.accuracy === "number" && previous.accuracy > 65);
  if (poorAccuracy && segmentMeters >= 40) {
    return true;
  }

  // Em janelas curtas, um salto acima desse limite é quase sempre glitch de GPS.
  if (elapsedSec <= 12 && segmentMeters > maxJumpMeters) {
    return true;
  }

  // Mesmo em janelas maiores, velocidade acima do limite físico do esporte é inválida.
  if (speedMps > maxReasonableSpeedMps) {
    return true;
  }

  // Fallback global para saltos muito extremos.
  if (segmentMeters > MAX_GPS_JUMP_METERS * 2 && elapsedSec <= 20) {
    return true;
  }

  return false;
};

const normalizeAltitude = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

const normalizeAccuracy = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return null;
};

const toActivityPoint = (value: any, fallbackTimestamp = Date.now()): ActivityPoint | null => {
  const coordinate = toCoordinate(value);
  if (!coordinate) {
    return null;
  }

  const timestamp =
    typeof value?.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp
      : fallbackTimestamp;

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    altitude: normalizeAltitude(value?.altitude),
    accuracy: normalizeAccuracy(value?.accuracy),
    timestamp,
  };
};

const updateElevationStats = (session: ActiveActivitySession, point: ActivityPoint) => {
  const altitude = normalizeAltitude(point.altitude);
  if (altitude === null) return;

  const previousAltitude = normalizeAltitude(
    session.points.length > 0 ? session.points[session.points.length - 1].altitude : null
  );

  if (session.elevation.minAltitude === null || altitude < session.elevation.minAltitude) {
    session.elevation.minAltitude = altitude;
  }

  if (session.elevation.maxAltitude === null || altitude > session.elevation.maxAltitude) {
    session.elevation.maxAltitude = altitude;
  }

  session.elevation.currentAltitude = altitude;

  if (previousAltitude === null) return;

  const delta = altitude - previousAltitude;
  if (Math.abs(delta) < ELEVATION_NOISE_THRESHOLD_METERS) return;

  if (delta > 0) {
    session.elevation.gainMeters += delta;
  } else {
    session.elevation.lossMeters += Math.abs(delta);
  }
};

const toSessionMeta = (session: ActiveActivitySession): ActiveActivitySessionMeta => {
  const { points: _points, ...meta } = session;
  return meta;
};

const saveSessionMeta = async (meta: ActiveActivitySessionMeta | null) => {
  const db = await getTrackingDb();

  if (!meta) {
    await db.runAsync("DELETE FROM active_session WHERE id = 1");
    return;
  }

  await db.runAsync(
    `INSERT INTO active_session (id, payload) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    JSON.stringify(meta)
  );
};

const getSessionMeta = async (): Promise<ActiveActivitySessionMeta | null> => {
  const db = await getTrackingDb();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM active_session WHERE id = 1"
  );

  if (!row?.payload) return null;

  try {
    return normalizeLegacyMeta(JSON.parse(row.payload));
  } catch {
    return null;
  }
};

const clearSessionPoints = async (sessionId: string) => {
  const db = await getTrackingDb();
  await db.runAsync("DELETE FROM tracking_points WHERE session_id = ?", sessionId);
};

const loadSessionPoints = async (sessionId: string): Promise<ActivityPoint[]> => {
  const db = await getTrackingDb();
  const rows = await db.getAllAsync<{
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    timestamp: number;
  }>(
    "SELECT latitude, longitude, altitude, accuracy, timestamp FROM tracking_points WHERE session_id = ? ORDER BY seq ASC",
    sessionId
  );

  return rows.map((row) => ({
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    altitude: typeof row.altitude === "number" ? Number(row.altitude) : null,
    accuracy: typeof row.accuracy === "number" ? Number(row.accuracy) : null,
    timestamp: Number(row.timestamp),
  }));
};

const appendSessionPointsBatch = async (sessionId: string, points: ActivityPoint[]) => {
  if (!points.length) return;
  const db = await getTrackingDb();
  const row = await db.getFirstAsync<{ nextSeq: number }>(
    "SELECT COALESCE(MAX(seq) + 1, 0) AS nextSeq FROM tracking_points WHERE session_id = ?",
    sessionId
  );

  let nextSeq = Number(row?.nextSeq ?? 0);
  await db.withTransactionAsync(async () => {
    for (const point of points) {
      await db.runAsync(
        "INSERT INTO tracking_points(session_id, seq, latitude, longitude, altitude, accuracy, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        sessionId,
        nextSeq,
        point.latitude,
        point.longitude,
        typeof point.altitude === "number" ? point.altitude : null,
        typeof point.accuracy === "number" ? point.accuracy : null,
        point.timestamp
      );
      nextSeq += 1;
    }
  });
};

const persistSessionPoints = async (sessionId: string, points: ActivityPoint[]) => {
  const db = await getTrackingDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM tracking_points WHERE session_id = ?", sessionId);

    for (let seq = 0; seq < points.length; seq += 1) {
      const point = points[seq];
      await db.runAsync(
        "INSERT INTO tracking_points(session_id, seq, latitude, longitude, altitude, accuracy, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        sessionId,
        seq,
        point.latitude,
        point.longitude,
        typeof point.altitude === "number" ? point.altitude : null,
        typeof point.accuracy === "number" ? point.accuracy : null,
        point.timestamp
      );
    }
  });
};

const saveSession = async (session: ActiveActivitySession | null) => {
  if (!session) {
    const previousMeta = await getSessionMeta();
    if (previousMeta?.id) {
      await clearSessionPoints(previousMeta.id);
    }
    await saveSessionMeta(null);
    return;
  }

  await saveSessionMeta(toSessionMeta(session));
};

const applyPauseUpdate = (session: ActiveActivitySession, now: number) => {
  if (!session.pausedAt) return;
  session.pausedDurationMs += Math.max(0, now - session.pausedAt);
  delete session.pausedAt;
};

const setPaused = (session: ActiveActivitySession, reason: PauseReason, timestamp: number) => {
  if (session.status === "paused_manual" || session.status === "paused_auto") return;
  session.status = reason === "manual" ? "paused_manual" : "paused_auto";
  session.pausedAt = timestamp;
  session.lastPauseReason = reason;
};

const setRecording = (session: ActiveActivitySession, timestamp: number) => {
  if (session.status === "recording") return;
  applyPauseUpdate(session, timestamp);
  session.status = "recording";
  session.lastPauseReason = null;
  session.autoPause.belowThresholdSince = null;
};

const processIncomingPoint = (
  session: ActiveActivitySession,
  point: ActivityPoint
): { appended: boolean; segmentSpeedKmh: number } => {
  const previous = session.points[session.points.length - 1];

  if (!previous) {
    updateElevationStats(session, point);
    session.points.push(point);
    return { appended: true, segmentSpeedKmh: 0 };
  }

  // Usamos a distância 2D (horizontal) para o acumulador principal para evitar que o ruído do sensor de altitude infle a distância total.
  // Isso é o padrão na indústria (ex: Strava).
  const segmentMeters2D = calculateDistance3DMeters(
    previous.latitude,
    previous.longitude,
    null, // Ignora altitude para cálculo 2D
    point.latitude,
    point.longitude,
    null
  );

  const elapsedSec = Math.max(0, (point.timestamp - previous.timestamp) / 1000);
  const segmentSpeedKmh = elapsedSec > 0 ? metersToKm(segmentMeters2D) / (elapsedSec / 3600) : 0;

  if (session.status === "paused_manual") {
    return { appended: false, segmentSpeedKmh };
  }

  if (session.status === "paused_auto") {
    if (segmentSpeedKmh >= session.autoPause.speedThresholdKmh) {
      setRecording(session, point.timestamp);
    } else {
      return { appended: false, segmentSpeedKmh };
    }
  }

  if (session.status === "recording" && session.autoPause.enabled) {
    if (segmentSpeedKmh < session.autoPause.speedThresholdKmh) {
      if (!session.autoPause.belowThresholdSince) {
        session.autoPause.belowThresholdSince = point.timestamp;
      }

      const idleMs = point.timestamp - session.autoPause.belowThresholdSince;
      if (idleMs >= session.autoPause.idleMsBeforePause) {
        setPaused(session, "auto", point.timestamp);
        return { appended: false, segmentSpeedKmh };
      }
    } else {
      session.autoPause.belowThresholdSince = null;
    }
  }

  if (segmentMeters2D < MIN_POINT_DISTANCE_METERS) {
    return { appended: false, segmentSpeedKmh };
  }

  if (isInvalidGpsJump(previous, point, segmentMeters2D, session.activityType)) {
    return { appended: false, segmentSpeedKmh };
  }

  session.distanceKm += metersToKm(segmentMeters2D);
  updateElevationStats(session, point); // Estatísticas de elevação continuam usando altitude real
  session.points.push(point);
  return { appended: true, segmentSpeedKmh };
};

export const getActiveSession = async (): Promise<ActiveActivitySession | null> => {
  const meta = await getSessionMeta();
  if (!meta) return null;

  const points = await loadSessionPoints(meta.id);
  return {
    ...meta,
    points,
  };
};

const stopBackgroundTrackingIfRunning = async () => {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
  }
};

const ensurePermissions = async () => {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      throw new Error("Permissão de localização negada.");
    }

    const background = await Location.requestBackgroundPermissionsAsync();

    return {
      hasBackground: background.status === "granted",
    };
  } catch (error: any) {
    throw new Error(error?.message || "Não foi possível validar as permissões de localização.");
  }
};

const startBackgroundTracking = async (activityType: ActivityType) => {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME);
  if (alreadyStarted) {
    return;
  }

  const isHighSpeed = activityType === "bike" || activityType === "corrida";

  await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
    accuracy: isHighSpeed ? Location.Accuracy.Highest : Location.Accuracy.Balanced,
    distanceInterval: isHighSpeed ? 5 : 10, // Metros entre atualizações
    timeInterval: isHighSpeed ? 2000 : 5000, // Ms entre atualizações
    deferredUpdatesDistance: isHighSpeed ? 15 : 30,
    deferredUpdatesInterval: 10000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Track-Traill em atividade",
      notificationBody: "Gravando seu trajeto por GPS.",
      notificationColor: "#1e4db7",
    },
  });
};

if (!TaskManager.isTaskDefined(TRACKING_TASK_NAME)) {
  TaskManager.defineTask(TRACKING_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody<any>) => {
    if (error) {
      console.warn("[activity] background task received error:", error?.message || String(error));
      return;
    }

    try {
      const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
      if (!locations || locations.length === 0) {
        return;
      }

      const activeSession = await getActiveSession();
      if (!activeSession || activeSession.status === "finished") {
        return;
      }

      const updatedSession = { ...activeSession, points: [...activeSession.points] };
      const appendedBatch: ActivityPoint[] = [];

      for (const location of locations) {
        const safePoint = toActivityPoint(location.coords, location.timestamp || Date.now());
        if (!safePoint) continue;

        const { appended } = processIncomingPoint(updatedSession, safePoint);
        if (appended) {
          appendedBatch.push(safePoint);
        }
      }

      if (appendedBatch.length > 0) {
        await appendSessionPointsBatch(updatedSession.id, appendedBatch);
      }

      await saveSession(updatedSession);
    } catch (taskError: any) {
      console.warn("[activity] background task failed:", taskError?.message || String(taskError));
    }
  });
}

export const appendForegroundPoint = async (coords: {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  timestamp?: number;
}) => {
  const activeSession = await getActiveSession();
  if (!activeSession || activeSession.status === "finished") {
    return null;
  }

  const safePoint = toActivityPoint(coords, coords.timestamp || Date.now());
  if (!safePoint) {
    return activeSession;
  }

  const updatedSession = { ...activeSession, points: [...activeSession.points] };
  const { appended } = processIncomingPoint(updatedSession, safePoint);

  if (appended) {
    await appendSessionPointsBatch(updatedSession.id, [safePoint]);
  }

  await saveSession(updatedSession);
  return updatedSession;
};

export const startActivityTracking = async (
  input: StartTrackingInput
): Promise<{ session: ActiveActivitySession; mode: TrackingMode }> => {
  const permissions = await ensurePermissions();
  const mode: TrackingMode = permissions.hasBackground ? "background" : "foreground";

  const existing = await getActiveSession();
  if (existing && existing.status !== "finished") {
    const resumed = { ...existing, trackingMode: mode, points: [...existing.points] };

    if (resumed.status === "paused_manual" || resumed.status === "paused_auto") {
      setRecording(resumed, Date.now());
    }

    await saveSession(resumed);

    if (mode === "background") {
      await startBackgroundTracking(resumed.activityType);
    }

    return { session: resumed, mode };
  }

  const now = Date.now();
  const base = buildDefaultSessionMeta(input, mode, now);
  const session: ActiveActivitySession = {
    ...base,
    points: [],
  };

  if (input.initialPoint) {
    const initialPoint = toActivityPoint({
      latitude: input.initialPoint.latitude,
      longitude: input.initialPoint.longitude,
      altitude: input.initialPoint.altitude ?? null,
      timestamp: now,
    });

    if (initialPoint) {
      updateElevationStats(session, initialPoint);
      session.points.push(initialPoint);
    }
  }

  await persistSessionPoints(session.id, session.points);
  await saveSession(session);

  if (mode === "background") {
    await startBackgroundTracking(session.activityType);
  }

  return { session, mode };
};

export const pauseActivityTracking = async () => {
  const activeSession = await getActiveSession();
  if (!activeSession || activeSession.status === "finished") {
    return activeSession;
  }

  const pausedSession: ActiveActivitySession = {
    ...activeSession,
    points: [...activeSession.points],
  };
  setPaused(pausedSession, "manual", Date.now());

  await saveSession(pausedSession);
  await stopBackgroundTrackingIfRunning();

  return pausedSession;
};

export const resumeActivityTracking = async () => {
  const activeSession = await getActiveSession();
  if (!activeSession || activeSession.status === "finished") {
    return null;
  }

  const permissions = await ensurePermissions();
  const mode: TrackingMode = permissions.hasBackground ? "background" : "foreground";

  const resumedSession: ActiveActivitySession = {
    ...activeSession,
    trackingMode: mode,
    points: [...activeSession.points],
  };

  setRecording(resumedSession, Date.now());
  await saveSession(resumedSession);

  if (mode === "background") {
    await startBackgroundTracking(resumedSession.activityType);
  }

  return {
    session: resumedSession,
    mode,
  };
};

export const finishActivityTracking = async () => {
  const activeSession = await getActiveSession();
  if (!activeSession) {
    throw new Error("Nenhuma atividade em andamento.");
  }

  await stopBackgroundTrackingIfRunning();

  const finishedAt = Date.now();
  const finishedSession: ActiveActivitySession = {
    ...activeSession,
    points: [...activeSession.points],
    status: "finished",
    endedAt: finishedAt,
    lastPauseReason: activeSession.lastPauseReason || null,
  };

  const wasPaused =
    activeSession.status === "paused_manual" || activeSession.status === "paused_auto";
  if (wasPaused && finishedSession.pausedAt) {
    applyPauseUpdate(finishedSession, finishedAt);
  }

  delete finishedSession.pausedAt;
  finishedSession.autoPause.belowThresholdSince = null;

  await saveSession(finishedSession);

  return finishedSession;
};

export const discardActiveSession = async () => {
  await stopBackgroundTrackingIfRunning();
  await saveSession(null);
};

const resolveNowBySessionStatus = (session: ActiveActivitySession): number => {
  if (session.status === "finished") {
    return session.endedAt || Date.now();
  }

  if (session.status === "paused_manual" || session.status === "paused_auto") {
    return session.pausedAt || Date.now();
  }

  return Date.now();
};

export const getSessionDurationSeconds = (session: ActiveActivitySession | null): number => {
  if (!session) return 0;

  const finishTimestamp = resolveNowBySessionStatus(session);
  const elapsedMs = Math.max(0, finishTimestamp - session.startedAt - session.pausedDurationMs);
  return Math.floor(elapsedMs / 1000);
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }

  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const getAverageSpeedKmh = (session: ActiveActivitySession | null): number => {
  if (!session) return 0;
  const durationSeconds = getSessionDurationSeconds(session);
  if (durationSeconds <= 0) return 0;

  return session.distanceKm / (durationSeconds / 3600);
};

export const getAveragePaceMinPerKm = (session: ActiveActivitySession | null): number | null => {
  if (!session) return null;
  const durationSeconds = getSessionDurationSeconds(session);
  return calculatePace(session.distanceKm, durationSeconds);
};

export const getSessionRecordingStateLabel = (session: ActiveActivitySession | null): string => {
  if (!session) return "inativo";
  if (session.status === "recording") return "gravando";
  if (session.status === "paused_auto") return "pausa automática";
  if (session.status === "paused_manual") return "pausa manual";
  return "finalizada";
};

export const saveFinishedSessionAsRoute = async (
  session: ActiveActivitySession,
  input: SaveRouteInput
) => {
  const currentUid = auth.currentUser?.uid || "";
  if (!currentUid || currentUid !== session.userId) {
    throw new Error("Sessão inválida para salvar rota.");
  }

  if (session.status !== "finished") {
    throw new Error("Finalize a atividade antes de salvar como rota.");
  }

  if (session.points.length < 2) {
    throw new Error("Trajeto muito curto. Grave mais pontos antes de salvar.");
  }

  const routeName = input.routeName?.trim();
  if (!routeName) {
    throw new Error("Informe um nome para a rota.");
  }

  const path = session.points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: typeof point.altitude === "number" ? point.altitude : null,
  }));

  const firstPoint = path[0];
  const lastPoint = path[path.length - 1];
  const activityType = input.activityType || session.activityType;
  const visibility = input.visibility || "public";
  const durationSeconds = getSessionDurationSeconds(session);
  const inferredDifficulty =
    activityType === "bike"
      ? "Média"
      : activityType === "corrida"
        ? "Difícil"
        : activityType === "caminhada"
          ? "Fácil"
          : "Média";
  const activitySaved = await saveFinishedSessionAsActivity(session, activityType, visibility);

  const userEmail = auth.currentUser?.email || "usuario@tracktrail";

  const baseRoutePayload = {
    nome: routeName,
    titulo: routeName,
    tipo: activityType,
    dificuldade: input.difficulty?.trim() || inferredDifficulty,
    distancia: `${session.distanceKm.toFixed(2)} km`,
    tempoEstimado: input.estimatedTime?.trim() || formatDuration(durationSeconds),
    duracaoSegundos: durationSeconds,
    terreno: input.terrain?.trim() || "Não informado",
    descricao: input.description?.trim() || "Rota gerada automaticamente por atividade GPS.",
    startPoint: firstPoint,
    endPoint: lastPoint,
    rotaCompleta: path,
    elevacaoGanhoM: Number(session.elevation.gainMeters.toFixed(1)),
    elevacaoPerdaM: Number(session.elevation.lossMeters.toFixed(1)),
    sugeridoPor: session.userId,
    emailAutor: userEmail,
    criadoEm: new Date().toISOString(),
    origem: "activity_tracking",
    activityId: activitySaved.activityId,
    visibility,
  };

  const shouldSendToPublicReview = visibility === "public";
  let publicPath = path;
  let privacySanitized = false;
  let privacyTrimStartPoints = 0;
  let privacyTrimEndPoints = 0;

  if (shouldSendToPublicReview) {
    const zone = await getUserPrivacyZone(session.userId);
    const sanitized = sanitizeRouteForPublicView(path, zone);
    if (sanitized.publicPoints.length >= 2) {
      publicPath = sanitized.publicPoints.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: typeof point.altitude === "number" ? point.altitude : null,
      }));
      privacySanitized = sanitized.sanitized;
      privacyTrimStartPoints = sanitized.removedFromStart;
      privacyTrimEndPoints = sanitized.removedFromEnd;
    }
  }

  const publicStartPoint = publicPath[0] || firstPoint;
  const publicEndPoint = publicPath[publicPath.length - 1] || lastPoint;
  try {
    if (shouldSendToPublicReview) {
      const rotaRef = push(ref(database, "rotas_pendentes"));
      await set(rotaRef, {
        ...baseRoutePayload,
        startPoint: publicStartPoint,
        endPoint: publicEndPoint,
        rotaCompleta: publicPath,
        privacySanitized,
        privacyTrimStartPoints,
        privacyTrimEndPoints,
        status: "pendente",
      });

      await saveSession(null);
      return {
        activityId: activitySaved.activityId,
        routeId: rotaRef.key,
        visibility,
        reviewRequired: true,
      };
    }

    const userRouteRef = push(ref(database, `users/${session.userId}/rotas_tracadas`));
    await set(userRouteRef, {
      ...baseRoutePayload,
      status: "privada",
      userId: session.userId,
      userEmail: userEmail || null,
    });

    await saveSession(null);
    return {
      activityId: activitySaved.activityId,
      routeId: userRouteRef.key,
      visibility,
      reviewRequired: false,
    };
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível salvar a rota."));
  }
};

const addToSyncQueue = async (id: string, payload: any) => {
  const db = await getTrackingDb();
  await db.runAsync(
    `INSERT INTO sync_queue (id, payload, status, attempts, next_retry_at, last_error, created_at)
     VALUES (?, ?, 'pending', 0, 0, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       status = 'pending',
       attempts = 0,
       next_retry_at = 0,
       last_error = NULL`,
    id,
    JSON.stringify(payload),
    Date.now()
  );
};

const computeBackoffMs = (attempt: number) => {
  const cappedAttempt = Math.min(attempt, 8);
  const exponentialMs = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, cappedAttempt));
  const jitterMs = Math.floor(Math.random() * 750);
  return exponentialMs + jitterMs;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDurationSeconds = (atividade: any): number => {
  const durationSeconds = toFiniteNumber(atividade?.durationSeconds);
  if (durationSeconds !== null) return Math.max(0, durationSeconds);

  const duracao = toFiniteNumber(atividade?.duracao);
  if (duracao !== null) return Math.max(0, duracao);

  const duration = toFiniteNumber(atividade?.duration);
  if (duration !== null) return Math.max(0, duration);

  const tempoTotal = toFiniteNumber(atividade?.tempoTotal);
  if (tempoTotal !== null) return Math.max(0, tempoTotal);

  return 0;
};

const sumActivitiesStats = (activitiesData: any) => {
  let totalKm = 0;
  let totalDurationSeconds = 0;

  if (!activitiesData || typeof activitiesData !== "object") {
    return { totalKm, totalDurationSeconds };
  }

  Object.values(activitiesData).forEach((activity: any) => {
    totalKm += Math.max(0, Number(activity?.distancia || 0));
    totalDurationSeconds += parseDurationSeconds(activity);
  });

  return { totalKm, totalDurationSeconds };
};

export const adjustUserLifetimeStats = async (
  userId: string,
  deltaKm: number,
  deltaDurationSeconds: number
) => {
  if (!userId?.trim()) return;

  const userRef = ref(database, `users/${userId}`);
  const snapshot = await get(userRef);
  const userData = snapshot.exists() ? snapshot.val() || {} : {};
  const lifetimeStats = userData?.lifetimeStats || {};

  const currentTotalKm = toFiniteNumber(lifetimeStats?.totalKm);
  const currentTotalDurationSeconds = toFiniteNumber(lifetimeStats?.totalDurationSeconds);
  const hasLifetimeStats = currentTotalKm !== null && currentTotalDurationSeconds !== null;

  const baseline = hasLifetimeStats
    ? {
        totalKm: Math.max(0, currentTotalKm || 0),
        totalDurationSeconds: Math.max(0, currentTotalDurationSeconds || 0),
      }
    : sumActivitiesStats(userData?.atividades);

  const nextTotalKm = Math.max(0, baseline.totalKm + (Number.isFinite(deltaKm) ? deltaKm : 0));
  const nextTotalDurationSeconds = Math.max(
    0,
    baseline.totalDurationSeconds +
      (Number.isFinite(deltaDurationSeconds) ? deltaDurationSeconds : 0)
  );

  await set(ref(database, `users/${userId}/lifetimeStats`), {
    totalKm: Number(nextTotalKm.toFixed(2)),
    totalDurationSeconds: Math.round(nextTotalDurationSeconds),
    updatedAt: new Date().toISOString(),
  });
};

export const getPendingSyncCount = async (): Promise<number> => {
  const db = await getTrackingDb();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'");
  return row?.count || 0;
};

export const getPendingSyncActivities = async (): Promise<any[]> => {
  const db = await getTrackingDb();
  const rows = await db.getAllAsync<{ id: string, payload: string, status: string }>(
    "SELECT id, payload, status FROM sync_queue WHERE status != 'synced'"
  );

  return rows.map(row => {
    try {
      const payload = JSON.parse(row.payload);
      return {
        ...payload,
        id: row.id,
        isPending: true,
        status: row.status
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
};

export const removePendingSyncActivity = async (id: string): Promise<void> => {
  if (!id?.trim()) {
    throw new Error("ID de atividade pendente inválido.");
  }

  const db = await getTrackingDb();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", id);
};

export const processSyncQueue = async () => {
  if (processingSyncQueue) return;
  processingSyncQueue = true;

  try {
    const db = await getTrackingDb();
    const now = Date.now();
    const pending = await db.getAllAsync<{
      id: string;
      payload: string;
      attempts: number;
      next_retry_at: number | null;
    }>(
      `SELECT id, payload, attempts, next_retry_at
       FROM sync_queue
       WHERE status = 'pending' AND COALESCE(next_retry_at, 0) <= ?
       ORDER BY created_at ASC LIMIT 5`,
      now
    );

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload);
        const activityRef = push(ref(database, `users/${payload.userId}/atividades`));
        
        // Remove campos locais que não devem ir pro Firebase
        const { points, ...meta } = payload;
        
        await set(activityRef, {
          ...meta,
          rota: points.map((p: any) => ({
            latitude: p.latitude,
            longitude: p.longitude,
            altitude: p.altitude ?? null
          })),
          status: "synced",
          syncId: item.id
        });

        adjustUserLifetimeStats(
          String(payload?.userId || ""),
          Number(payload?.distancia || 0),
          Number(payload?.duracao || 0)
        ).catch((statsError: any) => {
          console.warn(
            `[sync] Falha ao atualizar lifetimeStats para ${item.id}:`,
            statsError?.message || String(statsError)
          );
        });

        await db.runAsync(
          "UPDATE sync_queue SET status = 'synced', attempts = ?, next_retry_at = 0, last_error = NULL WHERE id = ?",
          item.attempts,
          item.id
        );
        console.log(`[sync] Atividade ${item.id} sincronizada com sucesso.`);
      } catch (error: any) {
        const newAttempts = item.attempts + 1;
        const newStatus = newAttempts >= MAX_SYNC_ATTEMPTS ? "failed" : "pending";
        const backoffMs = computeBackoffMs(newAttempts);
        const nextRetryAt = newStatus === "failed" ? 0 : Date.now() + backoffMs;
        const errorMessage = error?.message || String(error);
        await db.runAsync(
          "UPDATE sync_queue SET attempts = ?, status = ?, next_retry_at = ?, last_error = ? WHERE id = ?",
          newAttempts,
          newStatus,
          nextRetryAt,
          errorMessage,
          item.id
        );
        console.warn(
          newStatus === "failed"
            ? `[sync] Falha permanente ao sincronizar ${item.id} após ${newAttempts} tentativas:`
            : `[sync] Falha ao sincronizar ${item.id}. Tentativa ${newAttempts}, nova tentativa em ~${Math.round(
                backoffMs / 1000
              )}s:`,
          errorMessage
        );
      }
    }
  } finally {
    processingSyncQueue = false;
  }
};

export const saveFinishedSessionAsActivity = async (
  session: ActiveActivitySession,
  activityTypeOverride?: ActivityType,
  visibility: "public" | "friends" | "private" = "private"
) => {
  if (session.status !== "finished") {
    throw new Error("Finalize a atividade antes de salvar.");
  }

  const duration = getSessionDurationSeconds(session);
  const activityType = activityTypeOverride || session.activityType;
  const avgSpeed = getAverageSpeedKmh(session);
  const avgPace = getAveragePaceMinPerKm(session);

  const payload = {
    userId: session.userId,
    tipo: activityType,
    duracao: duration,
    distancia: Number(session.distanceKm.toFixed(2)),
    points: session.points,
    elevacaoGanhoM: Number(session.elevation.gainMeters.toFixed(1)),
    elevacaoPerdaM: Number(session.elevation.lossMeters.toFixed(1)),
    altitudeMinM: session.elevation.minAltitude,
    altitudeMaxM: session.elevation.maxAltitude,
    velocidadeMediaKmh: Number(avgSpeed.toFixed(2)),
    paceMedioMinKm: avgPace,
    visibility,
    criadoEm: new Date().toISOString(),
    sessionId: session.id,
  };

  // 1. Salva na fila local primeiro (Garantia de Dados)
  await addToSyncQueue(session.id, payload);

  // 2. Tenta processar a fila imediatamente (se houver rede)
  // Fazemos isso em background sem travar a UI
  processSyncQueue().catch(() => {});

  return {
    activityId: session.id,
    durationSeconds: duration,
    isQueued: true
  };
};

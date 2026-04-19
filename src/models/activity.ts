export type ActivityType = "bike" | "corrida" | "caminhada" | "trilha";
export type TrackingMode = "background" | "foreground";
export type PauseReason = "manual" | "auto";
export type ActivityStatus = "recording" | "paused_manual" | "paused_auto" | "finished";

export type ActivityPoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp: number;
};

export type ElevationStats = {
  gainMeters: number;
  lossMeters: number;
  minAltitude: number | null;
  maxAltitude: number | null;
  currentAltitude: number | null;
};

export type AutoPauseConfig = {
  enabled: boolean;
  speedThresholdKmh: number;
  idleMsBeforePause: number;
  belowThresholdSince: number | null;
};

export type ActiveActivitySession = {
  id: string;
  userId: string;
  activityType: ActivityType;
  status: ActivityStatus;
  trackingMode: TrackingMode;
  startedAt: number;
  endedAt?: number;
  pausedAt?: number;
  pausedDurationMs: number;
  lastPauseReason?: PauseReason | null;
  distanceKm: number;
  points: ActivityPoint[];
  createdAt: string;
  elevation: ElevationStats;
  autoPause: AutoPauseConfig;
};


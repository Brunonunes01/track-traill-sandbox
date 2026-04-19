export type SegmentVisibility = "public" | "friends" | "private";

export type SegmentPoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
};

export type Segment = {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  startPoint: SegmentPoint;
  endPoint: SegmentPoint;
  polyline: SegmentPoint[];
  distanceMeters: number;
  elevationGainMeters: number;
  activityTypesAllowed: string[];
  visibility: SegmentVisibility;
  createdAt: string;
};

export type SegmentAttempt = {
  id: string;
  segmentId: string;
  activityId: string;
  userId: string;
  activityType: string;
  enteredAt: number;
  exitedAt: number;
  durationSec: number;
  distanceMeters: number;
  avgSpeedKmh: number;
  createdAt: string;
};

export type SegmentMatchingConfig = {
  startToleranceMeters: number;
  endToleranceMeters: number;
  minDurationSec: number;
  maxDurationSec: number;
  minTrackPointsInside: number;
};

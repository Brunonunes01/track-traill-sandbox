export type PrivacyZone = {
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number;
  enabled: boolean;
  updatedAt?: string;
};

export type SanitizedRouteResult = {
  publicPoints: { latitude: number; longitude: number; altitude?: number | null }[];
  removedFromStart: number;
  removedFromEnd: number;
  sanitized: boolean;
};

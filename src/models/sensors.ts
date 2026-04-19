export type SensorType = "heart_rate" | "cadence";

export type SensorDevice = {
  id: string;
  name: string;
  type: SensorType;
  connected: boolean;
};

export type SensorSample = {
  timestamp: number;
  value: number;
};

export type SensorActivityStats = {
  average: number;
  max: number;
  samples: SensorSample[];
};

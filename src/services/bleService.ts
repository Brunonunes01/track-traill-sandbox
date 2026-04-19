import { Platform } from "react-native";
import { SensorActivityStats, SensorDevice, SensorSample } from "../models/sensors";

type Listener = (devices: SensorDevice[]) => void;

let scannedDevices: SensorDevice[] = [];
let currentDevice: SensorDevice | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  listeners.forEach((listener) => listener(scannedDevices));
};

export const getBleSupportStatus = () => {
  const supported = false;
  const reason =
    "BLE real requer módulo nativo (ex.: react-native-ble-plx com dev client). Nesta build Expo Managed, fluxo está em modo demonstrativo.";
  return {
    supported,
    platform: Platform.OS,
    reason,
  };
};

export const subscribeScannedSensors = (onChange: Listener) => {
  listeners.add(onChange);
  onChange(scannedDevices);
  return () => {
    listeners.delete(onChange);
  };
};

export const startSensorScan = async () => {
  scannedDevices = [
    { id: "demo-hr-1", name: "HR Sensor Demo", type: "heart_rate", connected: false },
    { id: "demo-cad-1", name: "Cadence Demo", type: "cadence", connected: false },
  ];
  emit();
  return scannedDevices;
};

export const connectSensor = async (deviceId: string) => {
  scannedDevices = scannedDevices.map((device) => {
    const isTarget = device.id === deviceId;
    if (isTarget) {
      currentDevice = { ...device, connected: true };
    }
    return { ...device, connected: isTarget };
  });
  emit();
  return currentDevice;
};

export const disconnectSensor = async () => {
  currentDevice = null;
  scannedDevices = scannedDevices.map((device) => ({ ...device, connected: false }));
  emit();
};

export const readSensorLiveSample = async (): Promise<SensorSample | null> => {
  if (!currentDevice) return null;
  const timestamp = Date.now();

  if (currentDevice.type === "heart_rate") {
    return { timestamp, value: Math.round(110 + Math.random() * 45) };
  }

  return { timestamp, value: Math.round(72 + Math.random() * 30) };
};

export const buildSensorStats = (samples: SensorSample[]): SensorActivityStats => {
  if (!samples.length) return { average: 0, max: 0, samples: [] };
  const max = samples.reduce((acc, item) => Math.max(acc, item.value), 0);
  const average = samples.reduce((acc, item) => acc + item.value, 0) / samples.length;
  return {
    average: Number(average.toFixed(1)),
    max: Number(max.toFixed(1)),
    samples: samples.slice(-120),
  };
};

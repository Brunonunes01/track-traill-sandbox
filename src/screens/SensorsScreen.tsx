import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SensorDevice, SensorSample } from "../models/sensors";
import {
  buildSensorStats,
  connectSensor,
  disconnectSensor,
  getBleSupportStatus,
  readSensorLiveSample,
  startSensorScan,
  subscribeScannedSensors,
} from "../services/bleService";

export default function SensorsScreen() {
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [samples, setSamples] = useState<SensorSample[]>([]);
  const support = useMemo(() => getBleSupportStatus(), []);

  useEffect(() => {
    const unsubscribe = subscribeScannedSensors((list) => setDevices(list));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!streaming) return;

    const interval = setInterval(async () => {
      const sample = await readSensorLiveSample();
      if (!sample) return;
      setSamples((current) => [...current.slice(-119), sample]);
    }, 1500);

    return () => clearInterval(interval);
  }, [streaming]);

  const stats = useMemo(() => buildSensorStats(samples), [samples]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sensores BLE</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Modo atual: {support.supported ? "BLE nativo" : "Demonstração / fallback"}
        </Text>
        <Text style={styles.infoText}>{support.reason}</Text>
      </View>

      <TouchableOpacity
        style={styles.scanBtn}
        onPress={async () => {
          try {
            setScanning(true);
            await startSensorScan();
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Falha ao buscar sensores.");
          } finally {
            setScanning(false);
          }
        }}
      >
        {scanning ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.scanBtnText}>Buscar sensores</Text>}
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, marginTop: 10 }}
        renderItem={({ item }) => (
          <View style={styles.deviceCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceMeta}>
                {item.type === "heart_rate" ? "Frequência cardíaca" : "Cadência"} •{" "}
                {item.connected ? "conectado" : "desconectado"}
              </Text>
            </View>
            {item.connected ? (
              <TouchableOpacity
                style={[styles.deviceAction, styles.disconnectBtn]}
                onPress={async () => {
                  await disconnectSensor();
                  setStreaming(false);
                }}
              >
                <Text style={styles.deviceActionText}>Desconectar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.deviceAction, styles.connectBtn]}
                onPress={async () => {
                  await connectSensor(item.id);
                  setSamples([]);
                  setStreaming(true);
                }}
              >
                <Text style={styles.deviceActionText}>Conectar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Métricas da sessão</Text>
        <Text style={styles.statsText}>Média: {stats.average.toFixed(1)}</Text>
        <Text style={styles.statsText}>Máximo: {stats.max.toFixed(1)}</Text>
        <Text style={styles.statsText}>Amostras: {stats.samples.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 14 },
  title: { color: "#fff", fontWeight: "800", fontSize: 21, marginBottom: 10 },
  infoCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    padding: 10,
  },
  infoTitle: { color: "#f8fafc", fontWeight: "700", marginBottom: 3 },
  infoText: { color: "#94a3b8", fontSize: 12, lineHeight: 18 },
  scanBtn: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#1e40af",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnText: { color: "#fff", fontWeight: "700" },
  deviceCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deviceName: { color: "#fff", fontWeight: "700" },
  deviceMeta: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  deviceAction: {
    borderRadius: 8,
    minHeight: 34,
    minWidth: 94,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  connectBtn: { backgroundColor: "#16a34a" },
  disconnectBtn: { backgroundColor: "#b91c1c" },
  deviceActionText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  statsCard: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    padding: 10,
    gap: 3,
  },
  statsTitle: { color: "#e2e8f0", fontWeight: "700", marginBottom: 2 },
  statsText: { color: "#94a3b8", fontSize: 12 },
});

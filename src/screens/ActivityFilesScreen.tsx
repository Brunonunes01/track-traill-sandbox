import { Picker } from "@react-native-picker/picker";
import { onAuthStateChanged } from "firebase/auth";
import { get, push, ref, set } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../services/connectionFirebase";
import { exportActivityToGpxFile, importGpxFile, parseFitPlaceholder } from "../services/activityFilesService";

type ActivityOption = {
  id: string;
  label: string;
  points: { latitude: number; longitude: number; altitude?: number | null; timestamp?: number }[];
};

export default function ActivityFilesScreen() {
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [activityId, setActivityId] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!uid) {
        setLoading(false);
        return;
      }
      try {
        const snapshot = await get(ref(database, `users/${uid}/atividades`));
        if (!snapshot.exists()) {
          setActivities([]);
          setLoading(false);
          return;
        }
        const list = Object.keys(snapshot.val())
          .map((id) => ({ id, ...snapshot.val()[id] }))
          .map((item: any) => ({
            id: item.id,
            label: `${item.tipo || "Atividade"} - ${item.data || ""} (${Number(item.distancia || 0).toFixed(2)} km)`,
            points: Array.isArray(item.rota)
              ? item.rota
                  .filter((point: any) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
                  .map((point: any) => ({
                    latitude: Number(point.latitude),
                    longitude: Number(point.longitude),
                    altitude: Number.isFinite(point.altitude) ? Number(point.altitude) : null,
                    timestamp: Number(point.timestamp || Date.now()),
                  }))
              : [],
          }))
          .filter((item) => item.points.length > 1);

        setActivities(list);
        if (list[0]) setActivityId(list[0].id);
      } catch (error: any) {
        Alert.alert("Erro", error?.message || "Falha ao carregar atividades.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [uid]);

  const handleImportGpx = async () => {
    try {
      setBusy(true);
      const imported = await importGpxFile();
      if (!imported || !uid) return;

      const newRef = push(ref(database, `users/${uid}/atividades`));
      await set(newRef, {
        tipo: "trilha",
        cidade: "Importado de GPX",
        data: new Date().toLocaleDateString("pt-BR"),
        duracao: imported.parsed.durationSec,
        distancia: Number(imported.parsed.distanceKm.toFixed(2)),
        rota: imported.parsed.points.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          altitude: point.altitude,
          timestamp: point.timestamp,
        })),
        criadoEm: new Date().toISOString(),
        origem: "gpx_import",
        tituloImportado: imported.parsed.title,
      });

      Alert.alert("Importado", `Atividade "${imported.parsed.title}" criada com sucesso.`);
      setLoading(true);
      const snapshot = await get(ref(database, `users/${uid}/atividades`));
      if (snapshot.exists()) {
        const list = Object.keys(snapshot.val())
          .map((id) => ({ id, ...snapshot.val()[id] }))
          .map((item: any) => ({
            id: item.id,
            label: `${item.tipo || "Atividade"} - ${item.data || ""} (${Number(item.distancia || 0).toFixed(2)} km)`,
            points: Array.isArray(item.rota) ? item.rota : [],
          }))
          .filter((item) => item.points.length > 1);
        setActivities(list);
        if (list[0]) setActivityId(list[0].id);
      }
    } catch (error: any) {
      Alert.alert("Falha na importação", error?.message || "Arquivo GPX inválido.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  const handleExportGpx = async () => {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      Alert.alert("Erro", "Selecione uma atividade para exportar.");
      return;
    }

    try {
      setBusy(true);
      const result = await exportActivityToGpxFile({
        title: activity.label,
        fileName: `tracktrail_${activity.id}`,
        points: activity.points.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          altitude: point.altitude,
          timestamp: Number(point.timestamp || Date.now()),
        })),
      });

      Alert.alert(
        "Exportação concluída",
        result.shared
          ? "Arquivo GPX pronto para compartilhar."
          : `Arquivo salvo em cache: ${result.uri}`
      );
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível exportar GPX.");
    } finally {
      setBusy(false);
    }
  };

  const handleFit = async () => {
    try {
      await parseFitPlaceholder();
    } catch (error: any) {
      Alert.alert("FIT", error?.message || "Integração FIT indisponível.");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Importar / Exportar atividade</Text>
      <Text style={styles.subtitle}>Interoperabilidade com GPX e base preparada para FIT.</Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={handleImportGpx} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Importar arquivo GPX</Text>}
      </TouchableOpacity>

      <Text style={styles.label}>Atividade para exportação</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={activityId} onValueChange={(value) => setActivityId(String(value))} style={styles.picker}>
          {activities.map((item) => (
            <Picker.Item key={item.id} label={item.label} value={item.id} color="#f8fafc" />
          ))}
        </Picker>
      </View>

      <TouchableOpacity style={styles.secondaryBtn} onPress={handleExportGpx} disabled={busy || activities.length === 0}>
        <Text style={styles.secondaryBtnText}>Exportar atividade em GPX</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.fitBtn} onPress={handleFit}>
        <Text style={styles.fitBtnText}>Status da base FIT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 14, paddingBottom: 28 },
  centered: { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 3, marginBottom: 12 },
  label: { color: "#dbeafe", marginTop: 12, marginBottom: 6, fontWeight: "700", fontSize: 13 },
  pickerWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  picker: { color: "#f8fafc" },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#1e4db7",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryBtnText: { color: "#e2e8f0", fontWeight: "700" },
  fitBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7c3aed",
    backgroundColor: "rgba(76,29,149,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  fitBtnText: { color: "#ddd6fe", fontWeight: "700" },
});

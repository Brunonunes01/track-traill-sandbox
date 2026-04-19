import { Picker } from "@react-native-picker/picker";
import { onAuthStateChanged } from "firebase/auth";
import { get, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../services/connectionFirebase";
import { ActivityType } from "../models/activity";
import { createSegment } from "../services/segmentService";

type ActivityRouteOption = {
  id: string;
  title: string;
  points: { latitude: number; longitude: number; altitude?: number | null }[];
  activityType: ActivityType;
  elevationGainMeters: number;
};

const parseActivityType = (value: any): ActivityType => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("bike") || normalized.includes("cicl")) return "bike";
  if (normalized.includes("corr")) return "corrida";
  if (normalized.includes("camin")) return "caminhada";
  return "trilha";
};

export default function SegmentCreateScreen({ navigation, route }: any) {
  const routeData = route?.params?.routeData;
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends" | "private">("public");
  const [activityType, setActivityType] = useState<ActivityType>("trilha");
  const [routes, setRoutes] = useState<ActivityRouteOption[]>([]);
  const [routeId, setRouteId] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadActivities = async () => {
      if (routeData?.rotaCompleta?.length >= 2) {
        const mapped = routeData.rotaCompleta
          .filter((point: any) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
          .map((point: any) => ({
            latitude: Number(point.latitude),
            longitude: Number(point.longitude),
            altitude: Number.isFinite(point.altitude) ? Number(point.altitude) : null,
          }));
        if (mapped.length >= 2) {
          const syntheticId = `route-${Date.now()}`;
          setRoutes([
            {
              id: syntheticId,
              title: routeData.titulo || "Rota selecionada",
              points: mapped,
              activityType: parseActivityType(routeData.tipo),
              elevationGainMeters: Number(routeData.elevacaoGanhoM || 0),
            },
          ]);
          setRouteId(syntheticId);
          setActivityType(parseActivityType(routeData.tipo));
          if (!title) setTitle(`Segmento ${routeData.titulo || "da rota"}`);
          setLoading(false);
          return;
        }
      }

      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await get(ref(database, `users/${uid}/atividades`));
        if (!snapshot.exists()) {
          setRoutes([]);
          setLoading(false);
          return;
        }

        const list = Object.keys(snapshot.val())
          .map((id) => ({ id, ...snapshot.val()[id] }))
          .map((item: any) => ({
            id: item.id,
            title: `${item.tipo || "Atividade"} - ${item.data || ""}`,
            activityType: parseActivityType(item.tipo),
            points: Array.isArray(item.rota)
              ? item.rota
                  .filter((point: any) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
                  .map((point: any) => ({
                    latitude: Number(point.latitude),
                    longitude: Number(point.longitude),
                    altitude: Number.isFinite(point.altitude) ? Number(point.altitude) : null,
                  }))
              : [],
            elevationGainMeters: Number(item.elevacaoGanhoM || 0),
          }))
          .filter((item) => item.points.length > 1)
          .sort((a, b) => (b.id > a.id ? 1 : -1));

        setRoutes(list);
        if (list[0]) {
          setRouteId(list[0].id);
          setActivityType(list[0].activityType);
          if (!title) setTitle(`Segmento ${list[0].activityType}`);
        }
      } catch (error: any) {
        Alert.alert("Erro", error?.message || "Falha ao carregar atividades.");
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, [routeData, title, uid]);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === routeId) || null,
    [routes, routeId]
  );

  const handleCreate = async () => {
    if (!uid) {
      Alert.alert("Erro", "Faça login para criar segmento.");
      return;
    }
    if (!selectedRoute || selectedRoute.points.length < 2) {
      Alert.alert("Erro", "Selecione uma atividade válida.");
      return;
    }

    try {
      setSaving(true);
      const segmentId = await createSegment({
        title,
        description,
        createdBy: uid,
        startPoint: selectedRoute.points[0],
        endPoint: selectedRoute.points[selectedRoute.points.length - 1],
        polyline: selectedRoute.points,
        elevationGainMeters: selectedRoute.elevationGainMeters,
        activityTypesAllowed: [activityType],
        visibility,
      });

      Alert.alert("Sucesso", "Segmento criado com sucesso.");
      navigation.replace("SegmentDetail", { segmentId });
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível criar o segmento.");
    } finally {
      setSaving(false);
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
      <Text style={styles.title}>Criar segmento</Text>
      <Text style={styles.subtitle}>Selecione uma atividade e publique o trecho competitivo.</Text>

      <Text style={styles.label}>Atividade base</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={routeId}
          onValueChange={(value) => {
            setRouteId(String(value));
            const found = routes.find((route) => route.id === value);
            if (found) setActivityType(found.activityType);
          }}
          dropdownIconColor="#f8fafc"
          style={styles.picker}
        >
          {routes.map((route) => (
            <Picker.Item key={route.id} label={route.title} value={route.id} color="#f8fafc" />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Nome do segmento</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Subida do mirante" placeholderTextColor="#6b7280" />

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Resumo opcional"
        placeholderTextColor="#6b7280"
        multiline
      />

      <Text style={styles.label}>Tipo de atividade</Text>
      <View style={styles.row}>
        {(["corrida", "caminhada", "trilha", "bike"] as ActivityType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.chip, activityType === type ? styles.chipActive : null]}
            onPress={() => setActivityType(type)}
          >
            <Text style={[styles.chipText, activityType === type ? styles.chipTextActive : null]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Visibilidade</Text>
      <View style={styles.row}>
        {(["public", "friends", "private"] as const).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.chip, visibility === item ? styles.chipActive : null]}
            onPress={() => setVisibility(item)}
          >
            <Text style={[styles.chipText, visibility === item ? styles.chipTextActive : null]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitText}>Criar segmento</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 14, paddingBottom: 28 },
  centered: { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  title: { color: "#f8fafc", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 3, marginBottom: 12 },
  label: { color: "#dbeafe", marginBottom: 6, marginTop: 10, fontWeight: "700", fontSize: 13 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  picker: { color: "#f8fafc", height: 50 },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { color: "#e2e8f0", textTransform: "capitalize", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  submitBtn: {
    minHeight: 44,
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: "#1e4db7",
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: "#fff", fontWeight: "700" },
});

import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
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
import { auth } from "../../services/connectionFirebase";
import { Segment } from "../models/segment";
import { subscribeSegments } from "../services/segmentService";

export default function SegmentsScreen({ navigation }: any) {
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });

    const unsubscribeSegments = subscribeSegments(
      (list) => {
        setSegments(list);
        setLoading(false);
      },
      (serviceError) => {
        setError(serviceError.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeSegments();
    };
  }, []);

  const mySegmentsCount = useMemo(
    () => segments.filter((segment) => segment.createdBy === uid).length,
    [segments, uid]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Segmentos</Text>
        <Text style={styles.subtitle}>
          {segments.length} segmento(s) • {mySegmentsCount} criado(s) por você
        </Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={16} color="#fca5a5" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={segments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Nenhum segmento ainda</Text>
            <Text style={styles.emptyText}>Crie o primeiro segmento para começar o ranking.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("SegmentDetail", { segmentId: item.id })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>
              {(item.distanceMeters / 1000).toFixed(2)} km • ganho {item.elevationGainMeters.toFixed(0)} m
            </Text>
            <Text style={styles.cardSub}>Tipos: {item.activityTypesAllowed.join(", ")}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (!uid) {
            Alert.alert("Erro", "Faça login para criar segmento.");
            return;
          }
          navigation.navigate("SegmentCreate");
        }}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.fabText}>Novo segmento</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 14 },
  centered: { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 10 },
  title: { color: "#f8fafc", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 2 },
  errorCard: {
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "rgba(127,29,29,0.25)",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  errorText: { color: "#fecaca", fontSize: 12, flex: 1 },
  listContent: { paddingBottom: 90, gap: 8 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
    padding: 12,
  },
  cardTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cardSub: { color: "#9ca3af", marginTop: 4, fontSize: 12, textTransform: "capitalize" },
  emptyWrap: { marginTop: 40, alignItems: "center" },
  emptyTitle: { color: "#e2e8f0", fontWeight: "700", fontSize: 15 },
  emptyText: { color: "#94a3b8", marginTop: 5 },
  fab: {
    position: "absolute",
    bottom: 16,
    left: 14,
    right: 14,
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: "#1e4db7",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});

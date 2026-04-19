import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { auth } from "../../services/connectionFirebase";
import { Segment, SegmentAttempt } from "../models/segment";
import { getSegmentById, subscribeSegmentAttempts } from "../services/segmentService";

const formatDuration = (durationSec: number) => {
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

export default function SegmentDetailScreen({ navigation, route }: any) {
  const segmentId = route?.params?.segmentId;
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [attempts, setAttempts] = useState<SegmentAttempt[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => setUid(user?.uid || ""));
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!segmentId) {
      setLoading(false);
      return;
    }

    getSegmentById(segmentId)
      .then((item) => {
        if (!mounted) return;
        setSegment(item);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const unsubscribeAttempts = subscribeSegmentAttempts(segmentId, (list) => setAttempts(list));

    return () => {
      mounted = false;
      unsubscribeAttempts();
    };
  }, [segmentId]);

  const myBest = useMemo(() => {
    const mine = attempts.filter((item) => item.userId === uid);
    return mine.length > 0 ? mine[0] : null;
  }, [attempts, uid]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!segment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Segmento não encontrado.</Text>
      </View>
    );
  }

  const initialPoint = segment.polyline[0];
  const region = initialPoint
    ? {
        latitude: initialPoint.latitude,
        longitude: initialPoint.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{segment.title}</Text>
      <Text style={styles.subtitle}>{segment.description || "Sem descrição"}</Text>
      <Text style={styles.subtitleSmall}>
        {(segment.distanceMeters / 1000).toFixed(2)} km • ganho {segment.elevationGainMeters.toFixed(0)} m
      </Text>

      {region ? (
        <MapView style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={region}>
          <Polyline coordinates={segment.polyline as any} strokeColor="#38bdf8" strokeWidth={4} />
          <Marker coordinate={segment.startPoint as any} title="Início" pinColor="#22c55e" />
          <Marker coordinate={segment.endPoint as any} title="Fim" pinColor="#ef4444" />
        </MapView>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seu melhor tempo</Text>
        <Text style={styles.bestText}>{myBest ? formatDuration(myBest.durationSec) : "--"}</Text>
      </View>

      <Text style={styles.sectionTitle}>Top global</Text>
      <FlatList
        data={attempts.slice(0, 5)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 6, paddingBottom: 10 }}
        renderItem={({ item, index }) => (
          <View style={styles.rankRow}>
            <Text style={styles.rankText}>#{index + 1}</Text>
            <Text style={styles.rankUser}>{item.userId.slice(0, 8)}</Text>
            <Text style={styles.rankTime}>{formatDuration(item.durationSec)}</Text>
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.openLeaderboardBtn}
        onPress={() => navigation.navigate("SegmentLeaderboard", { segmentId: segment.id })}
      >
        <Text style={styles.openLeaderboardText}>Abrir leaderboard completo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  emptyText: { color: "#cbd5e1" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#cbd5e1", marginTop: 4 },
  subtitleSmall: { color: "#93c5fd", marginTop: 4, marginBottom: 10, fontSize: 12 },
  map: { height: 210, borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  section: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  sectionTitle: { color: "#e2e8f0", fontWeight: "700", marginBottom: 6 },
  bestText: { color: "#38bdf8", fontSize: 22, fontWeight: "800" },
  rankRow: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  rankText: { color: "#93c5fd", fontWeight: "800", width: 36 },
  rankUser: { color: "#e2e8f0", flex: 1 },
  rankTime: { color: "#fff", fontWeight: "800" },
  openLeaderboardBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e40af",
    backgroundColor: "#1e40af",
    alignItems: "center",
    justifyContent: "center",
  },
  openLeaderboardText: { color: "#fff", fontWeight: "700" },
});

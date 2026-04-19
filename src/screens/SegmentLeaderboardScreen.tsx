import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth } from "../../services/connectionFirebase";
import { subscribeFriendships, subscribeUsers } from "../../services/friendsService";
import { SegmentAttempt } from "../models/segment";
import { buildSegmentLeaderboards, subscribeSegmentAttempts } from "../services/segmentService";

type LeaderboardScope = "global" | "friends" | "mine";

const formatDuration = (durationSec: number) => {
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

export default function SegmentLeaderboardScreen({ route }: any) {
  const segmentId = route?.params?.segmentId;
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [attempts, setAttempts] = useState<SegmentAttempt[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!segmentId) {
      setLoading(false);
      return;
    }

    const unsubscribeAttempts = subscribeSegmentAttempts(segmentId, (list) => {
      setAttempts(list);
      setLoading(false);
    });

    return unsubscribeAttempts;
  }, [segmentId]);

  useEffect(() => {
    const unsubscribeUsers = subscribeUsers((list: any[]) => {
      setUsers(
        list.reduce((acc, item) => {
          acc[item.uid] = item.fullName || item.username || item.email || item.uid;
          return acc;
        }, {} as Record<string, string>)
      );
    });
    const unsubscribeFriends = subscribeFriendships((list: any[]) => {
      const setIds = new Set<string>();
      list
        .filter((item) => item.status === "accepted" && (item.senderId === uid || item.receiverId === uid))
        .forEach((item) => setIds.add(item.senderId === uid ? item.receiverId : item.senderId));
      setFriendIds(setIds);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeFriends();
    };
  }, [uid]);

  const leaderboards = useMemo(
    () => buildSegmentLeaderboards(attempts, uid, friendIds),
    [attempts, friendIds, uid]
  );
  const rows = scope === "global" ? leaderboards.global : scope === "friends" ? leaderboards.friends : leaderboards.mine;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <View style={styles.filters}>
        {(["global", "friends", "mine"] as LeaderboardScope[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filterBtn, scope === item ? styles.filterBtnActive : null]}
            onPress={() => setScope(item)}
          >
            <Text style={[styles.filterText, scope === item ? styles.filterTextActive : null]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Sem tentativas nesse filtro.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.user}>{users[item.userId] || item.userId.slice(0, 8)}</Text>
              <Text style={styles.meta}>
                {item.avgSpeedKmh.toFixed(1)} km/h • {new Date(item.createdAt).toLocaleDateString("pt-BR")}
              </Text>
            </View>
            <Text style={styles.time}>{formatDuration(item.durationSec)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  title: { color: "#fff", fontWeight: "800", fontSize: 20, marginBottom: 10 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterBtnActive: { backgroundColor: "#1e40af", borderColor: "#1e40af" },
  filterText: { color: "#e2e8f0", fontWeight: "700", textTransform: "capitalize", fontSize: 12 },
  filterTextActive: { color: "#fff" },
  emptyWrap: { marginTop: 42, alignItems: "center" },
  emptyText: { color: "#94a3b8" },
  row: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rank: { color: "#93c5fd", width: 34, fontWeight: "800" },
  user: { color: "#fff", fontWeight: "700" },
  meta: { color: "#94a3b8", fontSize: 11, marginTop: 2 },
  time: { color: "#fff", fontWeight: "800" },
});

import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Image } from "expo-image";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { auth } from "../../services/connectionFirebase";
import {
  addCommunityComment,
  subscribeCommunityPosts,
  toggleCommunityKudo,
} from "../../services/communityService";

export default function PostDetailScreen(props: any) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const route = props.route || hookRoute;
  const postId = route.params?.postId;

  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!postId) return;
    const unsubscribe = subscribeCommunityPosts(
      (posts: any[]) => {
        const current = posts.find((item) => item.id === postId) || null;
        setPost(current);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [postId]);

  const mapPoints = useMemo(() => post?.routeSnapshot?.points || [], [post?.routeSnapshot?.points]);
  const initialRegion = useMemo(() => {
    const first = mapPoints[0];
    if (!first) return null;
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    };
  }, [mapPoints]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centerText}>Post não encontrado.</Text>
      </View>
    );
  }

  const hasRoute = mapPoints.length > 1;
  const photos = post.photos || [];
  const comments = post.comments || [];
  const kudosCount =
    typeof post.kudosCount === "number" ? post.kudosCount : Object.keys(post.kudos || {}).length;
  const hasKudo = Boolean(uid && post.kudos && post.kudos[uid]);
  const formatPace = (pace?: number | null) => {
    if (!Number.isFinite(pace as number) || Number(pace) <= 0) return "--";
    const total = Math.round(Number(pace) * 60);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, "0")} min/km`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Detalhe do post</Text>
        </View>

        <Text style={styles.author}>{post.authorName || "Usuário"}</Text>
        <Text style={styles.subtitle}>
          {Number(post.distanceKm || 0).toFixed(2)} km • {Math.round(Number(post.durationSec || 0) / 60)} min
        </Text>
        <Text style={styles.subtitle}>
          Pace: {formatPace(post.paceMedioMinKm)} • Velocidade: {Number(post.velocidadeMediaKmh || 0).toFixed(1)} km/h
        </Text>
        <Text style={styles.subtitle}>
          Elevação +{Number(post.elevacaoGanhoM || 0).toFixed(0)} m / -{Number(post.elevacaoPerdaM || 0).toFixed(0)} m
        </Text>
        {post.privacySanitized ? <Text style={styles.privacyHint}>Rota pública sanitizada por privacidade.</Text> : null}
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

        {photos.length > 0 ? (
          <FlatList
            horizontal
            data={photos}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.photosRow}
            renderItem={({ item }) => <Image source={{ uri: item.url }} style={styles.photo} contentFit="cover" transition={140} cachePolicy="memory-disk" />}
            showsHorizontalScrollIndicator={false}
          />
        ) : null}

        {hasRoute && initialRegion ? (
          <MapView style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={initialRegion}>
            <Polyline coordinates={mapPoints} strokeColor="#38bdf8" strokeWidth={5} />
            <Marker coordinate={mapPoints[0]} title="Início" />
            <Marker coordinate={mapPoints[mapPoints.length - 1]} title="Fim" />
          </MapView>
        ) : null}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.kudoBtn, hasKudo ? styles.kudoBtnActive : null]}
            onPress={async () => {
              if (!uid || liking) return;
              try {
                setLiking(true);
                await toggleCommunityKudo({
                  postId: post.id,
                  userId: uid,
                  userName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuário",
                  userPhotoUrl: null,
                });
              } catch (error: any) {
                Alert.alert("Erro", error?.message || "Não foi possível registrar kudos.");
              } finally {
                setLiking(false);
              }
            }}
          >
            {liking ? (
              <ActivityIndicator size="small" color={hasKudo ? "#111827" : "#fff"} />
            ) : (
              <Ionicons name={hasKudo ? "heart" : "heart-outline"} size={16} color={hasKudo ? "#111827" : "#fff"} />
            )}
            <Text style={[styles.kudoText, hasKudo ? styles.kudoTextActive : null]}>Kudos ({kudosCount})</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Comentários ({comments.length})</Text>
        {comments.map((comment: any) => (
          <View key={comment.id} style={styles.commentCard}>
            <Text style={styles.commentAuthor}>{comment.authorName}</Text>
            <Text style={styles.commentText}>{comment.text}</Text>
          </View>
        ))}

        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Escreva um comentário"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={async () => {
              if (!uid || !commentText.trim() || commenting) return;
              try {
                setCommenting(true);
                await addCommunityComment({
                  postId: post.id,
                  authorId: uid,
                  authorName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuário",
                  text: commentText.trim(),
                });
                setCommentText("");
              } catch (error: any) {
                Alert.alert("Erro", error?.message || "Não foi possível comentar.");
              } finally {
                setCommenting(false);
              }
            }}
          >
            {commenting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 14, paddingBottom: 28 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  centerText: { color: "#e2e8f0" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  title: { color: "#f8fafc", fontSize: 19, fontWeight: "800" },
  author: { color: "#fff", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#94a3b8", marginTop: 2, marginBottom: 8 },
  privacyHint: {
    alignSelf: "flex-start",
    color: "#c7d2fe",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    backgroundColor: "rgba(55,48,163,0.22)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
    fontSize: 11,
  },
  caption: { color: "#e2e8f0", marginBottom: 10, lineHeight: 20 },
  photosRow: { gap: 8, marginBottom: 10, paddingRight: 8 },
  photo: { width: 152, height: 120, borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: "#334155" },
  map: { height: 220, borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  actionsRow: { marginBottom: 12 },
  kudoBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  kudoBtnActive: { backgroundColor: "#fb7185", borderColor: "#fb7185" },
  kudoText: { color: "#fff", fontWeight: "700" },
  kudoTextActive: { color: "#111827" },
  sectionTitle: { color: "#e2e8f0", fontWeight: "800", marginBottom: 8 },
  commentCard: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  commentAuthor: { color: "#fff", fontWeight: "700", fontSize: 12 },
  commentText: { color: "#cbd5e1", marginTop: 3 },
  commentInputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sendBtn: {
    width: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e4db7",
  },
});

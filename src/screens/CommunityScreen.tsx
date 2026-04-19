import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import {
  addCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  subscribeCommunityPosts,
  toggleCommunityKudo,
} from "../../services/communityService";
import {
  subscribeFriendships,
  subscribeUsers,
} from "../../services/friendsService";
import { AppCard, EmptyState, LoadingState, SectionTitle } from "../components/ui";
import { colors, layout, spacing } from "../theme/designSystem";

type AppUser = {
  uid: string;
  fullName?: string;
  username?: string;
  photoUrl?: string;
};

type Friendship = {
  id: string;
  senderId: string;
  receiverId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt?: string;
};

type CommunityComment = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt?: string;
};

type SharedActivityPost = {
  id: string;
  postType?: string;
  visibility?: string;
  authorId: string;
  authorName?: string;
  authorPhotoUrl?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  routeName?: string | null;
  activityType?: string;
  distanceKm?: number;
  durationSec?: number;
  velocidadeMediaKmh?: number;
  paceMedioMinKm?: number | null;
  elevacaoGanhoM?: number;
  elevacaoPerdaM?: number;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
  caption?: string;
  activityDate?: string;
  createdAt?: string;
  routeSnapshot?: {
    points?: { latitude: number; longitude: number }[];
    startPoint?: { latitude: number; longitude: number } | null;
    endPoint?: { latitude: number; longitude: number } | null;
  };
  comments?: CommunityComment[];
  photos?: { id: string; url: string }[];
  kudos?: Record<string, { userId: string; createdAt: string }>;
  kudosCount?: number;
  privacySanitized?: boolean;
};

type CommunityScreenProps = {
  navigation?: any;
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
};

const formatDuration = (totalSeconds?: number) => {
  const sec = Number(totalSeconds || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }

  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const formatPace = (pace?: number | null) => {
  if (!Number.isFinite(pace as number) || Number(pace) <= 0) return "--";
  const total = Math.round(Number(pace) * 60);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")} min/km`;
};

const getDisplayName = (post: SharedActivityPost, usersById: Record<string, AppUser>) => {
  const user = usersById[post.authorId];
  return (
    post.authorName || user?.fullName || user?.username || auth.currentUser?.email || "Usuário"
  );
};

const getPhotoUrl = (post: SharedActivityPost, usersById: Record<string, AppUser>) => {
  const user = usersById[post.authorId];
  return post.authorPhotoUrl || user?.photoUrl || null;
};

export default function CommunityScreen(props: CommunityScreenProps) {
  const hookNavigation = useNavigation<any>();
  const navigation = props.navigation || hookNavigation;
  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<SharedActivityPost[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    const unsubscribePosts = subscribeCommunityPosts(
      (list: SharedActivityPost[]) => {
        setPosts(list);
        setLoading(false);
      },
      (error: any) => {
        console.warn("[community] posts subscription error:", error?.message || String(error));
        setLoading(false);
      }
    );

    return unsubscribePosts;
  }, []);

  useEffect(() => {
    const unsubscribeUsers = subscribeUsers(
      (list: AppUser[]) => {
        setUsers(list);
      },
      (error: any) => {
        console.warn("[community] users subscription error:", error?.message || String(error));
      }
    );

    const unsubscribeFriendships = subscribeFriendships(
      (list: Friendship[]) => {
        setFriendships(list);
      },
      (error: any) => {
        console.warn("[community] friendships subscription error:", error?.message || String(error));
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeFriendships();
    };
  }, []);

  const usersById = useMemo(() => {
    return users.reduce((acc: Record<string, AppUser>, item) => {
      acc[item.uid] = item;
      return acc;
    }, {});
  }, [users]);

  const friendIds = useMemo(() => {
    if (!uid) return new Set<string>();

    const ids = friendships
      .filter(
        (item) =>
          item.status === "accepted" && (item.senderId === uid || item.receiverId === uid)
      )
      .map((item) => (item.senderId === uid ? item.receiverId : item.senderId));

    return new Set(ids);
  }, [friendships, uid]);

  const visiblePosts = useMemo(() => {
    if (!uid) return [];

    return posts
      .filter((post) => post.postType === "activity_share")
      .filter((post) => {
        const visibility = post.visibility || "friends";
        if (post.authorId === uid) return true;
        if (visibility === "public") return true;
        if (visibility === "friends") return friendIds.has(post.authorId);
        return false;
      });
  }, [friendIds, posts, uid]);

  const handleAddComment = async (post: SharedActivityPost) => {
    const text = (commentInputs[post.id] || "").trim();
    if (!text || !uid) return;

    try {
      setCommentingPostId(post.id);
      const authorName =
        usersById[uid]?.fullName || usersById[uid]?.username || auth.currentUser?.email || "Usuário";

      await addCommunityComment({
        postId: post.id,
        authorId: uid,
        authorName,
        text,
      });

      setCommentInputs((prev) => ({ ...prev, [post.id]: "" }));
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível comentar agora.");
    } finally {
      setCommentingPostId(null);
    }
  };

  const handleOpenRoute = (post: SharedActivityPost) => {
    const points = post.routeSnapshot?.points || [];
    if (points.length < 2) return;

    const authorName = getDisplayName(post, usersById);
    const routeData = {
      id: post.routeId || `shared-${post.id}`,
      titulo: post.routeName || `Rota compartilhada por ${authorName}`,
      tipo: post.activityType || "trilha",
      descricao: post.caption || "Atividade compartilhada no feed de amigos.",
      dificuldade: "Não informada",
      distancia: `${Number(post.distanceKm || 0).toFixed(2)} km`,
      startPoint: post.routeSnapshot?.startPoint || points[0],
      endPoint: post.routeSnapshot?.endPoint || points[points.length - 1],
      rotaCompleta: points,
    };

    navigation.navigate("RouteDetail", { routeData });
  };

  const handleDeletePost = (post: SharedActivityPost) => {
    if (!uid || post.authorId !== uid) return;
    Alert.alert("Excluir post", "Essa ação remove o post e todos os comentários. Deseja continuar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingPostId(post.id);
            await deleteCommunityPost({ postId: post.id, requesterId: uid });
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível excluir o post.");
          } finally {
            setDeletingPostId(null);
          }
        },
      },
    ]);
  };

  const handleDeleteComment = (post: SharedActivityPost, comment: CommunityComment) => {
    if (!uid) return;
    const canDelete = post.authorId === uid || comment.authorId === uid;
    if (!canDelete) return;

    Alert.alert("Excluir comentário", "Deseja remover este comentário?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            const deletingId = `${post.id}:${comment.id}`;
            setDeletingCommentId(deletingId);
            await deleteCommunityComment({
              postId: post.id,
              commentId: comment.id,
              requesterId: uid,
            });
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível excluir o comentário.");
          } finally {
            setDeletingCommentId(null);
          }
        },
      },
    ]);
  };

  const renderPost = ({ item }: { item: SharedActivityPost }) => {
    const authorName = getDisplayName(item, usersById);
    const authorPhoto = getPhotoUrl(item, usersById);
    const comments = item.comments || [];
    const photos = item.photos || [];
    const isCommentsOpen = openCommentsPostId === item.id;
    const hasRoute = (item.routeSnapshot?.points || []).length > 1;
    const hasKudo = Boolean(uid && item.kudos && item.kudos[uid]);
    const canDeletePost = uid && item.authorId === uid;
    const kudosCount =
      typeof item.kudosCount === "number" ? item.kudosCount : Object.keys(item.kudos || {}).length;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.avatarWrap}>
            {authorPhoto ? (
              <Image source={{ uri: authorPhoto }} style={styles.avatarImage} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            ) : (
              <Text style={styles.avatarText}>{authorName.charAt(0).toUpperCase()}</Text>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>

          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.activityType || "atividade"}</Text>
          </View>

          {canDeletePost ? (
            <TouchableOpacity
              style={styles.headerDeleteBtn}
              onPress={() => handleDeletePost(item)}
              disabled={deletingPostId === item.id}
            >
              {deletingPostId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="trash-outline" size={14} color="#fff" />
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Distância</Text>
            <Text style={styles.metricValue}>{Number(item.distanceKm || 0).toFixed(2)} km</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Duração</Text>
            <Text style={styles.metricValue}>{formatDuration(item.durationSec)}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Data atividade</Text>
            <Text style={styles.metricValue}>{formatDate(item.activityDate || item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pace</Text>
            <Text style={styles.metricValue}>{formatPace(item.paceMedioMinKm)}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Velocidade média</Text>
            <Text style={styles.metricValue}>{Number(item.velocidadeMediaKmh || 0).toFixed(1)} km/h</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Elevação +</Text>
            <Text style={styles.metricValue}>{Number(item.elevacaoGanhoM || 0).toFixed(0)} m</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Elevação -</Text>
            <Text style={styles.metricValue}>{Number(item.elevacaoPerdaM || 0).toFixed(0)} m</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Alt min</Text>
            <Text style={styles.metricValue}>
              {Number.isFinite(item.altitudeMinM as number) ? `${Number(item.altitudeMinM).toFixed(0)} m` : "--"}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Alt max</Text>
            <Text style={styles.metricValue}>
              {Number.isFinite(item.altitudeMaxM as number) ? `${Number(item.altitudeMaxM).toFixed(0)} m` : "--"}
            </Text>
          </View>
        </View>

        {item.caption ? <Text style={styles.captionText}>{item.caption}</Text> : null}
        {item.privacySanitized ? (
          <Text style={styles.privacyBadge}>Rota pública sanitizada por zona de privacidade</Text>
        ) : null}
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
            {photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.url }} style={styles.feedPhoto} contentFit="cover" transition={140} cachePolicy="memory-disk" />
            ))}
          </ScrollView>
        ) : null}

        {item.routeName ? (
          <Text style={styles.routeNameText}>Rota: {item.routeName}</Text>
        ) : null}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.kudoBtn, hasKudo ? styles.kudoBtnActive : null]}
            onPress={async () => {
              if (!uid) return;
              try {
                setLikingPostId(item.id);
                await toggleCommunityKudo({
                  postId: item.id,
                  userId: uid,
                  userName: usersById[uid]?.fullName || usersById[uid]?.username || "Usuário",
                  userPhotoUrl: usersById[uid]?.photoUrl || null,
                });
              } catch (error: any) {
                Alert.alert("Erro", error?.message || "Não foi possível enviar kudos agora.");
              } finally {
                setLikingPostId(null);
              }
            }}
            disabled={likingPostId === item.id}
          >
            {likingPostId === item.id ? (
              <ActivityIndicator size="small" color={hasKudo ? "#111827" : "#f8fafc"} />
            ) : (
              <Ionicons
                name={hasKudo ? "heart" : "heart-outline"}
                size={16}
                color={hasKudo ? "#111827" : "#f8fafc"}
              />
            )}
            <Text style={[styles.kudoBtnText, hasKudo ? styles.kudoBtnTextActive : null]}>
              Kudos ({kudosCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, !hasRoute ? styles.actionBtnDisabled : null]}
            disabled={!hasRoute}
            onPress={() => handleOpenRoute(item)}
          >
            <Ionicons name="map-outline" size={16} color="#111827" />
            <Text style={styles.actionBtnText}>Ver rota no mapa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.commentsToggleBtn}
            onPress={() => setOpenCommentsPostId((current) => (current === item.id ? null : item.id))}
          >
            <Ionicons name="chatbubble-outline" size={16} color="#d1d5db" />
            <Text style={styles.commentsToggleText}>Comentários ({comments.length})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => navigation.navigate("PostDetail", { postId: item.id })}
          >
            <Ionicons name="open-outline" size={16} color="#d1d5db" />
            <Text style={styles.commentsToggleText}>Detalhes</Text>
          </TouchableOpacity>
        </View>

        {isCommentsOpen ? (
          <View style={styles.commentsBlock}>
            {comments.length === 0 ? (
              <Text style={styles.emptyText}>Sem comentários ainda.</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentHeaderRow}>
                    <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                    {uid && (item.authorId === uid || comment.authorId === uid) ? (
                      <TouchableOpacity
                        style={styles.commentDeleteBtn}
                        onPress={() => handleDeleteComment(item, comment)}
                        disabled={deletingCommentId === `${item.id}:${comment.id}`}
                      >
                        {deletingCommentId === `${item.id}:${comment.id}` ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="trash-outline" size={12} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.commentText}>{comment.text}</Text>
                  <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
                </View>
              ))
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                value={commentInputs[item.id] || ""}
                onChangeText={(value) =>
                  setCommentInputs((prev) => ({
                    ...prev,
                    [item.id]: value,
                  }))
                }
                placeholder="Comentar atividade"
                placeholderTextColor="#6b7280"
              />
              <TouchableOpacity
                style={styles.commentSendBtn}
                onPress={() => handleAddComment(item)}
                disabled={commentingPostId === item.id}
              >
                {commentingPostId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["#08101D", "#0B1220", "#121F36"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.sm }]}>
        <AppCard style={styles.headerCard}>
          <SectionTitle
            title="Feed dos Amigos"
            subtitle="Atividades e rotas compartilhadas por quem você acompanha"
          />
        </AppCard>

        {loading ? (
          <View style={styles.loadingWrap}>
            <LoadingState label="Carregando compartilhamentos..." />
          </View>
        ) : (
          <FlatList
            data={visiblePosts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom + 24, 32) },
            ]}
            renderItem={renderPost}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={8}
            removeClippedSubviews
            ListEmptyComponent={
              <View style={styles.emptyBlock}>
                <EmptyState
                  title="Sem compartilhamentos por enquanto"
                  description="Finalize uma atividade e compartilhe para iniciar a comunidade entre amigos."
                  icon="people-outline"
                />
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: layout.screenPaddingHorizontal,
  },
  headerCard: {
    marginBottom: 10,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
  },
  listContent: {
    gap: 10,
  },
  postCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: 16,
  },
  authorName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  dateText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  typeBadge: {
    backgroundColor: "rgba(30,77,183,0.22)",
    borderWidth: 1,
    borderColor: "rgba(30,77,183,0.45)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: "#bfdbfe",
    fontWeight: "700",
    fontSize: 11,
    textTransform: "capitalize",
  },
  headerDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricItem: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
  },
  metricValue: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  captionText: {
    color: colors.textSecondary,
    marginTop: 10,
    lineHeight: 20,
  },
  privacyBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    color: "#c7d2fe",
    fontSize: 11,
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    backgroundColor: "rgba(55,48,163,0.22)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photosRow: {
    marginTop: 10,
    gap: 8,
    paddingRight: 6,
  },
  feedPhoto: {
    width: 132,
    height: 108,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    backgroundColor: "#020617",
  },
  routeNameText: {
    color: colors.info,
    marginTop: 8,
    fontWeight: "700",
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 10,
    gap: 8,
  },
  kudoBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  kudoBtnActive: {
    backgroundColor: "#fb7185",
    borderColor: "#fb7185",
  },
  kudoBtnText: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 12,
  },
  kudoBtnTextActive: {
    color: "#111827",
  },
  actionBtn: {
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 12,
  },
  commentsToggleBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  commentsToggleText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 12,
  },
  detailBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  commentsBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 8,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  commentCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  commentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  commentAuthor: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  commentDeleteBtn: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239,68,68,0.82)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  commentText: {
    color: colors.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  commentDate: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 10,
  },
  commentInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  commentSendBtn: {
    width: 40,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBlock: {
    marginTop: 28,
  },
});

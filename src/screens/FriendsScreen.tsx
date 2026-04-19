import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import {
  AppButton,
  AppCard,
  AppInput,
  EmptyState,
  LoadingState,
  SectionTitle,
} from "../components/ui";
import { ensureUserProfileCompatibility } from "../services/userService";
import {
  acceptFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
  subscribeFriendships,
  subscribeUsers,
} from "../../services/friendsService";
import { colors, layout, radius, spacing, typography } from "../theme/designSystem";

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

const getUserDisplayName = (user?: AppUser) => {
  if (!user) return "Usuário";
  return user.fullName || user.username || "Usuário";
};

const getPublicUsername = (user?: AppUser) => {
  if (!user) return "@sem_username";
  return `@${user.username || "sem_username"}`;
};

const getInitials = (user?: AppUser) => {
  const name = getUserDisplayName(user).trim();
  if (!name) return "U";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const sortByCreatedAtDesc = (a: Friendship, b: Friendship) => {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
};

type FriendsScreenProps = {
  navigation?: any;
};

export default function FriendsScreen(props: FriendsScreenProps) {
  const hookNavigation = useNavigation<any>();
  const navigation = props.navigation || hookNavigation;
  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRequestId, setSavingRequestId] = useState<string | null>(null);
  const [sendingToUid, setSendingToUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
      if (user) {
        ensureUserProfileCompatibility({
          uid: user.uid,
          email: user.email || "",
        }).catch((error: any) => {
          console.error("[username-flow] ensure-profile:failure", {
            screen: "FriendsScreen",
            uid: user.uid,
            reason: error?.message || String(error),
          });
          Alert.alert(
            "Aviso",
            "Não foi possível sincronizar seu username agora. Você pode continuar usando o app."
          );
        });
      }
      setLoading(false);
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    const unsubscribeUsers = subscribeUsers(
      (list: AppUser[]) => {
        setUsers(list);
      },
      (error: any) => {
        console.warn("[friends] users subscription error:", error?.message || String(error));
      }
    );

    const unsubscribeFriendships = subscribeFriendships(
      (list: Friendship[]) => {
        setFriendships(list);
      },
      (error: any) => {
        console.warn("[friends] friendships subscription error:", error?.message || String(error));
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

  const pendingReceived = useMemo(() => {
    if (!uid) return [];
    return friendships
      .filter((item) => item.status === "pending" && item.receiverId === uid)
      .sort(sortByCreatedAtDesc);
  }, [friendships, uid]);

  const pendingSent = useMemo(() => {
    if (!uid) return [];
    return friendships
      .filter((item) => item.status === "pending" && item.senderId === uid)
      .sort(sortByCreatedAtDesc);
  }, [friendships, uid]);

  const friends = useMemo(() => {
    if (!uid) return [];

    const accepted = friendships.filter(
      (item) =>
        item.status === "accepted" &&
        (item.senderId === uid || item.receiverId === uid)
    );

    return accepted
      .map((item) => {
        const friendId = item.senderId === uid ? item.receiverId : item.senderId;
        return usersById[friendId];
      })
      .filter(Boolean) as AppUser[];
  }, [friendships, uid, usersById]);

  const searchResults = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text || !uid) return [];

    return users
      .filter((item) => item.uid !== uid)
      .filter((item) => {
        const query = text.replace(/^@/, "");
        const haystack = `${item.fullName || ""} ${item.username || ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 15);
  }, [search, users, uid]);

  const getRelationshipStatus = (targetUid: string) => {
    return friendships.find(
      (item) =>
        (item.senderId === uid && item.receiverId === targetUid) ||
        (item.senderId === targetUid && item.receiverId === uid)
    );
  };

  const handleSendRequest = async (targetUid: string) => {
    if (!uid) {
      Alert.alert("Erro", "Você precisa estar autenticado.");
      return;
    }

    try {
      setSendingToUid(targetUid);
      await sendFriendRequest({ senderId: uid, receiverId: targetUid });
      Alert.alert("Solicitação enviada", "Pedido de amizade enviado com sucesso.");
    } catch (error: any) {
      Alert.alert("Não foi possível enviar", error.message || "Erro ao enviar solicitação.");
    } finally {
      setSendingToUid(null);
    }
  };

  const handleRequestAction = async (requestId: string, action: "accept" | "reject") => {
    try {
      setSavingRequestId(requestId);

      if (action === "accept") {
        await acceptFriendRequest(requestId);
      } else {
        await rejectFriendRequest(requestId);
      }
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Não foi possível atualizar a solicitação.");
    } finally {
      setSavingRequestId(null);
    }
  };

  const renderUserRow = (
    user: AppUser | undefined,
    actionNode: React.ReactNode,
    key: string
  ) => (
    <View key={key} style={styles.rowCard}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarInitial}>{getInitials(user)}</Text>
      </View>

      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {getUserDisplayName(user)}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {getPublicUsername(user)}
        </Text>
      </View>

      <View>{actionNode}</View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingState label="Carregando conexões..." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["#08101D", "#0B1220", "#121F36"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingHorizontal: layout.screenPaddingHorizontal,
          paddingTop: insets.top + spacing.md,
          paddingBottom: Math.max(insets.bottom + spacing.xl, spacing.xxl),
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle
          title="Conexões"
          subtitle="Adicione amigos e acompanhe suas trilhas em conjunto"
        />

        <AppCard style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{friends.length}</Text>
              <Text style={styles.statLabel}>Amigos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pendingReceived.length}</Text>
              <Text style={styles.statLabel}>Recebidas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pendingSent.length}</Text>
              <Text style={styles.statLabel}>Enviadas</Text>
            </View>
          </View>

          <AppButton
            title="Abrir feed dos amigos"
            variant="secondary"
            onPress={() => navigation.navigate("Ajuda")}
            icon={<Ionicons name="people-circle-outline" size={17} color={colors.textPrimary} />}
            style={styles.feedBtn}
          />
        </AppCard>

        <View>
          <SectionTitle title="Buscar Usuários" subtitle="Procure por @username ou nome" />
          <AppCard>
            <AppInput
              value={search}
              onChangeText={setSearch}
              placeholder="Ex: @joao ou Maria"
              autoCapitalize="none"
              rightElement={<Ionicons name="search-outline" size={16} color={colors.textMuted} />}
            />

            {search.trim().length === 0 ? (
              <Text style={styles.helperText}>Digite para começar a buscar.</Text>
            ) : null}

            {searchResults.length === 0 && search.trim() ? (
              <EmptyState
                title="Nenhum usuário encontrado"
                description="Tente outro nome ou username."
                icon="search-outline"
              />
            ) : (
              <View style={styles.listWrap}>
                {searchResults.map((item) => {
                  const relation = getRelationshipStatus(item.uid);
                  const canSend = !relation || relation.status === "rejected";

                  return renderUserRow(
                    item,
                    canSend ? (
                      <AppButton
                        title="Adicionar"
                        onPress={() => handleSendRequest(item.uid)}
                        loading={sendingToUid === item.uid}
                        style={styles.compactBtn}
                        textStyle={styles.compactBtnText}
                      />
                    ) : (
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                          {relation?.status === "accepted" ? "Amigo" : "Pendente"}
                        </Text>
                      </View>
                    ),
                    `search-${item.uid}`
                  );
                })}
              </View>
            )}
          </AppCard>
        </View>

        <View>
          <SectionTitle
            title="Solicitações Recebidas"
            subtitle={`${pendingReceived.length} aguardando sua resposta`}
          />
          <AppCard>
            {pendingReceived.length === 0 ? (
              <EmptyState
                title="Sem solicitações"
                description="Quando alguém te adicionar, aparecerá aqui."
                icon="mail-unread-outline"
              />
            ) : (
              <View style={styles.listWrap}>
                {pendingReceived.map((request) => {
                  const sender = usersById[request.senderId];
                  const isSaving = savingRequestId === request.id;

                  return renderUserRow(
                    sender,
                    <View style={styles.dualActions}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleRequestAction(request.id, "accept")}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Ionicons name="checkmark" size={17} color={colors.white} />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleRequestAction(request.id, "reject")}
                        disabled={isSaving}
                      >
                        <Ionicons name="close" size={17} color={colors.white} />
                      </TouchableOpacity>
                    </View>,
                    `received-${request.id}`
                  );
                })}
              </View>
            )}
          </AppCard>
        </View>

        <View>
          <SectionTitle
            title="Solicitações Enviadas"
            subtitle={`${pendingSent.length} pendentes`}
          />
          <AppCard>
            {pendingSent.length === 0 ? (
              <EmptyState
                title="Sem envios pendentes"
                description="Solicitações enviadas aparecerão aqui."
                icon="send-outline"
              />
            ) : (
              <View style={styles.listWrap}>
                {pendingSent.map((request) => {
                  const receiver = usersById[request.receiverId];
                  return renderUserRow(
                    receiver,
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pendente</Text>
                    </View>,
                    `sent-${request.id}`
                  );
                })}
              </View>
            )}
          </AppCard>
        </View>

        <View>
          <SectionTitle
            title="Amigos"
            subtitle={`${friends.length} conexões ativas`}
          />
          <AppCard>
            {friends.length === 0 ? (
              <EmptyState
                title="Você ainda não possui amigos"
                description="Use a busca acima para adicionar seus primeiros contatos."
                icon="people-outline"
              />
            ) : (
              <View style={styles.listWrap}>
                {friends.map((friend) =>
                  renderUserRow(
                    friend,
                    <Ionicons name="people" size={18} color={colors.info} />,
                    `friend-${friend.uid}`
                  )
                )}
              </View>
            )}
          </AppCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsCard: {
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  feedBtn: {
    minHeight: 44,
  },
  helperText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
  },
  listWrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30, 58, 138, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.36)",
  },
  avatarInitial: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: 12,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    ...typography.cardTitle,
    fontSize: 14,
    lineHeight: 18,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  compactBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  compactBtnText: {
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  dualActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  acceptBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
  },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  pendingBadge: {
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.5)",
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  pendingBadgeText: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
  },
});

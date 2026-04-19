import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { auth, database } from "../../services/connectionFirebase";
import {
  AppButton,
  AppCard,
  EmptyState,
  LoadingState,
  SectionTitle,
} from "../components/ui";
import { colors, layout, spacing, typography } from "../theme/designSystem";

export default function ProfileBasicScreen() {
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("Usuário");
  const [username, setUsername] = useState("track_user");
  const [email, setEmail] = useState("");
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      setEmail(user.email || "");
      const userRef = ref(database, `users/${user.uid}`);
      const unsubscribeUser = onValue(userRef, (snapshot) => {
        const data = snapshot.val() || {};
        setFullName(data.fullName || "Usuário");
        setUsername(data.username || `user_${user.uid.slice(0, 6)}`);

        const parsed = data.atividades
          ? Object.keys(data.atividades).map((id) => ({ id, ...data.atividades[id] }))
          : [];
        setActivities(parsed);
        setLoading(false);
      });

      return unsubscribeUser;
    });

    return () => unsubscribeAuth();
  }, []);

  const stats = useMemo(() => {
    const totalKm = activities.reduce((sum, item) => sum + Number(item.distancia || 0), 0);
    const totalDurationSec = activities.reduce((sum, item) => sum + Number(item.duracao || 0), 0);
    const totalHours = totalDurationSec / 3600;
    return {
      totalKm,
      totalActivities: activities.length,
      totalHours,
    };
  }, [activities]);

  const handleLogout = () => {
    Alert.alert("Sair da conta", "Deseja encerrar sua sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
          } catch {
            Alert.alert("Erro", "Não foi possível sair agora.");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <LoadingState label="Carregando perfil..." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppCard animated style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
        </View>

        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.username}>@{username}</Text>
        <Text style={styles.email}>{email || "E-mail não disponível"}</Text>
      </AppCard>

      <View style={styles.statsRow}>
        <AppCard animated style={styles.statCard}>
          <Text style={styles.statLabel}>Atividades</Text>
          <Text style={styles.statValue}>{stats.totalActivities}</Text>
        </AppCard>

        <AppCard animated style={styles.statCard}>
          <Text style={styles.statLabel}>Distância</Text>
          <Text style={styles.statValue}>{stats.totalKm.toFixed(1)} km</Text>
        </AppCard>

        <AppCard animated style={styles.statCard}>
          <Text style={styles.statLabel}>Tempo</Text>
          <Text style={styles.statValue}>{stats.totalHours.toFixed(1)} h</Text>
        </AppCard>
      </View>

      <SectionTitle title="Histórico recente" subtitle="Suas últimas atividades" />

      {activities.length > 0 ? (
        <AppCard animated>
          {activities.slice(0, 5).map((item, index) => (
            <View
              key={item.id}
              style={[styles.historyRow, index === activities.slice(0, 5).length - 1 ? styles.historyLast : null]}
            >
              <View style={styles.historyLeft}>
                <Text style={styles.historyTitle}>{item.tipo || "Atividade"}</Text>
                <Text style={styles.historyDate}>{item.data || "Sem data"}</Text>
              </View>
              <Text style={styles.historyDistance}>{item.distancia || 0} km</Text>
            </View>
          ))}
        </AppCard>
      ) : (
        <EmptyState
          title="Sem atividades registradas"
          description="Comece sua primeira atividade para construir seu histórico."
          icon="walk-outline"
        />
      )}

      <AppButton
        title="Sair da conta"
        variant="danger"
        onPress={handleLogout}
        icon={<Ionicons name="log-out-outline" size={18} color={colors.textPrimary} />}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileCard: {
    alignItems: "center",
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: "800",
  },
  name: {
    ...typography.sectionTitle,
    fontSize: 22,
  },
  username: {
    marginTop: spacing.xxs,
    color: colors.primary,
    fontWeight: "700",
  },
  email: {
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statValue: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  historyLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  historyLeft: {
    flex: 1,
  },
  historyTitle: {
    color: colors.textPrimary,
    textTransform: "capitalize",
    fontWeight: "700",
  },
  historyDate: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xxs,
  },
  historyDistance: {
    color: colors.info,
    fontWeight: "700",
    marginLeft: spacing.sm,
  },
});

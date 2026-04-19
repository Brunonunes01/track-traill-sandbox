import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, database } from "../../services/connectionFirebase";
import { resolveUserRole } from "../../services/adminService";
import { ensureUserProfileCompatibility, updatePublicProfile } from "../services/userService";
import { AppButton, AppCard, LoadingState } from "../components/ui";
import { colors, layout, radius, shadows, spacing, typography } from "../theme/designSystem";

type PerfilScreenProps = {
  navigation?: any;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseClockDurationToSeconds = (value: string): number | null => {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
};

const parseDurationSeconds = (atividade: any): number => {
  const durationSeconds = toFiniteNumber(atividade?.durationSeconds);
  if (durationSeconds !== null) return Math.max(0, durationSeconds);

  const duracaoRaw = atividade?.duracao;
  if (typeof duracaoRaw === "string" && duracaoRaw.includes(":")) {
    return Math.max(0, parseClockDurationToSeconds(duracaoRaw) || 0);
  }

  const duracao = toFiniteNumber(duracaoRaw);
  if (duracao !== null) return Math.max(0, duracao);

  const duration = toFiniteNumber(atividade?.duration);
  if (duration !== null) return Math.max(0, duration);

  const tempoTotal = toFiniteNumber(atividade?.tempoTotal);
  if (tempoTotal !== null) return Math.max(0, tempoTotal);

  const minutes = toFiniteNumber(atividade?.minutes);
  if (minutes !== null) return Math.max(0, minutes * 60);

  const minutos = toFiniteNumber(atividade?.minutos);
  if (minutos !== null) return Math.max(0, minutos * 60);

  return 0;
};

const formatDurationLabel = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${totalMinutes} min`;
  if (minutes <= 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

export default function PerfilScreen(props: PerfilScreenProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [uidLogado, setUidLogado] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");

  const [totalKm, setTotalKm] = useState(0);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(0);

  const hookNavigation = useNavigation<any>();
  const navigation = props.navigation || hookNavigation;

  useEffect(() => {
    let unsubscribeDB: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeDB) {
        unsubscribeDB();
        unsubscribeDB = null;
      }

      if (user) {
        setUidLogado(user.uid);
        setEmail(user.email || "");
        ensureUserProfileCompatibility({ uid: user.uid, email: user.email || "" }).catch((error: any) => {
          console.error("[username-flow] ensure-profile:failure", {
            screen: "PerfilScreen",
            uid: user.uid,
            reason: error?.message || String(error),
          });
          Alert.alert("Aviso", "Não foi possível sincronizar o username agora. Tente novamente em instantes.");
        });

        const userRef = ref(database, `users/${user.uid}`);

        unsubscribeDB = onValue(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.val();

              setFullName(data.fullName || "Usuário Sem Nome");
              setUsername(data.username || `user_${user.uid.substring(0, 6)}`);
              setRole(resolveUserRole(data, user.email || "") as "user" | "admin");

              if (data.atividades) {
                let km = 0;
                let totalSeconds = 0;
                Object.values(data.atividades).forEach((ativ: any) => {
                  km += Number(ativ.distancia || 0);
                  totalSeconds += parseDurationSeconds(ativ);
                });
                setTotalKm(km);
                setTotalDurationSeconds(totalSeconds);
              } else {
                setTotalKm(0);
                setTotalDurationSeconds(0);
              }
            } else {
              setFullName("Novo Explorador");
              setUsername(`user_${user.uid.substring(0, 5)}`);
              setRole("user");
              setTotalKm(0);
              setTotalDurationSeconds(0);
            }
            setLoading(false);
          },
          (error) => {
            Alert.alert("Erro de Leitura", `O Firebase bloqueou o acesso: ${error.message}`);
            setLoading(false);
          }
        );
      } else {
        setLoading(false);
        if (typeof navigation.reset === "function") {
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        } else if (typeof navigation.replace === "function") {
          navigation.replace("Login");
        }
      }
    });

    return () => {
      if (unsubscribeDB) unsubscribeDB();
      unsubscribeAuth();
    };
  }, [navigation]);

  const handleSaveProfile = async () => {
    if (!fullName || !username) {
      Alert.alert("Atenção", "Nome e Username não podem ficar vazios.");
      return;
    }
    if (!uidLogado) return;

    try {
      await updatePublicProfile({ uid: uidLogado, fullName, username });
      setIsEditing(false);
      Alert.alert("Sucesso", "O seu perfil foi atualizado!");
    } catch (error: any) {
      Alert.alert("Erro", `Falha ao atualizar perfil: ${error.message}`);
    }
  };

  const profileDeepLink = `tracktrail://user/${username}`;
  const profileWebLink = `https://tracktrail.app/user/${username}`;

  const handleCopyProfileLink = async () => {
    try {
      await Clipboard.setStringAsync(profileDeepLink);
      Alert.alert("Link copiado", profileDeepLink);
    } catch {
      Alert.alert("Erro", "Não foi possível copiar o link agora.");
    }
  };

  const handleShareProfile = async () => {
    try {
      await Share.share({ message: `Meu perfil no Track & Trail:\n${profileDeepLink}\n${profileWebLink}` });
    } catch {
      Alert.alert("Erro", "Não foi possível compartilhar o perfil agora.");
    }
  };

  const handleLogout = () => {
    Alert.alert("Sair da Conta", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
          } catch {
            Alert.alert("Erro", "Não foi possível fazer logout.");
          }
        },
      },
    ]);
  };

  const initials = useMemo(() => {
    const parts = fullName.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }, [fullName]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingState label="Sincronizando perfil..." />
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: Math.max(tabBarHeight + insets.bottom + spacing.lg, spacing.xxl),
          },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Meu Perfil</Text>
          <TouchableOpacity style={[styles.iconBtn, styles.logoutBtn]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>

        <AppCard style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.fullName}>{fullName}</Text>
          <Text style={styles.usernameText}>@{username}</Text>
          <View style={[styles.roleBadge, role === "admin" ? styles.roleBadgeAdmin : styles.roleBadgeUser]}>
            <Text style={styles.roleText}>{role.toUpperCase()}</Text>
          </View>

          <View style={styles.shareRow}>
            <AppButton
              title="Copiar link"
              variant="ghost"
              icon={<Ionicons name="copy-outline" size={16} color={colors.textPrimary} />}
              onPress={handleCopyProfileLink}
              style={styles.shareBtn}
            />
            <AppButton
              title="Compartilhar"
              variant="ghost"
              icon={<Ionicons name="share-social-outline" size={16} color={colors.textPrimary} />}
              onPress={handleShareProfile}
              style={styles.shareBtn}
            />
          </View>
        </AppCard>

        <View style={styles.statsRow}>
          <AppCard style={styles.statCard}>
            <Ionicons name="trail-sign-outline" size={20} color={colors.info} />
            <Text style={styles.statValue}>{totalKm.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Percorridos</Text>
          </AppCard>
          <AppCard style={styles.statCard}>
            <Ionicons name="time-outline" size={20} color={colors.success} />
            <Text style={styles.statValue}>{formatDurationLabel(totalDurationSeconds)}</Text>
            <Text style={styles.statLabel}>Tempo total</Text>
          </AppCard>
        </View>

        <AppButton
          title="Ver histórico completo"
          variant="secondary"
          icon={<Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />}
          onPress={() => navigation.navigate("History")}
          style={styles.historyAction}
        />

        <AppCard style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Informações pessoais</Text>
            <TouchableOpacity onPress={() => setIsEditing((current) => !current)}>
              <Ionicons
                name={isEditing ? "close-circle-outline" : "create-outline"}
                size={20}
                color={isEditing ? colors.warning : colors.info}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Nome completo</Text>
          <TextInput
            style={[styles.input, isEditing ? styles.inputEditable : null]}
            value={fullName}
            onChangeText={setFullName}
            editable={isEditing}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Nome de usuário</Text>
          <TextInput
            style={[styles.input, isEditing ? styles.inputEditable : null]}
            value={username}
            onChangeText={setUsername}
            editable={isEditing}
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>E-mail (privado)</Text>
          <TextInput style={[styles.input, styles.inputReadonly]} value={email} editable={false} />

          {isEditing ? (
            <AppButton
              title="Salvar alterações"
              onPress={handleSaveProfile}
              icon={<Ionicons name="save-outline" size={16} color={colors.white} />}
              style={styles.saveAction}
            />
          ) : null}

          {role === "admin" ? (
            <AppButton
              title="Painel de administração"
              variant="danger"
              icon={<Ionicons name="shield-checkmark-outline" size={16} color={colors.textPrimary} />}
              onPress={() => navigation.navigate("AdminDashboard")}
              style={styles.adminAction}
            />
          ) : null}
        </AppCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(11, 18, 32, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    borderColor: "rgba(239, 68, 68, 0.35)",
    backgroundColor: "rgba(127, 29, 29, 0.2)",
  },
  screenTitle: {
    ...typography.sectionTitle,
    fontSize: 22,
  },
  profileCard: {
    alignItems: "center",
    gap: spacing.xs,
  },
  avatarCircle: {
    width: 92,
    height: 92,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: "rgba(248,250,252,0.9)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.floating,
  },
  avatarText: {
    color: colors.white,
    fontSize: 34,
    fontWeight: "800",
  },
  fullName: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  usernameText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  roleBadge: {
    marginTop: spacing.xs,
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
  },
  roleBadgeAdmin: {
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(127, 29, 29, 0.22)",
  },
  roleBadgeUser: {
    borderColor: "rgba(56, 189, 248, 0.35)",
    backgroundColor: "rgba(12, 74, 110, 0.25)",
  },
  roleText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shareRow: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  shareBtn: {
    flex: 1,
    minHeight: 44,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  historyAction: {
    minHeight: 50,
  },
  formCard: {
    gap: spacing.xs,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  formTitle: {
    ...typography.cardTitle,
  },
  fieldLabel: {
    ...typography.label,
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  inputEditable: {
    borderColor: colors.info,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
  },
  inputReadonly: {
    color: colors.textMuted,
    opacity: 0.9,
  },
  saveAction: {
    marginTop: spacing.sm,
  },
  adminAction: {
    marginTop: spacing.sm,
  },
});

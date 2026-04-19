import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { onValue, ref, remove, update } from "firebase/database";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, database } from "../../services/connectionFirebase";
import WeatherCard from "../components/WeatherCard";
import { AppCard, EmptyState, SectionTitle } from "../components/ui";
import { getPendingSyncActivities, removePendingSyncActivity } from "../services/activityTrackingService";
import { colors, layout, radius, spacing } from "../theme/designSystem";

type WeatherCoordinates = {
  latitude: number;
  longitude: number;
};

type ActivityGeoPoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp?: number;
};

type DashboardActivity = {
  id: string;
  isPending?: boolean;
  status?: string;
  sessionId?: string;
  tipo?: string;
  cidade?: string;
  data?: string;
  duracao?: number;
  distancia?: number;
  criadoEm?: string;
  rota?: ActivityGeoPoint[];
  points?: ActivityGeoPoint[];
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeActivity = (id: string, raw: any, isPending: boolean): DashboardActivity => ({
  id,
  isPending,
  status: typeof raw?.status === "string" ? raw.status : undefined,
  sessionId: typeof raw?.sessionId === "string" ? raw.sessionId : undefined,
  tipo: typeof raw?.tipo === "string" ? raw.tipo : undefined,
  cidade: typeof raw?.cidade === "string" ? raw.cidade : undefined,
  data: typeof raw?.data === "string" ? raw.data : undefined,
  duracao: toFiniteNumber(raw?.duracao, 0),
  distancia: toFiniteNumber(raw?.distancia, 0),
  criadoEm: typeof raw?.criadoEm === "string" ? raw.criadoEm : undefined,
  rota: Array.isArray(raw?.rota) ? raw.rota : undefined,
  points: Array.isArray(raw?.points) ? raw.points : undefined,
});

export default function DashboardScreen() {
  const [atividades, setAtividades] = useState<DashboardActivity[]>([]);
  const [firebaseAtividades, setFirebaseAtividades] = useState<DashboardActivity[]>([]);
  const [localPendingAtividades, setLocalPendingAtividades] = useState<DashboardActivity[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<DashboardActivity | null>(null);

  const [tipo, setTipo] = useState("");
  const [cidade, setCidade] = useState("");
  const [data, setData] = useState("");
  const [duracao, setDuracao] = useState("");
  const [distancia, setDistancia] = useState("");

  const [weatherCoordinates, setWeatherCoordinates] = useState<WeatherCoordinates | null>(null);
  const [weatherSource, setWeatherSource] = useState<"route" | "gps" | "none">("none");
  const [resolvingWeatherCoordinates, setResolvingWeatherCoordinates] = useState(true);

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.textPrimary,
      headerTitle: "Histórico de Atividades",
    });
  }, [navigation]);

  // Carregar do Local (Sync Queue)
  const refreshLocalPending = async () => {
    try {
      const pending = await getPendingSyncActivities();
      const normalizedPending = pending
        .filter((item): item is DashboardActivity => Boolean(item?.id))
        .map((item) => normalizeActivity(String(item.id), item, true));
      setLocalPendingAtividades(normalizedPending);
    } catch (err) {
      console.warn("[dashboard] failed to fetch local pending activities:", err);
    }
  };

  useEffect(() => {
    refreshLocalPending();
    const interval = setInterval(refreshLocalPending, 10000); // Poll local status every 10s
    return () => clearInterval(interval);
  }, []);

  // Carregar do Firebase
  useEffect(() => {
    if (!user) return;

    const activitiesRef = ref(database, `users/${user.uid}/atividades`);
    const unsubscribe = onValue(activitiesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setFirebaseAtividades([]);
        return;
      }

      const parsed = Object.keys(data).map((key) => normalizeActivity(key, data[key], false));
      setFirebaseAtividades(parsed);
    });

    return () => unsubscribe();
  }, [user]);

  // Mesclar Atividades
  useEffect(() => {
    // Evita duplicados (atividades que acabaram de ser sincronizadas mas ainda estão na fila local)
    const syncedIds = new Set(firebaseAtividades.map((item) => item.sessionId || item.id));
    const filteredLocal = localPendingAtividades.filter((item) => !syncedIds.has(item.id));

    const combined = [...filteredLocal, ...firebaseAtividades];
    const sorted = combined.sort(
      (a, b) => new Date(b.criadoEm || b.data || 0).getTime() - new Date(a.criadoEm || a.data || 0).getTime()
    );
    setAtividades(sorted);
  }, [firebaseAtividades, localPendingAtividades]);

  useEffect(() => {
    let cancelled = false;

    const routeAnchor = atividades.find((item) => {
      const firstPoint = item?.rota?.[0] || item?.points?.[0];
      return (
        (Array.isArray(item?.rota) || Array.isArray(item?.points)) &&
        typeof firstPoint?.latitude === "number" &&
        typeof firstPoint?.longitude === "number"
      );
    })?.rota?.[0] || atividades.find((item) => item.points?.[0])?.points?.[0];

    if (routeAnchor) {
      setWeatherCoordinates({ latitude: routeAnchor.latitude, longitude: routeAnchor.longitude });
      setWeatherSource("route");
      setResolvingWeatherCoordinates(false);
      return;
    }


    const resolveCurrentLocation = async () => {
      try {
        setResolvingWeatherCoordinates(true);
        const currentPermission = await Location.getForegroundPermissionsAsync();
        const permission =
          currentPermission.status === "granted"
            ? currentPermission
            : await Location.requestForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          if (!cancelled) {
            setWeatherCoordinates(null);
            setWeatherSource("none");
          }
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          setWeatherCoordinates({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          });
          setWeatherSource("gps");
        }
      } catch {
        if (!cancelled) {
          setWeatherCoordinates(null);
          setWeatherSource("none");
        }
      } finally {
        if (!cancelled) {
          setResolvingWeatherCoordinates(false);
        }
      }
    };

    resolveCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, [atividades]);

  const capitalize = (text?: string) =>
    text ? text.charAt(0).toUpperCase() + text.slice(1) : "Atividade";

  const formatarDuracao = (totalSegundos: number) => {
    if (!totalSegundos) return "00:00";
    const min = Math.floor(totalSegundos / 60);
    const seg = Math.floor(totalSegundos % 60);
    return `${min < 10 ? "0" : ""}${min}:${seg < 10 ? "0" : ""}${seg}`;
  };

  const openEditModal = (item: DashboardActivity) => {
    setEditItem(item);
    setTipo(String(item.tipo || ""));
    setCidade(String(item.cidade || ""));
    setData(String(item.data || ""));
    setDuracao(String(item.duracao ? Math.floor(item.duracao / 60) : 0));
    setDistancia(String(item.distancia ?? 0));
    setModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editItem) return;

    const activityRef = ref(database, `users/${user?.uid}/atividades/${editItem.id}`);
    update(activityRef, {
      tipo,
      cidade,
      data,
      duracao: Number(duracao || 0) * 60,
      distancia: Number(distancia || 0),
    })
      .then(() => {
        setModalVisible(false);
        setEditItem(null);
      })
      .catch((err) => Alert.alert("Erro", err.message));
  };

  const handleDelete = (item: DashboardActivity) => {
    Alert.alert("Excluir atividade", "Tem certeza? Essa ação não pode ser desfeita.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          if (item?.isPending) {
            try {
              await removePendingSyncActivity(String(item.id));
              await refreshLocalPending();
            } catch (error: any) {
              Alert.alert("Erro", error?.message || "Não foi possível excluir a atividade pendente.");
            }
            return;
          }

          if (!user?.uid) {
            Alert.alert("Erro", "Usuário não autenticado.");
            return;
          }

          try {
            const activityRef = ref(database, `users/${user?.uid}/atividades/${item.id}`);
            await remove(activityRef);
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível excluir a atividade.");
          }
        },
      },
    ]);
  };

  const renderActivityCard = ({ item }: { item: DashboardActivity }) => {
    const isPending = !!item.isPending;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.cardTouchable}
        onPress={() => navigation.navigate("ActivityView", { atividade: item })}
      >
        <AppCard style={[styles.card, isPending && styles.cardPending]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.titleWithSync}>
              <Text style={styles.itemTitle}>{capitalize(item.tipo)}</Text>
              <Ionicons
                name={isPending ? "cloud-upload-outline" : "cloud-done-outline"}
                size={16}
                color={isPending ? "#fbbf24" : "#10b981"}
                style={styles.syncIcon}
              />
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{String(item.data || "Sem data")}</Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.statValue}>{formatarDuracao(Number(item.duracao || 0))}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="resize-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.statValue}>{toFiniteNumber(item.distancia, 0).toFixed(2)} km</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text numberOfLines={1} style={styles.statValue}>{String(item.cidade || "Não informado")}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => openEditModal(item)} style={styles.miniBtn}>
              <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.miniBtn, styles.deleteBtn]}>
              <Ionicons name="trash-outline" size={16} color="#fecaca" />
            </TouchableOpacity>
          </View>
        </AppCard>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View style={styles.headerArea}>
      <AppCard style={styles.headerCard}>
        <SectionTitle
          title="Minhas Aventuras"
          subtitle={`${atividades.length} registro(s)`}
        />
      </AppCard>

      <AppCard style={styles.weatherSection}>
        <Text style={styles.weatherTitle}>Condição do tempo</Text>

        {weatherCoordinates ? (
          <WeatherCard latitude={weatherCoordinates.latitude} longitude={weatherCoordinates.longitude} />
        ) : (
          <View style={styles.weatherFallback}>
            <Text style={styles.weatherFallbackText}>
              {resolvingWeatherCoordinates
                ? "Localizando coordenadas para carregar o clima..."
                : "Clima indisponível no momento. Permita localização ou registre uma rota para ver o clima aqui."}
            </Text>
          </View>
        )}

        {weatherSource !== "none" && (
          <Text style={styles.weatherSourceText}>
            Fonte: {weatherSource === "route" ? "última rota registrada" : "localização atual"}
          </Text>
        )}
      </AppCard>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#08101D", "#0B1220", "#121F36"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <FlatList
        data={atividades}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        renderItem={renderActivityCard}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: Math.max(insets.bottom + 28, 40),
          },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyStateWrap}>
            <EmptyState
              title="Nenhuma atividade registrada"
              description="Inicie uma atividade para começar a construir seu histórico."
              icon="trail-sign-outline"
            />
          </View>
        }
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <AppCard style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar registro</Text>

            <Text style={styles.label}>Tipo</Text>
            <TextInput style={styles.input} value={tipo} onChangeText={setTipo} placeholderTextColor={colors.textMuted} />

            <Text style={styles.label}>Cidade</Text>
            <TextInput style={styles.input} value={cidade} onChangeText={setCidade} placeholderTextColor={colors.textMuted} />

            <View style={styles.inputRow}>
              <View style={styles.inputCol}>
                <Text style={styles.label}>Data</Text>
                <TextInput style={styles.input} value={data} onChangeText={setData} placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.label}>Duração (min)</Text>
                <TextInput
                  style={styles.input}
                  value={duracao}
                  keyboardType="numeric"
                  onChangeText={setDuracao}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={styles.label}>Distância (km)</Text>
            <TextInput
              style={styles.input}
              value={distancia}
              keyboardType="numeric"
              onChangeText={setDistancia}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnTextConfig}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                <Text style={styles.saveText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </AppCard>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: layout.screenPaddingHorizontal,
  },
  headerArea: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerCard: {
    backgroundColor: "rgba(11, 18, 32, 0.72)",
  },
  weatherSection: {
    backgroundColor: "rgba(11, 18, 32, 0.72)",
    marginBottom: spacing.xs,
  },
  weatherTitle: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  weatherFallback: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  weatherFallbackText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  weatherSourceText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },

  cardTouchable: {
    marginBottom: spacing.sm,
  },
  card: {
    padding: spacing.md,
    backgroundColor: "rgba(18, 28, 46, 0.95)",
  },
  cardPending: {
    borderColor: "rgba(251, 191, 36, 0.3)",
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  titleWithSync: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  syncIcon: {
    marginTop: 2,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  dateBadge: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.round,
  },
  dateText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  statsContainer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statValue: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
  },
  actionRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    backgroundColor: "rgba(127,29,29,0.45)",
    borderColor: "rgba(248,113,113,0.45)",
  },

  emptyStateWrap: {
    marginTop: spacing.xl,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: layout.screenPaddingHorizontal,
  },
  modalContent: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: spacing.md,
    textAlign: "center",
  },
  label: {
    color: colors.textSecondary,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  inputCol: {
    flex: 1,
  },
  modalButtons: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  btnTextConfig: {
    fontWeight: "800",
    color: colors.textSecondary,
  },
  saveText: {
    fontWeight: "800",
    color: colors.white,
  },
});

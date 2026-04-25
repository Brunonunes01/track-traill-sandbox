import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityType,
  ActiveActivitySession,
  discardActiveSession,
  formatDuration,
  getAveragePaceMinPerKm,
  getActiveSession,
  getSessionRecordingStateLabel,
  getAverageSpeedKmh,
  getSessionDurationSeconds,
  saveFinishedSessionAsActivity,
  saveFinishedSessionAsRoute,
} from "../services/activityTrackingService";
import { createActivitySharePost } from "../../services/communityService";
import { formatPace, getPerformancePrimary } from "../utils/activityMetrics";
import { FALLBACK_REGION, getRegionWithFallback, toCoordinateArray } from "../utils/geo";
import ElevationChart from "../components/activity/ElevationChart";
import PaceChart from "../components/activity/PaceChart";
import { buildElevationChartData, buildPaceChartData, ChartPoint } from "../utils/activityCharts";

const ACTIVITY_OPTIONS: { label: string; value: ActivityType }[] = [
  { label: "Bike", value: "bike" },
  { label: "Corrida", value: "corrida" },
  { label: "Caminhada", value: "caminhada" },
  { label: "Trilha", value: "trilha" },
];

const getActivityLabel = (value: ActivityType) =>
  ACTIVITY_OPTIONS.find((item) => item.value === value)?.label || value;

type ActivitySummaryScreenProps = {
  navigation?: any;
  route?: any;
};
type ShareVisibility = "public" | "friends" | "private";
const VISIBILITY_OPTIONS: { value: ShareVisibility; label: string }[] = [
  { value: "public", label: "App inteiro" },
  { value: "friends", label: "Somente amigos" },
  { value: "private", label: "Só para mim" },
];

export default function ActivitySummaryScreen(props: ActivitySummaryScreenProps) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const route = props.route || hookRoute;
  const insets = useSafeAreaInsets();
  const sessionFromParams = route.params?.session as ActiveActivitySession | undefined;
  const contentBottomPadding = Math.max(insets.bottom + 56, 88);

  const [session, setSession] = useState<ActiveActivitySession | null>(sessionFromParams || null);
  const [loading, setLoading] = useState(!sessionFromParams);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<ShareVisibility>("public");
  const [activityType, setActivityType] = useState<ActivityType>(
    sessionFromParams?.activityType || "trilha"
  );

  useEffect(() => {
    if (sessionFromParams) {
      setActivityType(sessionFromParams.activityType);
      return;
    }

    let mounted = true;
    const loadSession = async () => {
      try {
        const active = await getActiveSession();
        if (!mounted) return;

        setSession(active);
        if (active) {
          setActivityType(active.activityType);
        }
      } catch (error: any) {
        console.warn("[activity-summary] loadSession failed:", error?.message || String(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, [sessionFromParams]);

  const durationSeconds = useMemo(() => getSessionDurationSeconds(session), [session]);
  const averageSpeed = useMemo(() => getAverageSpeedKmh(session), [session]);
  const averagePace = useMemo(() => getAveragePaceMinPerKm(session), [session]);
  const performancePrimary = useMemo(
    () => getPerformancePrimary(activityType, averageSpeed, averagePace),
    [activityType, averagePace, averageSpeed]
  );
  const recordingState = useMemo(() => getSessionRecordingStateLabel(session), [session]);
  const elevationGain = useMemo(() => Number(session?.elevation?.gainMeters || 0), [session]);
  const elevationLoss = useMemo(() => Number(session?.elevation?.lossMeters || 0), [session]);
  const altitudeMin = useMemo(
    () =>
      typeof session?.elevation?.minAltitude === "number"
        ? session.elevation.minAltitude
        : null,
    [session?.elevation?.minAltitude]
  );
  const altitudeMax = useMemo(
    () =>
      typeof session?.elevation?.maxAltitude === "number"
        ? session.elevation.maxAltitude
        : null,
    [session?.elevation?.maxAltitude]
  );

  const mapPoints = useMemo(
    () => toCoordinateArray(session?.points || []),
    [session]
  );

  const initialRegion = useMemo(() => {
    const firstPoint = mapPoints[0];
    return getRegionWithFallback(firstPoint, FALLBACK_REGION, {
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
  }, [mapPoints]);
  const elevationChartPoints = useMemo(() => buildElevationChartData(session?.points || []), [session?.points]);
  const paceChartPoints = useMemo(() => buildPaceChartData(session?.points || []), [session?.points]);
  const [focusedChartPoint, setFocusedChartPoint] = useState<ChartPoint | null>(null);

  const handleDiscard = async () => {
    Alert.alert(
      "Descartar atividade?",
      "Essa ação remove a atividade atual e não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Descartar",
          style: "destructive",
          onPress: async () => {
            try {
              await discardActiveSession();
              navigation.navigate("MainTabs", { screen: "Home" });
            } catch (error: any) {
              console.warn("[activity-summary] handleDiscard failed:", error?.message || String(error));
              Alert.alert("Erro", "Não foi possível descartar a atividade agora.");
            }
          },
        },
      ]
    );
  };

  const handleSaveRoute = async () => {
    if (!session) {
      Alert.alert("Erro", "Nenhuma atividade finalizada encontrada.");
      return;
    }

    try {
      setSaving(true);

      const response = await saveFinishedSessionAsRoute(session, {
        routeName,
        description,
        activityType,
        visibility,
      });

      const message =
        response.reviewRequired
          ? `Atividade: ${response.activityId}\nRota: ${response.routeId}\nA rota foi enviada para análise pública.`
          : `Atividade: ${response.activityId}\nRota: ${response.routeId}\nRota salva no seu espaço (${visibility === "private" ? "só para você" : "somente amigos"}).`;
      Alert.alert("Rota salva com sucesso", message);

      navigation.navigate("MainTabs", { screen: "Home" });
    } catch (error: any) {
      Alert.alert("Não foi possível salvar", error?.message || "Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleShareOnly = async () => {
    if (!session) {
      Alert.alert("Erro", "Nenhuma atividade finalizada encontrada.");
      return;
    }

    try {
      setSharing(true);

      const savedActivity = await saveFinishedSessionAsActivity(session, activityType, visibility);
      await createActivitySharePost({
        userId: session.userId,
        session,
        activityId: savedActivity.activityId,
        routeId: null,
        routeName: routeName.trim() || null,
        caption,
        activityType,
        photoUris,
        visibility,
      });

      await discardActiveSession();
      Alert.alert(
        "Compartilhado",
        visibility === "public"
          ? "Sua atividade foi compartilhada para todo o app."
          : visibility === "friends"
            ? "Sua atividade foi compartilhada com seus amigos."
            : "Sua atividade foi salva como privada e só você consegue ver."
      );
      navigation.navigate("Community");
    } catch (error: any) {
      Alert.alert("Não foi possível compartilhar", error?.message || "Tente novamente.");
    } finally {
      setSharing(false);
    }
  };

  const handleSaveAndShare = async () => {
    if (!session) {
      Alert.alert("Erro", "Nenhuma atividade finalizada encontrada.");
      return;
    }

    if (!routeName.trim()) {
      Alert.alert("Nome da rota obrigatório", "Informe um nome para salvar e compartilhar.");
      return;
    }

    try {
      setSaving(true);
      setSharing(true);

      const savedRoute = await saveFinishedSessionAsRoute(session, {
        routeName,
        description,
        activityType,
        visibility,
      });

      await createActivitySharePost({
        userId: session.userId,
        session,
        activityId: savedRoute.activityId,
        routeId: savedRoute.routeId,
        routeName: routeName.trim(),
        caption,
        activityType,
        photoUris,
        visibility,
      });

      Alert.alert(
        "Rota salva e compartilhada",
        visibility === "public"
          ? "Sua atividade foi compartilhada no app inteiro."
          : visibility === "friends"
            ? "Sua atividade foi compartilhada com seus amigos."
            : "Sua atividade foi salva como privada."
      );
      navigation.navigate("Community");
    } catch (error: any) {
      Alert.alert("Não foi possível concluir", error?.message || "Tente novamente.");
    } finally {
      setSaving(false);
      setSharing(false);
    }
  };

  const handlePickPhotos = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permissão necessária", "Permita acesso à galeria para anexar fotos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        quality: 0.72,
        selectionLimit: 4,
      });

      if (result.canceled) return;
      const next = (result.assets || [])
        .map((asset) => asset.uri)
        .filter((uri): uri is string => Boolean(uri));

      if (next.length === 0) return;
      setPhotoUris((prev) => [...prev, ...next].slice(0, 6));
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível selecionar fotos.");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffd700" />
        <Text style={styles.centeredText}>Carregando resumo da atividade...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Nenhuma atividade finalizada disponível.</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
        >
          {mapPoints.length > 0 ? (
            <Marker coordinate={mapPoints[0]} title="Início">
              <Ionicons name="location" size={36} color="#22c55e" />
            </Marker>
          ) : null}

          {mapPoints.length > 1 ? (
            <Marker coordinate={mapPoints[mapPoints.length - 1]} title="Fim">
              <Ionicons name="flag" size={36} color="#ef4444" />
            </Marker>
          ) : null}

          {mapPoints.length > 1 ? (
            <Polyline coordinates={mapPoints} strokeColor="#ffd700" strokeWidth={5} />
          ) : null}
          {focusedChartPoint ? (
            <Marker coordinate={focusedChartPoint.coordinate} title="Ponto selecionado">
              <Ionicons name="ellipse" size={18} color="#f97316" />
            </Marker>
          ) : null}
        </MapView>

        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 8 }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Resumo da atividade</Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Duração</Text>
            <Text style={styles.metricValue}>{formatDuration(durationSeconds)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distância</Text>
            <Text style={styles.metricValue}>{session.distanceKm.toFixed(2)} km</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{performancePrimary.label}</Text>
            <Text style={styles.metricValue}>{performancePrimary.value}</Text>
          </View>
        </View>

        <ElevationChart points={elevationChartPoints} onPointFocus={setFocusedChartPoint} />
        <PaceChart points={paceChartPoints} onPointFocus={setFocusedChartPoint} />

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ganho elevação</Text>
            <Text style={styles.metricValue}>{elevationGain.toFixed(0)} m</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Perda elevação</Text>
            <Text style={styles.metricValue}>{elevationLoss.toFixed(0)} m</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Altitude mín/máx</Text>
            <Text style={styles.metricValue}>
              {altitudeMin !== null && altitudeMax !== null
                ? `${altitudeMin.toFixed(0)} / ${altitudeMax.toFixed(0)} m`
                : "N/D"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Salvar como rota</Text>

        <Text style={styles.label}>Nome da rota</Text>
        <TextInput
          style={styles.input}
          value={routeName}
          onChangeText={setRouteName}
          placeholder="Ex: Trilha da Serra Norte"
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Tipo da atividade</Text>
        <View style={styles.chipsRow}>
          {ACTIVITY_OPTIONS.map((option) => {
            const selected = activityType === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, selected ? styles.chipActive : null]}
                onPress={() => setActivityType(option.value)}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          placeholder="Conte um pouco sobre terreno, pontos de referência e dicas da rota."
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Legenda para compartilhar (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={caption}
          onChangeText={setCaption}
          multiline
          textAlignVertical="top"
          placeholder="Ex: Trilha incrível hoje cedo, trecho final com subida forte."
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Quem pode ver</Text>
        <View style={styles.chipsRow}>
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = visibility === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, selected ? styles.chipActive : null]}
                onPress={() => setVisibility(option.value)}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Fotos da atividade (opcional)</Text>
        <TouchableOpacity style={styles.infoBtn} onPress={handlePickPhotos} disabled={saving || sharing}>
          <Ionicons name="images-outline" size={18} color="#fff" />
          <Text style={styles.infoBtnText}>Anexar fotos</Text>
        </TouchableOpacity>

        {photoUris.length > 0 ? (
          <View style={styles.photosRow}>
            {photoUris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.photoItemWrap}>
                <Image source={{ uri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.photoRemoveBtn}
                  onPress={() =>
                    setPhotoUris((prev) => prev.filter((_, photoIndex) => photoIndex !== index))
                  }
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Tipo original: {getActivityLabel(session.activityType)}</Text>
          <Text style={styles.infoText}>Pontos GPS: {session.points.length}</Text>
          <Text style={styles.infoText}>Status: {recordingState}</Text>
          <Text style={styles.infoText}>Pace médio: {formatPace(averagePace)}</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveRoute} disabled={saving || sharing}>
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#000" />
              <Text style={styles.primaryBtnText}>Salvar rota</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoBtn} onPress={handleShareOnly} disabled={saving || sharing}>
          {sharing && !saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={styles.infoBtnText}>
                {visibility === "public"
                  ? "Compartilhar no app inteiro"
                  : visibility === "friends"
                    ? "Compartilhar com amigos"
                    : "Salvar compartilhamento privado"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.successBtn} onPress={handleSaveAndShare} disabled={saving || sharing}>
          {saving && sharing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark-done-outline" size={18} color="#000" />
              <Text style={styles.successBtnText}>Salvar e compartilhar</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleDiscard} disabled={saving || sharing}>
          <Ionicons name="trash-outline" size={18} color="#d1d5db" />
          <Text style={styles.secondaryBtnText}>Descartar atividade</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  mapContainer: {
    height: "38%",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: 46,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 10,
    borderRadius: 50,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 10,
  },
  metricLabel: {
    color: "#9ca3af",
    fontSize: 11,
    marginBottom: 6,
  },
  metricValue: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  label: {
    color: "#e5e7eb",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: {
    minHeight: 90,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111827",
  },
  chipActive: {
    backgroundColor: "#ffd700",
    borderColor: "#ffd700",
  },
  chipText: {
    color: "#d1d5db",
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#000",
  },
  infoBox: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 10,
    marginTop: 12,
    gap: 4,
  },
  infoText: {
    color: "#d1d5db",
    fontSize: 12,
  },
  photosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  photoItemWrap: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(15,23,42,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#ffd700",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#000",
    fontWeight: "800",
  },
  infoBtn: {
    marginTop: 10,
    backgroundColor: "#1e4db7",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  infoBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  successBtn: {
    marginTop: 10,
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  successBtnText: {
    color: "#000",
    fontWeight: "800",
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: "#d1d5db",
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
    padding: 24,
  },
  centeredText: {
    color: "#fff",
    marginTop: 10,
    textAlign: "center",
  },
});

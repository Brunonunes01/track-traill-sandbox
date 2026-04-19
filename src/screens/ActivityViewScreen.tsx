import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import React from "react";
import {
  Alert,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import WeatherCard from "../components/WeatherCard";
import ActivityMapPreview from "../components/activity/ActivityMapPreview";
import ElevationChart from "../components/activity/ElevationChart";
import PaceChart from "../components/activity/PaceChart";
import { ActivityPoint } from "../models/activity";
import { buildElevationChartData, buildPaceChartData, ChartPoint } from "../utils/activityCharts";
import { calculatePace, formatPace, formatSpeedKmh } from "../utils/activityMetrics";
import { toCoordinateArray } from "../utils/geo";

type ActivityViewScreenProps = {
  navigation?: any;
  route?: any;
};

export default function ActivityViewScreen(props: ActivityViewScreenProps) {
  const hookRoute = useRoute<any>();
  const hookNavigation = useNavigation<any>();
  const route = props.route || hookRoute;
  const navigation = props.navigation || hookNavigation;
  const atividade: any = route.params?.atividade || {};
  const [focusedChartPoint, setFocusedChartPoint] = React.useState<ChartPoint | null>(null);
  const routePoints = toCoordinateArray(atividade.rota);
  const routeActivityPoints = React.useMemo<ActivityPoint[]>(
    () =>
      Array.isArray(atividade.rota)
        ? atividade.rota
            .filter((point: any) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
            .map((point: any, index: number) => ({
              latitude: Number(point.latitude),
              longitude: Number(point.longitude),
              altitude: Number.isFinite(point.altitude) ? Number(point.altitude) : null,
              timestamp:
                Number(point.timestamp) ||
                Date.now() + index * 5000,
            }))
        : [],
    [atividade.rota]
  );
  const elevationChartPoints = React.useMemo(() => buildElevationChartData(routeActivityPoints), [routeActivityPoints]);
  const paceChartPoints = React.useMemo(() => buildPaceChartData(routeActivityPoints), [routeActivityPoints]);

  const hasRoute = routePoints.length > 0;

  const durationSeconds = Number(atividade?.duracao || 0);
  const distanceKm = Number(atividade?.distancia || 0);
  const avgSpeedKmh =
    typeof atividade?.velocidadeMediaKmh === "number"
      ? atividade.velocidadeMediaKmh
      : durationSeconds > 0
        ? distanceKm / (durationSeconds / 3600)
        : 0;
  const avgPaceMinKm =
    typeof atividade?.paceMedioMinKm === "number"
      ? atividade.paceMedioMinKm
      : calculatePace(distanceKm, durationSeconds);
  const elevationGain = Number(atividade?.elevacaoGanhoM || 0);
  const elevationLoss = Number(atividade?.elevacaoPerdaM || 0);
  const altitudeMin =
    typeof atividade?.altitudeMinM === "number" ? Number(atividade.altitudeMinM) : null;
  const altitudeMax =
    typeof atividade?.altitudeMaxM === "number" ? Number(atividade.altitudeMaxM) : null;

  const formatDuration = (totalSeconds: number) => {
    if (!totalSeconds) return "00:00";
    const min = Math.floor(totalSeconds / 60);
    const sec = Math.floor(totalSeconds % 60);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        {hasRoute ? (
          <ActivityMapPreview points={routePoints} highlightedPoint={focusedChartPoint?.coordinate || null} style={styles.map} />
        ) : (
          <ImageBackground source={require("../../assets/images/Azulao.png")} style={styles.placeholderImage}>
            <View style={styles.noGpsOverlay}>
              <Ionicons name="map-outline" size={56} color="#7dd3fc" />
              <Text style={styles.noGpsText}>Trajeto GPS não registrado</Text>
            </View>
          </ImageBackground>
        )}

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.detailsContainer}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollDetails}>
          <View style={styles.titleRow}>
            <Text style={styles.activityTitle}>{String(atividade?.tipo || "Atividade")}</Text>
            <View style={styles.dateBadge}>
              <Text style={styles.activityDate}>{String(atividade?.data || "Sem data")}</Text>
            </View>
          </View>

          <View style={styles.metricsCard}>
            <View style={styles.metricItem}>
              <Ionicons name="resize-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Distância</Text>
              <Text style={styles.metricValue}>{distanceKm.toFixed(2)} km</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Duração</Text>
              <Text style={styles.metricValue}>{formatDuration(durationSeconds)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="flash-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Pace médio</Text>
              <Text style={styles.metricValue}>{formatPace(avgPaceMinKm)}</Text>
            </View>
          </View>

          <View style={styles.metricsCard}>
            <View style={styles.metricItem}>
              <Ionicons name="speedometer-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Velocidade média</Text>
              <Text style={styles.metricValue}>{formatSpeedKmh(avgSpeedKmh)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="trending-up-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Elevação +</Text>
              <Text style={styles.metricValue}>{elevationGain.toFixed(0)} m</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="trending-down-outline" size={18} color="#7dd3fc" />
              <Text style={styles.metricLabel}>Elevação -</Text>
              <Text style={styles.metricValue}>{elevationLoss.toFixed(0)} m</Text>
            </View>
          </View>

          <View style={styles.locationBox}>
            <Ionicons name="analytics-outline" size={18} color="#bfdbfe" />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>Altitude mínima / máxima</Text>
              <Text style={styles.locationText}>
                {altitudeMin !== null && altitudeMax !== null
                  ? `${altitudeMin.toFixed(0)} m / ${altitudeMax.toFixed(0)} m`
                  : "Não disponível para esta atividade"}
              </Text>
            </View>
          </View>

          <View style={styles.locationBox}>
            <Ionicons name="location-outline" size={18} color="#bfdbfe" />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>Local do registro</Text>
              <Text style={styles.locationText}>{String(atividade?.cidade || "Não informado")}</Text>
            </View>
          </View>

          <ElevationChart points={elevationChartPoints} onPointFocus={setFocusedChartPoint} />
          <PaceChart points={paceChartPoints} onPointFocus={setFocusedChartPoint} />

          {hasRoute ? (
            <WeatherCard latitude={routePoints[0].latitude} longitude={routePoints[0].longitude} />
          ) : (
            <View style={styles.noWeatherBox}>
              <Text style={styles.noWeatherText}>
                Clima indisponível: esta atividade não possui coordenadas de rota.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => Alert.alert("Em breve", "Partilha será disponibilizada em breve.")}
          >
            <Ionicons name="share-social-outline" size={18} color="#0f172a" />
            <Text style={styles.shareText}>Compartilhar conquista</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  headerContainer: { height: "44%", width: "100%", position: "relative" },
  map: { ...StyleSheet.absoluteFillObject },
  placeholderImage: { width: "100%", height: "100%" },
  noGpsOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.74)",
    justifyContent: "center",
    alignItems: "center",
  },
  noGpsText: { color: "#e2e8f0", fontSize: 16, marginTop: 10, fontWeight: "700" },
  backButton: {
    position: "absolute",
    top: 14,
    left: 16,
    backgroundColor: "rgba(2, 6, 23, 0.72)",
    padding: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
  },
  detailsContainer: {
    flex: 1,
    backgroundColor: "#0b1220",
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scrollDetails: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 28,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  activityTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: "#f8fafc",
    textTransform: "capitalize",
  },
  dateBadge: {
    backgroundColor: "rgba(56,189,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activityDate: { fontSize: 12, color: "#bae6fd", fontWeight: "700" },
  metricsCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    marginBottom: 14,
    paddingVertical: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
  },
  metricDivider: { width: 1, backgroundColor: "rgba(148,163,184,0.2)" },
  metricLabel: { color: "#94a3b8", fontSize: 12 },
  metricValue: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  locationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
    padding: 14,
    marginBottom: 14,
  },
  locationTitle: { color: "#e2e8f0", fontWeight: "700", fontSize: 14 },
  locationText: { color: "#94a3b8", marginTop: 2, fontSize: 13 },
  noWeatherBox: {
    backgroundColor: "rgba(15,23,42,0.75)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  noWeatherText: { color: "#94a3b8", fontSize: 13 },
  shareButton: {
    borderRadius: 14,
    backgroundColor: "#7dd3fc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 2,
  },
  shareText: { color: "#0f172a", fontSize: 15, fontWeight: "800" },
});

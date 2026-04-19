import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import AlertCard from "../components/AlertCard";
import AlertMarker from "../components/AlertMarker";
import { TrackTrailRoute, TrailAlert } from "../models/alerts";
import { exportActivityToGpxFile } from "../services/activityFilesService";
import { subscribeRouteAlerts } from "../services/alertService";
import { deleteUserRoute } from "../services/routeService";
import {
  getOfflineRoute,
  isOfflineRouteOutdated,
  removeOfflineRoute,
  saveOfflineRoute,
} from "../storage/offlineRoutes";
import { toCoordinate, toCoordinateArray } from "../utils/geo";

type RouteDetailParams = {
  routeData: TrackTrailRoute;
};

const getMapRegion = (routeData: TrackTrailRoute) => {
  const anchor = toCoordinate(routeData.startPoint) || toCoordinate(routeData.rotaCompleta?.[0]);

  if (!anchor) {
    return {
      latitude: -15.7942,
      longitude: -47.8822,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }

  return {
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };
};

type RouteDetailScreenProps = {
  navigation?: any;
  route?: any;
};

export default function RouteDetailScreen(props: RouteDetailScreenProps) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const insets = useSafeAreaInsets();
  const params = props.route?.params || hookRoute.params;
  const { routeData } = (params || {}) as RouteDetailParams;

  const [alerts, setAlerts] = useState<TrailAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [offlineDownloadedAt, setOfflineDownloadedAt] = useState<string | null>(null);
  const [offlineOutdated, setOfflineOutdated] = useState(false);
  const [offlineAlertsSnapshot, setOfflineAlertsSnapshot] = useState<TrailAlert[]>([]);
  const [savingOffline, setSavingOffline] = useState(false);
  const [sharingRoute, setSharingRoute] = useState(false);
  const [exportingRoute, setExportingRoute] = useState(false);

  useEffect(() => {
    if (!routeData?.id) {
      setLoadingAlerts(false);
      return;
    }

    const unsubscribe = subscribeRouteAlerts(
      routeData.id,
      (incoming) => {
        setAlerts(incoming);
        setLoadingAlerts(false);
      },
      (message) => {
        setError(message);
        setLoadingAlerts(false);
      }
    );

    return () => unsubscribe();
  }, [routeData]);

  useEffect(() => {
    let mounted = true;
    const syncOfflineState = async () => {
      if (!routeData?.id) {
        if (mounted) setOfflineDownloadedAt(null);
        return;
      }
      try {
        const offlineEntry = await getOfflineRoute(routeData.id);
        if (!mounted) return;
        setOfflineDownloadedAt(offlineEntry?.downloadedAt || null);
        setOfflineOutdated(isOfflineRouteOutdated(routeData, offlineEntry));
        setOfflineAlertsSnapshot(Array.isArray(offlineEntry?.alertsSnapshot) ? offlineEntry.alertsSnapshot : []);
      } catch {
        if (mounted) {
          setOfflineDownloadedAt(null);
          setOfflineOutdated(false);
          setOfflineAlertsSnapshot([]);
        }
      }
    };

    syncOfflineState();
    return () => {
      mounted = false;
    };
  }, [routeData]);

  const activeAlerts = useMemo(
    () => alerts.filter((item) => item.status === "ativo"),
    [alerts]
  );
  const safeRoutePath = useMemo(() => toCoordinateArray(routeData?.rotaCompleta), [routeData?.rotaCompleta]);
  const safeStartPoint = useMemo(() => toCoordinate(routeData?.startPoint), [routeData?.startPoint]);
  const safeAlertMarkers = useMemo(
    () =>
      alerts
        .map((alert) => ({
          alert,
          coordinate: toCoordinate({ latitude: alert.latitude, longitude: alert.longitude }),
        }))
        .filter(
          (
            item
          ): item is { alert: TrailAlert; coordinate: { latitude: number; longitude: number } } =>
            Boolean(item.coordinate)
        ),
    [alerts]
  );
  const currentUid = auth.currentUser?.uid || "";
  const canDeleteRoute =
    Boolean(routeData?.id) &&
    Boolean(currentUid) &&
    routeData?.userId === currentUid &&
    routeData?.visibility !== "public";

  const handleToggleOfflineRoute = async () => {
    if (!routeData?.id || savingOffline) return;

    try {
      setSavingOffline(true);
      if (offlineDownloadedAt && !offlineOutdated) {
        await removeOfflineRoute(routeData.id);
        setOfflineDownloadedAt(null);
        setOfflineOutdated(false);
        setOfflineAlertsSnapshot([]);
        Alert.alert("Offline removido", "A rota foi removida do armazenamento offline.");
        return;
      }

      const saved = await saveOfflineRoute(routeData, activeAlerts);
      setOfflineDownloadedAt(saved.downloadedAt);
      setOfflineOutdated(false);
      setOfflineAlertsSnapshot(saved.alertsSnapshot || []);
      Alert.alert(
        offlineOutdated ? "Offline atualizado" : "Rota baixada",
        "Rota salva para uso offline. Sem internet, o traçado e os dados da rota continuam disponíveis."
      );
    } catch (saveError: any) {
      Alert.alert("Erro", saveError?.message || "Não foi possível salvar a rota offline.");
    } finally {
      setSavingOffline(false);
    }
  };

  const handleShareRoute = async () => {
    if (sharingRoute) return;
    try {
      setSharingRoute(true);
      const message =
        `${routeData.titulo}\n` +
        `${routeData.descricao || "Rota Track-Traill"}\n` +
        `Tipo: ${routeData.tipo || "N/D"} | Distância: ${routeData.distancia || "N/D"} | Dificuldade: ${routeData.dificuldade || "N/D"}`;
      await Share.share({ title: routeData.titulo, message });
    } catch (shareError: any) {
      Alert.alert("Erro", shareError?.message || "Não foi possível compartilhar a rota.");
    } finally {
      setSharingRoute(false);
    }
  };

  const handleExportRouteGpx = async () => {
    if (exportingRoute) return;

    const basePoints = safeRoutePath;
    if (!basePoints.length && !safeStartPoint) {
      Alert.alert("Exportação indisponível", "Esta rota não possui pontos válidos para exportar.");
      return;
    }

    const pointsForExport =
      basePoints.length >= 2
        ? basePoints
        : [
            safeStartPoint,
            routeData.endPoint ? toCoordinate(routeData.endPoint) : safeStartPoint,
          ].filter((item): item is { latitude: number; longitude: number } => Boolean(item));

    if (pointsForExport.length < 2) {
      Alert.alert("Exportação indisponível", "São necessários ao menos 2 pontos para exportar GPX.");
      return;
    }

    try {
      setExportingRoute(true);
      const now = Date.now();
      const result = await exportActivityToGpxFile({
        title: routeData.titulo || "Rota Track-Traill",
        description: routeData.descricao || "Rota exportada do app Track-Traill",
        fileName: `rota_${routeData.id}`,
        points: pointsForExport.map((point, index) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          altitude: null,
          timestamp: now + index * 1000,
        })),
      });

      Alert.alert(
        "Exportação concluída",
        result.shared ? "Arquivo GPX pronto para compartilhar." : `Arquivo salvo em cache: ${result.uri}`
      );
    } catch (exportError: any) {
      Alert.alert("Erro", exportError?.message || "Não foi possível exportar a rota em GPX.");
    } finally {
      setExportingRoute(false);
    }
  };

  const handleDeleteRoute = () => {
    if (!routeData?.id || !currentUid || !canDeleteRoute) return;

    Alert.alert("Excluir rota", "Deseja apagar esta rota do seu espaço?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingRoute(true);
            await deleteUserRoute(currentUid, routeData.id);
            Alert.alert("Rota excluída", "A rota foi removida com sucesso.");
            navigation.goBack();
          } catch (deleteError: any) {
            Alert.alert("Erro", deleteError?.message || "Não foi possível excluir a rota.");
          } finally {
            setDeletingRoute(false);
          }
        },
      },
    ]);
  };

  if (!routeData) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.centerText}>Rota não encontrada.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backFallbackBtn}>
          <Text style={styles.backFallbackText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapHeader}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_DEFAULT}
          initialRegion={getMapRegion(routeData)}
        >
          {safeRoutePath.length > 0 ? (
            <Polyline coordinates={safeRoutePath} strokeColor="#ffd700" strokeWidth={5} />
          ) : null}

          {safeStartPoint ? (
            <Marker coordinate={safeStartPoint} title="Início da rota">
              <Ionicons name="flag" size={34} color="#22c55e" />
            </Marker>
          ) : null}

          {safeAlertMarkers.map(({ alert, coordinate }) => (
            <Marker
              key={alert.id}
              coordinate={coordinate}
              onPress={() => navigation.navigate("AlertDetail", { alertData: alert })}
            >
              <AlertMarker alert={alert} />
            </Marker>
          ))}
        </MapView>

        <TouchableOpacity style={[styles.backButton, { top: insets.top + 8 }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.routeTitle}>{routeData.titulo}</Text>
        <Text style={styles.routeDescription}>{routeData.descricao}</Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distância</Text>
            <Text style={styles.metricValue}>{routeData.distancia || "N/D"}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Dificuldade</Text>
            <Text style={styles.metricValue}>{routeData.dificuldade || "N/D"}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Alertas ativos</Text>
            <Text style={[styles.metricValue, { color: activeAlerts.length > 0 ? "#ef4444" : "#10b981" }]}> 
              {activeAlerts.length}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.offlineBtn, offlineDownloadedAt ? styles.offlineBtnActive : null]}
          onPress={handleToggleOfflineRoute}
          disabled={savingOffline}
        >
          {savingOffline ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={offlineDownloadedAt ? "cloud-done-outline" : "cloud-download-outline"}
                size={16}
                color="#fff"
              />
              <Text style={styles.offlineBtnText}>
                {offlineDownloadedAt
                  ? offlineOutdated
                    ? "Atualizar versão offline"
                    : "Remover do offline"
                  : "Baixar rota offline"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.offlineHint}>
          {offlineDownloadedAt
            ? `Disponível offline desde ${new Date(offlineDownloadedAt).toLocaleString("pt-BR")}`
            : "Baixe esta rota para manter trajeto e detalhes sem internet. O mapa base pode ficar limitado offline."}
        </Text>
        {offlineDownloadedAt && offlineOutdated ? (
          <Text style={styles.offlineUpdateHint}>
            Uma versão mais recente desta rota foi detectada. Toque em Atualizar versão offline.
          </Text>
        ) : null}

        <View style={styles.routeActionRow}>
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={handleShareRoute}
            disabled={sharingRoute}
          >
            {sharingRoute ? (
              <ActivityIndicator size="small" color="#d1d5db" />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={18} color="#d1d5db" />
                <Text style={styles.secondaryActionText}>Compartilhar rota</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={handleExportRouteGpx}
            disabled={exportingRoute}
          >
            {exportingRoute ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#000" />
                <Text style={styles.primaryActionText}>Exportar GPX</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {canDeleteRoute ? (
          <TouchableOpacity
            style={styles.deleteRouteBtn}
            onPress={handleDeleteRoute}
            disabled={deletingRoute}
          >
            {deletingRoute ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.deleteRouteText}>Excluir rota</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Alertas da rota</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity
              style={styles.segmentBtn}
              onPress={() => navigation.navigate("SegmentCreate", { routeData })}
            >
              <Ionicons name="speedometer-outline" size={16} color="#dbeafe" />
              <Text style={styles.segmentText}>Criar segmento</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() =>
                navigation.navigate("AlertForm", {
                  routeId: routeData.id,
                  routeName: routeData.titulo,
                  latitude: safeStartPoint?.latitude,
                  longitude: safeStartPoint?.longitude,
                })
              }
            >
              <Ionicons name="warning-outline" size={16} color="#000" />
              <Text style={styles.registerText}>Registrar alerta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loadingAlerts ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#ffd700" />
            <Text style={styles.helperText}>Carregando alertas...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loadingAlerts && !error && alerts.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum alerta registrado para esta rota.</Text>
        ) : null}

        {!loadingAlerts && !error
          ? alerts.map((item) => (
              <AlertCard
                key={item.id}
                alert={item}
                onPress={() => navigation.navigate("AlertDetail", { alertData: item })}
              />
            ))
          : null}

        {!loadingAlerts && error && offlineAlertsSnapshot.length > 0 ? (
          <>
            <Text style={styles.offlineAlertsTitle}>Alertas offline salvos com a rota</Text>
            {offlineAlertsSnapshot.map((item) => (
              <AlertCard
                key={`offline-${item.id}`}
                alert={item}
                onPress={() => navigation.navigate("AlertDetail", { alertData: item })}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  mapHeader: {
    height: "42%",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    top: 48,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 999,
    padding: 10,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 10,
  },
  routeTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  routeDescription: {
    color: "#d1d5db",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  offlineBtn: {
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.22)",
    borderRadius: 12,
    paddingVertical: 12,
  },
  offlineBtnActive: {
    borderColor: "rgba(59,130,246,0.45)",
    backgroundColor: "rgba(30,64,175,0.4)",
  },
  offlineBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  offlineHint: {
    color: "#93c5fd",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  offlineUpdateHint: {
    color: "#facc15",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  routeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  secondaryActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryActionText: {
    color: "#d1d5db",
    fontWeight: "700",
    fontSize: 13,
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#facc15",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryActionText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 13,
  },
  offlineAlertsTitle: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
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
  sectionHeader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionActions: {
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
  },
  segmentBtn: {
    backgroundColor: "#1e3a8a",
    borderWidth: 1,
    borderColor: "#1d4ed8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  segmentText: {
    color: "#dbeafe",
    fontWeight: "700",
    fontSize: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  registerBtn: {
    backgroundColor: "#ffd700",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  registerText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
  },
  deleteRouteBtn: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "rgba(239,68,68,0.9)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.6)",
    borderRadius: 10,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteRouteText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  helperText: {
    color: "#9ca3af",
  },
  errorText: {
    color: "#f87171",
    marginTop: 10,
  },
  emptyText: {
    color: "#9ca3af",
    marginTop: 12,
    marginBottom: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#030712",
    padding: 24,
  },
  centerText: {
    color: "#fff",
    marginBottom: 12,
  },
  backFallbackBtn: {
    backgroundColor: "#ffd700",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backFallbackText: {
    color: "#000",
    fontWeight: "700",
  },
});

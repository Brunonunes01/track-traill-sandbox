import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, { FadeInDown, FadeOutDown, Layout, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import { buildSensorStats, readSensorLiveSample } from "../services/bleService";
import {
  ActivityType,
  ActiveActivitySession,
  appendForegroundPoint,
  discardActiveSession,
  finishActivityTracking,
  formatDuration,
  getActiveSession,
  getAveragePaceMinPerKm,
  getAverageSpeedKmh,
  getSessionDurationSeconds,
  getSessionRecordingStateLabel,
  pauseActivityTracking,
  resumeActivityTracking,
  startActivityTracking,
} from "../services/activityTrackingService";
import { calculateDistance3DMeters, formatPace, getPerformancePrimary } from "../utils/activityMetrics";
import { FALLBACK_REGION, getRegionWithFallback, toCoordinate, toCoordinateArray } from "../utils/geo";

type Coordinate = { latitude: number; longitude: number };

const ACTIVITY_OPTIONS: { label: string; value: ActivityType }[] = [
  { label: "Bike", value: "bike" },
  { label: "Corrida", value: "corrida" },
  { label: "Caminhada", value: "caminhada" },
  { label: "Trilha", value: "trilha" },
];
const ROUTE_START_MAX_DISTANCE_METERS = 100;

const inferActivityType = (value?: string): ActivityType => {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("bike") || normalized.includes("cicl")) return "bike";
  if (normalized.includes("corr")) return "corrida";
  if (normalized.includes("camin")) return "caminhada";
  return "trilha";
};

type AtividadesScreenProps = { navigation?: any; route?: any };

const ActivityMapView = memo(function ActivityMapView({
  safeSuggestedPath,
  trackedPath,
  mapInitialRegion,
  mapRef,
}: {
  safeSuggestedPath: Coordinate[];
  trackedPath: Coordinate[];
  mapInitialRegion: any;
  mapRef: React.RefObject<MapView | null>;
}) {
  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={mapInitialRegion}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {safeSuggestedPath.length > 1 ? (
        <Polyline coordinates={safeSuggestedPath} strokeColor="rgba(249,115,22,0.45)" strokeWidth={6} />
      ) : null}
      {trackedPath.length > 1 ? (
        <Polyline coordinates={trackedPath} strokeColor="#fb7185" strokeWidth={5} />
      ) : null}
    </MapView>
  );
});

export default function AtividadesScreen(props: AtividadesScreenProps) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const route = props.route || hookRoute;
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const rotaGuia = route.params?.rotaSugerida;

  const mapRef = useRef<MapView>(null);
  const foregroundSubscription = useRef<Location.LocationSubscription | null>(null);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activityType, setActivityType] = useState<ActivityType>(inferActivityType(rotaGuia?.tipo));
  const [session, setSession] = useState<ActiveActivitySession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Pronto para iniciar.");
  const [sensorSamples, setSensorSamples] = useState<{ timestamp: number; value: number }[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [distanceFromRouteStartMeters, setDistanceFromRouteStartMeters] = useState<number | null>(null);

  const trackedPath: Coordinate[] = useMemo(() => toCoordinateArray(session?.points || []), [session]);
  const durationSeconds = useMemo(() => getSessionDurationSeconds(session), [session]);
  const averageSpeed = useMemo(() => getAverageSpeedKmh(session), [session]);
  const averagePace = useMemo(() => getAveragePaceMinPerKm(session), [session]);
  const performancePrimary = useMemo(() => getPerformancePrimary(activityType, averageSpeed, averagePace), [activityType, averagePace, averageSpeed]);
  const recordingStateLabel = useMemo(() => getSessionRecordingStateLabel(session), [session]);
  const elevationGain = useMemo(() => Number(session?.elevation?.gainMeters || 0), [session]);
  const elevationLoss = useMemo(() => Number(session?.elevation?.lossMeters || 0), [session]);
  const altitudeMin = useMemo(() => (typeof session?.elevation?.minAltitude === "number" ? session.elevation.minAltitude : null), [session?.elevation?.minAltitude]);
  const altitudeMax = useMemo(() => (typeof session?.elevation?.maxAltitude === "number" ? session.elevation.maxAltitude : null), [session?.elevation?.maxAltitude]);
  const sensorStats = useMemo(() => buildSensorStats(sensorSamples), [sensorSamples]);
  const isRecording = session?.status === "recording";
  const isPaused = session?.status === "paused_auto" || session?.status === "paused_manual";
  const hasActiveSession = !!session && session.status !== "finished";
  const safeSuggestedPath = useMemo(() => toCoordinateArray(rotaGuia?.rotaCompleta), [rotaGuia?.rotaCompleta]);
  const routeStartPoint = useMemo(
    () => toCoordinate(rotaGuia?.startPoint) || toCoordinate(rotaGuia?.rotaCompleta?.[0]),
    [rotaGuia?.rotaCompleta, rotaGuia?.startPoint]
  );
  const mapInitialRegion = useMemo(
    () => getRegionWithFallback(toCoordinate(rotaGuia?.startPoint) || trackedPath[0] || null, FALLBACK_REGION, { latitudeDelta: 0.05, longitudeDelta: 0.05 }),
    [rotaGuia?.startPoint, trackedPath]
  );

  const focusProgress = useSharedValue(0);
  useEffect(() => {
    focusProgress.value = withTiming(focusMode ? 1 : 0, { duration: 260 });
  }, [focusMode, focusProgress]);

  const mapAnimatedStyle = useAnimatedStyle(() => ({
    height: withTiming(screenHeight * (focusProgress.value > 0.5 ? 0.18 : 0.52), { duration: 260 }),
  }));
  const metricsAnimatedStyle = useAnimatedStyle(() => ({
    height: withTiming(screenHeight * (focusProgress.value > 0.5 ? 0.82 : 0.48), { duration: 260 }),
  }));

  const dragHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 12,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -40) setFocusMode(true);
          if (gestureState.dy > 40) setFocusMode(false);
        },
      }),
    []
  );

  const stopForegroundWatch = () => {
    if (foregroundSubscription.current) {
      foregroundSubscription.current.remove();
      foregroundSubscription.current = null;
    }
  };

  const ensureLocationReady = useCallback(async (showAlerts: boolean): Promise<boolean> => {
    try {
      let servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled && Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
          servicesEnabled = await Location.hasServicesEnabledAsync();
        } catch (error: any) {
          console.warn("[activity] enableNetworkProviderAsync failed:", error?.message || String(error));
        }
      }

      if (!servicesEnabled) {
        if (showAlerts) {
          Alert.alert("GPS desativado", "Ative a localização do dispositivo para gravar atividade.", [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir ajustes", onPress: () => Linking.openSettings().catch(() => {}) },
          ]);
        }
        return false;
      }

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== "granted") {
        if (showAlerts) {
          Alert.alert("Permissão necessária", "Permita localização para iniciar e gravar atividade.", [
            { text: "Cancelar", style: "cancel" },
            ...(permission.canAskAgain === false
              ? [{ text: "Abrir ajustes", onPress: () => Linking.openSettings().catch(() => {}) }]
              : []),
          ]);
        }
        return false;
      }

      return true;
    } catch (error: any) {
      if (showAlerts) {
        Alert.alert("Erro", error?.message || "Não foi possível validar o GPS.");
      }
      return false;
    }
  }, []);

  const startForegroundWatch = useCallback(async () => {
    stopForegroundWatch();
    try {
      foregroundSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 },
        async (location) => {
          try {
            const updated = await appendForegroundPoint({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: typeof location.coords.altitude === "number" ? location.coords.altitude : null,
              timestamp: location.timestamp || Date.now(),
            });
            if (updated) {
              setSession(updated);
              mapRef.current?.animateCamera({ center: { latitude: location.coords.latitude, longitude: location.coords.longitude } });
            }
          } catch (error: any) {
            console.warn("[activity] appendForegroundPoint failed:", error?.message || String(error));
          }
        }
      );
    } catch (error: any) {
      console.warn("[activity] startForegroundWatch failed:", error?.message || String(error));
      setStatusMessage("Falha ao iniciar rastreamento em primeiro plano.");
    }
  }, []);

  const refreshDistanceFromRouteStart = useCallback(
    async (coords?: Location.LocationObjectCoords) => {
      if (!routeStartPoint || hasActiveSession) {
        setDistanceFromRouteStartMeters(null);
        return;
      }

      try {
        const currentCoords =
          coords ||
          (
            await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            })
          ).coords;

        const meters = calculateDistance3DMeters(
          currentCoords.latitude,
          currentCoords.longitude,
          typeof currentCoords.altitude === "number" ? currentCoords.altitude : null,
          routeStartPoint.latitude,
          routeStartPoint.longitude,
          typeof (rotaGuia as any)?.startPoint?.altitude === "number"
            ? (rotaGuia as any).startPoint.altitude
            : null
        );

        setDistanceFromRouteStartMeters(Number.isFinite(meters) ? meters : null);
      } catch {
        setDistanceFromRouteStartMeters(null);
      }
    },
    [hasActiveSession, routeStartPoint, rotaGuia]
  );

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const bootstrapTimeout = setTimeout(() => {
        if (loadingSession && mounted) {
          setLoadingSession(false);
          setStatusMessage("Sincronização lenta, tente novamente se os dados não aparecerem.");
        }
      }, 10000);

      try {
        const ready = await ensureLocationReady(true);
        if (!ready) {
          setStatusMessage("Permissão de localização necessária para gravar atividade.");
          setLoadingSession(false);
          clearTimeout(bootstrapTimeout);
          return;
        }

        const current = await Location.getCurrentPositionAsync({});
        if (!mounted) return;
        const startFocus = toCoordinate(rotaGuia?.startPoint) || toCoordinate(current.coords);
        if (startFocus) {
          mapRef.current?.animateCamera({ center: startFocus, zoom: 16 });
        }
        await refreshDistanceFromRouteStart(current.coords);

        const active = await getActiveSession();
        if (!mounted) return;
        if (active && active.status !== "finished") {
          setSession(active);
          setActivityType(active.activityType);
          setStatusMessage(
            active.status === "recording" ? "Atividade em andamento recuperada." : active.status === "paused_auto" ? "Atividade em pausa automática." : "Atividade pausada manualmente."
          );
          if (active.trackingMode === "foreground" && active.status === "recording") {
            await startForegroundWatch();
          }
        }
      } catch (error: any) {
        setStatusMessage("Falha ao obter GPS inicial.");
        console.error("[activity] Bootstrap failed:", error?.message || String(error));
      } finally {
        if (mounted) setLoadingSession(false);
        clearTimeout(bootstrapTimeout);
      }
    };

    bootstrap();
    syncInterval.current = setInterval(() => {
      getActiveSession()
        .then((active) => {
          if (!mounted) return;
          if (active && active.status !== "finished") setSession(active);
        })
        .catch((error: any) => {
          if (!mounted) return;
          console.warn("[activity] session sync failed:", error?.message || String(error));
        });
    }, 1500);

    return () => {
      mounted = false;
      if (syncInterval.current) clearInterval(syncInterval.current);
      stopForegroundWatch();
    };
  }, [ensureLocationReady, loadingSession, refreshDistanceFromRouteStart, rotaGuia?.startPoint, startForegroundWatch]);

  useEffect(() => {
    if (!routeStartPoint || hasActiveSession) {
      setDistanceFromRouteStartMeters(null);
      return;
    }

    let mounted = true;
    const updateDistance = async () => {
      if (!mounted) return;
      await refreshDistanceFromRouteStart();
    };

    updateDistance();
    const intervalId = setInterval(updateDistance, 8000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [hasActiveSession, refreshDistanceFromRouteStart, routeStartPoint]);

  useEffect(() => {
    if (!isRecording) return;
    const sensorInterval = setInterval(async () => {
      const sample = await readSensorLiveSample();
      if (!sample) return;
      setSensorSamples((current) => [...current.slice(-59), sample]);
    }, 2000);
    return () => clearInterval(sensorInterval);
  }, [isRecording]);

  const handleStart = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Erro", "Você precisa estar logado.");

    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const safeCurrent = toCoordinate(current.coords);
      if (!safeCurrent && trackedPath.length === 0) throw new Error("Coordenadas iniciais inválidas.");
      const startPoint = trackedPath[trackedPath.length - 1] || (safeCurrent as Coordinate);

      const routeStartPoint = toCoordinate(rotaGuia?.startPoint) || toCoordinate(rotaGuia?.rotaCompleta?.[0]);
      if (routeStartPoint) {
        const distanceFromRouteStartMeters = calculateDistance3DMeters(
          startPoint.latitude,
          startPoint.longitude,
          typeof current.coords.altitude === "number" ? current.coords.altitude : null,
          routeStartPoint.latitude,
          routeStartPoint.longitude,
          typeof (rotaGuia as any)?.startPoint?.altitude === "number"
            ? (rotaGuia as any).startPoint.altitude
            : null
        );

        if (distanceFromRouteStartMeters > ROUTE_START_MAX_DISTANCE_METERS) {
          setDistanceFromRouteStartMeters(distanceFromRouteStartMeters);
          Alert.alert(
            "Fora da zona de início",
            `Você está a ${Math.round(distanceFromRouteStartMeters)}m do ponto inicial. Limite máximo: ${ROUTE_START_MAX_DISTANCE_METERS}m.`
          );
          return;
        }
      }

      const response = await startActivityTracking({
        userId: user.uid,
        activityType,
        initialPoint: {
          latitude: startPoint.latitude,
          longitude: startPoint.longitude,
          altitude: trackedPath.length > 0 ? null : typeof current.coords.altitude === "number" ? current.coords.altitude : null,
        },
      });

      setSession(response.session);
      if (response.mode === "foreground") {
        await startForegroundWatch();
        setStatusMessage("Atividade iniciada. Rastreamento em tempo real ativo.");
      } else {
        stopForegroundWatch();
        setStatusMessage("Atividade iniciada em background.");
      }
      setDistanceFromRouteStartMeters(null);
    } catch {
      Alert.alert("Erro de localização", "Não foi possível obter sua localização atual. Tente novamente.");
    }
  };

  const handlePauseOrResume = async () => {
    if (!hasActiveSession) return;
    if (isRecording) {
      try {
        const paused = await pauseActivityTracking();
        stopForegroundWatch();
        if (paused) setSession(paused);
        setStatusMessage("Atividade pausada.");
      } catch {
        Alert.alert("Erro", "Não foi possível pausar.");
      }
      return;
    }

    try {
      const response = await resumeActivityTracking();
      if (!response) return;
      setSession(response.session);
      if (response.mode === "foreground") {
        await startForegroundWatch();
      } else {
        stopForegroundWatch();
      }
      setStatusMessage("Atividade retomada.");
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível retomar a atividade.");
    }
  };

  const handleFinishAction = async () => {
    if (!hasActiveSession) return;
    try {
      stopForegroundWatch();
      const finished = await finishActivityTracking();
      if (finished.points.length < 2 || getSessionDurationSeconds(finished) < 10) {
        Alert.alert("Atividade muito curta", "Não há dados suficientes para gerar uma rota. Deseja descartar?", [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Descartar",
            style: "destructive",
            onPress: async () => {
              try {
                await discardActiveSession();
                setSession(null);
              } catch (error: any) {
                Alert.alert("Erro", error?.message || "Não foi possível descartar a atividade.");
              }
            },
          },
        ]);
        return;
      }
      navigation.navigate("ActivitySummary", { session: finished });
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível finalizar.");
    }
  };

  const handleExit = () => {
    if (isRecording) {
      Alert.alert("Atividade em andamento", "Deseja sair e continuar gravando em background?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair", onPress: () => navigation.goBack() },
      ]);
      return;
    }
    navigation.navigate("Mapa");
  };

  const handleCenterOnCurrentLocation = async () => {
    try {
      const ready = await ensureLocationReady(true);
      if (!ready) return;
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const safeCurrent = toCoordinate(current.coords);
      if (!safeCurrent) return Alert.alert("Localização indisponível", "Coordenadas inválidas retornadas pelo GPS.");
      mapRef.current?.animateCamera({ center: safeCurrent, zoom: 17 }, { duration: 450 });
      await refreshDistanceFromRouteStart(current.coords);
    } catch {
      Alert.alert("Localização indisponível", "Não foi possível centralizar no local atual.");
    }
  };

  const startBlockedByDistance =
    !hasActiveSession &&
    Boolean(routeStartPoint) &&
    typeof distanceFromRouteStartMeters === "number" &&
    distanceFromRouteStartMeters > ROUTE_START_MAX_DISTANCE_METERS;
  const startButtonLabel = startBlockedByDistance ? "Aproxime-se para iniciar" : "Iniciar atividade";
  const startButtonIcon = startBlockedByDistance ? "lock-closed-outline" : "play";

  const tabBarHeight = useBottomTabBarHeight();

  if (loadingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Preparando atividade...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.mapSection, mapAnimatedStyle]}>
        <ActivityMapView
          safeSuggestedPath={safeSuggestedPath}
          trackedPath={trackedPath}
          mapInitialRegion={mapInitialRegion}
          mapRef={mapRef}
        />

        <View style={[styles.mapTopRow, { top: insets.top + 8 }]}>
          <Pressable style={styles.topIconButton} onPress={handleExit}>
            <Ionicons name="arrow-back" size={20} color="#f8fafc" />
          </Pressable>
          <View style={styles.statusWrap}>
            <Text style={styles.statusTitle}>{isRecording ? "Atividade em andamento" : "Painel de atividade"}</Text>
            <Text style={styles.statusDescription} numberOfLines={1}>
              {statusMessage}
            </Text>
            <Text style={styles.statusState}>{recordingStateLabel}</Text>
          </View>
        </View>

        <Pressable style={[styles.locateButton, { bottom: 14 + Math.max(insets.bottom, 0) }]} onPress={handleCenterOnCurrentLocation}>
          <Ionicons name="locate" size={22} color="#f8fafc" />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.metricsSection, metricsAnimatedStyle]}>
        <View style={styles.dragHandleWrap} {...dragHandleResponder.panHandlers}>
          <View style={styles.dragHandle} />
          <Pressable onPress={() => setFocusMode((current) => !current)}>
            <Text style={styles.dragHint}>{focusMode ? "Mostrar mapa" : "Arraste para cima para foco em métricas"}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.metricsContent, { paddingBottom: 16 }]} showsVerticalScrollIndicator={false}>
          {!hasActiveSession ? (
            <View style={styles.activityTypeRow}>
              {ACTIVITY_OPTIONS.map((option) => {
                const selected = activityType === option.value;
                return (
                  <Pressable key={option.value} style={[styles.typeChip, selected ? styles.typeChipActive : null]} onPress={() => setActivityType(option.value)}>
                    <Text style={[styles.typeChipText, selected ? styles.typeChipTextActive : null]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <View style={styles.metricCardLarge}>
              <Text style={styles.metricLabel}>Tempo</Text>
              <Text style={styles.metricValueLarge}>{formatDuration(durationSeconds)}</Text>
            </View>
            <View style={styles.metricCardLarge}>
              <Text style={styles.metricLabel}>Distância</Text>
              <Text style={styles.metricValueLarge}>{session?.distanceKm.toFixed(2) || "0.00"} km</Text>
            </View>
          </View>

          <View style={styles.metricCardSmall}>
            <Text style={styles.metricLabel}>{performancePrimary.label}</Text>
            <Text style={styles.metricValueSmall}>{performancePrimary.value}</Text>
            <Text style={styles.metricHint}>Pace médio: {formatPace(averagePace)}</Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCardLarge}>
              <Text style={styles.metricLabel}>Ganho elevação</Text>
              <Text style={styles.metricValueSmall}>{elevationGain.toFixed(0)} m</Text>
            </View>
            <View style={styles.metricCardLarge}>
              <Text style={styles.metricLabel}>Perda elevação</Text>
              <Text style={styles.metricValueSmall}>{elevationLoss.toFixed(0)} m</Text>
            </View>
          </View>

          <View style={styles.metricCardSmall}>
            <Text style={styles.metricLabel}>Altitude (mín/máx)</Text>
            <Text style={styles.metricValueSmall}>
              {altitudeMin !== null && altitudeMax !== null ? `${altitudeMin.toFixed(0)} m / ${altitudeMax.toFixed(0)} m` : "Sem sinal de altitude"}
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <Text style={styles.metricLabel}>Sensor associado</Text>
            <Text style={styles.metricValueSmall}>
              {sensorStats.samples.length > 0 ? `média ${sensorStats.average.toFixed(0)} • pico ${sensorStats.max.toFixed(0)}` : "Sem leitura ativa"}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.actionsDock, { paddingBottom: Math.max(insets.bottom + tabBarHeight + 20, 36) }]}>
          {!hasActiveSession ? (
            <Pressable
              disabled={startBlockedByDistance}
              style={({ pressed }) => [
                styles.mainActionButton,
                styles.startAction,
                startBlockedByDistance ? styles.startActionDisabled : null,
                pressed && !startBlockedByDistance ? styles.buttonPressed : null,
              ]}
              onPress={handleStart}
            >
              <Ionicons name={startButtonIcon as any} size={22} color={startBlockedByDistance ? "#e5e7eb" : "#fff"} />
              <Text style={[styles.mainActionText, startBlockedByDistance ? styles.mainActionTextDisabled : null]}>
                {startButtonLabel}
              </Text>
            </Pressable>
          ) : null}

          {hasActiveSession && isRecording ? (
            <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(120)} layout={Layout.springify()}>
              <Pressable style={({ pressed }) => [styles.mainActionButton, styles.pauseAction, pressed ? styles.buttonPressed : null]} onPress={handlePauseOrResume}>
                <Ionicons name="pause" size={20} color="#fff" />
                <Text style={styles.mainActionText}>Pausar gravação</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {hasActiveSession && isPaused ? (
            <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(140)} layout={Layout.springify()} style={styles.pausedActionsRow}>
              <Pressable style={({ pressed }) => [styles.splitActionBtn, styles.resumeAction, pressed ? styles.buttonPressed : null]} onPress={handlePauseOrResume}>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.splitActionText}>Continuar</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.splitActionBtn, styles.finishAction, pressed ? styles.buttonPressed : null]} onPress={handleFinishAction}>
                <Ionicons name="stop" size={18} color="#fff" />
                <Text style={styles.splitActionText}>Finalizar</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  loadingText: { marginTop: 10, color: "#cbd5e1", fontSize: 14 },
  mapSection: { position: "relative", overflow: "hidden" },
  map: { ...StyleSheet.absoluteFillObject },
  mapTopRow: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  topIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.5)",
    backgroundColor: "rgba(2,6,23,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusWrap: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.82)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.42)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusTitle: { color: "#f8fafc", fontSize: 13, fontWeight: "700" },
  statusDescription: { marginTop: 2, color: "#cbd5e1", fontSize: 12 },
  statusState: { marginTop: 4, color: "#7dd3fc", fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  locateButton: {
    position: "absolute",
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.42)",
    backgroundColor: "rgba(2,6,23,0.9)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },
  metricsSection: { backgroundColor: "#0f172a" },
  dragHandleWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 2, backgroundColor: "#0f172a" },
  dragHandle: { width: 42, height: 5, borderRadius: 999, backgroundColor: "#334155", marginBottom: 4 },
  dragHint: { color: "#64748b", fontSize: 11, fontWeight: "600" },
  metricsContent: { paddingHorizontal: 14, paddingTop: 14, gap: 10 },
  actionsDock: {
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  activityTypeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 12 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  typeChipActive: { borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.18)" },
  typeChipText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  typeChipTextActive: { color: "#f97316" },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCardLarge: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    backgroundColor: "#111c31",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  metricCardSmall: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    backgroundColor: "#111c31",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  metricLabel: {
    color: "#94a3b8",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    marginBottom: 6,
  },
  metricValueLarge: { color: "#f8fafc", fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricValueSmall: { color: "#f8fafc", fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  metricHint: { marginTop: 4, color: "#94a3b8", fontSize: 11, fontVariant: ["tabular-nums"] },
  mainActionButton: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  startAction: { backgroundColor: "#16a34a" },
  startActionDisabled: {
    backgroundColor: "#334155",
    borderWidth: 1,
    borderColor: "#475569",
  },
  pauseAction: { backgroundColor: "#ea580c" },
  resumeAction: { backgroundColor: "#16a34a" },
  finishAction: { backgroundColor: "#dc2626" },
  mainActionText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  mainActionTextDisabled: { color: "#e5e7eb" },
  pausedActionsRow: { flexDirection: "row", gap: 10 },
  splitActionBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  splitActionText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  buttonPressed: { opacity: 0.82 },
});

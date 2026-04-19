import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FALLBACK_REGION, getRegionWithFallback, toCoordinate } from "../utils/geo";
import { formatPace, calculatePace } from "../utils/activityMetrics";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MIN_PANEL_HEIGHT = 320;
const MAX_PANEL_HEIGHT = SCREEN_HEIGHT * 0.8;

interface MapTrackerProps {
  onFinish: (data: { coordinates: any[]; distance: number; duration: number }) => void;
  onCancel: () => void;
}

type Coordinate = { latitude: number; longitude: number };

const calcDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Componente de Cronômetro isolado para não re-renderizar o mapa
const TimerDisplay = memo(function TimerDisplay({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Date.now() - startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return <Text style={styles.timerText}>{formatElapsed(elapsed)}</Text>;
});

const TrackerMapView = memo(function TrackerMapView({
  currentLocation,
  routeCoordinates,
  mapRef,
}: {
  currentLocation: Coordinate | null;
  routeCoordinates: Coordinate[];
  mapRef: React.RefObject<MapView | null>;
}) {
  const initialRegion = useMemo(() => getRegionWithFallback(currentLocation, FALLBACK_REGION, {
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  }), [currentLocation]);

  if (!currentLocation) {
    return (
      <View style={styles.mapFallback}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.mapFallbackText}>Sincronizando satélites...</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
    >
      <Polyline coordinates={routeCoordinates} strokeColor="#f43f5e" strokeWidth={6} />
      {routeCoordinates.length > 0 && (
        <Marker coordinate={routeCoordinates[0]} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.startDot} />
        </Marker>
      )}
    </MapView>
  );
});

export default function MapTracker({ onFinish, onCancel }: MapTrackerProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 0;

  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [distance, setDistance] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const mapRef = useRef<MapView>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedTimeRef = useRef<number>(0);

  const panelY = useSharedValue(0);
  const gestureStartY = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          gestureStartY.value = panelY.value;
        })
        .onUpdate((event) => {
          panelY.value = gestureStartY.value + event.translationY;
        })
        .onEnd((event) => {
          if (event.velocityY < -500 || event.translationY < -100) {
            panelY.value = withSpring(-MAX_PANEL_HEIGHT + MIN_PANEL_HEIGHT + 40);
          } else if (event.velocityY > 500 || event.translationY > 100) {
            panelY.value = withSpring(0);
          } else {
            panelY.value = withSpring(
              panelY.value < -200 ? -MAX_PANEL_HEIGHT + MIN_PANEL_HEIGHT + 40 : 0
            );
          }
        }),
    [gestureStartY, panelY]
  );

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  const animatedOverlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(panelY.value < -100 ? 0.8 : 0, { duration: 200 }),
  }));

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 6,
          },
          (loc) => {
            if (!mounted || isPaused) return;
            const nextPoint = toCoordinate(loc.coords);
            if (!nextPoint) return;

            setRouteCoordinates((prev) => {
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const d = calcDistanceKm(last.latitude, last.longitude, nextPoint.latitude, nextPoint.longitude);
                if (d > 0.005) { 
                   setDistance(curr => curr + d);
                   return [...prev, nextPoint];
                }
                return prev;
              }
              return [nextPoint];
            });

            setCurrentLocation(nextPoint);
            mapRef.current?.animateCamera({ center: nextPoint });
          }
        );
      } catch (e) {
        console.warn("[tracker] GPS update failed", e);
      }
    })();

    return () => {
      mounted = false;
      locationSubscriptionRef.current?.remove();
    };
  }, [isPaused]);

  const handlePauseResume = () => {
    if (isPaused) {
      if (pausedAtRef.current) {
        totalPausedTimeRef.current += Date.now() - pausedAtRef.current;
      }
      setIsPaused(false);
    } else {
      pausedAtRef.current = Date.now();
      setIsPaused(true);
    }
  };

  const handleFinish = () => {
    const durationMs = Date.now() - startedAtRef.current - totalPausedTimeRef.current;
    onFinish({
      coordinates: routeCoordinates,
      distance: parseFloat(distance.toFixed(2)),
      duration: Math.floor(durationMs / 60000),
    });
  };

  const pace = useMemo(() => {
    const durationSec = (Date.now() - startedAtRef.current - totalPausedTimeRef.current) / 1000;
    return calculatePace(distance, durationSec);
  }, [distance]);

  return (
    <View style={styles.container}>
      <TrackerMapView
        currentLocation={currentLocation}
        routeCoordinates={routeCoordinates}
        mapRef={mapRef}
      />

      <Animated.View style={[StyleSheet.absoluteFill, styles.darkOverlay, animatedOverlayStyle]} pointerEvents="none" />

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.panel, animatedPanelStyle, { paddingBottom: insets.bottom + tabBarHeight + 40 }]}>
          <View style={styles.dragHandle} />
          
          <View style={styles.hudHeader}>
            <View style={styles.mainMetric}>
              <Text style={styles.metricLabel}>TEMPO</Text>
              <TimerDisplay startedAt={startedAtRef.current} />
            </View>
          </View>

          <View style={styles.secondaryMetrics}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>DISTÂNCIA (KM)</Text>
              <Text style={styles.metricValue}>{distance.toFixed(2)}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>RITMO (PACE)</Text>
              <Text style={styles.metricValue}>{formatPace(pace).split(" ")[0]}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable style={[styles.controlBtn, styles.cancelBtn]} onPress={onCancel}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>

            <Pressable 
              style={[styles.controlBtn, isPaused ? styles.resumeBtn : styles.pauseBtn]} 
              onPress={handlePauseResume}
            >
              <Ionicons name={isPaused ? "play" : "pause"} size={32} color="#fff" />
            </Pressable>

            <Pressable style={[styles.controlBtn, styles.finishBtn]} onPress={handleFinish}>
              <Ionicons name="stop" size={24} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  mapFallback: { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  mapFallbackText: { color: "#94a3b8", marginTop: 12, fontWeight: "600" },
  darkOverlay: { backgroundColor: "#000" },
  panel: {
    position: "absolute",
    bottom: -MAX_PANEL_HEIGHT + MIN_PANEL_HEIGHT,
    left: 0,
    right: 0,
    height: MAX_PANEL_HEIGHT,
    backgroundColor: "#111827",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#374151",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  hudHeader: {
    alignItems: "center",
    marginBottom: 30,
  },
  mainMetric: {
    alignItems: "center",
  },
  metricLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  timerText: {
    color: "#fff",
    fontSize: 72,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  secondaryMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  metricBox: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    color: "#fff",
    fontSize: 42,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  pauseBtn: { backgroundColor: "#f97316", width: 80, height: 80, borderRadius: 40 },
  resumeBtn: { backgroundColor: "#22c55e", width: 80, height: 80, borderRadius: 40 },
  cancelBtn: { backgroundColor: "#475569" },
  finishBtn: { backgroundColor: "#ef4444" },
  startDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#fff",
  },
});

import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged } from "firebase/auth";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { MapType, Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AlertCard from "../components/AlertCard";
import AlertMarker from "../components/AlertMarker";
import POIMarker from "../components/POIMarker";
import RouteMarker from "../components/RouteMarker";
import { TrackTrailRoute, TrailAlert } from "../models/alerts";
import { subscribeAlerts } from "../services/alertService";
import { auth } from "../../services/connectionFirebase";
import { ensureUserRole } from "../../services/adminService";
import { PointOfInterest, POI_TYPE_META } from "../models/poi";
import { deletePOI, subscribePOIs } from "../services/poiService";
import { calculateDistanceKm, subscribeOfficialRoutes, subscribeUserRoutes } from "../services/routeService";
import { FALLBACK_REGION, toCoordinate, toCoordinateArray } from "../utils/geo";

const NEARBY_RADIUS_KM = 20;
const normalizeRouteType = (value?: string) => (value || "").trim().toLowerCase();
const isOfflineFallbackMessage = (message?: string | null) => {
  const msg = String(message || "").toLowerCase();
  return msg.includes("cache offline") || msg.includes("sem conexão");
};
type RouteDistance = TrackTrailRoute & {
  distanceFromUserKm?: number;
};

export default function HomeScreen({ navigation }: any) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [routes, setRoutes] = useState<TrackTrailRoute[]>([]);
  const [userRoutes, setUserRoutes] = useState<TrackTrailRoute[]>([]);
  const [alerts, setAlerts] = useState<TrailAlert[]>([]);
  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDistance | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<TrailAlert | null>(null);
  const [selectedPOI, setSelectedPOI] = useState<PointOfInterest | null>(null);
  const [mapType, setMapType] = useState<MapType>("standard");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [sourceFilter, setSourceFilter] = useState<"all" | "mine" | "community">("all");
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [routeActionVisible, setRouteActionVisible] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingPois, setLoadingPois] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userRoutesError, setUserRoutesError] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);

  const mapRef = useRef<MapView>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const loadingRoutesRef = useRef(true);
  const loadingAlertsRef = useRef(true);

  useEffect(() => {
    loadingRoutesRef.current = loadingRoutes;
  }, [loadingRoutes]);

  useEffect(() => {
    loadingAlertsRef.current = loadingAlerts;
  }, [loadingAlerts]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
      if (!user?.uid) {
        setIsAdmin(false);
      } else {
        ensureUserRole(user.uid, user.email || "")
          .then((role) => setIsAdmin(role === "admin"))
          .catch(() => setIsAdmin(false));
      }
      setAuthResolved(true);
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!uid) {
      setUserRoutes([]);
      setUserRoutesError(null);
      return;
    }

    const unsubscribe = subscribeUserRoutes(
      uid,
      (incoming) => {
        setUserRoutes(incoming);
      },
      (message) => {
        setUserRoutesError(message);
      }
    );

    return unsubscribe;
  }, [uid]);

  const combinedRoutes = useMemo(() => {
    if (!userRoutes.length) return routes;

    // Não deduplicar por título+início: rotas diferentes podem compartilhar esses campos.
    // Deduplicamos apenas por id para evitar esconder rotas válidas no mapa.
    const mapById = new Map<string, TrackTrailRoute>();
    const merged = [...routes, ...userRoutes];

    merged.forEach((route) => {
      const routeId = String(route?.id || "").trim();
      if (!routeId) return;
      mapById.set(routeId, route);
    });

    return Array.from(mapById.values());
  }, [routes, userRoutes]);

  const categories = useMemo(() => {
    const dynamicTypes = Array.from(
      new Set(
        combinedRoutes
          .map((route) => route.tipo)
          .filter((item): item is string => Boolean(item))
      )
    );
    return ["Todos", ...dynamicTypes];
  }, [combinedRoutes]);

  const stopLocationWatcher = () => {
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();
      locationWatcherRef.current = null;
    }
  };

  const requestLocationAccess = async (showSystemAlert: boolean): Promise<boolean> => {
    try {
      console.log("[map] Validating GPS services status");
      let servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled && Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
          servicesEnabled = await Location.hasServicesEnabledAsync();
        } catch (error: any) {
          console.warn("[map] enableNetworkProviderAsync failed:", error?.message || String(error));
        }
      }

      if (!servicesEnabled) {
        console.warn("[map] Location services are disabled on device");
        setLocationError("GPS desativado. Ative a localização do dispositivo.");
        if (showSystemAlert) {
          Alert.alert(
            "GPS desativado",
            "Ative a localização do dispositivo para usar o mapa em tempo real.",
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Abrir ajustes",
                onPress: () => {
                  Linking.openSettings().catch(() => {});
                },
              },
            ]
          );
        }
        return false;
      }

      console.log("[map] Checking/requesting foreground permissions");
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== "granted") {
        console.warn("[map] Permission denied by user:", permission.status);
        setLocationError("Permissão de localização negada.");
        setHasPermission(false);
        if (showSystemAlert) {
          Alert.alert("Permissão necessária", "Permita o acesso à localização para usar o modo em tempo real.", [
            { text: "Cancelar", style: "cancel" },
            ...(permission.canAskAgain === false
              ? [
                  {
                    text: "Abrir ajustes",
                    onPress: () => {
                      Linking.openSettings().catch(() => {});
                    },
                  },
                ]
              : []),
          ]);
        }
        return false;
      }

      console.log("[map] GPS permission granted");
      setLocationError(null);
      setHasPermission(true);
      return true;
    } catch (error: any) {
      console.error("[map] requestLocationAccess crashed:", error?.message || String(error));
      setLocationError("Falha ao validar permissões de localização.");
      setHasPermission(false);
      if (showSystemAlert) {
        Alert.alert("Erro de localização", "Não foi possível validar as permissões de GPS.");
      }
      return false;
    }
  };

  const centerOnUser = async () => {
    console.log("[map] Manual center on user requested");
    const hasAccess = await requestLocationAccess(true);
    if (!hasAccess) return;

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const safePoint = toCoordinate(current.coords);
      if (!safePoint) {
        throw new Error("Coordenadas inválidas recebidas.");
      }
      
      console.log("[map] Centering at:", safePoint);
      setLocation(current);
      mapRef.current?.animateCamera({ center: safePoint, zoom: 15 });
    } catch (error: any) {
      console.error("[map] centerOnUser failed:", error?.message || String(error));
      setLocationError("Não foi possível obter sua localização atual.");
      Alert.alert("Falha de localização", "Não foi possível obter sua posição no momento.");
    }
  };

  useEffect(() => {
    if (!isFocused) {
      stopLocationWatcher();
      return;
    }

    let mounted = true;
    const syncLocation = async () => {
      try {
        const hasAccess = await requestLocationAccess(false);
        if (!hasAccess || !mounted) return;

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!mounted) return;

        setLocation(current);
        mapRef.current?.animateCamera({ center: current.coords, zoom: 14 });

        stopLocationWatcher();
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 8,
          },
          (updatedLocation) => {
            if (!mounted) return;
            setLocation(updatedLocation);
          }
        );
      } catch (error: any) {
        if (!mounted) return;
        console.warn("[map] syncLocation failed:", error?.message || String(error));
        setLocationError("Falha ao iniciar localização em tempo real.");
      }
    };

    syncLocation();

    return () => {
      mounted = false;
      stopLocationWatcher();
    };
  }, [isFocused]);

  useEffect(() => {
    if (!authResolved) return;

    if (!uid) {
      setRoutes([]);
      setAlerts([]);
      setRouteError(null);
      setAlertError(null);
      setLoadingRoutes(false);
      setLoadingAlerts(false);
      return;
    }

    console.log("[map] HomeScreen subscriptions starting");
    
    // Safety timeout to avoid infinite loading
    const safetyTimeout = setTimeout(() => {
      if (loadingRoutesRef.current || loadingAlertsRef.current) {
        console.warn("[map] Subscriptions taking too long. Releasing loading states.");
        setLoadingRoutes(false);
        setLoadingAlerts(false);
      }
    }, 10000);

    const unsubscribeRoutes = subscribeOfficialRoutes(
      (incoming) => {
        console.log(`[map] Routes updated: ${incoming.length}`);
        setRoutes(incoming);
        setRouteError(null);
        setLoadingRoutes(false);
        if (!loadingAlertsRef.current) clearTimeout(safetyTimeout);
      },
      (message) => {
        if (isOfflineFallbackMessage(message)) {
          console.warn(`[map] Routes subscription fallback: ${message}`);
        } else {
          console.error(`[map] Routes subscription error: ${message}`);
        }
        setRouteError(message);
        setLoadingRoutes(false);
      }
    );

    const unsubscribeAlerts = subscribeAlerts(
      (incoming) => {
        console.log(`[map] Alerts updated: ${incoming.length}`);
        setAlerts(incoming);
        setAlertError(null);
        setLoadingAlerts(false);
        if (!loadingRoutesRef.current) clearTimeout(safetyTimeout);
      },
      (message) => {
        if (isOfflineFallbackMessage(message)) {
          console.warn(`[map] Alerts subscription fallback: ${message}`);
        } else {
          console.error(`[map] Alerts subscription error: ${message}`);
        }
        setAlertError(message);
        setLoadingAlerts(false);
      }
    );

    return () => {
      console.log("[map] HomeScreen subscriptions cleaning up");
      clearTimeout(safetyTimeout);
      unsubscribeRoutes();
      unsubscribeAlerts();
    };
  }, [authResolved, uid]);

  useEffect(() => {
    if (!isFocused || !authResolved) return;

    if (!uid) {
      setPois([]);
      setPoiError(null);
      setLoadingPois(false);
      return;
    }

    setLoadingPois(true);

    const unsubscribe = subscribePOIs(
      (incoming) => {
        setPois(incoming);
        setPoiError(null);
        setLoadingPois(false);
      },
      (message) => {
        if (message.toLowerCase().includes("permission_denied") || message.toLowerCase().includes("permissão")) {
          console.log("[map] POIs permission delayed or denied. Using cache if available.");
        } else {
          setPoiError(message);
        }
        setLoadingPois(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isFocused, authResolved, uid]);

  const routeDistances = useMemo<RouteDistance[]>(() => {
    return combinedRoutes.map((route): RouteDistance => {
      if (!location || !route.startPoint) {
        return route;
      }

      const km = calculateDistanceKm(
        location.coords.latitude,
        location.coords.longitude,
        route.startPoint.latitude,
        route.startPoint.longitude
      );

      return {
        ...route,
        distanceFromUserKm: km,
      };
    });
  }, [combinedRoutes, location]);

  const alertsByRoute = useMemo(() => {
    return alerts.reduce<Record<string, TrailAlert[]>>((acc, item) => {
      if (!item.routeId) return acc;
      if (!acc[item.routeId]) acc[item.routeId] = [];
      acc[item.routeId].push(item);
      return acc;
    }, {});
  }, [alerts]);

  const visibleRoutes = useMemo(() => {
    return routeDistances.filter((route) => {
      // 1. Filtro de Categoria
      const normalizedRouteType = normalizeRouteType(route.tipo);
      const normalizedActiveFilter = normalizeRouteType(activeFilter);
      const categoryOk =
        activeFilter === "Todos" || normalizedRouteType.includes(normalizedActiveFilter);

      if (!categoryOk) return false;

      // 2. Filtro de Perto de Mim
      if (nearbyOnly && (route.distanceFromUserKm ?? Number.POSITIVE_INFINITY) > NEARBY_RADIUS_KM) {
        return false;
      }

      // 3. Filtro de Origem (Minhas vs Comunidade)
      if (sourceFilter === "mine") {
        if (!uid) return false;
        return route.userId === uid;
      }
      if (sourceFilter === "community") {
        if (!uid) return true;
        return route.userId !== uid;
      }

      return true;
    });
  }, [activeFilter, nearbyOnly, sourceFilter, routeDistances, uid]);

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "ativo"),
    [alerts]
  );
  const mapInitialRegion = useMemo(() => {
    // Retorna FALLBACK_REGION no mount para estabilidade no Android APK.
    // O mapa será centralizado dinamicamente via animateCamera após obter a localização.
    return FALLBACK_REGION;
  }, []);
  const safeVisibleRoutes = useMemo(
    () =>
      visibleRoutes
        .map((route) => ({
          ...route,
          safeStartPoint: toCoordinate(route.startPoint),
        }))
        .filter((route) => Boolean(route.safeStartPoint)),
    [visibleRoutes]
  );
  const safeAlerts = useMemo(
    () =>
      alerts
        .map((alert) => ({
          alert,
          coordinate: toCoordinate({
            latitude: alert.latitude,
            longitude: alert.longitude,
          }),
        }))
        .filter(
          (
            item
          ): item is {
            alert: TrailAlert;
            coordinate: { latitude: number; longitude: number };
          } => Boolean(item.coordinate)
        ),
    [alerts]
  );
  const safePOIs = useMemo(
    () =>
      pois.filter(
        (poi): poi is PointOfInterest =>
          Number.isFinite(poi?.coordenadas?.latitude) && Number.isFinite(poi?.coordenadas?.longitude)
      ),
    [pois]
  );

  const recentAlerts = useMemo(
    () => alerts.filter((alert) => Date.now() - alert.createdAtMs <= 12 * 60 * 60 * 1000),
    [alerts]
  );

  const selectedRouteId = selectedRoute?.id;
  const hasLocation = Boolean(location);
  useEffect(() => {
    if (!selectedRouteId) return;
    const updated = routeDistances.find((item) => item.id === selectedRouteId) || null;
    setSelectedRoute(updated);
  }, [routeDistances, selectedRouteId]);

  const focusNearbyRoutes = () => {
    setNearbyOnly((current) => {
      const nextValue = !current;
      if (!nextValue) {
        return nextValue;
      }

      const nearest = routeDistances
        .filter((route): route is RouteDistance => typeof route.distanceFromUserKm === "number")
        .sort((a, b) => (a.distanceFromUserKm || 0) - (b.distanceFromUserKm || 0))[0];

      if (nearest?.startPoint) {
        mapRef.current?.animateCamera({ center: nearest.startPoint, zoom: 13 });
        setSelectedRoute(nearest);
        setSelectedAlert(null);
        setSelectedPOI(null);
      }

      return nextValue;
    });
  };

  const selectedRoutePath = useMemo(
    () => toCoordinateArray(selectedRoute?.rotaCompleta),
    [selectedRoute?.rotaCompleta]
  );
  const selectedPOIMeta = selectedPOI ? POI_TYPE_META[selectedPOI.tipo] : null;

  const handleOpenDirections = async () => {
    if (!selectedRoute?.startPoint) return;
    const url = `http://maps.google.com/maps?q=${selectedRoute.startPoint.latitude},${selectedRoute.startPoint.longitude}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Mapa indisponível", "Não foi possível abrir o aplicativo de mapas.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Mapa indisponível", "Não foi possível abrir o aplicativo de mapas.");
    }
  };

  const handleStartTrail = () => {
    if (!selectedRoute) return;
    navigation.navigate("Atividades", { rotaSugerida: selectedRoute });
  };

  const handleOpenPOIDirections = async () => {
    if (!selectedPOI) return;
    const url = `http://maps.google.com/maps?q=${selectedPOI.coordenadas.latitude},${selectedPOI.coordenadas.longitude}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Mapa indisponível", "Não foi possível abrir o aplicativo de mapas.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Mapa indisponível", "Não foi possível abrir o aplicativo de mapas.");
    }
  };

  const handleDeletePOI = () => {
    if (!selectedPOI) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("Login necessário", "Entre na conta para excluir um ponto de interesse.");
      return;
    }

    Alert.alert(
      "Excluir ponto de interesse",
      "Tem certeza que deseja remover este ponto de interesse?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePOI(selectedPOI.id, currentUser);
              setSelectedPOI(null);
              Alert.alert("POI removido", "Ponto de interesse removido com sucesso.");
            } catch (error: any) {
              Alert.alert("Erro", error?.message || "Não foi possível excluir o ponto de interesse.");
            }
          },
        },
      ]
    );
  };

  const handleRegisterAlert = () => {
    navigation.navigate("AlertForm", {
      routeId: selectedRoute?.id,
      routeName: selectedRoute?.titulo,
      latitude: selectedRoute?.startPoint?.latitude ?? location?.coords.latitude,
      longitude: selectedRoute?.startPoint?.longitude ?? location?.coords.longitude,
    });
  };

  const handleRegisterPOI = () => {
    navigation.navigate("AddPOI", {
      latitude: selectedRoute?.startPoint?.latitude ?? location?.coords.latitude,
      longitude: selectedRoute?.startPoint?.longitude ?? location?.coords.longitude,
    });
  };

  const handleOpenSuggestRoute = () => {
    setRouteActionVisible(false);
    navigation.navigate("SuggestRoute");
  };

  const handleOpenTraceRoute = () => {
    setRouteActionVisible(false);
    navigation.navigate("TraceRoute");
  };

  const activeAlertsForRoute = selectedRoute ? alertsByRoute[selectedRoute.id] || [] : [];
  const selectedRouteActiveAlerts = activeAlertsForRoute.filter((item) => item.status === "ativo");
  const canDeleteSelectedPOI = Boolean(
    selectedPOI && uid && (selectedPOI.criadoPor === uid || isAdmin)
  );

  const loading = loadingRoutes || loadingAlerts || loadingPois;
  const tabSafeOffset = Math.max(insets.bottom, 12);
  const hasSelectionCard = Boolean(selectedRoute || selectedAlert || selectedPOI);
  // Aumentado para subir mais os botões flutuantes
  const floatingBottomBase = tabSafeOffset + 38; 
  const routeFabBottom = hasSelectionCard
    ? floatingBottomBase + 268
    : floatingBottomBase + 192;
  const routeActionMenuBottom = routeFabBottom + 72;
  const alertFabBottom = hasSelectionCard
    ? floatingBottomBase + 207
    : floatingBottomBase + 131;
  const poiFabBottom = hasSelectionCard
    ? floatingBottomBase + 146
    : floatingBottomBase + 70;
  const listFabBottom = hasSelectionCard
    ? floatingBottomBase + 85
    : floatingBottomBase + 9;
  const handleOpenDrawer = () => {
    const parent = navigation.getParent?.();
    if (parent?.openDrawer) {
      parent.openDrawer();
      return;
    }
    navigation.navigate("Próximas");
  };

  useEffect(() => {
    if (isFocused) {
      console.log("[map] HomeScreen focused. Ready for map rendering.");
      console.log("[map] Initial state check:", {
        hasPermission,
        routesCount: combinedRoutes.length,
        alertsCount: alerts.length,
        locationAvailable: hasLocation,
        isWeb: Platform.OS === "web",
      });
    }
  }, [isFocused, hasPermission, combinedRoutes.length, alerts.length, hasLocation]);

  return (
    <View style={styles.container}>
      {isFocused ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={mapInitialRegion}
          mapType={mapType}
          showsUserLocation={hasPermission}
          showsMyLocationButton={false}
          onMapReady={() => {
            console.log("[map] MapView native component ready.");
          }}
          onLongPress={(event) => {
            const coordinate = toCoordinate(event.nativeEvent.coordinate);
            if (!coordinate) return;
            navigation.navigate("AddPOI", coordinate);
          }}
        >
          {safePOIs.map((poi) => (
            <Marker
              key={`poi-${poi.id}`}
              coordinate={poi.coordenadas}
              onPress={() => {
                setSelectedPOI(poi);
                setSelectedRoute(null);
                setSelectedAlert(null);
              }}
            >
              <POIMarker poi={poi} selected={selectedPOI?.id === poi.id} />
            </Marker>
          ))}

          {safeVisibleRoutes.map((route) => {
            if (!route.safeStartPoint) return null;
            return (
              <Marker
                key={`route-${route.id}`}
                coordinate={route.safeStartPoint}
                onPress={() => {
                  setSelectedRoute(route);
                  setSelectedAlert(null);
                  setSelectedPOI(null);
                }}
              >
                <RouteMarker
                  type={route.tipo || "trilha"}
                  selected={selectedRoute?.id === route.id}
                  activeAlertsCount={
                    (alertsByRoute[route.id] || []).filter((item) => item.status === "ativo").length
                  }
                />
              </Marker>
            );
          })}

          {safeAlerts.map(({ alert, coordinate }) => {
            if (!coordinate) return null;
            return (
              <Marker
                key={`alert-${alert.id}`}
                coordinate={coordinate}
                onPress={() => {
                  setSelectedAlert(alert);
                  setSelectedRoute(null);
                  setSelectedPOI(null);
                }}
              >
                <AlertMarker alert={alert} selected={selectedAlert?.id === alert.id} />
              </Marker>
            );
          })}

          {selectedRoutePath && selectedRoutePath.length >= 2 ? (
            <Polyline
              coordinates={selectedRoutePath}
              strokeColor="#ffd700"
              strokeWidth={5}
            />
          ) : null}
        </MapView>
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color="#1e4db7" />
          <Text style={styles.placeholderText}>Carregando mapa...</Text>
        </View>
      )}

      <View style={[styles.topContainer, { top: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleOpenDrawer}
          >
            <Ionicons name="menu" size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Mapa Inteligente</Text>

          <TouchableOpacity style={styles.iconButton} onPress={centerOnUser}>
            <Ionicons name="locate" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.sourceFilterContainer}>
          <TouchableOpacity
            style={[styles.sourceOption, sourceFilter === "all" ? styles.sourceOptionActive : null]}
            onPress={() => setSourceFilter("all")}
          >
            <Text style={[styles.sourceOptionText, sourceFilter === "all" ? styles.sourceOptionTextActive : null]}>Todas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sourceOption, sourceFilter === "mine" ? styles.sourceOptionActive : null]}
            onPress={() => setSourceFilter("mine")}
          >
            <Text style={[styles.sourceOptionText, sourceFilter === "mine" ? styles.sourceOptionTextActive : null]}>Minhas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sourceOption, sourceFilter === "community" ? styles.sourceOptionActive : null]}
            onPress={() => setSourceFilter("community")}
          >
            <Text style={[styles.sourceOptionText, sourceFilter === "community" ? styles.sourceOptionTextActive : null]}>Comunidade</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.filterChip, activeFilter === category ? styles.filterChipActive : null]}
              onPress={() => {
                setActiveFilter(category);
                setSelectedRoute(null);
                setSelectedAlert(null);
                setSelectedPOI(null);
              }}
            >
              <Text style={[styles.filterText, activeFilter === category ? styles.filterTextActive : null]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.filterChip, nearbyOnly ? styles.filterChipNearbyActive : null]}
            onPress={focusNearbyRoutes}
          >
            <Ionicons name="navigate" size={14} color={nearbyOnly ? "#000" : "#fff"} />
            <Text style={[styles.filterText, nearbyOnly ? styles.filterTextActive : null]}>Perto de mim</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.mapTypeSwitch}>
          <TouchableOpacity
            style={[styles.mapTypeOption, mapType === "standard" ? styles.mapTypeOptionActive : null]}
            onPress={() => setMapType("standard")}
          >
            <Ionicons name="map-outline" size={14} color={mapType === "standard" ? "#000" : "#fff"} />
            <Text
              style={[
                styles.mapTypeOptionText,
                mapType === "standard" ? styles.mapTypeOptionTextActive : null,
              ]}
            >
              Mapa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapTypeOption, mapType === "satellite" ? styles.mapTypeOptionActive : null]}
            onPress={() => setMapType("satellite")}
          >
            <Ionicons name="earth-outline" size={14} color={mapType === "satellite" ? "#000" : "#fff"} />
            <Text
              style={[
                styles.mapTypeOptionText,
                mapType === "satellite" ? styles.mapTypeOptionTextActive : null,
              ]}
            >
              Satélite
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBadge}>
          <ActivityIndicator size="small" color="#000" />
          <Text style={styles.loadingText}>Atualizando rotas, alertas e POIs...</Text>
        </View>
      ) : null}

      {(routeError && !isOfflineFallbackMessage(routeError)) || 
       (userRoutesError && !isOfflineFallbackMessage(userRoutesError)) || 
       (alertError && !isOfflineFallbackMessage(alertError)) || 
       (poiError && !isOfflineFallbackMessage(poiError)) ? (
        <View style={styles.errorBadge}>
          <Ionicons name="warning-outline" size={16} color="#fef3c7" />
          <Text style={styles.errorText}>
            {(routeError && !isOfflineFallbackMessage(routeError) && routeError) || 
             (userRoutesError && !isOfflineFallbackMessage(userRoutesError) && userRoutesError) || 
             (alertError && !isOfflineFallbackMessage(alertError) && alertError) || 
             (poiError && !isOfflineFallbackMessage(poiError) && poiError)}
          </Text>
        </View>
      ) : null}

      {!routeError && !alertError && locationError ? (
        <View style={styles.errorBadge}>
          <Ionicons name="locate-outline" size={16} color="#fef3c7" />
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      ) : null}

      {routeActionVisible ? (
        <Pressable style={styles.routeActionBackdrop} onPress={() => setRouteActionVisible(false)} />
      ) : null}

      {routeActionVisible ? (
        <View
          style={[
            styles.routeActionMenu,
            { bottom: routeActionMenuBottom },
          ]}
        >
          <TouchableOpacity style={styles.routeActionItem} onPress={handleOpenSuggestRoute}>
            <Ionicons name="sparkles-outline" size={17} color="#f8fafc" />
            <Text style={styles.routeActionText}>Sugerir rota</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.routeActionItem} onPress={handleOpenTraceRoute}>
            <Ionicons name="create-outline" size={17} color="#f8fafc" />
            <Text style={styles.routeActionText}>Traçar rota</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.fabRoute,
          { bottom: routeFabBottom },
        ]}
        onPress={() => setRouteActionVisible((current) => !current)}
      >
        <Ionicons name="trail-sign" size={20} color="#000" />
        <Text style={styles.fabText}>Nova rota</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.fabPrimary,
          { bottom: alertFabBottom },
        ]}
        onPress={handleRegisterAlert}
      >
        <Ionicons name="warning" size={20} color="#000" />
        <Text style={styles.fabText}>Registrar alerta</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.fabPOI,
          { bottom: poiFabBottom },
        ]}
        onPress={handleRegisterPOI}
      >
        <Ionicons name="location" size={20} color="#000" />
        <Text style={styles.fabText}>Registrar POI</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.fabSecondary,
          { bottom: listFabBottom },
        ]}
        onPress={() => navigation.navigate("Próximas")}
      >
        <Ionicons name="list" size={20} color="#000" />
        <Text style={styles.fabText}>Ver rotas</Text>
      </TouchableOpacity>

      {selectedRoute ? (
        <View style={[styles.bottomCardWrap, { bottom: floatingBottomBase + 6 }]}>
          <LinearGradient colors={["#0b1220", "#111827"]} style={styles.bottomCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {selectedRoute.titulo}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {selectedRoute.descricao}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setSelectedRoute(null)}>
                <Ionicons name="close-circle" size={26} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View style={styles.routeMetaRow}>
              <View style={styles.routeTag}>
                <Text style={styles.routeTagText}>{selectedRoute.tipo}</Text>
              </View>
              <View style={styles.routeTagWarning}>
                <Text style={styles.routeTagText}>{selectedRoute.dificuldade || "N/D"}</Text>
              </View>
              <View style={styles.routeTagDark}>
                <Text style={styles.routeTagText}>
                  {selectedRoute.distanceFromUserKm !== undefined
                    ? `${selectedRoute.distanceFromUserKm.toFixed(1)} km`
                    : selectedRoute.distancia || "Distância N/D"}
                </Text>
              </View>
            </View>

            <View style={styles.alertSummaryRow}>
              <Text style={styles.alertSummaryLabel}>Alertas ativos:</Text>
              <Text
                style={[
                  styles.alertSummaryValue,
                  { color: selectedRouteActiveAlerts.length > 0 ? "#f87171" : "#4ade80" },
                ]}
              >
                {selectedRouteActiveAlerts.length}
              </Text>
              <Text style={styles.alertSummaryLabel}>| Recentes no mapa: {recentAlerts.length}</Text>
            </View>

            {selectedRouteActiveAlerts[0] ? (
              <AlertCard
                alert={selectedRouteActiveAlerts[0]}
                compact
                onPress={() => navigation.navigate("AlertDetail", { alertData: selectedRouteActiveAlerts[0] })}
              />
            ) : (
              <Text style={styles.noAlertText}>Esta rota não tem alertas ativos no momento.</Text>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.roundBtn} onPress={handleOpenDirections}>
                <Ionicons name="map-outline" size={21} color="#d1d5db" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={() =>
                  navigation.navigate("RouteDetail", {
                    routeData: selectedRoute,
                  })
                }
              >
                <Text style={styles.secondaryActionText}>Detalhes da rota</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryActionBtn} onPress={handleStartTrail}>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.primaryActionText}>Iniciar trilha</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      {selectedAlert ? (
        <View style={styles.alertCardWrap}>
          <View style={styles.alertCardHeader}>
            <Text style={styles.alertCardTitle}>Alerta no mapa</Text>
            <TouchableOpacity onPress={() => setSelectedAlert(null)}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <AlertCard
            alert={selectedAlert}
            onPress={() => navigation.navigate("AlertDetail", { alertData: selectedAlert })}
          />

          <TouchableOpacity
            style={styles.alertDetailBtn}
            onPress={() => navigation.navigate("AlertDetail", { alertData: selectedAlert })}
          >
            <Text style={styles.alertDetailBtnText}>Abrir detalhe do alerta</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selectedPOI && selectedPOIMeta ? (
        <View style={[styles.poiCardWrap, { bottom: floatingBottomBase + 6 }]}>
          <View style={styles.poiCardHeader}>
            <View style={[styles.poiIconDot, { backgroundColor: selectedPOIMeta.color }]}>
              <Ionicons name={selectedPOIMeta.icon as any} size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.poiCardTitle} numberOfLines={1}>
                {selectedPOI.titulo}
              </Text>
              <Text style={styles.poiCardType}>{selectedPOIMeta.label}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedPOI(null)}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <Text style={styles.poiCardDescription} numberOfLines={3}>
            {selectedPOI.descricao || "Sem descrição."}
          </Text>

          <View style={styles.poiMetaRow}>
            <Ionicons name="person-outline" size={14} color="#93c5fd" />
            <Text style={styles.poiMetaText}>Criado por: {selectedPOI.criadoPorDisplay}</Text>
          </View>
          <View style={styles.poiMetaRow}>
            <Ionicons name="calendar-outline" size={14} color="#a7f3d0" />
            <Text style={styles.poiMetaText}>
              Registrado em: {new Date(selectedPOI.dataCriacao).toLocaleDateString("pt-BR")}
            </Text>
          </View>

          <TouchableOpacity style={styles.poiActionBtn} onPress={handleOpenPOIDirections}>
            <Ionicons name="navigate-outline" size={17} color="#020617" />
            <Text style={styles.poiActionBtnText}>Abrir no mapa</Text>
          </TouchableOpacity>

          {canDeleteSelectedPOI ? (
            <TouchableOpacity style={styles.poiDeleteBtn} onPress={handleDeletePOI}>
              <Ionicons name="trash-outline" size={16} color="#fee2e2" />
              <Text style={styles.poiDeleteBtnText}>Excluir POI</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!loading && visibleRoutes.length === 0 ? (
        <View style={styles.emptyStateBox}>
          <Text style={styles.emptyStateText}>
            Nenhuma rota encontrada para este filtro. Tente desativar o modo Perto de mim.
          </Text>
        </View>
      ) : null}

      {!loading && activeAlerts.length === 0 ? (
        <View style={styles.emptyAlertBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#86efac" />
          <Text style={styles.emptyAlertText}>Sem alertas ativos no momento.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  map: { ...StyleSheet.absoluteFillObject },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  placeholderText: {
    marginTop: 12,
    color: "#94a3b8",
    fontSize: 14,
  },

  topContainer: { position: "absolute", top: 40, width: "100%" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 5,
  },
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 10,
    borderRadius: 50,
  },

  sourceFilterContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.72)",
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: "#374151",
  },
  sourceOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 9,
  },
  sourceOptionActive: {
    backgroundColor: "#1e4db7",
  },
  sourceOptionText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  sourceOptionTextActive: {
    color: "#fff",
  },

  filterScroll: { paddingHorizontal: 20, gap: 10, alignItems: "center" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#555",
  },
  filterChipActive: { backgroundColor: "#1e4db7", borderColor: "#1e4db7" },
  filterChipNearbyActive: { backgroundColor: "#ffd700", borderColor: "#ffd700" },
  filterText: { color: "#fff", fontWeight: "bold" },
  filterTextActive: { color: "#000" },
  mapTypeSwitch: {
    marginTop: 10,
    marginHorizontal: 20,
    padding: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 14,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#374151",
    alignSelf: "flex-start",
  },
  mapTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mapTypeOptionActive: {
    backgroundColor: "#ffd700",
  },
  mapTypeOptionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  mapTypeOptionTextActive: {
    color: "#000",
  },

  loadingBadge: {
    position: "absolute",
    top: 168,
    alignSelf: "center",
    backgroundColor: "#ffd700",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 5,
    gap: 8,
  },
  loadingText: { color: "#000", fontWeight: "700" },

  errorBadge: {
    position: "absolute",
    top: 206,
    alignSelf: "center",
    backgroundColor: "rgba(127, 29, 29, 0.95)",
    borderWidth: 1,
    borderColor: "#991b1b",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "90%",
  },
  errorText: { color: "#fee2e2", flexShrink: 1 },

  fabPrimary: {
    position: "absolute",
    right: 20,
    backgroundColor: "#ffd700",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 28,
    elevation: 8,
    gap: 6,
  },
  fabRoute: {
    position: "absolute",
    right: 20,
    backgroundColor: "#facc15",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 28,
    elevation: 8,
    gap: 6,
  },
  fabSecondary: {
    position: "absolute",
    right: 20,
    backgroundColor: "#facc15",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 28,
    elevation: 8,
    gap: 6,
  },
  fabPOI: {
    position: "absolute",
    right: 20,
    backgroundColor: "#86efac",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 28,
    elevation: 8,
    gap: 6,
  },
  fabText: { color: "#000", fontWeight: "800", fontSize: 12 },
  routeActionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.14)",
  },
  routeActionMenu: {
    position: "absolute",
    right: 20,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 8,
    gap: 6,
    minWidth: 176,
    elevation: 12,
  },
  routeActionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  routeActionText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 13,
  },

  bottomCardWrap: {
    position: "absolute",
    bottom: 20,
    left: 14,
    right: 14,
    borderRadius: 18,
    overflow: "hidden",
    elevation: 10,
  },
  bottomCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  cardTitle: { color: "#fff", fontSize: 19, fontWeight: "800" },
  cardSubtitle: { color: "#9ca3af", fontSize: 13, marginTop: 2 },

  routeMetaRow: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  routeTag: {
    backgroundColor: "#1e40af",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  routeTagWarning: {
    backgroundColor: "#ca8a04",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  routeTagDark: {
    backgroundColor: "#374151",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  routeTagText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  alertSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
    gap: 4,
  },
  alertSummaryLabel: { color: "#d1d5db", fontSize: 12 },
  alertSummaryValue: { fontSize: 12, fontWeight: "800" },
  noAlertText: { color: "#9ca3af", marginBottom: 10 },

  actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: "#374151",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryActionText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: "#ffd700",
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryActionText: { color: "#000", fontWeight: "800", fontSize: 12 },

  alertCardWrap: {
    position: "absolute",
    bottom: 20,
    left: 14,
    right: 14,
    backgroundColor: "#030712",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    elevation: 10,
  },
  alertCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  alertCardTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  alertDetailBtn: {
    backgroundColor: "#1f2937",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  alertDetailBtnText: { color: "#fff", fontWeight: "700" },

  poiCardWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    elevation: 10,
  },
  poiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  poiIconDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  poiCardTitle: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 15,
  },
  poiCardType: {
    color: "#93c5fd",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 1,
  },
  poiCardDescription: {
    color: "#cbd5e1",
    lineHeight: 19,
    marginBottom: 10,
  },
  poiMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  poiMetaText: {
    color: "#94a3b8",
    fontSize: 12,
    flexShrink: 1,
  },
  poiActionBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#67e8f9",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 11,
  },
  poiActionBtnText: {
    color: "#020617",
    fontWeight: "800",
    fontSize: 13,
  },
  poiDeleteBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
  },
  poiDeleteBtnText: {
    color: "#fee2e2",
    fontWeight: "800",
    fontSize: 13,
  },

  emptyStateBox: {
    position: "absolute",
    bottom: 20,
    left: 18,
    right: 18,
    backgroundColor: "rgba(17,24,39,0.95)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  emptyStateText: { color: "#d1d5db", textAlign: "center" },

  emptyAlertBadge: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "rgba(6, 78, 59, 0.9)",
    borderColor: "#065f46",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyAlertText: { color: "#d1fae5", fontSize: 12, fontWeight: "600" },
});

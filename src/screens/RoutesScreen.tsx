import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { onAuthStateChanged } from "firebase/auth";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import {
  ActionButton,
  EmptyState,
  LoadingState,
  RouteCard,
  SectionTitle,
} from "../components/ui";
import { TrackTrailRoute, TrailAlert } from "../models/alerts";
import { subscribeAlerts } from "../services/alertService";
import {
  calculateDistanceKm,
  deleteUserRoute,
  subscribeOfficialRoutes,
  subscribeUserRoutes,
} from "../services/routeService";
import { colors, layout, spacing } from "../theme/designSystem";

type RouteWithDistance = TrackTrailRoute & { distanceFromUserKm?: number };

type DistanceFilter = "Todas" | 5 | 20 | 50;
type RoutesView = "proximas" | "minhas";
const TEST_ROUTE_TYPE = "teste";

const normalizeRouteType = (value?: string) => (value || "").trim().toLowerCase();
const isTestRouteType = (value?: string) => normalizeRouteType(value) === TEST_ROUTE_TYPE;

export default function RoutesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [routes, setRoutes] = useState<TrackTrailRoute[]>([]);
  const [userRoutes, setUserRoutes] = useState<TrackTrailRoute[]>([]);
  const [alerts, setAlerts] = useState<TrailAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRoutesError, setUserRoutesError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [uid, setUid] = useState("");
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);
  const [routesView, setRoutesView] = useState<RoutesView>("proximas");
  const [selectedType, setSelectedType] = useState("Todos");
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>(20);

  const handleDeleteOwnRoute = (route: TrackTrailRoute) => {
    if (!uid || route.userId !== uid) return;

    Alert.alert("Excluir rota", "Deseja apagar esta rota do seu espaço?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingRouteId(route.id);
            await deleteUserRoute(uid, route.id);
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível excluir a rota.");
          } finally {
            setDeletingRouteId(null);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    let settled = false;
    const loadingGuard = setTimeout(() => {
      if (settled) return;
      setLoading(false);
      setError((prev) => prev || "Não foi possível atualizar as rotas agora. Exibindo dados disponíveis.");
    }, 9000);

    const unsubscribeRoutes = subscribeOfficialRoutes(
      (items) => {
        settled = true;
        clearTimeout(loadingGuard);
        setRoutes(items);
        setLoading(false);
      },
      (message) => {
        settled = true;
        clearTimeout(loadingGuard);
        setError(message);
        setLoading(false);
      }
    );

    const unsubscribeAlerts = subscribeAlerts((items) => {
      settled = true;
      clearTimeout(loadingGuard);
      setAlerts(items);
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingGuard);
      unsubscribeRoutes();
      unsubscribeAlerts();
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setUserRoutes([]);
      setUserRoutesError(null);
      return;
    }

    const unsubscribe = subscribeUserRoutes(
      uid,
      (items) => {
        setUserRoutes(items);
      },
      (message) => {
        setUserRoutesError(message);
      }
    );

    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    const loadLocation = async () => {
      try {
        let servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled && Platform.OS === "android") {
          try {
            await Location.enableNetworkProviderAsync();
            servicesEnabled = await Location.hasServicesEnabledAsync();
          } catch (error: any) {
            console.warn("[routes] enableNetworkProviderAsync failed:", error?.message || String(error));
          }
        }

        if (!servicesEnabled) {
          setLocationError("Ative o GPS para priorizar rotas próximas.");
          Alert.alert("GPS desativado", "Ative a localização para priorizar rotas próximas.", [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Abrir ajustes",
              onPress: () => {
                Linking.openSettings().catch(() => {});
              },
            },
          ]);
          return;
        }

        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          permission = await Location.requestForegroundPermissionsAsync();
        }

        if (permission.status !== "granted") {
          setLocationError("Permissão de localização negada. Mostrando catálogo geral.");
          Alert.alert("Permissão necessária", "Permita o acesso à localização para priorizar rotas próximas.", [
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
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setUserLocation(current);
        setLocationError(null);
      } catch {
        setLocationError("Não foi possível obter sua localização agora.");
      }
    };

    loadLocation();
  }, []);

  const activeAlertsByRoute = useMemo(() => {
    return alerts.reduce<Record<string, number>>((acc, item) => {
      if (!item.routeId || item.status !== "ativo") return acc;
      acc[item.routeId] = (acc[item.routeId] || 0) + 1;
      return acc;
    }, {});
  }, [alerts]);

  const officialRoutesWithDistance = useMemo<RouteWithDistance[]>(() => {
    if (!userLocation) {
      return [...routes].sort((a, b) => a.titulo.localeCompare(b.titulo));
    }

    const routesWithLocation = routes.map<RouteWithDistance>((route) => {
      if (!route.startPoint) return { ...route };

      const distanceFromUserKm = calculateDistanceKm(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        route.startPoint.latitude,
        route.startPoint.longitude
      );

      return { ...route, distanceFromUserKm };
    });

    return routesWithLocation.sort((a, b) => {
      const distanceA = a.distanceFromUserKm ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distanceFromUserKm ?? Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });
  }, [routes, userLocation]);

  const myRoutesWithDistance = useMemo<RouteWithDistance[]>(() => {
    if (!userLocation) {
      return [...userRoutes].sort((a, b) => a.titulo.localeCompare(b.titulo));
    }

    const routesWithLocation = userRoutes.map<RouteWithDistance>((route) => {
      if (!route.startPoint) return { ...route };

      const distanceFromUserKm = calculateDistanceKm(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        route.startPoint.latitude,
        route.startPoint.longitude
      );

      return { ...route, distanceFromUserKm };
    });

    return routesWithLocation.sort((a, b) => {
      const distanceA = a.distanceFromUserKm ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distanceFromUserKm ?? Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });
  }, [userRoutes, userLocation]);
  const baseRoutes = routesView === "minhas" ? myRoutesWithDistance : officialRoutesWithDistance;

  const routeTypes = useMemo(() => {
    const types = Array.from(
      new Set(
        baseRoutes
          .map((route) => route.tipo)
          .filter((value): value is string => Boolean(value && !isTestRouteType(value)))
      )
    );
    return ["Todos", ...types];
  }, [baseRoutes]);

  const filteredRoutes = useMemo(() => {
    return baseRoutes.filter((route) => {
      if (isTestRouteType(route.tipo)) return false;

      const normalizedSelectedType = normalizeRouteType(selectedType);
      const normalizedRouteType = normalizeRouteType(route.tipo);
      const matchesType =
        selectedType === "Todos" || normalizedRouteType.includes(normalizedSelectedType);

      if (!matchesType) return false;
      if (routesView === "minhas") return true;
      if (distanceFilter === "Todas") return true;

      return (route.distanceFromUserKm ?? Number.POSITIVE_INFINITY) <= distanceFilter;
    });
  }, [baseRoutes, distanceFilter, routesView, selectedType]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <LoadingState label="Carregando rotas próximas..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SectionTitle
          title={routesView === "minhas" ? "Minhas rotas" : "Próximas a você"}
          subtitle={
            routesView === "minhas"
              ? "Rotas criadas e salvas por você"
              : userLocation
                ? "Rotas oficiais ordenadas por distância"
                : "Sem localização: exibindo catálogo oficial"
          }
        />

        {locationError ? (
          <View style={styles.warningRow}>
            <Ionicons name="locate-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>{locationError}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>{error}</Text>
          </View>
        ) : null}

        {routesView === "minhas" && userRoutesError ? (
          <View style={styles.warningRow}>
            <Ionicons name="folder-open-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>{userRoutesError}</Text>
          </View>
        ) : null}

        <View style={styles.viewSwitchRow}>
          <TouchableOpacity
            onPress={() => setRoutesView("proximas")}
            style={[styles.viewSwitchChip, routesView === "proximas" ? styles.viewSwitchChipActive : null]}
          >
            <Text
              style={[
                styles.viewSwitchText,
                routesView === "proximas" ? styles.viewSwitchTextActive : null,
              ]}
            >
              Próximas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRoutesView("minhas")}
            style={[styles.viewSwitchChip, routesView === "minhas" ? styles.viewSwitchChipActive : null]}
          >
            <Text
              style={[
                styles.viewSwitchText,
                routesView === "minhas" ? styles.viewSwitchTextActive : null,
              ]}
            >
              Minhas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("OfflineRoutes")}
            style={styles.offlineRoutesChip}
          >
            <Ionicons name="cloud-download-outline" size={14} color="#bfdbfe" />
            <Text style={styles.offlineRoutesText}>Offline</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {routeTypes.map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setSelectedType(type)}
              style={[styles.filterChip, selectedType === type ? styles.filterChipActive : null]}
            >
              <Text style={[styles.filterText, selectedType === type ? styles.filterTextActive : null]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {routesView === "proximas" ? (
          <View style={styles.distanceRow}>
            {([5, 20, 50, "Todas"] as DistanceFilter[]).map((item) => (
              <TouchableOpacity
                key={String(item)}
                onPress={() => setDistanceFilter(item)}
                style={[styles.distanceChip, distanceFilter === item ? styles.distanceChipActive : null]}
              >
                <Text style={[styles.distanceText, distanceFilter === item ? styles.distanceTextActive : null]}>
                  {item === "Todas" ? "Todas" : `Até ${item} km`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <FlatList
        data={filteredRoutes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        ListEmptyComponent={
          <EmptyState
            title={
              routesView === "minhas"
                ? "Você ainda não tem rotas salvas"
                : "Sem rotas para o filtro atual"
            }
            description={
              routesView === "minhas"
                ? "Crie uma rota em 'Sugerir rota' ou finalize uma atividade e salve como rota."
                : "Ajuste o tipo ou o raio de distância para encontrar trilhas próximas."
            }
            icon="trail-sign-outline"
          />
        }
        renderItem={({ item }) => {
          const visibilityLabel =
            item.visibility === "private"
              ? "Só para mim"
              : item.visibility === "friends"
                ? "Com amigos"
                : "Pública";
          const shouldShowVisibility = routesView === "minhas" && uid && item.userId === uid;
          const routeDescription = shouldShowVisibility
            ? `${item.descricao || "Sem descrição disponível."} • ${visibilityLabel}`
            : item.descricao;

          return (
            <View style={styles.routeItemWrap}>
              <RouteCard
                route={{
                  ...item,
                  descricao: routeDescription,
                  distancia:
                    item.distanceFromUserKm !== undefined
                      ? `${item.distanceFromUserKm.toFixed(1)} km de você`
                      : item.distancia,
                }}
                activeAlerts={activeAlertsByRoute[item.id] || 0}
                onPress={() => navigation.navigate("RouteDetail", { routeData: item })}
                footerAction={
                  routesView === "minhas" && uid && item.userId === uid && item.visibility !== "public" ? (
                    <TouchableOpacity
                      style={styles.deleteOwnRouteBtn}
                      onPress={() => handleDeleteOwnRoute(item)}
                      disabled={deletingRouteId === item.id}
                    >
                      {deletingRouteId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="trash-outline" size={14} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ) : null
                }
              />
            </View>
          );
        }}
      />

      <ActionButton
        label="Abrir mapa"
        icon="map-outline"
        style={[styles.mapButton, { bottom: tabBarHeight + spacing.sm }]}
        onPress={() => navigation.navigate("Mapa")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingTop: spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.sm,
  },
  warningRow: {
    marginBottom: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.4)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    flex: 1,
  },
  filtersRow: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  viewSwitchRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  offlineRoutesChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.45)",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(30,64,175,0.22)",
  },
  offlineRoutesText: {
    color: "#bfdbfe",
    fontWeight: "700",
    fontSize: 12,
  },
  viewSwitchChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  viewSwitchChipActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(252, 76, 2, 0.15)",
  },
  viewSwitchText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  viewSwitchTextActive: {
    color: colors.primary,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChipActive: {
    borderColor: colors.info,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
  },
  filterText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 12,
  },
  filterTextActive: {
    color: colors.info,
  },
  distanceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  distanceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  distanceChipActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(252, 76, 2, 0.15)",
  },
  distanceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  distanceTextActive: {
    color: colors.primary,
  },
  mapButton: {
    position: "absolute",
    right: spacing.md,
  },
  routeItemWrap: {
    position: "relative",
    marginBottom: spacing.xs,
  },
  deleteOwnRouteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.9)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.6)",
  },
});

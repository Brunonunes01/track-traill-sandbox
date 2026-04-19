import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import { TrackTrailRoute, TrailAlert } from "../models/alerts";
import { RouteCard } from "../components/ui";
import {
  calculateDistanceKm,
  subscribeOfficialRoutes,
  subscribeUserRoutes,
} from "../services/routeService";
import { subscribeAlerts } from "../services/alertService";
import { colors, layout, spacing } from "../theme/designSystem";

type DifficultyFilter = "Todas" | "Fácil" | "Média" | "Difícil";
type DistanceFilter = 5 | 10 | 20 | 40;

type SuggestedRoute = TrackTrailRoute & {
  distanceKm?: number;
  score: number;
  safetyScore: number;
  activeAlertsNearby: number;
  regionalMatch: "local" | "br" | "global" | "unknown";
  source: "oficial" | "minha";
};

const ACTIVITY_OPTIONS = ["Todos", "Caminhada", "Corrida", "Ciclismo", "Trilha"];
const DIFFICULTY_OPTIONS: DifficultyFilter[] = ["Todas", "Fácil", "Média", "Difícil"];
const DISTANCE_OPTIONS: DistanceFilter[] = [5, 10, 20, 40];

const normalizeValue = (value?: string) => (value || "").trim().toLowerCase();

const normalizeRegionToken = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const buildRegionKey = (city?: string, state?: string, country?: string) =>
  `${normalizeRegionToken(city)}|${normalizeRegionToken(state)}|${normalizeRegionToken(country)}`;

const isBrazil = (country?: string) => {
  const normalized = normalizeRegionToken(country);
  return normalized === "brasil" || normalized === "brazil" || normalized === "br";
};

const getRoutePoints = (route: TrackTrailRoute): { latitude: number; longitude: number }[] => {
  const sampledPath = (route.rotaCompleta || []).filter((_, index) => index % 5 === 0);
  const points = [...sampledPath];
  if (route.startPoint) points.unshift(route.startPoint);
  if (route.endPoint) points.push(route.endPoint);
  return points;
};

const evaluateRouteSafety = (route: TrackTrailRoute, activeAlerts: TrailAlert[]) => {
  const routePoints = getRoutePoints(route);
  if (routePoints.length === 0 || activeAlerts.length === 0) {
    return { safetyScore: 100, activeAlertsNearby: 0 };
  }

  let hazard = 0;
  let nearby = 0;

  activeAlerts.forEach((alert) => {
    let nearestDistanceKm = Number.POSITIVE_INFINITY;
    routePoints.forEach((point) => {
      const dist = calculateDistanceKm(
        point.latitude,
        point.longitude,
        alert.latitude,
        alert.longitude
      );
      if (dist < nearestDistanceKm) nearestDistanceKm = dist;
    });

    let distanceWeight = 0;
    if (nearestDistanceKm <= 0.15) distanceWeight = 1;
    else if (nearestDistanceKm <= 0.35) distanceWeight = 0.72;
    else if (nearestDistanceKm <= 0.6) distanceWeight = 0.46;

    if (distanceWeight > 0) {
      nearby += 1;
      const normalizedRisk = Math.max(0, Math.min(100, Number(alert.riskScore || 0))) / 100;
      hazard += normalizedRisk * distanceWeight * 28;
    }
  });

  const safetyScore = Math.round(Math.max(5, Math.min(100, 100 - hazard)));
  return { safetyScore, activeAlertsNearby: nearby };
};

export default function RouteSuggestionScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const [officialRoutes, setOfficialRoutes] = useState<TrackTrailRoute[]>([]);
  const [userRoutes, setUserRoutes] = useState<TrackTrailRoute[]>([]);
  const [selectedType, setSelectedType] = useState("Todos");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter>("Todas");
  const [selectedDistance, setSelectedDistance] = useState<DistanceFilter>(20);
  const [prioritizeLocalRegion, setPrioritizeLocalRegion] = useState(true);
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [userRegion, setUserRegion] = useState<{
    city?: string;
    state?: string;
    country?: string;
    key: string;
  } | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<TrailAlert[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    const loadingGuard = setTimeout(() => {
      if (settled) return;
      setLoading(false);
      setDataNotice((prev) => prev || "Não foi possível atualizar as rotas agora. Exibindo dados disponíveis.");
    }, 9000);

    const unsubscribeOfficialRoutes = subscribeOfficialRoutes(
      (routes) => {
        settled = true;
        clearTimeout(loadingGuard);
        setOfficialRoutes(routes);
        setLoading(false);
      },
      (message) => {
        settled = true;
        clearTimeout(loadingGuard);
        setLoading(false);
        setDataNotice(message || null);
      }
    );

    let unsubscribeUserRoutes = () => {};
    if (user?.uid) {
      unsubscribeUserRoutes = subscribeUserRoutes(
        user.uid,
        (routes) => setUserRoutes(routes),
        (message) => {
          setUserRoutes([]);
          if (message) setDataNotice(message);
        }
      );
    }

    return () => {
      clearTimeout(loadingGuard);
      unsubscribeOfficialRoutes();
      unsubscribeUserRoutes();
    };
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribeAlerts = subscribeAlerts(
      (alerts) => setActiveAlerts(alerts.filter((item) => item.status === "ativo")),
      (message) => {
        setActiveAlerts([]);
        if (message) setDataNotice(message);
      }
    );

    return () => unsubscribeAlerts();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setLocationError("Sem permissão de localização. Mostrando recomendações gerais.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) return;
        setUserLocation(current);
        setLocationError(null);
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        if (!mounted) return;
        const info = geocoded?.[0];
        const city = info?.city || info?.subregion || undefined;
        const state = info?.region || info?.district || undefined;
        const country = info?.country || "Brasil";
        setUserRegion({
          city,
          state,
          country,
          key: buildRegionKey(city, state, country),
        });
      } catch {
        if (mounted) {
          setLocationError("Não foi possível obter sua localização agora.");
        }
      }
    };

    loadLocation();

    return () => {
      mounted = false;
    };
  }, []);

  const suggestedRoutes = useMemo(() => {
    const allRoutes: SuggestedRoute[] = [
      ...officialRoutes.map((route) => ({ ...route, source: "oficial" as const })),
      ...userRoutes.map((route) => ({ ...route, source: "minha" as const })),
    ].map((route) => {
      let distanceKm: number | undefined;
      if (userLocation && route.startPoint) {
        distanceKm = calculateDistanceKm(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          route.startPoint.latitude,
          route.startPoint.longitude
        );
      }

      const routeType = normalizeValue(route.tipo);
      const routeDifficulty = normalizeValue(route.dificuldade);
      const requestedType = normalizeValue(selectedType);
      const requestedDifficulty = normalizeValue(selectedDifficulty);

      const typeScore =
        selectedType === "Todos"
          ? 1
          : routeType.includes(requestedType)
            ? 1.4
            : 0.5;

      const difficultyScore =
        selectedDifficulty === "Todas"
          ? 1
          : routeDifficulty.includes(requestedDifficulty)
            ? 1.2
            : 0.6;

      const distanceScore =
        typeof distanceKm === "number"
          ? Math.max(0.1, 1.8 - Math.min(distanceKm, 60) / 35)
          : 0.8;
      const { safetyScore, activeAlertsNearby } = evaluateRouteSafety(route, activeAlerts);
      const safetyMultiplier = 0.65 + safetyScore / 100;

      const routeKey = route.regionKey || buildRegionKey(route.city, route.state, route.country);
      const routeStateCountryKey = buildRegionKey(undefined, route.state, route.country);
      const userStateCountryKey = buildRegionKey(undefined, userRegion?.state, userRegion?.country);

      const regionalMatch: SuggestedRoute["regionalMatch"] = !routeKey
        ? "unknown"
        : userRegion?.key && routeKey === userRegion.key
          ? "local"
          : isBrazil(route.country)
            ? "br"
            : "global";
      const regionalBoost = !prioritizeLocalRegion
        ? 1
        : regionalMatch === "local"
          ? 1.28
          : routeStateCountryKey && userStateCountryKey && routeStateCountryKey === userStateCountryKey
            ? 1.16
            : regionalMatch === "br"
              ? 1.08
              : 0.92;

      const curatedBoost = route.isAmbassadorCurated ? 1.2 : 1;

      return {
        ...route,
        distanceKm,
        regionalMatch,
        safetyScore,
        activeAlertsNearby,
        score: typeScore * difficultyScore * distanceScore * safetyMultiplier * regionalBoost * curatedBoost,
      };
    });

    return allRoutes
      .filter((route) => {
        if (curatedOnly && !route.isAmbassadorCurated) {
          return false;
        }

        if (selectedType !== "Todos") {
          const matchesType = normalizeValue(route.tipo).includes(normalizeValue(selectedType));
          if (!matchesType) return false;
        }

        if (selectedDifficulty !== "Todas") {
          const matchesDifficulty = normalizeValue(route.dificuldade).includes(
            normalizeValue(selectedDifficulty)
          );
          if (!matchesDifficulty) return false;
        }

        if (typeof route.distanceKm === "number") {
          return route.distanceKm <= selectedDistance;
        }

        return true;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
        return a.activeAlertsNearby - b.activeAlertsNearby;
      })
      .slice(0, 12);
  }, [
    officialRoutes,
    userRoutes,
    selectedType,
    selectedDifficulty,
    selectedDistance,
    userLocation,
    activeAlerts,
    userRegion,
    curatedOnly,
    prioritizeLocalRegion,
  ]);

  const safetyBriefing = useMemo(() => {
    if (!suggestedRoutes.length) return null;

    const safestRoute = [...suggestedRoutes].sort((a, b) => {
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return a.activeAlertsNearby - b.activeAlertsNearby;
    })[0];

    const highRiskCount = suggestedRoutes.filter((route) => route.safetyScore < 55).length;
    const avgSafety = Math.round(
      suggestedRoutes.reduce((sum, route) => sum + route.safetyScore, 0) / suggestedRoutes.length
    );

    return {
      safestRoute,
      highRiskCount,
      avgSafety,
    };
  }, [suggestedRoutes]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Sugerir rota</Text>
          <Text style={styles.subtitle}>Recomendações por perfil, segurança e região</Text>
        </View>
      </View>

      {userRegion ? (
        <View style={styles.regionInfoBox}>
          <Ionicons name="location-outline" size={14} color={colors.info} />
          <Text style={styles.regionInfoText}>
            Região detectada: {[userRegion.city, userRegion.state].filter(Boolean).join(" - ") || userRegion.country}
          </Text>
        </View>
      ) : null}

      {locationError ? (
        <View style={styles.warningBox}>
          <Ionicons name="locate-outline" size={15} color={colors.warning} />
          <Text style={styles.warningText}>{locationError}</Text>
        </View>
      ) : null}

      {dataNotice ? (
        <View style={styles.noticeBox}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.noticeText}>{dataNotice}</Text>
        </View>
      ) : null}

      {safetyBriefing ? (
        <View style={styles.briefingCard}>
          <View style={styles.briefingTop}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.success} />
            <Text style={styles.briefingTitle}>Briefing de segurança</Text>
          </View>
          <Text style={styles.briefingText}>
            Segurança média das rotas filtradas: {safetyBriefing.avgSafety}%
          </Text>
          <Text style={styles.briefingText}>
            Rota mais segura agora: {safetyBriefing.safestRoute.titulo} ({safetyBriefing.safestRoute.safetyScore}%)
          </Text>
          <Text style={styles.briefingText}>
            Rotas críticas no filtro: {safetyBriefing.highRiskCount}
          </Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {ACTIVITY_OPTIONS.map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() => setSelectedType(item)}
            style={[styles.filterChip, selectedType === item ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterText, selectedType === item ? styles.filterTextActive : null]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.inlineFiltersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineScroll}>
          {DIFFICULTY_OPTIONS.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setSelectedDifficulty(item)}
              style={[styles.inlineChip, selectedDifficulty === item ? styles.inlineChipActive : null]}
            >
              <Text style={[styles.inlineText, selectedDifficulty === item ? styles.inlineTextActive : null]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineScroll}>
          {DISTANCE_OPTIONS.map((item) => (
            <TouchableOpacity
              key={String(item)}
              onPress={() => setSelectedDistance(item)}
              style={[styles.inlineChip, selectedDistance === item ? styles.inlineChipActive : null]}
            >
              <Text style={[styles.inlineText, selectedDistance === item ? styles.inlineTextActive : null]}>
                Até {item} km
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inlineFiltersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineScroll}>
          <TouchableOpacity
            onPress={() => setPrioritizeLocalRegion((prev) => !prev)}
            style={[styles.inlineChip, prioritizeLocalRegion ? styles.inlineChipActive : null]}
          >
            <Text style={[styles.inlineText, prioritizeLocalRegion ? styles.inlineTextActive : null]}>
              Priorizar minha região
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCuratedOnly((prev) => !prev)}
            style={[styles.inlineChip, curatedOnly ? styles.inlineChipActive : null]}
          >
            <Text style={[styles.inlineText, curatedOnly ? styles.inlineTextActive : null]}>
              Só curadoria local
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Buscando rotas recomendadas...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}> 
          {suggestedRoutes.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="trail-sign-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma rota encontrada para os filtros atuais.</Text>
            </View>
          ) : (
            suggestedRoutes.map((route) => (
              <View key={`${route.source}-${route.id}`}>
                <RouteCard
                  route={{
                    ...route,
                    safetyScore: route.safetyScore,
                    activeAlertsNearby: route.activeAlertsNearby,
                    distancia:
                      typeof route.distanceKm === "number"
                        ? `${route.distanceKm.toFixed(1)} km de você`
                        : route.distancia,
                  }}
                  activeAlerts={route.activeAlertsNearby}
                  onPress={() => navigation.navigate("RouteDetail", { routeData: route })}
                />
                <View style={styles.sourceRow}>
                  <Ionicons
                    name={route.source === "oficial" ? "ribbon-outline" : "person-outline"}
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text style={styles.sourceText}>
                    {route.source === "oficial" ? "Rota oficial" : "Rota traçada por você"}
                  </Text>
                  <Text style={styles.sourceText}>
                    • {route.regionalMatch === "local" ? "Região local" : route.regionalMatch === "br" ? "Brasil" : route.regionalMatch === "unknown" ? "Região não informada" : "Internacional"}
                  </Text>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.traceButton} onPress={() => navigation.navigate("TraceRoute")}> 
            <Ionicons name="create-outline" size={16} color="#111827" />
            <Text style={styles.traceButtonText}>Traçar rota manualmente</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPaddingHorizontal,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  regionInfoBox: {
    marginBottom: spacing.xs,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  regionInfoText: {
    color: colors.info,
    fontSize: 12,
    flex: 1,
    fontWeight: "700",
  },
  warningBox: {
    marginBottom: spacing.xs,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  warningText: {
    color: colors.warning,
    fontSize: 12,
    flex: 1,
  },
  noticeBox: {
    marginBottom: spacing.xs,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.38)",
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  noticeText: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  briefingCard: {
    marginBottom: spacing.sm,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.35)",
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  briefingTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  briefingTitle: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
  },
  briefingText: {
    color: "#d1fae5",
    fontSize: 12,
  },
  filterRow: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
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
  inlineFiltersRow: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  inlineScroll: {
    gap: spacing.xs,
  },
  inlineChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  inlineChipActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(252, 76, 2, 0.15)",
  },
  inlineText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 11,
  },
  inlineTextActive: {
    color: colors.primary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sourceRow: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs,
  },
  sourceText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  traceButton: {
    marginTop: spacing.sm,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  traceButtonText: {
    color: "#111827",
    fontWeight: "800",
  },
});

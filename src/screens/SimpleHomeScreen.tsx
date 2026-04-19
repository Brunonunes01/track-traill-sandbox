import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, database } from "../../services/connectionFirebase";
import { getWeatherByCoordinates } from "../../services/weatherService";
import {
  AppButton,
  AppCard,
  EmptyState,
  LoadingState,
  SectionTitle,
} from "../components/ui";
import { TrailAlert } from "../models/alerts";
import { subscribeAlerts } from "../services/alertService";
import { subscribeOfficialRoutes } from "../services/routeService";
import { colors, layout, radius, shadows, spacing, typography } from "../theme/designSystem";

type WeatherInfo = {
  temperature: number;
  rainChance: number;
  cityName?: string;
};

const DEFAULT_WEATHER_POINT = {
  latitude: -23.5505,
  longitude: -46.6333,
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

export default function SimpleHomeScreen({ navigation }: any) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [fullName, setFullName] = useState("Explorador");
  const [routesCount, setRoutesCount] = useState(0);
  const [alerts, setAlerts] = useState<TrailAlert[]>([]);
  const [activitiesCount, setActivitiesCount] = useState(0);
  const [locationLabel, setLocationLabel] = useState("Localização não informada");
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const sectionAnims = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const user = auth.currentUser;
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 8000);

    if (!user) {
      setLoading(false);
      clearTimeout(safetyTimeout);
      return;
    }

    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribeUser = onValue(userRef, (snapshot) => {
      const data = snapshot.val() || {};
      setFullName(data.fullName || data.username || user.email || "Explorador");
      setActivitiesCount(data.atividades ? Object.keys(data.atividades).length : 0);
      setLocationLabel(data.city || data.cidade || data.location || "Localização não informada");
    });

    const unsubscribeRoutes = subscribeOfficialRoutes((routes) => {
      setRoutesCount(routes.length);
      setLoading(false);
    });

    const unsubscribeAlerts = subscribeAlerts((items) => {
      setAlerts(items);
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribeUser();
      unsubscribeRoutes();
      unsubscribeAlerts();
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    let mounted = true;

    const loadWeather = async () => {
      try {
        setWeatherLoading(true);
        let latitude = DEFAULT_WEATHER_POINT.latitude;
        let longitude = DEFAULT_WEATHER_POINT.longitude;

        try {
          let permission = await Location.getForegroundPermissionsAsync();
          if (permission.status !== "granted") {
            permission = await Location.requestForegroundPermissionsAsync();
          }
          if (permission.status === "granted") {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (
              Number.isFinite(current.coords.latitude) &&
              Number.isFinite(current.coords.longitude)
            ) {
              latitude = current.coords.latitude;
              longitude = current.coords.longitude;
            }
          }
        } catch {
          // Fallback para coordenada padrão em caso de falha de GPS/permissão.
        }

        const data = await getWeatherByCoordinates(
          latitude,
          longitude
        );

        if (!mounted) return;
        setWeather({
          temperature: Number(data?.temperature ?? 0),
          rainChance: Number(data?.rainChance ?? 0),
          cityName: typeof data?.cityName === "string" ? data.cityName : undefined,
        });
      } catch {
        if (mounted) setWeather(null);
      } finally {
        if (mounted) setWeatherLoading(false);
      }
    };

    loadWeather();

    return () => {
      mounted = false;
    };
  }, [isFocused]);

  useEffect(() => {
    if (loading) return;

    const animations = sectionAnims.map((value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      })
    );

    Animated.stagger(90, animations).start();
  }, [loading, sectionAnims]);

  const activeAlerts = useMemo(
    () => alerts.filter((item) => item.status === "ativo").length,
    [alerts]
  );

  const recentAlerts = useMemo(
    () => alerts.filter((item) => Date.now() - item.createdAtMs <= 24 * 60 * 60 * 1000).length,
    [alerts]
  );

  const firstName = useMemo(() => fullName.trim().split(" ")[0] || "Explorador", [fullName]);

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date()),
    []
  );

  const getAnimatedStyle = (index: number) => {
    const animation = sectionAnims[index];
    return {
      opacity: animation,
      transform: [
        {
          translateY: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [18, 0],
          }),
        },
      ],
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <LoadingState label="Preparando seu painel..." />
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
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: spacing.lg,
            paddingBottom: Math.max(tabBarHeight + insets.bottom + spacing.lg, spacing.xxl),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={getAnimatedStyle(0)}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}, {firstName}</Text>
              <Text style={styles.dateText}>{dateLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} />
              <Text style={styles.statusText}>Trilhas seguras</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={getAnimatedStyle(1)}>
          <AppCard style={styles.heroCard}>
            <LinearGradient
              colors={["#FC4C02", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroHeader}>
                <View style={styles.heroIconBox}>
                  <Ionicons name="play" size={20} color={colors.white} />
                </View>
                <Text style={styles.heroTag}>Ação principal</Text>
              </View>

              <Text style={styles.heroTitle}>Iniciar atividade</Text>
              <Text style={styles.heroSubtitle}>
                Comece sua trilha agora e acompanhe sua rota em tempo real.
              </Text>

              <AppButton
                title="Começar agora"
                onPress={() => navigation.navigate("Atividades")}
                icon={<Ionicons name="navigate" size={16} color={colors.white} />}
                style={styles.heroButton}
                textStyle={styles.heroButtonText}
              />
            </LinearGradient>
          </AppCard>
        </Animated.View>

        <Animated.View style={getAnimatedStyle(2)}>
          <SectionTitle title="Informações rápidas" subtitle="Contexto para sair com segurança" />
          <View style={styles.quickInfoRow}>
            <AppCard animated style={styles.infoCard}>
              <Ionicons name="partly-sunny-outline" size={18} color={colors.warning} />
              <Text style={styles.infoLabel}>Clima</Text>
              {weatherLoading ? (
                <ActivityIndicator size="small" color={colors.warning} style={styles.infoLoading} />
              ) : (
                <View>
                  <Text style={styles.infoValue}>
                    {weather ? `${weather.temperature}°C · ${weather.rainChance}% chuva` : "Indisponível"}
                  </Text>
                  {weather?.cityName ? (
                    <Text style={styles.infoSubValue} numberOfLines={1}>
                      {weather.cityName}
                    </Text>
                  ) : null}
                </View>
              )}
            </AppCard>

            <AppCard animated style={styles.infoCard}>
              <Ionicons
                name={activeAlerts > 0 ? "warning-outline" : "shield-checkmark-outline"}
                size={18}
                color={activeAlerts > 0 ? colors.danger : colors.success}
              />
              <Text style={styles.infoLabel}>Alertas</Text>
              <Text style={[styles.infoValue, activeAlerts > 0 ? styles.valueDanger : styles.valueSuccess]}>
                {activeAlerts > 0 ? `${activeAlerts} ativos` : "Sem alertas"}
              </Text>
            </AppCard>

            <AppCard animated style={styles.infoCard}>
              <Ionicons name="location-outline" size={18} color={colors.info} />
              <Text style={styles.infoLabel}>Local</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {locationLabel}
              </Text>
            </AppCard>
          </View>
        </Animated.View>

        <Animated.View style={getAnimatedStyle(3)}>
          <SectionTitle title="Rotas próximas" subtitle="Planeje antes de iniciar" />
          <AppCard animated style={styles.routesCard}>
            <View style={styles.routesTopRow}>
              <View>
                <Text style={styles.routesCount}>{routesCount}</Text>
                <Text style={styles.routesLabel}>rotas oficiais disponíveis</Text>
              </View>
              <View style={styles.routesBadge}>
                <Ionicons name="trail-sign-outline" size={16} color={colors.primary} />
                <Text style={styles.routesBadgeText}>Atualizado</Text>
              </View>
            </View>

            <AppButton
              title="Explorar rotas"
              variant="secondary"
              onPress={() => navigation.navigate("Próximas")}
              icon={<Ionicons name="map-outline" size={16} color={colors.textPrimary} />}
            />
          </AppCard>
        </Animated.View>

        <Animated.View style={getAnimatedStyle(4)}>
          <SectionTitle title="Atalhos rápidos" subtitle="Acesso direto ao que mais importa" />
          <View style={styles.shortcutsGrid}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.shortcutCard}
              onPress={() => navigation.navigate("Mapa")}
            >
              <Ionicons name="map-outline" size={20} color={colors.info} />
              <Text style={styles.shortcutTitle}>Mapa</Text>
              <Text style={styles.shortcutText}>Visualizar terreno</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.shortcutCard}
              onPress={() => navigation.navigate("AlertForm")}
            >
              <Ionicons name="warning-outline" size={20} color={colors.warning} />
              <Text style={styles.shortcutTitle}>Novo alerta</Text>
              <Text style={styles.shortcutText}>Reportar ocorrência</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.shortcutCard}
              onPress={() => navigation.navigate("Historico")}
            >
              <Ionicons name="time-outline" size={20} color={colors.success} />
              <Text style={styles.shortcutTitle}>Histórico</Text>
              <Text style={styles.shortcutText}>{activitiesCount} registros</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.shortcutCard}
              onPress={() => navigation.navigate("Perfil")}
            >
              <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.shortcutTitle}>Perfil</Text>
              <Text style={styles.shortcutText}>Ajustar preferências</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View style={getAnimatedStyle(5)}>
          <View style={styles.footerStats}>
            <Text style={styles.footerText}>Alertas nas últimas 24h: {recentAlerts}</Text>
            <Text style={styles.footerText}>Atividades concluídas: {activitiesCount}</Text>
          </View>

          {routesCount === 0 ? (
            <EmptyState
              title="Ainda sem rotas"
              description="Quando novas rotas forem publicadas, elas aparecerão aqui."
              icon="map-outline"
            />
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    gap: spacing.md,
  },
  loadingBox: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  greeting: {
    ...typography.title,
    fontSize: 26,
    lineHeight: 32,
  },
  dateText: {
    color: colors.textMuted,
    marginTop: spacing.xxs,
    textTransform: "capitalize",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  heroCard: {
    padding: 0,
    overflow: "hidden",
    borderColor: "rgba(252, 76, 2, 0.35)",
  },
  heroGradient: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroTag: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  heroButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryPressed,
    ...shadows.floating,
  },
  heroButtonText: {
    color: colors.white,
  },
  quickInfoRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  infoCard: {
    flex: 1,
    minHeight: 108,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  infoLoading: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: spacing.xxs,
  },
  infoSubValue: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  valueDanger: {
    color: colors.danger,
  },
  valueSuccess: {
    color: colors.success,
  },
  routesCard: {
    gap: spacing.md,
  },
  routesTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  routesCount: {
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
  },
  routesLabel: {
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  routesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: "rgba(252, 76, 2, 0.4)",
    backgroundColor: "rgba(252, 76, 2, 0.12)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  routesBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  shortcutsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  shortcutCard: {
    width: "48%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: 6,
    ...shadows.card,
  },
  shortcutTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  shortcutText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  footerStats: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(11, 18, 32, 0.55)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});

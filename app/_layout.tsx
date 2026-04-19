import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as NavigationBar from "expo-navigation-bar";
import { Drawer } from "expo-router/drawer";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut } from "firebase/auth";
import AppErrorBoundary from "../src/components/AppErrorBoundary";
import { useColorScheme } from "@/hooks/useColorScheme";
import { onValue, ref } from "firebase/database";
import { subscribeCurrentUserRole } from "../services/adminService";
import { auth, database, isRealtimeDatabaseConfigured } from "../services/connectionFirebase";
import { getPendingSyncCount, processSyncQueue } from "../src/services/activityTrackingService";

function CustomDrawerContent(props: any) {
  const { navigation } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeCurrentUserRole(({ isAdmin: adminAllowed }: any) => {
      setIsAdmin(adminAllowed);
    });
    return unsubscribe;
  }, []);

  const menuItems = useMemo(
    () => [
      { key: "inicio", label: "Início", icon: "home-outline", href: "/(tabs)/" },
      { key: "historico", label: "Meu Histórico", icon: "time-outline", href: "/history" },
      { key: "offline-routes", label: "Rotas Offline", icon: "cloud-download-outline", href: "/offline-routes" },
      { key: "community", label: "Comunidade", icon: "people-circle-outline", href: "/community" },
      { key: "amigos", label: "Amigos", icon: "people-outline", href: "/friends" },
      { key: "config", label: "Configurações", icon: "settings-outline", href: "/configuracoes" },
      { key: "ajuda", label: "Ajuda & Suporte", icon: "help-circle-outline", href: "/ajuda" },
    ],
    []
  );

  return (
    <View style={[styles.drawerContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Track & Trail</Text>
        <Text style={styles.drawerSubtitle}>Explore novos caminhos</Text>
      </View>

      <ScrollView contentContainerStyle={styles.drawerItems}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.drawerItem}
            onPress={() => {
              navigation.closeDrawer();
              router.push(item.href as any);
            }}
          >
            <Ionicons name={item.icon as any} size={22} color="#94a3b8" />
            <Text style={styles.drawerItemText}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {isAdmin && (
          <TouchableOpacity
            style={styles.drawerItem}
            onPress={() => {
              navigation.closeDrawer();
              router.push("/admin");
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={22} color="#f97316" />
            <Text style={[styles.drawerItemText, { color: "#f97316" }]}>Painel Admin</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={async () => {
          try {
            await signOut(auth);
            navigation.closeDrawer();
            router.replace("/login");
          } catch (error: any) {
            Alert.alert("Erro ao sair", error?.message || "Tente novamente.");
          }
        }}
      >
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncRunning, setSyncRunning] = useState(false);
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const syncQueueNow = useCallback(async () => {
    if (syncRunning) return;

    setSyncRunning(true);
    try {
      await processSyncQueue();
    } catch (err) {
      console.warn("[sync] auto-process failed:", err);
    } finally {
      setSyncRunning(false);
    }
  }, [syncRunning]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);
      return pending;
    } catch (error) {
      console.warn("[sync] pending count failed:", error);
      return 0;
    }
  }, []);

  useEffect(() => {
    // Esconde o splash imediatamente para boot rápido
    SplashScreen.hideAsync().catch(() => {});

    syncQueueNow().catch(() => {});
    refreshPendingCount().catch(() => {});

    if (Platform.OS === "android") {
      const configureAndroidNavBar = async () => {
        try {
          // Keep app content above system navigation bar (prevents bottom tab overlap).
          await NavigationBar.setPositionAsync("relative");
          await NavigationBar.setVisibilityAsync("visible");
        } catch (error) {
          console.warn("[android-nav] failed to configure navigation bar:", error);
        }
      };

      configureAndroidNavBar();
    }
  }, [refreshPendingCount, syncQueueNow]);

  useEffect(() => {
    if (!isRealtimeDatabaseConfigured) {
      setIsRealtimeConnected(null);
      return;
    }

    const connectionRef = ref(database, ".info/connected");
    const unsubscribe = onValue(connectionRef, (snapshot) => {
      setIsRealtimeConnected(Boolean(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isRealtimeConnected) return;
    syncQueueNow().catch(() => {});
    refreshPendingCount().catch(() => {});
  }, [isRealtimeConnected, refreshPendingCount, syncQueueNow]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = await refreshPendingCount();
      if (isRealtimeConnected && pending > 0) {
        await syncQueueNow();
        await refreshPendingCount();
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isRealtimeConnected, refreshPendingCount, syncQueueNow]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <Drawer
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              headerShown: false,
              drawerStyle: {
                backgroundColor: "#0b1220",
                width: 280,
              },
              overlayColor: "rgba(2,6,23,0.7)",
            }}
          >
            <Drawer.Screen 
              name="(tabs)" 
              options={{ 
                drawerLabel: "Principal",
                headerShown: false 
              }} 
            />
            <Drawer.Screen 
              name="history" 
              options={{ 
                drawerLabel: "Histórico",
                headerShown: true,
                title: "Meu Histórico",
                headerStyle: { backgroundColor: "#0b1220" },
                headerTintColor: "#fff"
              }} 
            />
            <Drawer.Screen
              name="offline-routes"
              options={{
                drawerLabel: "Rotas Offline",
                headerShown: true,
                title: "Rotas Offline",
                headerStyle: { backgroundColor: "#0b1220" },
                headerTintColor: "#fff",
              }}
            />
            <Drawer.Screen
              name="community"
              options={{
                drawerLabel: "Comunidade",
                headerShown: true,
                title: "Comunidade",
                headerStyle: { backgroundColor: "#0b1220" },
                headerTintColor: "#fff",
              }}
            />
          </Drawer>
          <GlobalStatusBanner
            showConnectivityStatus={isRealtimeDatabaseConfigured}
            connected={isRealtimeConnected}
            pendingSyncCount={pendingSyncCount}
            syncRunning={syncRunning}
          />
          <StatusBar style="auto" />
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  drawerContainer: { flex: 1, backgroundColor: "#0b1220" },
  drawerHeader: { paddingHorizontal: 20, marginBottom: 24 },
  drawerTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  drawerSubtitle: { color: "#94a3b8", fontSize: 13, marginTop: 4 },
  drawerItems: { paddingHorizontal: 12 },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  drawerItemText: { color: "#e2e8f0", fontSize: 16, fontWeight: "600", marginLeft: 12 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  logoutText: { color: "#ef4444", fontSize: 16, fontWeight: "700", marginLeft: 12 },
  globalBannerWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 8,
    zIndex: 999,
  },
  globalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  globalBannerOffline: {
    backgroundColor: "rgba(120,53,15,0.82)",
    borderColor: "rgba(245,158,11,0.35)",
  },
  globalBannerSync: {
    backgroundColor: "rgba(30,64,175,0.82)",
    borderColor: "rgba(59,130,246,0.35)",
  },
  globalBannerText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
});

function GlobalStatusBanner({
  showConnectivityStatus,
  connected,
  pendingSyncCount,
  syncRunning,
}: {
  showConnectivityStatus: boolean;
  connected: boolean | null;
  pendingSyncCount: number;
  syncRunning: boolean;
}) {
  const insets = useSafeAreaInsets();
  const showOffline = showConnectivityStatus && connected === false;
  const showPending = pendingSyncCount > 0 || syncRunning;

  if (!showOffline && !showPending) return null;

  return (
    <View style={[styles.globalBannerWrap, { top: insets.top + 6 }]}>
      {showOffline ? (
        <View style={[styles.globalBanner, styles.globalBannerOffline]}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fef3c7" />
          <Text style={styles.globalBannerText}>Sem conexão. Recursos offline ativos.</Text>
        </View>
      ) : null}

      {showPending ? (
        <View style={[styles.globalBanner, styles.globalBannerSync]}>
          <Ionicons name={syncRunning ? "sync-outline" : "cloud-upload-outline"} size={14} color="#dbeafe" />
          <Text style={styles.globalBannerText}>
            {syncRunning
              ? "Sincronizando atividades pendentes..."
              : `${pendingSyncCount} atividade(s) aguardando sincronização`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

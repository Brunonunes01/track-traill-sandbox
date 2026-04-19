import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { storeNavigationPayload } from "./navPayloadStore";

const routeMap: Record<string, string> = {
  Login: "/login",
  Register: "/register",
  MainTabs: "/(tabs)",
  Home: "/(tabs)",
  Mapa: "/(tabs)/mapa",
  "Próximas": "/(tabs)/proximas",
  Atividades: "/(tabs)/atividades",
  Perfil: "/(tabs)/perfil",
  Amigos: "/friends",
  RouteDetail: "/route-detail",
  AlertForm: "/alert-form",
  AddPOI: "/add-poi",
  AlertDetail: "/alert-detail",
  ActivitySummary: "/activity-summary",
  ActivityView: "/activity-view",
  PostDetail: "/post-detail",
  History: "/history",
  Historico: "/history",
  Configuracoes: "/configuracoes",
  Segments: "/segments",
  SegmentDetail: "/segment-detail",
  SegmentCreate: "/segment-create",
  SegmentLeaderboard: "/segment-leaderboard",
  PrivacyZone: "/privacy-zone",
  ActivityFiles: "/activity-files",
  Sensors: "/sensors",
  Community: "/community",
  OfflineRoutes: "/offline-routes",
  Ajuda: "/ajuda",
  Admin: "/admin",
  AdminDashboard: "/admin",
  SuggestRoute: "/suggest-route",
  TraceRoute: "/trace-route",
};

export function useExpoNavigationBridge() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  const navigate = (name: string, params?: any) => {
    const target = routeMap[name];
    if (!target) return;

    if (params && typeof params === "object") {
      const payloadId = storeNavigationPayload(params);
      router.push({ pathname: target as any, params: { payloadId } });
      return;
    }

    router.push(target as any);
  };

  const replace = (name: string, params?: any) => {
    const target = routeMap[name];
    if (!target) return;

    if (params && typeof params === "object") {
      const payloadId = storeNavigationPayload(params);
      router.replace({ pathname: target as any, params: { payloadId } });
      return;
    }

    router.replace(target as any);
  };

  return {
    navigate,
    replace,
    goBack: () => router.back(),
    openDrawer: () => {
      const parent = navigation?.getParent?.();
      if (parent?.openDrawer) {
        parent.openDrawer();
      }
    },
    getParent: () => navigation?.getParent?.(),
  };
}

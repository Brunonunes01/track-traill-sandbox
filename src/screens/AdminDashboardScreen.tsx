import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { onValue, ref, remove, set } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AdminUserList from "../../components/AdminUserList";
import { database } from "../../services/connectionFirebase";
import {
  addAdminByEmail,
  removeAdminRole,
  resolveUserRole,
  subscribeAdmins,
  subscribeCurrentUserRole,
  subscribeUsers,
} from "../../services/adminService";
import { TrailAlert } from "../models/alerts";
import {
  markAlertAsResolved,
  removeAlertByAdmin,
  subscribeAllAlertsForAdmin,
} from "../services/alertService";

type AdminSection = "add" | "admins" | "users" | "tools" | "routes" | "settings" | "alerts";
type AlertFilter = "todos" | "ativos" | "expirados" | "denunciados" | "resolvidos";

const PRIVILEGED_ADMIN_EMAIL = "brunobhnuness@gmail.com";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type PendingRoute = {
  id: string;
  nome?: string;
  titulo?: string;
  tipo?: string;
  distancia?: string;
  emailAutor?: string;
  autor?: string;
  descricao?: string;
  dificuldade?: string;
  tempoEstimado?: string | null;
  duracaoSegundos?: number | null;
  terreno?: string | null;
  elevacaoGanhoM?: number | null;
  elevacaoPerdaM?: number | null;
  criadoEm?: string;
  createdAt?: string;
  startPoint?: Coordinate | null;
  endPoint?: Coordinate | null;
  rotaCompleta: Coordinate[];
};

type AdminRouteItem = {
  id: string;
  titulo: string;
  tipo: string;
  distancia?: string;
  criadoEm?: string;
  autor?: string;
};

const SECTION_ITEMS: { key: AdminSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "add", label: "Adicionar", icon: "person-add-outline" },
  { key: "admins", label: "Administradores", icon: "shield-checkmark-outline" },
  { key: "users", label: "Usuários", icon: "people-outline" },
  { key: "tools", label: "Ferramentas", icon: "construct-outline" },
  { key: "settings", label: "Sistema", icon: "settings-outline" },
  { key: "routes", label: "Rotas", icon: "map-outline" },
  { key: "alerts", label: "Alertas", icon: "warning-outline" },
];

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toCoordinate = (value: any): Coordinate | null => {
  const latitude = toNumber(value?.latitude);
  const longitude = toNumber(value?.longitude);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
};

const toCoordinateArray = (value: any): Coordinate[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toCoordinate(item))
    .filter((item): item is Coordinate => Boolean(item));
};

const toPendingRoute = (id: string, raw: any): PendingRoute => ({
  id,
  nome: raw?.nome ? String(raw.nome) : undefined,
  titulo: raw?.titulo ? String(raw.titulo) : undefined,
  tipo: raw?.tipo ? String(raw.tipo) : "trilha",
  distancia: raw?.distancia ? String(raw.distancia) : undefined,
  emailAutor: raw?.emailAutor ? String(raw.emailAutor) : undefined,
  autor: raw?.autor ? String(raw.autor) : undefined,
  descricao: raw?.descricao ? String(raw.descricao) : "Sem descrição disponível.",
  dificuldade: raw?.dificuldade ? String(raw.dificuldade) : "Não informada",
  tempoEstimado: raw?.tempoEstimado ? String(raw.tempoEstimado) : null,
  duracaoSegundos: typeof raw?.duracaoSegundos === "number" ? raw.duracaoSegundos : null,
  terreno: raw?.terreno ? String(raw.terreno) : null,
  elevacaoGanhoM: typeof raw?.elevacaoGanhoM === "number" ? raw.elevacaoGanhoM : null,
  elevacaoPerdaM: typeof raw?.elevacaoPerdaM === "number" ? raw.elevacaoPerdaM : null,
  criadoEm: raw?.criadoEm ? String(raw.criadoEm) : undefined,
  createdAt: raw?.createdAt ? String(raw.createdAt) : undefined,
  startPoint: toCoordinate(raw?.startPoint),
  endPoint: toCoordinate(raw?.endPoint),
  rotaCompleta: toCoordinateArray(raw?.rotaCompleta),
});

const formatAdminDate = (value?: string) => {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data não informada";
  return parsed.toLocaleString("pt-BR");
};

export default function AdminDashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<AdminSection>("routes");
  const [adminEmail, setAdminEmail] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  const [admins, setAdmins] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [pendentes, setPendentes] = useState<PendingRoute[]>([]);
  const [rotaSelecionada, setRotaSelecionada] = useState<PendingRoute | null>(null);
  const [officialRoutes, setOfficialRoutes] = useState<AdminRouteItem[]>([]);
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<TrailAlert[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("todos");
  const [workingAlertId, setWorkingAlertId] = useState<string | null>(null);

  const [pendingError, setPendingError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCurrentUserRole(({ isAdmin: adminAllowed, user, role }: any) => {
      const email = String(user?.email || "").toLowerCase().trim();
      const emailAllowed = email === PRIVILEGED_ADMIN_EMAIL;
      const finalAccess = adminAllowed || emailAllowed;

      console.log(
        `[Admin] Login: ${user?.email}, Role: ${role}, emailAllowed=${emailAllowed}, Access Granted: ${finalAccess}`
      );

      setCurrentUserId(user?.uid || null);
      setIsAdmin(finalAccess);
      setCheckingAccess(false);

      if (user && !finalAccess) {
        Alert.alert(
          "Acesso negado",
          "Esta área é exclusiva para administradores. Seu token atual não possui claim admin."
        );
        navigation.goBack();
      }
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribeAdmins = subscribeAdmins((adminUsers: any[]) => {
      setAdmins(
        adminUsers
          .map((user: any) => ({ ...user, role: resolveUserRole(user, user.email) }))
          .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
      );
    });

    const unsubscribeUsers = subscribeUsers((allUsers: any[]) => {
      setUsers(
        allUsers
          .map((user: any) => ({ ...user, role: resolveUserRole(user, user.email) }))
          .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
      );
      setUsersError(null);
    });

    const pendentesRef = ref(database, "rotas_pendentes");
    const unsubscribePendentes = onValue(
      pendentesRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setPendentes([]);
          setPendingError(null);
          return;
        }

        const data = snapshot.val() || {};
        const lista = Object.keys(data)
          .map((key) => toPendingRoute(key, data[key]))
          .sort((a, b) => (b.criadoEm || b.createdAt || "").localeCompare(a.criadoEm || a.createdAt || ""));
        setPendentes(lista);
        setPendingError(null);
      },
      (error) => {
        const message = error?.message || "Falha ao ler rotas pendentes.";
        console.warn("[admin] rotas_pendentes listener failed:", message);
        setPendentes([]);
        setPendingError(message);
      }
    );

    const oficiaisRef = ref(database, "rotas_oficiais");
    const unsubscribeOfficialRoutes = onValue(
      oficiaisRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          console.log("[Admin] O nó 'rotas_oficiais' está vazio no banco de dados.");
          setOfficialRoutes([]);
          return;
        }

        const data = snapshot.val() || {};
        const keys = Object.keys(data);
        console.log(`[Admin] Recebidas ${keys.length} rotas oficiais do Firebase.`);
        
        const lista: AdminRouteItem[] = keys.map((key) => {
          const route = data[key] || {};
          return {
            id: key,
            titulo: String(route.titulo || route.nome || "Rota sem nome"),
            tipo: String(route.tipo || "trilha"),
            distancia: route.distancia ? String(route.distancia) : "N/D",
            criadoEm: route.aprovadoEm || route.criadoEm || route.createdAt || route.dataCriacao,
            autor: route.autor || route.emailAutor || route.userEmail || "Sistema",
          };
        });

        lista.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
        setOfficialRoutes(lista);
      },
      (error) => {
        console.warn("[Admin] Erro ao ler 'rotas_oficiais':", error.message);
        setOfficialRoutes([]);
      }
    );

    const unsubscribeAlerts = subscribeAllAlertsForAdmin(
      (incoming) => {
        setAlerts(incoming);
      },
      () => {
        setAlerts([]);
      }
    );

    return () => {
      unsubscribeAdmins();
      unsubscribeUsers();
      unsubscribePendentes();
      unsubscribeOfficialRoutes();
      unsubscribeAlerts();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (users.length === 0 && admins.length === 0) {
      setUsersError("Seção usuários vazia ou sem permissão de leitura em /users.");
    }
  }, [isAdmin, users.length, admins.length]);

  const totalCommonUsers = useMemo(
    () => users.filter((user) => user.role !== "admin").length,
    [users]
  );

  const visibleModerationAlerts = useMemo(
    () => alerts.filter((item) => item.status !== "removido"),
    [alerts]
  );

  const activeAlertsCount = useMemo(
    () => visibleModerationAlerts.filter((item) => item.status === "ativo").length,
    [visibleModerationAlerts]
  );

  const filteredAlerts = useMemo(() => {
    return visibleModerationAlerts.filter((item) => {
      if (alertFilter === "todos") return true;
      if (alertFilter === "ativos") return item.status === "ativo";
      if (alertFilter === "expirados") return item.status === "expirado";
      if (alertFilter === "resolvidos") return item.status === "resolvido";
      if (alertFilter === "denunciados") return (item.reportCount || 0) > 0;
      return true;
    });
  }, [alertFilter, visibleModerationAlerts]);

  const selectedStartPoint = useMemo(() => toCoordinate(rotaSelecionada?.startPoint), [rotaSelecionada]);
  const selectedEndPoint = useMemo(() => toCoordinate(rotaSelecionada?.endPoint), [rotaSelecionada]);
  const selectedPath = useMemo(() => toCoordinateArray(rotaSelecionada?.rotaCompleta), [rotaSelecionada]);

  const handleAddAdmin = async () => {
    try {
      setIsAddingAdmin(true);
      await addAdminByEmail(adminEmail);
      setAdminEmail("");
      Alert.alert("Sucesso", "Usuário promovido para administrador.");
      setActiveSection("admins");
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Falha ao adicionar administrador.");
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = (adminUser: any) => {
    if (adminUser.uid === currentUserId) {
      Alert.alert("Ação bloqueada", "Você não pode remover seu próprio acesso de admin.");
      return;
    }

    Alert.alert(
      "Remover administrador",
      `Deseja remover privilégios de admin para ${adminUser.email}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await removeAdminRole(adminUser.uid);
              Alert.alert("Sucesso", "Privilégios de administrador removidos.");
            } catch (error: any) {
              Alert.alert("Erro", error.message || "Não foi possível remover o administrador.");
            }
          },
        },
      ]
    );
  };

  const handleAprovarRota = async () => {
    if (!rotaSelecionada) return;

    const safeStartPoint = toCoordinate(rotaSelecionada.startPoint);
    const safeEndPoint = toCoordinate(rotaSelecionada.endPoint);
    const safePath = toCoordinateArray(rotaSelecionada.rotaCompleta);

    if (!safeStartPoint || !safeEndPoint || safePath.length < 2) {
      Alert.alert("Rota inválida", "Esta sugestão tem coordenadas incompletas e não pode ser aprovada.");
      return;
    }

    try {
      setDeletingRouteId(rotaSelecionada.id);
      const oficialRef = ref(database, `rotas_oficiais/${rotaSelecionada.id}`);
      await set(oficialRef, {
        titulo: rotaSelecionada.nome || rotaSelecionada.titulo || "Rota sem nome",
        tipo: rotaSelecionada.tipo || "trilha",
        visibility: "public",
        dificuldade: rotaSelecionada.dificuldade || "Não informada",
        tempoEstimado: rotaSelecionada.tempoEstimado || null,
        duracaoSegundos:
          typeof rotaSelecionada.duracaoSegundos === "number" ? rotaSelecionada.duracaoSegundos : null,
        terreno: rotaSelecionada.terreno || null,
        descricao: rotaSelecionada.descricao || "Sem descrição disponível.",
        distancia: rotaSelecionada.distancia || null,
        startPoint: safeStartPoint,
        endPoint: safeEndPoint,
        rotaCompleta: safePath,
        elevacaoGanhoM:
          typeof rotaSelecionada.elevacaoGanhoM === "number" ? rotaSelecionada.elevacaoGanhoM : null,
        elevacaoPerdaM:
          typeof rotaSelecionada.elevacaoPerdaM === "number" ? rotaSelecionada.elevacaoPerdaM : null,
        autor: rotaSelecionada.emailAutor || rotaSelecionada.autor || null,
        aprovadoEm: new Date().toISOString(),
      });

      await remove(ref(database, `rotas_pendentes/${rotaSelecionada.id}`));
      setRotaSelecionada(null);
      Alert.alert("Aprovada", "Rota aprovada e publicada.");
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Não foi possível aprovar a rota.");
    } finally {
      setDeletingRouteId(null);
    }
  };

  const handleRejeitarRota = () => {
    if (!rotaSelecionada) return;

    Alert.alert("Rejeitar rota", "Essa sugestão será removida permanentemente.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Rejeitar",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingRouteId(rotaSelecionada.id);
            await remove(ref(database, `rotas_pendentes/${rotaSelecionada.id}`));
            setRotaSelecionada(null);
            Alert.alert("Concluído", "Rota rejeitada com sucesso.");
          } catch (error: any) {
            Alert.alert("Erro", error.message || "Não foi possível rejeitar a rota.");
          } finally {
            setDeletingRouteId(null);
          }
        },
      },
    ]);
  };

  const handleDeleteOfficialRoute = (routeItem: AdminRouteItem) => {
    Alert.alert("Excluir rota", "Tem certeza que deseja excluir esta rota?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingRouteId(routeItem.id);
            await remove(ref(database, `rotas_oficiais/${routeItem.id}`));
            Alert.alert("Rota excluída", "A rota foi removida com sucesso.");
          } catch (error: any) {
            Alert.alert("Erro ao excluir", error?.message || "Não foi possível excluir a rota agora.");
          } finally {
            setDeletingRouteId(null);
          }
        },
      },
    ]);
  };

  const reportSummary = (item: TrailAlert) => {
    if (!item.reports) return "Sem denúncias";
    const reasons = Object.values(item.reports).reduce<Record<string, number>>((acc, report) => {
      const key = report.reason;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const entries = Object.entries(reasons);
    if (entries.length === 0) return "Sem denúncias";
    return entries.map(([reason, count]) => `${reason}: ${count}`).join(" | ");
  };

  const handleResolveAlertAdmin = async (alertId: string) => {
    try {
      setWorkingAlertId(alertId);
      await markAlertAsResolved(alertId);
      Alert.alert("Alerta atualizado", "Alerta marcado como resolvido.");
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível resolver o alerta.");
    } finally {
      setWorkingAlertId(null);
    }
  };

  const handleRemoveAlertAdmin = (alertId: string) => {
    Alert.alert("Remover alerta", "Este alerta será ocultado para usuários comuns.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          try {
            setWorkingAlertId(alertId);
            await removeAlertByAdmin(alertId, currentUserId);
            Alert.alert("Alerta removido", "O alerta foi removido da visualização pública.");
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível remover o alerta.");
          } finally {
            setWorkingAlertId(null);
          }
        },
      },
    ]);
  };

  const renderSectionButtons = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sectionButtons}
      style={styles.sectionButtonsScroll}
    >
      {SECTION_ITEMS.map((item) => {
        const isActive = activeSection === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.sectionBtn, isActive && styles.sectionBtnActive]}
            onPress={() => setActiveSection(item.key)}
          >
            <Ionicons name={item.icon} size={16} color={isActive ? "#0b1220" : "#94a3b8"} />
            <Text style={[styles.sectionBtnText, isActive && styles.sectionBtnTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderPendingList = () => {
    if (pendingError) {
      return <Text style={styles.errorText}>{pendingError}</Text>;
    }

    if (pendentes.length === 0) {
      return (
        <View style={styles.emptyTools}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color="#22c55e" />
          <Text style={styles.emptyToolsText}>Nenhuma rota pendente no momento.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={pendentes}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.routeCard} onPress={() => setRotaSelecionada(item)}>
            <View style={styles.routeCardIcon}>
              <Ionicons name="map-outline" size={24} color="#38bdf8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeCardTitle}>{item.nome || item.titulo || "Rota sem nome"}</Text>
              <Text style={styles.routeCardMeta}>Tipo: {item.tipo || "trilha"}</Text>
              <Text style={styles.routeCardMeta}>Autor: {item.emailAutor || item.autor || "Não informado"}</Text>
              <Text style={styles.routeCardMeta}>Enviada em: {formatAdminDate(item.criadoEm || item.createdAt)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>
        )}
      />
    );
  };

  const renderSectionContent = () => {
    if (activeSection === "add") {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Adicionar novo administrador</Text>
          <Text style={styles.sectionDescription}>
            Informe o e-mail de um usuário já cadastrado para conceder acesso administrativo.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email do usuário"
            placeholderTextColor="#64748b"
            value={adminEmail}
            onChangeText={setAdminEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.primaryActionBtn} onPress={handleAddAdmin} disabled={isAddingAdmin}>
            {isAddingAdmin ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.primaryActionText}>Adicionar como administrador</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (activeSection === "admins") {
      return (
        <AdminUserList
          title={`Administradores (${admins.length})`}
          users={admins}
          emptyMessage="Nenhum administrador cadastrado."
          actionLabel="Remover"
          onActionPress={handleRemoveAdmin}
          disableActionForUid={currentUserId}
        />
      );
    }

    if (activeSection === "users") {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Usuários cadastrados ({users.length})</Text>
          <Text style={styles.sectionDescription}>
            {totalCommonUsers} usuário(s) comum(ns) e {admins.length} administrador(es).
          </Text>
          {usersError ? <Text style={styles.errorText}>{usersError}</Text> : null}
          <AdminUserList
            title="Lista de usuários"
            users={users}
            emptyMessage="Nenhum usuário cadastrado ou sem permissão de leitura."
            actionLabel=""
            onActionPress={() => {}}
            disableActionForUid={null}
          />
        </View>
      );
    }

    if (activeSection === "settings") {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Configurações do sistema</Text>
          <Text style={styles.sectionDescription}>
            Área reservada para parâmetros globais do app e controles de segurança.
          </Text>
          <View style={styles.systemItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#22c55e" />
            <Text style={styles.systemItemText}>Controle de acesso admin ativo</Text>
          </View>
          <View style={styles.systemItem}>
            <Ionicons name="server-outline" size={20} color="#38bdf8" />
            <Text style={styles.systemItemText}>Conectado ao Firebase Realtime Database</Text>
          </View>
          <Text style={styles.helpText}>
            Se aparecer `permission_denied`, publique as regras em produção com `firebase deploy --only database`.
          </Text>
        </View>
      );
    }

    if (activeSection === "alerts") {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Moderação de alertas ({visibleModerationAlerts.length})</Text>
          <Text style={styles.sectionDescription}>Filtre por status e trate denúncias para manter o sistema confiável.</Text>

          <View style={styles.alertFilterRow}>
            {(
              [
                { key: "todos", label: "Todos" },
                { key: "ativos", label: "Ativos" },
                { key: "expirados", label: "Expirados" },
                { key: "denunciados", label: "Denunciados" },
                { key: "resolvidos", label: "Resolvidos" },
              ] as { key: AlertFilter; label: string }[]
            ).map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => setAlertFilter(item.key)}
                style={[styles.alertFilterChip, alertFilter === item.key ? styles.alertFilterChipActive : null]}
              >
                <Text style={[styles.alertFilterText, alertFilter === item.key ? styles.alertFilterTextActive : null]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredAlerts.length === 0 ? (
            <View style={styles.emptyTools}>
              <Ionicons name="shield-checkmark-outline" size={48} color="#64748b" />
              <Text style={styles.emptyToolsText}>Nenhum alerta para o filtro atual.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredAlerts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.alertAdminCard}>
                  <View style={styles.alertAdminHeader}>
                    <Text style={styles.alertAdminType}>{item.type}</Text>
                    <Text style={styles.alertAdminStatus}>Status: {item.status}</Text>
                  </View>

                  <Text style={styles.alertAdminDescription}>{item.description}</Text>
                  <Text style={styles.alertAdminMeta}>Criado: {formatAdminDate(item.createdAt)}</Text>
                  <Text style={styles.alertAdminMeta}>Expira: {formatAdminDate(item.expiresAt)}</Text>
                  <Text style={styles.alertAdminMeta}>Rota: {item.routeName || "Não vinculada"}</Text>
                  <Text style={styles.alertAdminMeta}>Denúncias: {item.reportCount || 0}</Text>
                  <Text style={styles.alertAdminMeta}>Resumo denúncias: {reportSummary(item)}</Text>

                  <View style={styles.alertAdminActions}>
                    <TouchableOpacity
                      style={styles.alertResolveBtn}
                      disabled={workingAlertId === item.id || item.status !== "ativo"}
                      onPress={() => handleResolveAlertAdmin(item.id)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color="#dcfce7" />
                      <Text style={styles.alertResolveText}>Resolver</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.alertRemoveBtn}
                      disabled={workingAlertId === item.id || item.status === "removido"}
                      onPress={() => handleRemoveAlertAdmin(item.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fee2e2" />
                      <Text style={styles.alertRemoveText}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      );
    }

    if (activeSection === "routes") {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Rotas ({officialRoutes.length} oficiais / {pendentes.length} pendentes)</Text>
          <Text style={styles.sectionDescription}>Modere pendências e gerencie rotas oficiais em um único lugar.</Text>

          {renderPendingList()}

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Rotas oficiais ({officialRoutes.length})</Text>
          {officialRoutes.length === 0 ? (
            <View style={styles.emptyTools}>
              <Ionicons name="trail-sign-outline" size={52} color="#64748b" />
              <Text style={styles.emptyToolsText}>Nenhuma rota oficial cadastrada.</Text>
            </View>
          ) : (
            <FlatList
              data={officialRoutes}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.routeCard}>
                  <View style={styles.routeCardIcon}>
                    <Ionicons name="map-outline" size={24} color="#38bdf8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeCardTitle}>{item.titulo}</Text>
                    <Text style={styles.routeCardMeta}>Tipo: {item.tipo}</Text>
                    <Text style={styles.routeCardMeta}>Distância: {item.distancia || "Não informada"}</Text>
                    <Text style={styles.routeCardMeta}>Criada em: {formatAdminDate(item.criadoEm)}</Text>
                    <Text style={styles.routeCardMeta}>Autor: {item.autor || "Não informado"}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteRouteBtn}
                    disabled={deletingRouteId === item.id}
                    onPress={() => handleDeleteOfficialRoute(item)}
                  >
                    {deletingRouteId === item.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      );
    }

    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Ferramentas de gerenciamento do app</Text>
        <Text style={styles.sectionDescription}>Modere rotas sugeridas pela comunidade.</Text>
        {renderPendingList()}
      </View>
    );
  };

  if (checkingAccess) {
    return (
      <SafeAreaView style={styles.centerState}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.centerStateText}>Validando permissões...</Text>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centerState}>
        <Ionicons name="lock-closed-outline" size={52} color="#ef4444" />
        <Text style={styles.centerStateText}>Acesso restrito para administradores.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}> 
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Painel Admin</Text>
          <Text style={styles.headerSubtitle}>Gestão de usuários, rotas e moderação</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 24, 36) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{admins.length}</Text>
            <Text style={styles.statLabel}>Admins</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendentes.length}</Text>
            <Text style={styles.statLabel}>Pendências</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeAlertsCount}</Text>
            <Text style={styles.statLabel}>Alertas ativos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{users.length}</Text>
            <Text style={styles.statLabel}>Usuários</Text>
          </View>
        </View>

        {renderSectionButtons()}
        {renderSectionContent()}
      </ScrollView>

      <Modal visible={Boolean(rotaSelecionada)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{rotaSelecionada?.nome || rotaSelecionada?.titulo || "Rota pendente"}</Text>
            <Text style={styles.modalMeta}>Tipo: {rotaSelecionada?.tipo || "trilha"}</Text>
            <Text style={styles.modalMeta}>Autor: {rotaSelecionada?.emailAutor || rotaSelecionada?.autor || "Não informado"}</Text>
            <Text style={styles.modalMeta}>Distância: {rotaSelecionada?.distancia || "Não informada"}</Text>
            <Text style={styles.modalMeta}>Descrição: {rotaSelecionada?.descricao || "Sem descrição"}</Text>

            {selectedPath.length >= 2 ? (
              <MapView
                style={styles.modalMap}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude: selectedStartPoint?.latitude || selectedPath[0].latitude,
                  longitude: selectedStartPoint?.longitude || selectedPath[0].longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
              >
                <Polyline coordinates={selectedPath} strokeColor="#facc15" strokeWidth={5} />
                {selectedStartPoint ? <Marker coordinate={selectedStartPoint} title="Início" /> : null}
                {selectedEndPoint ? <Marker coordinate={selectedEndPoint} title="Fim" /> : null}
              </MapView>
            ) : (
              <Text style={styles.errorText}>Rota sem geometria válida.</Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setRotaSelecionada(null)}>
                <Text style={styles.modalSecondaryText}>Fechar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalDangerBtn} onPress={handleRejeitarRota}>
                <Text style={styles.modalDangerText}>Rejeitar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleAprovarRota}>
                {deletingRouteId === rotaSelecionada?.id ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Aprovar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  centerState: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  centerStateText: {
    marginTop: 10,
    color: "#cbd5e1",
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#94a3b8",
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    paddingVertical: 10,
  },
  statValue: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 18,
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  sectionButtonsScroll: {
    maxHeight: 48,
  },
  sectionButtons: {
    paddingRight: 8,
    gap: 8,
  },
  sectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
  },
  sectionBtnActive: {
    borderColor: "#facc15",
    backgroundColor: "#facc15",
  },
  sectionBtnText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12,
  },
  sectionBtnTextActive: {
    color: "#0b1220",
  },
  sectionCard: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 4,
  },
  sectionDescription: {
    color: "#94a3b8",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#020617",
    borderRadius: 10,
    color: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  primaryActionBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: {
    color: "#fff",
    fontWeight: "700",
  },
  emptyTools: {
    alignItems: "center",
    paddingVertical: 18,
  },
  emptyToolsText: {
    color: "#94a3b8",
    marginTop: 8,
    textAlign: "center",
  },
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  routeCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#082f49",
    alignItems: "center",
    justifyContent: "center",
  },
  routeCardTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 14,
  },
  routeCardMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 1,
  },
  deleteRouteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    alignItems: "center",
    justifyContent: "center",
  },
  systemItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  systemItemText: {
    color: "#cbd5e1",
  },
  helpText: {
    color: "#93c5fd",
    marginTop: 8,
  },
  alertFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  alertFilterChip: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#020617",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  alertFilterChipActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#082f49",
  },
  alertFilterText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  alertFilterTextActive: {
    color: "#7dd3fc",
  },
  alertAdminCard: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  alertAdminHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  alertAdminType: {
    color: "#f8fafc",
    fontWeight: "700",
  },
  alertAdminStatus: {
    color: "#93c5fd",
    fontWeight: "700",
    fontSize: 12,
  },
  alertAdminDescription: {
    color: "#e2e8f0",
    marginBottom: 6,
  },
  alertAdminMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 1,
  },
  alertAdminActions: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  alertResolveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#166534",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  alertResolveText: {
    color: "#dcfce7",
    fontWeight: "700",
  },
  alertRemoveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#7f1d1d",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  alertRemoveText: {
    color: "#fee2e2",
    fontWeight: "700",
  },
  errorText: {
    color: "#fda4af",
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#020617",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    maxHeight: "88%",
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  modalMeta: {
    color: "#cbd5e1",
    fontSize: 12,
    marginBottom: 2,
  },
  modalMap: {
    height: 240,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
  },
  modalSecondaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    color: "#cbd5e1",
    fontWeight: "700",
  },
  modalDangerBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#7f1d1d",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDangerText: {
    color: "#fee2e2",
    fontWeight: "700",
  },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#facc15",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    color: "#111827",
    fontWeight: "800",
  },
});

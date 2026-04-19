import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, RouteCard, SectionTitle } from "../components/ui";
import { TrackTrailRoute } from "../models/alerts";
import { listOfflineRoutes, removeOfflineRoute } from "../storage/offlineRoutes";
import { colors, layout, spacing } from "../theme/designSystem";

type OfflineItem = {
  route: TrackTrailRoute;
  downloadedAt: string;
};

export default function OfflineRoutesScreen({ navigation }: any) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadOfflineItems = async () => {
    try {
      setLoading(true);
      const list = await listOfflineRoutes();
      setItems(list.map((item) => ({ route: item.route, downloadedAt: item.downloadedAt })));
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível carregar as rotas offline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    loadOfflineItems();
  }, [isFocused]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const title = String(item.route.titulo || "").toLowerCase();
      const desc = String(item.route.descricao || "").toLowerCase();
      const type = String(item.route.tipo || "").toLowerCase();
      return title.includes(normalized) || desc.includes(normalized) || type.includes(normalized);
    });
  }, [items, query]);

  const handleRemove = (routeId: string) => {
    Alert.alert("Remover offline", "Deseja remover esta rota do armazenamento offline?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          try {
            setRemovingId(routeId);
            await removeOfflineRoute(routeId);
            await loadOfflineItems();
          } catch (error: any) {
            Alert.alert("Erro", error?.message || "Não foi possível remover a rota offline.");
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SectionTitle
          title="Rotas Offline"
          subtitle={`${items.length} rota(s) baixada(s) para uso sem internet`}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar rota offline"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.route.id}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 32) }}
        ListEmptyComponent={
          <EmptyState
            title="Nenhuma rota offline"
            description="Abra uma rota e use 'Baixar rota offline' para salvá-la."
            icon="cloud-download-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.routeWrap}>
            <RouteCard
              route={item.route}
              onPress={() => navigation.navigate("RouteDetail", { routeData: item.route })}
              footerAction={
                <View style={styles.footerRow}>
                  <Text style={styles.downloadedAtText}>
                    Baixada em {new Date(item.downloadedAt).toLocaleString("pt-BR")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemove(item.route.id)}
                    style={styles.removeBtn}
                    disabled={removingId === item.route.id}
                  >
                    {removingId === item.route.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingTop: spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  routeWrap: {
    marginBottom: spacing.xs,
  },
  footerRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  downloadedAtText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(239,68,68,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
});

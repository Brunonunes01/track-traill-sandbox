import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { MapPressEvent, Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import { calculateDistanceKm, saveManualRoute } from "../services/routeService";
import { FALLBACK_REGION, toCoordinate } from "../utils/geo";

type Coordinate = { latitude: number; longitude: number };

const ACTIVITY_TYPES = ["Caminhada", "Corrida", "Ciclismo", "Trilha"];
const DIFFICULTIES = ["Fácil", "Média", "Difícil"];
const VISIBILITY_OPTIONS: { value: "public" | "friends" | "private"; label: string }[] = [
  { value: "public", label: "App inteiro" },
  { value: "friends", label: "Somente amigos" },
  { value: "private", label: "Só para mim" },
];

const getPathDistanceKm = (points: Coordinate[]) => {
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    total += calculateDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude);
  }

  return total;
};

export default function TraceRouteScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [points, setPoints] = useState<Coordinate[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Trilha");
  const [difficulty, setDifficulty] = useState("Média");
  const [visibility, setVisibility] = useState<"public" | "friends" | "private">("public");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const centerOnUser = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") return;

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const safe = toCoordinate(location.coords);
        if (!mounted || !safe) return;

        mapRef.current?.animateCamera({ center: safe, zoom: 15 });
      } catch (error: any) {
        console.warn("[trace-route] centerOnUser failed:", error?.message || String(error));
      }
    };

    centerOnUser();

    return () => {
      mounted = false;
    };
  }, []);

  const distanceKm = useMemo(() => getPathDistanceKm(points), [points]);
  const intermediatePoints = useMemo(
    () => (points.length > 2 ? points.slice(1, -1) : []),
    [points]
  );

  const handleMapPress = (event: MapPressEvent) => {
    const safe = toCoordinate(event.nativeEvent.coordinate);
    if (!safe) return;

    setPoints((current) => [...current, safe]);
  };

  const handleUndo = () => {
    setPoints((current) => current.slice(0, -1));
  };

  const handleClear = () => {
    setPoints([]);
  };

  const handleSaveRoute = async () => {
    if (points.length < 2) {
      Alert.alert("Rota incompleta", "Adicione ao menos dois pontos para salvar.");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Nome obrigatório", "Informe um nome para a rota.");
      return;
    }

    try {
      setSaving(true);
      const saved = await saveManualRoute(
        {
          title,
          type,
          difficulty,
          description,
          points,
          distanceKm,
          visibility,
        },
        auth.currentUser
      );

      if (saved.reviewRequired) {
        Alert.alert(
          "Rota enviada para análise",
          "A rota foi enviada para o painel de moderação e ficará disponível após aprovação."
        );
        navigation.goBack();
      } else {
        Alert.alert("Rota salva", "Sua rota foi salva na sua conta.", [
          {
            text: "Abrir detalhes",
            onPress: () => navigation.replace("RouteDetail", { routeData: saved }),
          },
        ]);
      }
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível salvar a rota.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={FALLBACK_REGION}
        showsUserLocation
        onPress={handleMapPress}
      >
        {points.length > 0 ? (
          <Marker coordinate={points[0]} title="Início">
            <Ionicons name="location" size={34} color="#22c55e" />
          </Marker>
        ) : null}

        {points.length > 1 ? (
          <Marker coordinate={points[points.length - 1]} title="Fim">
            <Ionicons name="flag" size={34} color="#ef4444" />
          </Marker>
        ) : null}

        {points.length > 1 ? (
          <Polyline coordinates={points} strokeColor="#facc15" strokeWidth={5} />
        ) : null}

        {intermediatePoints.map((point, index) => (
          <Marker
            key={`waypoint-${index}-${point.latitude}-${point.longitude}`}
            coordinate={point}
            title={`Ponto ${index + 2}`}
            description="Ponto intermediário do traçado manual"
          >
            <Ionicons name="ellipse" size={14} color="#f59e0b" />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}> 
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.distanceBadge}>
          <Ionicons name="analytics" size={15} color="#111827" />
          <Text style={styles.distanceText}>{distanceKm.toFixed(2)} km</Text>
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={handleClear}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.helpBadge}>
        <Text style={styles.helpText}>
          Traçar rota: adicione múltiplos pontos para montar o caminho manual em sequência.
        </Text>
      </View>

      <View style={styles.pointsBadge}>
        <Ionicons name="git-network-outline" size={14} color="#d1d5db" />
        <Text style={styles.pointsText}>{points.length} pontos no traçado</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetTitle}>Traçar rota</Text>

          <Text style={styles.label}>Nome da rota</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Volta do Parque"
            placeholderTextColor="#6b7280"
          />

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.chipsRow}>
            {ACTIVITY_TYPES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setType(item)}
                style={[styles.chip, type === item ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, type === item ? styles.chipTextActive : null]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Dificuldade</Text>
          <View style={styles.chipsRow}>
            {DIFFICULTIES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setDifficulty(item)}
                style={[styles.chip, difficulty === item ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, difficulty === item ? styles.chipTextActive : null]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Descreva terreno, pontos de atenção e dicas."
            placeholderTextColor="#6b7280"
          />

          <Text style={styles.label}>Visibilidade da rota</Text>
          <View style={styles.chipsRow}>
            {VISIBILITY_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.value}
                onPress={() => setVisibility(item.value)}
                style={[styles.chip, visibility === item.value ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, visibility === item.value ? styles.chipTextActive : null]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.visibilityHint}>
            {visibility === "public"
              ? "Rotas públicas vão para moderação no painel admin (rotas pendentes)."
              : "Rotas não públicas são salvas apenas na sua conta."}
          </Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleUndo}>
              <Ionicons name="arrow-undo" size={16} color="#d1d5db" />
              <Text style={styles.secondaryText}>Desfazer ponto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveRoute} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#111827" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={17} color="#111827" />
                  <Text style={styles.primaryText}>Salvar rota</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    borderWidth: 1,
    borderColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#facc15",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  distanceText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  helpBadge: {
    position: "absolute",
    top: 96,
    alignSelf: "center",
    maxWidth: "90%",
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  helpText: {
    color: "#d1d5db",
    fontSize: 12,
    textAlign: "center",
  },
  pointsBadge: {
    position: "absolute",
    top: 140,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pointsText: {
    color: "#d1d5db",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetWrap: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    maxHeight: "48%",
  },
  sheet: {
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 16,
    paddingBottom: 26,
  },
  sheetTitle: {
    color: "#f8fafc",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },
  label: {
    color: "#e2e8f0",
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    color: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: {
    minHeight: 72,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipActive: {
    borderColor: "#facc15",
    backgroundColor: "rgba(250, 204, 21, 0.2)",
  },
  chipText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#fde68a",
  },
  visibilityHint: {
    color: "#93c5fd",
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1f2937",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryText: {
    color: "#d1d5db",
    fontWeight: "700",
    fontSize: 12,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#facc15",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 12,
  },
});

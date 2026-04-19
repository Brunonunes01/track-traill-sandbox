import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import { ALERT_TYPE_META, ALERT_TYPES, AlertType } from "../models/alerts";
import { createAlert } from "../services/alertService";
import { FALLBACK_REGION, getRegionWithFallback, toCoordinate } from "../utils/geo";

type AlertFormParams = {
  routeId?: string;
  routeName?: string;
  latitude?: number;
  longitude?: number;
};

type AlertFormScreenProps = {
  navigation?: any;
  route?: any;
};

export default function AlertFormScreen(props: AlertFormScreenProps) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const params = props.route?.params || hookRoute.params;
  const initialParams = (params || {}) as AlertFormParams;
  const insets = useSafeAreaInsets();
  const safeInitialPoint = toCoordinate({
    latitude: initialParams.latitude,
    longitude: initialParams.longitude,
  });

  const [type, setType] = useState<AlertType>("acidente");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState<number | null>(safeInitialPoint?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(safeInitialPoint?.longitude ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const availableTypes = useMemo(() => ALERT_TYPES, []);

  const mapRegion = useMemo(
    () =>
      getRegionWithFallback(
        { latitude, longitude },
        FALLBACK_REGION,
        { latitudeDelta: 0.01, longitudeDelta: 0.01 }
      ),
    [latitude, longitude]
  );

  const requestCurrentPosition = async () => {
    try {
      setLoadingLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        console.warn("[alert-form] location permission denied");
        Alert.alert("Permissão necessária", "Ative o GPS para preencher as coordenadas.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      const safeCurrent = toCoordinate(current.coords);
      if (!safeCurrent) {
        Alert.alert("Erro", "Coordenadas de localização inválidas.");
        return;
      }

      setLatitude(safeCurrent.latitude);
      setLongitude(safeCurrent.longitude);
    } catch (error: any) {
      console.warn("[alert-form] requestCurrentPosition failed:", error?.message || String(error));
      Alert.alert("Erro", "Não foi possível obter sua localização.");
    } finally {
      setLoadingLocation(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permissão necessária", "Permita acesso à galeria para anexar foto.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.35,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        setPhotoUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (error: any) {
      console.warn("[alert-form] handlePickImage failed:", error?.message || String(error));
      Alert.alert("Erro", "Não foi possível abrir a galeria.");
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert("Campo obrigatório", "Descreva o problema para registrar o alerta.");
      return;
    }

    if (latitude === null || longitude === null) {
      Alert.alert("Localização obrigatória", "Selecione uma posição no mapa.");
      return;
    }

    try {
      setSubmitting(true);

      const created = await createAlert(
        {
          type,
          description,
          latitude,
          longitude,
          routeId: initialParams.routeId || null,
          routeName: initialParams.routeName || null,
          status: "ativo",
          photoUrl,
        },
        auth.currentUser
      );

      Alert.alert("Alerta registrado", "Seu alerta já está visível para os outros usuários.", [
        {
          text: "Abrir detalhe",
          onPress: () => navigation.replace("AlertDetail", { alertData: created }),
        },
      ]);
    } catch (error: any) {
      Alert.alert("Erro ao registrar", error?.message || "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Registrar alerta</Text>

        <TouchableOpacity style={styles.headerIconBtn} onPress={requestCurrentPosition}>
          {loadingLocation ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="locate" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Rota vinculada</Text>
        <Text style={styles.routeBadge}>
          {initialParams.routeName || "Sem rota vinculada (alerta geral de localização)"}
        </Text>

        <Text style={styles.label}>Tipo do alerta</Text>
        <View style={styles.typeGrid}>
          {availableTypes.map((alertType) => {
            const meta = ALERT_TYPE_META[alertType];
            const active = type === alertType;
            return (
              <TouchableOpacity
                key={alertType}
                style={[
                  styles.typeChip,
                  { borderColor: active ? meta.color : "#374151", backgroundColor: active ? "#111827" : "#030712" },
                ]}
                onPress={() => setType(alertType)}
              >
                <Ionicons name={meta.icon as any} size={14} color={active ? meta.color : "#9ca3af"} />
                <Text style={[styles.typeChipText, { color: active ? "#fff" : "#9ca3af" }]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={styles.descriptionInput}
          multiline
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
          placeholder="Exemplo: trilha bloqueada por queda de árvore no trecho principal"
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Tempo de vida do alerta</Text>
        <Text style={styles.routeBadge}>
          O alerta é publicado como ativo e fica visível por tempo limitado.
        </Text>

        <Text style={styles.label}>Local do alerta</Text>
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={mapRegion}
          region={mapRegion}
          onPress={(event) => {
            const safeCoordinate = toCoordinate(event.nativeEvent.coordinate);
            if (!safeCoordinate) {
              console.warn("[alert-form] ignored invalid map press coordinate");
              return;
            }
            setLatitude(safeCoordinate.latitude);
            setLongitude(safeCoordinate.longitude);
          }}
        >
          {latitude !== null && longitude !== null ? (
            <Marker
              coordinate={{ latitude, longitude }}
              draggable
              onDragEnd={(event) => {
                const safeCoordinate = toCoordinate(event.nativeEvent.coordinate);
                if (!safeCoordinate) {
                  console.warn("[alert-form] ignored invalid marker drag coordinate");
                  return;
                }
                setLatitude(safeCoordinate.latitude);
                setLongitude(safeCoordinate.longitude);
              }}
            >
              <Ionicons name="warning" size={34} color="#ef4444" />
            </Marker>
          ) : null}
        </MapView>

        <Text style={styles.coordinatesText}>
          {latitude !== null && longitude !== null
            ? `Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)}`
            : "Toque no mapa para escolher o ponto exato do alerta."}
        </Text>

        <Text style={styles.label}>Foto opcional</Text>
        <TouchableOpacity style={styles.photoBtn} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={18} color="#d1d5db" />
          <Text style={styles.photoBtnText}>{photoUrl ? "Trocar foto" : "Adicionar foto"}</Text>
        </TouchableOpacity>

        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photoPreview} /> : null}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#000" />
              <Text style={styles.submitText}>Publicar alerta</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  headerRow: {
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    color: "#e5e7eb",
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 12,
  },
  routeBadge: {
    color: "#d1d5db",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    padding: 10,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  descriptionInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
    color: "#fff",
    padding: 12,
  },
  map: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
  },
  coordinatesText: {
    color: "#9ca3af",
    marginTop: 8,
    fontSize: 12,
  },
  photoBtn: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoBtnText: {
    color: "#d1d5db",
    fontWeight: "700",
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginTop: 10,
  },
  submitBtn: {
    marginTop: 18,
    backgroundColor: "#ffd700",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitText: {
    color: "#000",
    fontWeight: "800",
  },
});

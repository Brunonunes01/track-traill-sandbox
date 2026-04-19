import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { useMemo, useState } from "react";
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
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../services/connectionFirebase";
import { POI_TYPE_META, POI_TYPES, POIType } from "../models/poi";
import { createPOI } from "../services/poiService";
import { FALLBACK_REGION, getRegionWithFallback, toCoordinate } from "../utils/geo";

type POIFormParams = {
  latitude?: number;
  longitude?: number;
};

type POIFormScreenProps = {
  navigation?: any;
  route?: any;
};

export default function POIFormScreen(props: POIFormScreenProps) {
  const hookNavigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const navigation = props.navigation || hookNavigation;
  const params = props.route?.params || hookRoute.params;
  const initialParams = (params || {}) as POIFormParams;
  const insets = useSafeAreaInsets();

  const safeInitialPoint = toCoordinate({
    latitude: initialParams.latitude,
    longitude: initialParams.longitude,
  });

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<POIType>("cachoeira");
  const [latitude, setLatitude] = useState<number | null>(safeInitialPoint?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(safeInitialPoint?.longitude ?? null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [saving, setSaving] = useState(false);

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
        Alert.alert("Permissão necessária", "Ative a localização para preencher as coordenadas do POI.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const safeCurrent = toCoordinate(current.coords);
      if (!safeCurrent) {
        Alert.alert("Erro", "Coordenadas inválidas retornadas pelo GPS.");
        return;
      }

      setLatitude(safeCurrent.latitude);
      setLongitude(safeCurrent.longitude);
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível obter sua localização.");
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!titulo.trim()) {
      Alert.alert("Campo obrigatório", "Informe um título para o ponto de interesse.");
      return;
    }

    if (latitude === null || longitude === null) {
      Alert.alert("Localização obrigatória", "Selecione o ponto no mapa ou use sua localização atual.");
      return;
    }

    try {
      setSaving(true);
      await createPOI(
        {
          titulo,
          descricao,
          tipo,
          coordenadas: { latitude, longitude },
        },
        auth.currentUser
      );

      Alert.alert("POI criado", "Ponto de interesse salvo com sucesso.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível salvar o ponto de interesse.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Novo ponto de interesse</Text>

        <TouchableOpacity style={styles.headerIconBtn} onPress={requestCurrentPosition}>
          {loadingLocation ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="locate" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Tipo de local</Text>
        <View style={styles.typeGrid}>
          {POI_TYPES.map((item) => {
            const meta = POI_TYPE_META[item];
            const active = item === tipo;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.typeChip,
                  {
                    borderColor: active ? meta.color : "#334155",
                    backgroundColor: active ? "rgba(15, 23, 42, 0.95)" : "#020617",
                  },
                ]}
                onPress={() => setTipo(item)}
              >
                <Ionicons name={meta.icon as any} size={14} color={active ? meta.color : "#94a3b8"} />
                <Text style={[styles.typeChipText, { color: active ? "#e2e8f0" : "#94a3b8" }]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ex: Cachoeira do Vale"
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          multiline
          textAlignVertical="top"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Dicas de acesso, nível de dificuldade, estrutura local..."
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.label}>Localização do POI</Text>
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={mapRegion}
          region={mapRegion}
          onPress={(event) => {
            const safeCoordinate = toCoordinate(event.nativeEvent.coordinate);
            if (!safeCoordinate) return;
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
                if (!safeCoordinate) return;
                setLatitude(safeCoordinate.latitude);
                setLongitude(safeCoordinate.longitude);
              }}
            >
              <Ionicons name={(POI_TYPE_META[tipo].icon as any) || "pin"} size={32} color={POI_TYPE_META[tipo].color} />
            </Marker>
          ) : null}
        </MapView>

        <Text style={styles.coordinatesText}>
          {latitude !== null && longitude !== null
            ? `Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)}`
            : "Toque no mapa para marcar o ponto de interesse."}
        </Text>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#000" />
              <Text style={styles.submitText}>Salvar ponto de interesse</Text>
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
    fontSize: 17,
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
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
    color: "#fff",
    padding: 12,
  },
  multilineInput: {
    minHeight: 88,
  },
  map: {
    borderRadius: 12,
    overflow: "hidden",
    height: 220,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  coordinatesText: {
    color: "#94a3b8",
    marginTop: 8,
    fontSize: 12,
  },
  submitBtn: {
    marginTop: 16,
    backgroundColor: "#facc15",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "800",
  },
});

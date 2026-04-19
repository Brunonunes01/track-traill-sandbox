import * as Location from "expo-location";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../services/connectionFirebase";
import { PrivacyZone } from "../models/privacyZone";
import { getUserPrivacyZone, saveUserPrivacyZone } from "../services/privacyZoneService";

export default function PrivacyZoneScreen() {
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zone, setZone] = useState<PrivacyZone>({
    centerLatitude: 0,
    centerLongitude: 0,
    radiusMeters: 180,
    enabled: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setUid(user?.uid || ""));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const existing = await getUserPrivacyZone(uid);
        if (existing) {
          setZone(existing);
        } else {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === "granted") {
            const current = await Location.getCurrentPositionAsync({});
            setZone((prev) => ({
              ...prev,
              centerLatitude: current.coords.latitude,
              centerLongitude: current.coords.longitude,
            }));
          }
        }
      } catch (error: any) {
        Alert.alert("Erro", error?.message || "Falha ao carregar zona.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [uid]);

  const onSave = async () => {
    if (!uid) {
      Alert.alert("Erro", "Faça login para salvar.");
      return;
    }

    try {
      setSaving(true);
      await saveUserPrivacyZone(uid, zone);
      Alert.alert("Sucesso", "Zona de privacidade atualizada.");
    } catch (error: any) {
      Alert.alert("Erro", error?.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zona de privacidade</Text>
      <Text style={styles.subtitle}>
        Ao publicar atividade, os pontos no começo/fim dentro desse raio são ocultados.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Ativar proteção</Text>
        <Switch
          value={zone.enabled}
          onValueChange={(value) => setZone((prev) => ({ ...prev, enabled: value }))}
        />
      </View>

      <Text style={styles.label}>Latitude central</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={String(zone.centerLatitude || "")}
        onChangeText={(value) =>
          setZone((prev) => ({ ...prev, centerLatitude: Number(value.replace(",", ".")) || 0 }))
        }
      />

      <Text style={styles.label}>Longitude central</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={String(zone.centerLongitude || "")}
        onChangeText={(value) =>
          setZone((prev) => ({ ...prev, centerLongitude: Number(value.replace(",", ".")) || 0 }))
        }
      />

      <Text style={styles.label}>Raio (metros)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(zone.radiusMeters || "")}
        onChangeText={(value) =>
          setZone((prev) => ({ ...prev, radiusMeters: Number(value.replace(",", ".")) || 0 }))
        }
      />

      <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>Salvar zona</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", padding: 14 },
  centered: { flex: 1, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 4, marginBottom: 14 },
  row: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: { color: "#dbeafe", marginBottom: 6, fontWeight: "700", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
  },
  saveBtn: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#1e4db7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  saveText: { color: "#fff", fontWeight: "700" },
});

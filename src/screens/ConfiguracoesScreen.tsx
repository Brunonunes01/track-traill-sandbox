import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type ConfiguracoesScreenProps = {
  navigation?: any;
};

const items = [
  {
    title: "Segmentos",
    subtitle: "Criar segmentos e ver leaderboard",
    icon: "speedometer-outline",
    route: "Segments",
  },
  {
    title: "Zona de privacidade",
    subtitle: "Oculta início/fim próximo de casa",
    icon: "shield-checkmark-outline",
    route: "PrivacyZone",
  },
  {
    title: "Importar / Exportar GPX",
    subtitle: "Trazer trilhas e exportar atividades",
    icon: "document-text-outline",
    route: "ActivityFiles",
  },
  {
    title: "Sensores BLE",
    subtitle: "Base para FC e cadência",
    icon: "bluetooth-outline",
    route: "Sensors",
  },
];

export default function ConfiguracoesScreen(props: ConfiguracoesScreenProps) {
  const navigation = props.navigation;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Configurações avançadas</Text>
        <Text style={styles.subtitle}>
          Ajustes técnicos para rastreamento, privacidade e interoperabilidade.
        </Text>

        {items.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.card}
            onPress={() => navigation?.navigate?.(item.route)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon as any} size={20} color="#bfdbfe" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#93c5fd" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 14, gap: 10, paddingBottom: 30 },
  title: { color: "#f8fafc", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginBottom: 8 },
  card: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(30,64,175,0.25)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1 },
  cardTitle: { color: "#e2e8f0", fontSize: 15, fontWeight: "700" },
  cardSubtitle: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
});

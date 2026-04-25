import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type AjudaScreenProps = {
  navigation?: any;
};

const HELP_ITEMS = [
  {
    key: "friends",
    title: "Amigos e comunidade",
    subtitle: "Gerencie amizades e veja o feed de atividades compartilhadas.",
    icon: "people-outline",
    actionLabel: "Abrir Amigos",
    onPress: (navigation: any) => navigation?.navigate?.("Amigos"),
  },
  {
    key: "routes",
    title: "Rotas e navegação",
    subtitle: "Crie rotas, acompanhe no mapa e baixe para uso offline.",
    icon: "map-outline",
    actionLabel: "Abrir Próximas",
    onPress: (navigation: any) => navigation?.navigate?.("Próximas"),
  },
  {
    key: "settings",
    title: "Configurações avançadas",
    subtitle: "Privacidade, sensores BLE, arquivos GPX e segmentos.",
    icon: "settings-outline",
    actionLabel: "Abrir Configurações",
    onPress: (navigation: any) => navigation?.navigate?.("Configuracoes"),
  },
  {
    key: "contact",
    title: "Falar com suporte",
    subtitle: "Entre em contato por e-mail para relatar problema ou tirar dúvidas.",
    icon: "mail-outline",
    actionLabel: "Enviar e-mail",
    onPress: async () => {
      const emailUrl = "mailto:suporte.tracktrail@gmail.com?subject=Suporte%20Track%20%26%20Trail";
      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
      }
    },
  },
];

export default function AjudaScreen(props: AjudaScreenProps) {
  const navigation = props.navigation;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ajuda e suporte</Text>
        <Text style={styles.subtitle}>
          Acesse atalhos rápidos para resolver dúvidas e problemas comuns.
        </Text>

        {HELP_ITEMS.map((item) => (
          <View key={item.key} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon as any} size={20} color="#bfdbfe" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={() => item.onPress(navigation)}>
                <Text style={styles.actionText}>{item.actionLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    alignItems: "flex-start",
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
  actionBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0b1220",
  },
  actionText: { color: "#bfdbfe", fontSize: 12, fontWeight: "700" },
});

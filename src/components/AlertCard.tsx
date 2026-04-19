import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ALERT_TYPE_META, TrailAlert } from "../models/alerts";

type AlertCardProps = {
  alert: TrailAlert;
  compact?: boolean;
  onPress?: () => void;
};

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Data indisponível";

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

export default function AlertCard({ alert, compact, onPress }: AlertCardProps) {
  const meta = ALERT_TYPE_META[alert.type] || ALERT_TYPE_META.outro;
  const statusColor =
    alert.status === "ativo"
      ? "#ef4444"
      : alert.status === "resolvido"
        ? "#10b981"
        : alert.status === "expirado"
          ? "#f59e0b"
          : "#9ca3af";
  const expirationLabel = formatDate(alert.expiresAt);
  const confidence = Math.max(0, Math.min(100, Math.round(alert.confidenceScore || 0)));
  const risk = Math.max(0, Math.min(100, Math.round(alert.riskScore || 0)));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, compact ? styles.cardCompact : null]}
    >
      <View style={styles.headerRow}>
        <View style={styles.typeRow}>
          <View style={[styles.iconDot, { backgroundColor: meta.color }]}>
            <Ionicons name={meta.icon as any} size={14} color="#fff" />
          </View>
          <Text style={styles.typeText}>{meta.label}</Text>
        </View>

        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{alert.status}</Text>
        </View>
      </View>

      <Text numberOfLines={compact ? 2 : 3} style={styles.description}>
        {alert.description}
      </Text>

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.dateText}>Criado: {formatDate(alert.createdAt)}</Text>
          <Text style={styles.expireText}>Expira: {expirationLabel}</Text>
          <Text style={styles.confidenceText}>Confiabilidade: {confidence}%</Text>
        </View>
        <View style={styles.metaRight}>
          <View style={styles.confirmRow}>
            <Ionicons name="checkmark-done" size={15} color="#9ca3af" />
            <Text style={styles.confirmText}>{alert.confirmations}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Ionicons name="flag-outline" size={14} color="#f59e0b" />
            <Text style={styles.confirmText}>{alert.reportCount || 0}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Ionicons name="pulse-outline" size={14} color="#f87171" />
            <Text style={styles.confirmText}>Risco: {risk}%</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 12,
  },
  cardCompact: {
    padding: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  iconDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  typeText: {
    color: "#f9fafb",
    fontWeight: "700",
    fontSize: 14,
    flexShrink: 1,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  description: {
    color: "#d1d5db",
    lineHeight: 19,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
  },
  dateText: {
    color: "#9ca3af",
    fontSize: 12,
    flexShrink: 1,
  },
  expireText: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  confidenceText: {
    color: "#93c5fd",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },
  metaRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  confirmText: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
  },
});

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ALERT_TYPE_META, TrailAlert } from "../models/alerts";

type AlertMarkerProps = {
  alert: TrailAlert;
  selected?: boolean;
};

export default function AlertMarker({ alert, selected }: AlertMarkerProps) {
  const meta = ALERT_TYPE_META[alert.type] || ALERT_TYPE_META["outro"];
  const markerColor =
    alert.status === "resolvido"
      ? "#4b5563"
      : alert.status === "expirado"
        ? "#b45309"
        : alert.status === "removido"
          ? "#6b7280"
          : meta?.color || "#6b7280";
  const markerIcon = (meta?.icon || "alert-circle") as keyof typeof Ionicons.glyphMap;

  return (
    <View
      style={[
        styles.marker,
        { backgroundColor: markerColor },
        selected ? styles.markerSelected : null,
      ]}
    >
      <Ionicons name={markerIcon as any} size={18} color="#fff" />
      {alert.status === "resolvido" ? (
        <View style={styles.resolvedBadge} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerSelected: {
    transform: [{ scale: 1.15 }],
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  resolvedBadge: {
    position: "absolute",
    right: -1,
    top: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#9ca3af",
    borderWidth: 1,
    borderColor: "#fff",
  },
});

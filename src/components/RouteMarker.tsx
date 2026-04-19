import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type RouteMarkerProps = {
  type: string;
  selected?: boolean;
  activeAlertsCount?: number;
};

const getIcon = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized.includes("ciclismo") || normalized.includes("bike")) return "bicycle";
  if (normalized.includes("corrida") || normalized.includes("run")) return "barbell-outline";
  return "walk";
};

export default function RouteMarker({
  type,
  selected,
  activeAlertsCount = 0,
}: RouteMarkerProps) {
  return (
    <View style={[styles.marker, selected ? styles.selected : null]}>
      <Ionicons name={getIcon(type) as any} size={20} color="#fff" />
      {activeAlertsCount > 0 ? (
        <View style={styles.alertBadge}>
          <Text style={styles.alertBadgeText}>{activeAlertsCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1e4db7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  selected: {
    backgroundColor: "#ffd700",
    transform: [{ scale: 1.15 }],
  },
  alertBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  alertBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});

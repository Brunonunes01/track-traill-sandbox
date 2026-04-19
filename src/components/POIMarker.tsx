import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { POI_TYPE_META, PointOfInterest } from "../models/poi";

type POIMarkerProps = {
  poi: PointOfInterest;
  selected?: boolean;
};

export default function POIMarker({ poi, selected }: POIMarkerProps) {
  const meta = POI_TYPE_META[poi.tipo];

  return (
    <View style={[styles.marker, { backgroundColor: meta.color }, selected ? styles.markerSelected : null]}>
      <Ionicons name={meta.icon as any} size={17} color="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  markerSelected: {
    transform: [{ scale: 1.15 }],
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});

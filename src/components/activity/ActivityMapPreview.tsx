import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

export default function ActivityMapPreview({
  points,
  highlightedPoint,
  style,
}: {
  points: { latitude: number; longitude: number }[];
  highlightedPoint?: { latitude: number; longitude: number } | null;
  style?: any;
}) {
  if (points.length === 0) return <View style={[styles.empty, style]} />;

  const initialRegion = {
    latitude: points[0].latitude,
    longitude: points[0].longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <MapView style={[styles.map, style]} provider={PROVIDER_DEFAULT} initialRegion={initialRegion}>
      <Polyline coordinates={points} strokeColor="#38bdf8" strokeWidth={5} />
      <Marker coordinate={points[0]} title="Início" />
      <Marker coordinate={points[points.length - 1]} title="Fim" />
      {highlightedPoint ? <Marker coordinate={highlightedPoint} title="Ponto selecionado" pinColor="#f97316" /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 12, overflow: "hidden" },
  empty: {
    height: 220,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
  },
});

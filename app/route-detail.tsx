import { useLocalSearchParams } from "expo-router";
import React from "react";
import RouteDetailScreen from "../src/screens/RouteDetailScreen";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function RouteDetailRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <RouteDetailScreen navigation={navigation} route={{ params }} />;
}

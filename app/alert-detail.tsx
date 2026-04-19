import { useLocalSearchParams } from "expo-router";
import React from "react";
import AlertDetailScreen from "../src/screens/AlertDetailScreen";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function AlertDetailRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <AlertDetailScreen navigation={navigation} route={{ params }} />;
}

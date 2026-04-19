import { useLocalSearchParams } from "expo-router";
import React from "react";
import AlertFormScreen from "../src/screens/AlertFormScreen";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function AlertFormRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <AlertFormScreen navigation={navigation} route={{ params }} />;
}

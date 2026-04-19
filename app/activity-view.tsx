import { useLocalSearchParams } from "expo-router";
import React from "react";
import ActivityViewScreen from "../src/screens/ActivityViewScreen";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function ActivityViewRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <ActivityViewScreen navigation={navigation} route={{ params }} />;
}

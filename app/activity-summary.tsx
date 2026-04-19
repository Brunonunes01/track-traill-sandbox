import { useLocalSearchParams } from "expo-router";
import React from "react";
import ActivitySummaryScreen from "../src/screens/ActivitySummaryScreen";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function ActivitySummaryRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <ActivitySummaryScreen navigation={navigation} route={{ params }} />;
}

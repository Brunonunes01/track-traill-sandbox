import { useLocalSearchParams } from "expo-router";
import React from "react";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import SegmentLeaderboardScreen from "../src/screens/SegmentLeaderboardScreen";

export default function SegmentLeaderboardRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};
  return <SegmentLeaderboardScreen navigation={navigation} route={{ params }} />;
}

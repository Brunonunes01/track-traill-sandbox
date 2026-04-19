import { useLocalSearchParams } from "expo-router";
import React from "react";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import SegmentDetailScreen from "../src/screens/SegmentDetailScreen";

export default function SegmentDetailRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};
  return <SegmentDetailScreen navigation={navigation} route={{ params }} />;
}

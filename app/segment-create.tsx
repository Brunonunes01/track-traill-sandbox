import { useLocalSearchParams } from "expo-router";
import React from "react";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import SegmentCreateScreen from "../src/screens/SegmentCreateScreen";

export default function SegmentCreateRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};
  return <SegmentCreateScreen navigation={navigation} route={{ params }} />;
}

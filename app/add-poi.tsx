import { useLocalSearchParams } from "expo-router";
import React from "react";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import POIFormScreen from "../src/screens/POIFormScreen";

export default function AddPOIRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <POIFormScreen navigation={navigation} route={{ params }} />;
}

import { useLocalSearchParams } from "expo-router";
import React from "react";
import AtividadesScreen from "../../src/screens/AtividadesScreen";
import { getNavigationPayload } from "../../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../../src/navigation/useExpoNavigationBridge";

export default function AtividadesTabRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <AtividadesScreen navigation={navigation} route={{ params }} />;
}

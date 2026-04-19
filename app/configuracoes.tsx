import React from "react";
import ConfiguracoesScreen from "../src/screens/ConfiguracoesScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function ConfiguracoesRoute() {
  const navigation = useExpoNavigationBridge();
  return <ConfiguracoesScreen navigation={navigation} />;
}

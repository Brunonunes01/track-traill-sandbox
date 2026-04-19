import React from "react";
import PerfilScreen from "../../src/screens/PerfilScreen";
import { useExpoNavigationBridge } from "../../src/navigation/useExpoNavigationBridge";

export default function PerfilTabRoute() {
  const navigation = useExpoNavigationBridge();
  return <PerfilScreen navigation={navigation} />;
}

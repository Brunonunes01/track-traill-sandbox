import React from "react";
import RoutesScreen from "../../src/screens/RoutesScreen";
import { useExpoNavigationBridge } from "../../src/navigation/useExpoNavigationBridge";

export default function ProximasTabRoute() {
  const navigation = useExpoNavigationBridge();
  return <RoutesScreen navigation={navigation} />;
}

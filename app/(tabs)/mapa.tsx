import React from "react";
import HomeScreen from "../../src/screens/HomeScreen";
import { useExpoNavigationBridge } from "../../src/navigation/useExpoNavigationBridge";

export default function MapaTabRoute() {
  const navigation = useExpoNavigationBridge();
  return <HomeScreen navigation={navigation} />;
}

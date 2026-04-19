import React from "react";
import OfflineRoutesScreen from "../src/screens/OfflineRoutesScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function OfflineRoutesRoute() {
  const navigation = useExpoNavigationBridge();
  return <OfflineRoutesScreen navigation={navigation} />;
}

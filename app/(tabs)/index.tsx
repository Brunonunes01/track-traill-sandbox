import React from "react";
import SimpleHomeScreen from "../../src/screens/SimpleHomeScreen";
import { useExpoNavigationBridge } from "../../src/navigation/useExpoNavigationBridge";

export default function HomeTabRoute() {
  const navigation = useExpoNavigationBridge();
  return <SimpleHomeScreen navigation={navigation} />;
}

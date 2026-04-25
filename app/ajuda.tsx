import React from "react";
import AjudaScreen from "../src/screens/AjudaScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function AjudaRoute() {
  const navigation = useExpoNavigationBridge();
  return <AjudaScreen navigation={navigation} />;
}

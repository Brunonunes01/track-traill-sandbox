import React from "react";
import RegisterScreen from "../src/screens/RegisterScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function RegisterRoute() {
  const navigation = useExpoNavigationBridge();
  return <RegisterScreen navigation={navigation} />;
}

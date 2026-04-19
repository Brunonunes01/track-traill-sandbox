import React from "react";
import LoginScreen from "../src/screens/LoginScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function LoginRoute() {
  const navigation = useExpoNavigationBridge();
  return <LoginScreen navigation={navigation} />;
}

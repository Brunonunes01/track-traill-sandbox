import React from "react";
import CommunityScreen from "../src/screens/CommunityScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function CommunityRoute() {
  const navigation = useExpoNavigationBridge();
  return <CommunityScreen navigation={navigation} />;
}

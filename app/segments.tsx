import React from "react";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import SegmentsScreen from "../src/screens/SegmentsScreen";

export default function SegmentsRoute() {
  const navigation = useExpoNavigationBridge();
  return <SegmentsScreen navigation={navigation} />;
}

import React from "react";
import FriendsScreen from "../src/screens/FriendsScreen";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";

export default function FriendsRoute() {
  const navigation = useExpoNavigationBridge();
  return <FriendsScreen navigation={navigation} />;
}

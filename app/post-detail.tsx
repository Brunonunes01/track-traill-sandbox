import { useLocalSearchParams } from "expo-router";
import React from "react";
import { getNavigationPayload } from "../src/navigation/navPayloadStore";
import { useExpoNavigationBridge } from "../src/navigation/useExpoNavigationBridge";
import PostDetailScreen from "../src/screens/PostDetailScreen";

export default function PostDetailRoute() {
  const navigation = useExpoNavigationBridge();
  const { payloadId } = useLocalSearchParams<{ payloadId?: string }>();
  const params = getNavigationPayload(payloadId) || {};

  return <PostDetailScreen navigation={navigation} route={{ params }} />;
}

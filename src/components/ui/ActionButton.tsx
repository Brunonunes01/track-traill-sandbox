import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { colors, radius, shadows, spacing } from "../../theme/designSystem";

type ActionButtonProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function ActionButton({
  label,
  icon = "add",
  onPress,
  style,
}: ActionButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.button, style]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.white} />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.round,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    ...shadows.floating,
  },
  text: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
});

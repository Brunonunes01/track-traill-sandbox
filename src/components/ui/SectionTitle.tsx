import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography } from "../../theme/designSystem";

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export default function SectionTitle({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: SectionTitleProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity onPress={onActionPress}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  left: {
    flex: 1,
  },
  title: {
    ...typography.sectionTitle,
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xxs,
    fontSize: 13,
  },
  action: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
});

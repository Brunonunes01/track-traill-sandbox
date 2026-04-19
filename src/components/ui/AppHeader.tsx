import React, { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/designSystem";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
};

export default function AppHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
}: AppHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.side}>{leftAction}</View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.side, styles.sideRight]}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  side: {
    minWidth: 40,
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  center: {
    flex: 1,
  },
  title: {
    ...typography.sectionTitle,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xxs,
    fontSize: 12,
  },
});

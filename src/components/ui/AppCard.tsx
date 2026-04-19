import React, { ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { colors, radius, shadows, spacing } from "../../theme/designSystem";

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "glass";
  animated?: boolean;
};

export default function AppCard({
  children,
  style,
  variant = "default",
  animated = false,
}: AppCardProps) {
  const opacity = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animated ? 8 : 0)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animated, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.base,
        variant === "glass" ? styles.glass : styles.default,
        style,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    ...shadows.card,
  },
  default: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  glass: {
    backgroundColor: "rgba(11, 18, 32, 0.68)",
    borderColor: "rgba(186, 199, 223, 0.22)",
  },
});

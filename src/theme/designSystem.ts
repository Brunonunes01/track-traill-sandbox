import { TextStyle, ViewStyle } from "react-native";

export const colors = {
  background: "#0B1220",
  backgroundAlt: "#0F172A",
  surface: "#121C2E",
  surfaceAlt: "#1A2740",
  surfaceSoft: "#22314D",
  border: "#2B3B5C",
  textPrimary: "#F8FAFC",
  textSecondary: "#BAC7DF",
  textMuted: "#8B9BB8",
  primary: "#FC4C02",
  primaryPressed: "#DB4202",
  secondary: "#1E3A8A",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#38BDF8",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  round: 999,
} as const;

export const typography: Record<string, TextStyle> = {
  title: {
    fontFamily: "SpaceMono",
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontFamily: "SpaceMono",
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  button: {
    fontSize: 15,
    fontWeight: "700",
  },
};

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor: "#020617",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  floating: {
    shadowColor: "#020617",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
};

export const layout = {
  screenPaddingHorizontal: spacing.md,
  screenPaddingTop: spacing.xl,
} as const;

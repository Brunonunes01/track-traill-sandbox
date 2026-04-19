import React, { ReactNode } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/designSystem";

type AppInputProps = TextInputProps & {
  label?: string;
  error?: string;
  rightElement?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function AppInput({
  label,
  error,
  rightElement,
  containerStyle,
  style,
  ...props
}: AppInputProps) {
  const webInputStyle = Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : null;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput
          style={[styles.input, webInputStyle, style]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          {...props}
        />
        {rightElement}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    marginTop: spacing.xs,
    fontSize: 12,
  },
});

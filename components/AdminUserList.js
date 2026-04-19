import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../src/theme/designSystem";

export default function AdminUserList({
  title,
  users,
  emptyMessage,
  actionLabel,
  onActionPress,
  disableActionForUid,
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {users.length === 0 ? (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      ) : (
        users.map((user) => {
          const userRole = user.role === "admin" ? "admin" : "user";
          const actionDisabled = disableActionForUid === user.uid;

          return (
            <View key={user.uid} style={styles.userCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>
                  {user.fullName || user.username || "Usuário"}
                </Text>
                <Text style={styles.userEmail}>{user.email || "Sem e-mail"}</Text>
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{userRole.toUpperCase()}</Text>
              </View>

              {onActionPress && actionLabel ? (
                <TouchableOpacity
                  onPress={() => onActionPress(user)}
                  disabled={actionDisabled}
                  style={[styles.actionBtn, actionDisabled && styles.actionBtnDisabled]}
                >
                  <Ionicons name="person-remove-outline" size={16} color={colors.white} />
                  <Text style={styles.actionText}>{actionLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  title: {
    ...typography.cardTitle,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    gap: 10,
  },
  userName: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  userEmail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  actionBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 11,
  },
});

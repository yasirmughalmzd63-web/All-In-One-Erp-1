import React from "react";
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from "react-native";

import { useListAuditLogs } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type AuditLog = { id: number; userId?: number | null; userName?: string | null; action: string; entityType: string; entityId?: number | null; details?: string | null; createdAt: string };

const ACTION_COLORS: Record<string, string> = {
  create: "#16A34A",
  update: "#2563EB",
  delete: "#DC2626",
  payment: "#7C3AED",
  transfer: "#0891B2",
  login: "#D97706",
};

export default function AuditScreen() {
  const colors = useColors();
  const { data: raw, isLoading, refetch } = useListAuditLogs();
  const logs = (raw ?? []) as unknown as AuditLog[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={logs}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No audit logs</Text></View>}
          renderItem={({ item: log }) => {
            const actionColor = ACTION_COLORS[log.action] ?? colors.mutedForeground;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardRow}>
                  <View style={[styles.dot, { backgroundColor: actionColor }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <View style={[styles.actionBadge, { backgroundColor: actionColor + "20" }]}>
                        <Text style={[styles.actionText, { color: actionColor }]}>{log.action.toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.entityText, { color: colors.text }]}>{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</Text>
                    </View>
                    {log.details && <Text style={[styles.details, { color: colors.mutedForeground }]}>{log.details}</Text>}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{log.userName ?? (log.userId ? `User #${log.userId}` : "System")}</Text>
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{new Date(log.createdAt).toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: 1, padding: 12 },
  cardRow: { flexDirection: "row", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  entityText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  details: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 11 },
});

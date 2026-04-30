import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Category = { key: string; label: string; description: string };
type CountsResponse = {
  counts: Record<string, number>;
  categories: Category[];
  allTransactionalKeys: string[];
};

const CONFIRM_WORD = "RESET";

export default function ResetCenterScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [data, setData] = useState<CountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Confirmation modal state
  const [pending, setPending] = useState<{ key: string; label: string; description: string; total?: number } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await customFetch<CountsResponse>("/api/admin/reset/counts");
      setData(r);
    } catch (e) {
      Alert.alert("Failed to load", e instanceof Error ? e.message : "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const totalTransactional = data
    ? data.allTransactionalKeys.reduce((s, k) => s + (data.counts[k] ?? 0), 0)
    : 0;

  const askConfirm = (cat: { key: string; label: string; description: string }, total?: number) => {
    setPending({ ...cat, total });
    setConfirmText("");
  };

  const doReset = async () => {
    if (!pending) return;
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) {
      Alert.alert("Confirmation mismatch", `Please type ${CONFIRM_WORD} exactly to proceed.`);
      return;
    }
    setRunning(true);
    try {
      const r = await customFetch<{
        ok: boolean; cleared?: number; sideEffects?: string;
        results?: Array<{ key: string; cleared: number; sideEffects?: string }>;
        total?: number;
      }>(`/api/admin/reset/${pending.key}`, {
        method: "POST",
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      const cleared = r.total ?? r.cleared ?? 0;
      const extra = r.sideEffects ? `\n\n${r.sideEffects}` : "";
      const breakdown = r.results
        ? "\n\n" + r.results.map(x => `• ${x.key}: ${x.cleared} cleared${x.sideEffects ? ` (${x.sideEffects})` : ""}`).join("\n")
        : "";
      Alert.alert("Done", `${pending.label} cleared.\n\n${cleared} row(s) removed.${extra}${breakdown}`);
      setPending(null);
      setConfirmText("");
      await load();
    } catch (e) {
      Alert.alert("Reset failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setRunning(false);
    }
  };

  // ── Non-admin guard ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 8 }}>Admins Only</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 }}>
          The Reset Center is restricted to administrators.
        </Text>
        <TouchableOpacity onPress={() => router.back()}
          style={{ marginTop: 24, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={["#991B1B", "#DC2626"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#FFF", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Reset Center</Text>
            <Text style={styles.headerSub}>Clear application data safely · Admin only</Text>
          </View>
        </View>
        <View style={styles.warnBanner}>
          <Text style={styles.warnTitle}>⚠  These actions cannot be undone</Text>
          <Text style={styles.warnText}>
            Each clear permanently removes the selected data. Master data (users, customers, suppliers, products, accounts, wallets) is never deleted by these actions — only the transactions/balances tied to them.
          </Text>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>

          {/* CLEAR ALL — top banner */}
          <TouchableOpacity
            onPress={() => askConfirm(
              { key: "all-transactions", label: "ALL transactional data", description: "Wipes sales, purchases, expenses, credits, dollar wallet activity, app wallet activity, stock transfers, cash counts, currency transactions, HRM activity — and resets account/wallet balances and product stock to 0. Audit logs are kept." },
              totalTransactional,
            )}
            style={[styles.dangerCard, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#991B1B" }}>RESET ALL TRANSACTIONAL DATA</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#7F1D1D", marginTop: 4 }}>
              {totalTransactional.toLocaleString()} row(s) across all categories. Master data is preserved.
            </Text>
          </TouchableOpacity>

          {/* Per-category cards */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY CATEGORY</Text>
          {data?.categories.map(cat => {
            const count = data.counts[cat.key] ?? 0;
            const isBalanceReset = cat.key === "account-balances" || cat.key === "product-stock";
            const isAuditLogs = cat.key === "audit-logs";
            return (
              <View key={cat.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text, flex: 1, paddingRight: 8 }}>{cat.label}</Text>
                  <View style={{ backgroundColor: count > 0 ? "#FEF3C7" : colors.muted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: count > 0 ? "#92400E" : colors.mutedForeground }}>
                      {isBalanceReset ? `${count} row(s)` : `${count.toLocaleString()} row(s)`}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 6 }}>{cat.description}</Text>
                <TouchableOpacity
                  disabled={count === 0 && !isBalanceReset}
                  onPress={() => askConfirm(cat, count)}
                  style={{
                    marginTop: 12, borderRadius: 10, paddingVertical: 10, alignItems: "center",
                    backgroundColor: isAuditLogs ? "#7C3AED" : "#DC2626",
                    opacity: count === 0 && !isBalanceReset ? 0.4 : 1,
                  }}>
                  <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 13 }}>
                    {isBalanceReset ? "Reset to 0" : "Clear"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* CONFIRM MODAL */}
      <Modal visible={!!pending} animationType="fade" transparent onRequestClose={() => { if (!running) setPending(null); }}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 18, padding: 20 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#DC2626", marginBottom: 6 }}>
              Confirm: {pending?.label}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 12, lineHeight: 18 }}>
              {pending?.description}
            </Text>
            {pending?.total != null ? (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#991B1B" }}>
                  About to clear {pending.total.toLocaleString()} row(s)
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#7F1D1D", marginTop: 2 }}>
                  This action cannot be undone.
                </Text>
              </View>
            ) : null}
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 6 }}>
              TYPE "{CONFIRM_WORD}" TO PROCEED
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={colors.mutedForeground}
              editable={!running}
              style={{
                borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
                fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 14,
                color: colors.text, backgroundColor: colors.card,
                borderColor: confirmText.trim().toUpperCase() === CONFIRM_WORD ? "#DC2626" : colors.border,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity disabled={running} onPress={() => { setPending(null); setConfirmText(""); }}
                style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: running ? 0.6 : 1 }}>
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={running || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
                onPress={doReset}
                style={{
                  flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center",
                  backgroundColor: "#DC2626",
                  opacity: (running || confirmText.trim().toUpperCase() !== CONFIRM_WORD) ? 0.5 : 1,
                }}>
                <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 }}>
                  {running ? "Clearing..." : "Clear Now"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 18 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  warnBanner: { marginTop: 14, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  warnTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FEF3C7" },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.92)", marginTop: 4, lineHeight: 16 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  dangerCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});

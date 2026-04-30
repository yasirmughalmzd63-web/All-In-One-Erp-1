import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator, Alert, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Registration = {
  id: number; businessName: string; businessType: string;
  ownerName: string; email: string | null; phone: string | null;
  address: string | null; purpose: string | null;
  package: string; adminUsername: string;
  status: "pending" | "approved" | "rejected"; rejectionReason: string | null;
  createdAt: string;
};

const PKG_EMOJI: Record<string, string> = { free: "🆓", basic: "🟢", professional: "🔵", enterprise: "🟣" };
const PKG_LABEL: Record<string, string> = { free: "Free Starter", basic: "Basic", professional: "Professional", enterprise: "Enterprise" };
const PKG_PRICE: Record<string, string> = { free: "Free", basic: "₨999/mo", professional: "₨2,499/mo", enterprise: "₨4,999/mo" };
const PKG_IS_PAID: Record<string, boolean> = { free: false, basic: true, professional: true, enterprise: true };
const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  pending:  { bg: "#FFF7ED", text: "#92400E", border: "#FCD34D" },
  approved: { bg: "#ECFDF5", text: "#065F46", border: "#6EE7B7" },
  rejected: { bg: "#FEF2F2", text: "#991B1B", border: "#FCA5A5" },
};
const STATUS_EMOJI: Record<string, string> = { pending: "⏳", approved: "✅", rejected: "❌" };

export default function RegistrationsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "paid">("all");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    try {
      const data = await customFetch<Registration[]>("/api/registrations");
      setRegistrations(data);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleApprove = async (reg: Registration) => {
    Alert.alert(
      "Approve Business",
      `Approve "${reg.businessName}"?\n\nThis will create an admin account for @${reg.adminUsername} with the ${PKG_LABEL[reg.package] ?? reg.package} package.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setActionLoading(reg.id);
            try {
              await customFetch(`/api/registrations/${reg.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve" }),
              });
              await load();
              Alert.alert("Approved!", `@${reg.adminUsername} can now log in.`);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = async (reg: Registration) => {
    setRejectingId(reg.id);
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    setActionLoading(rejectingId);
    try {
      await customFetch(`/api/registrations/${rejectingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason.trim() || undefined }),
      });
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = registrations.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (planFilter === "free" && PKG_IS_PAID[r.package]) return false;
    if (planFilter === "paid" && !PKG_IS_PAID[r.package]) return false;
    return true;
  });
  const pendingCount = registrations.filter(r => r.status === "pending").length;
  const freeCount = registrations.filter(r => !PKG_IS_PAID[r.package]).length;
  const paidCount = registrations.filter(r => PKG_IS_PAID[r.package]).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 18, color: "rgba(255,255,255,0.8)" }}>‹</Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Back</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View>
            <Text style={styles.headerTitle}>Business Registrations</Text>
            <Text style={styles.headerSub}>
              {pendingCount > 0 ? `${pendingCount} pending approval` : "All caught up"}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={{ backgroundColor: "#FCD34D", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#78350F" }}>{pendingCount}</Text>
            </View>
          )}
        </View>
        {/* Paid / Free summary stats */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{freeCount}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.8)" }}>🆓 Free</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FCD34D" }}>{paidCount}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.8)" }}>💳 Paid</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{registrations.length}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.8)" }}>📋 Total</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Status filter tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, gap: 8, backgroundColor: colors.card }}>
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterTab, {
              backgroundColor: filter === f ? colors.primary : colors.input,
              borderColor: filter === f ? colors.primary : colors.border,
            }]}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: filter === f ? "#FFF" : colors.mutedForeground, textTransform: "capitalize" }}>
              {f === "all" ? "All" : STATUS_EMOJI[f] + " " + f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Plan filter tabs (Free / Paid) */}
      <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingBottom: 10, gap: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {([
          { key: "all", label: "All Plans" },
          { key: "free", label: "🆓 Free" },
          { key: "paid", label: "💳 Paid" },
        ] as const).map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setPlanFilter(f.key)}
            style={[styles.filterTab, {
              backgroundColor: planFilter === f.key ? (f.key === "free" ? "#059669" : f.key === "paid" ? "#D97706" : colors.primary) : colors.input,
              borderColor: planFilter === f.key ? (f.key === "free" ? "#059669" : f.key === "paid" ? "#D97706" : colors.primary) : colors.border,
            }]}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: planFilter === f.key ? "#FFF" : colors.mutedForeground }}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} />}
        >
          {filtered.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 16, color: colors.mutedForeground, marginTop: 12 }}>
                No {filter === "all" ? "" : filter} registrations
              </Text>
            </View>
          )}
          {filtered.map(reg => {
            const st = STATUS_COLOR[reg.status] ?? STATUS_COLOR.pending!;
            const isProcessing = actionLoading === reg.id;
            return (
              <View key={reg.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Status badge */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: st.text }}>
                      {STATUS_EMOJI[reg.status]} {reg.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                    #{reg.id} · {new Date(reg.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                {/* Business info */}
                <Text style={[styles.bizName, { color: colors.text }]}>{reg.businessName}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                  {reg.businessType} · {reg.ownerName}
                </Text>

                {/* Package badge — shows FREE / PAID + plan name + price */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <View style={[styles.pkgBadge, { backgroundColor: colors.input, borderColor: colors.border }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.text }}>
                      {PKG_EMOJI[reg.package] ?? "📦"} {PKG_LABEL[reg.package] ?? reg.package}
                    </Text>
                  </View>
                  {/* Paid / Free pill */}
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
                    backgroundColor: PKG_IS_PAID[reg.package] ? "#FEF3C7" : "#D1FAE5",
                    borderColor: PKG_IS_PAID[reg.package] ? "#FCD34D" : "#6EE7B7",
                  }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: PKG_IS_PAID[reg.package] ? "#92400E" : "#065F46" }}>
                      {PKG_IS_PAID[reg.package] ? `💳 ${PKG_PRICE[reg.package] ?? "Paid"}` : "🆓 Free"}
                    </Text>
                  </View>
                </View>

                {/* Contact info */}
                <View style={{ marginTop: 10, gap: 3 }}>
                  {reg.phone && <Text style={styles.infoLine}>📞 {reg.phone}</Text>}
                  {reg.email && <Text style={styles.infoLine}>✉️ {reg.email}</Text>}
                  {reg.address && <Text style={styles.infoLine}>📍 {reg.address}</Text>}
                  {reg.purpose && <Text style={[styles.infoLine, { color: colors.mutedForeground, fontStyle: "italic" }]}>"{reg.purpose}"</Text>}
                </View>

                {/* Admin username */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 8, backgroundColor: colors.input, borderRadius: 8 }}>
                  <Text style={{ fontSize: 13 }}>👤</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Admin login:</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: colors.text }}>@{reg.adminUsername}</Text>
                </View>

                {/* Rejection reason if rejected */}
                {reg.status === "rejected" && reg.rejectionReason && (
                  <View style={{ marginTop: 8, padding: 8, backgroundColor: "#FEF2F2", borderRadius: 8, borderWidth: 1, borderColor: "#FCA5A5" }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#991B1B" }}>Reason: {reg.rejectionReason}</Text>
                  </View>
                )}

                {/* Actions for pending */}
                {reg.status === "pending" && isAdmin && (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ECFDF5", borderColor: "#6EE7B7" }]}
                      onPress={() => handleApprove(reg)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <ActivityIndicator size="small" color="#065F46" /> : (
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#065F46" }}>✓ Approve</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}
                      onPress={() => handleReject(reg)}
                      disabled={isProcessing}
                    >
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#991B1B" }}>✗ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Reject reason modal */}
      {rejectingId !== null && (
        <View style={styles.rejectOverlay}>
          <View style={[styles.rejectModal, { backgroundColor: colors.card }]}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 8 }}>Reject Registration</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
              Optionally provide a reason for rejection:
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Incomplete information, duplicate account..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={{
                backgroundColor: colors.input, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 14, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text,
                height: 90, textAlignVertical: "top", marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setRejectingId(null); setRejectReason(""); }}
                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.input, borderColor: colors.border }]}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmReject}
                disabled={actionLoading !== null}
                style={[styles.actionBtn, { flex: 1, backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}
              >
                {actionLoading !== null
                  ? <ActivityIndicator size="small" color="#991B1B" />
                  : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#991B1B" }}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  bizName: { fontFamily: "Inter_700Bold", fontSize: 17, marginBottom: 2 },
  pkgBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  infoLine: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#475569" },
  actionBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  rejectOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "flex-end" },
  rejectModal: { width: "100%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
});

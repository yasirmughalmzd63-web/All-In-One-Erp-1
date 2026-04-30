import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Stats = {
  total: number; approved: number; pending: number; rejected: number;
  active: number; inactive: number;
  byPackage: Record<string, number>;
  byPaymentStatus: Record<string, number>;
  monthlyRevenue: string;
};

const PKG_EMOJI: Record<string, string> = { free: "🆓", basic: "🟢", professional: "🔵", enterprise: "🟣" };
const PKG_COLOR: Record<string, string> = { free: "#059669", basic: "#2563EB", professional: "#7C3AED", enterprise: "#D97706" };
const PAYMENT_STATUS_META: Record<string, { emoji: string; color: string; bg: string }> = {
  trial:     { emoji: "🆕", color: "#0891B2", bg: "#ECFEFF" },
  active:    { emoji: "✅", color: "#065F46", bg: "#ECFDF5" },
  overdue:   { emoji: "⚠️", color: "#92400E", bg: "#FFF7ED" },
  cancelled: { emoji: "❌", color: "#991B1B", bg: "#FEF2F2" },
};

type QuickAction = {
  label: string; emoji: string; desc: string;
  route: string; gradientFrom: string; gradientTo: string; badge?: number;
};

export default function SuperAdminScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const isSuperAdmin = user?.role === "super_admin";

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await customFetch<Stats>("/api/businesses/stats");
      setStats(data);
    } catch {
      // silently fail — user sees skeleton
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const quickActions: QuickAction[] = [
    {
      label: "Pending Approvals",
      emoji: "⏳",
      desc: `${stats?.pending ?? 0} registrations waiting`,
      route: "/registrations",
      gradientFrom: "#D97706", gradientTo: "#F59E0B",
      badge: stats?.pending ?? 0,
    },
    {
      label: "Manage Businesses",
      emoji: "🏢",
      desc: `${stats?.approved ?? 0} approved businesses`,
      route: "/businesses",
      gradientFrom: "#7C3AED", gradientTo: "#8B5CF6",
    },
    {
      label: "Overdue Payments",
      emoji: "⚠️",
      desc: `${stats?.byPaymentStatus?.overdue ?? 0} overdue`,
      route: "/businesses",
      gradientFrom: "#DC2626", gradientTo: "#EF4444",
      badge: stats?.byPaymentStatus?.overdue ?? 0,
    },
    {
      label: "Audit Log",
      emoji: "🛡",
      desc: "View all system actions",
      route: "/audit",
      gradientFrom: "#475569", gradientTo: "#64748B",
    },
  ];

  const revenue = parseFloat(stats?.monthlyRevenue ?? "0");
  const revenueFormatted = revenue >= 1000
    ? `₨${(revenue / 1000).toFixed(1)}K`
    : `₨${revenue.toFixed(0)}`;

  if (!isSuperAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }]}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
          Super Admin Only
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginBottom: 24 }}>
          This dashboard is reserved for the super admin.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFF" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={["#1E1B4B", "#312E81", "#4C1D95"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 }}
        >
          <Text style={{ fontSize: 18, color: "rgba(255,255,255,0.8)" }}>‹</Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Back</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 24 }}>👑</Text>
          </View>
          <View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" }}>Super Admin</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              @{user?.username} · Full system control
            </Text>
          </View>
        </View>

        {/* KPI strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: "row", gap: 10, paddingRight: 8 }}>
            {[
              { label: "Total",    value: stats?.total ?? 0,    color: "#FFF",     emoji: "🏢" },
              { label: "Active",   value: stats?.active ?? 0,   color: "#6EE7B7",  emoji: "✅" },
              { label: "Pending",  value: stats?.pending ?? 0,  color: "#FCD34D",  emoji: "⏳" },
              { label: "Revenue",  value: revenueFormatted,     color: "#A5F3FC",  emoji: "💰" },
              { label: "Overdue",  value: stats?.byPaymentStatus?.overdue ?? 0, color: "#FCA5A5", emoji: "⚠️" },
            ].map(kpi => (
              <View
                key={kpi.label}
                style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", minWidth: 80 }}
              >
                <Text style={{ fontSize: 14, marginBottom: 2 }}>{kpi.emoji}</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: kpi.color }}>{kpi.value}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{kpi.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={["#7C3AED"]} />}
      >
        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator color="#7C3AED" size="large" />
          </View>
        ) : (
          <>
            {/* Quick actions */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {quickActions.map(action => (
                <TouchableOpacity
                  key={action.label}
                  style={{ width: "47%", borderRadius: 16, overflow: "hidden" }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    router.push(action.route as `/registrations`);
                  }}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[action.gradientFrom, action.gradientTo]}
                    style={{ padding: 16, borderRadius: 16 }}
                  >
                    {action.badge !== undefined && action.badge > 0 && (
                      <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "#FFF", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: action.gradientFrom }}>{action.badge}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 28, marginBottom: 8 }}>{action.emoji}</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF", marginBottom: 4 }}>{action.label}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{action.desc}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>

            {/* Package breakdown */}
            {stats && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Businesses by Package</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {(["enterprise", "professional", "basic", "free"] as const).map(pkg => {
                    const count = stats.byPackage[pkg] ?? 0;
                    const total = stats.approved || 1;
                    const pct = (count / total) * 100;
                    return (
                      <View key={pkg} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>
                            {PKG_EMOJI[pkg]} {pkg.charAt(0).toUpperCase() + pkg.slice(1)}
                          </Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: PKG_COLOR[pkg] }}>{count}</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: colors.input, borderRadius: 3, overflow: "hidden" }}>
                          <View style={{ height: 6, width: `${pct}%`, backgroundColor: PKG_COLOR[pkg], borderRadius: 3 }} />
                        </View>
                      </View>
                    );
                  })}
                  {/* Monthly revenue */}
                  <View style={{ marginTop: 8, padding: 12, backgroundColor: "#F0FDF4", borderRadius: 10, borderWidth: 1, borderColor: "#6EE7B7" }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#047857" }}>Est. Monthly Subscription Revenue</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#065F46", marginTop: 2 }}>{revenueFormatted}</Text>
                  </View>
                </View>

                {/* Payment status breakdown */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscription Status</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {(["active", "trial", "overdue", "cancelled"] as const).map(ps => {
                    const meta = PAYMENT_STATUS_META[ps]!;
                    const count = stats.byPaymentStatus[ps] ?? 0;
                    return (
                      <View key={ps} style={[styles.statusCard, { backgroundColor: meta.bg, flex: 1, minWidth: "40%" }]}>
                        <Text style={{ fontSize: 22, marginBottom: 4 }}>{meta.emoji}</Text>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: meta.color }}>{count}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: meta.color, textTransform: "capitalize" }}>{ps}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Business health overview */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Overview</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { label: "Approved", value: stats.approved, emoji: "✅", color: "#059669" },
                    { label: "Active Users", value: stats.active, emoji: "🟢", color: "#0891B2" },
                    { label: "Inactive Users", value: stats.inactive, emoji: "🔴", color: "#DC2626" },
                    { label: "Pending Review", value: stats.pending, emoji: "⏳", color: "#D97706" },
                    { label: "Rejected", value: stats.rejected, emoji: "❌", color: "#64748B" },
                  ].map((row, i, arr) => (
                    <View key={row.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 16, marginRight: 10 }}>{row.emoji}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 }}>{row.label}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: row.color }}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  statusCard: { borderRadius: 14, padding: 14, alignItems: "center" },
});

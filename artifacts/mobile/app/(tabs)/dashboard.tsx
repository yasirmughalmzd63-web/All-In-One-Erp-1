import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Period = "today" | "yesterday" | "weekly" | "monthly";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
];
const PERIOD_LABELS: Record<Period, string> = {
  today: "Today's Activity", yesterday: "Yesterday's Activity",
  weekly: "This Week's Activity", monthly: "This Month's Activity",
};

type Sale = { id: number; invoiceNo: string; customerName?: string | null; total: string; paymentMethod: string; createdAt: string };
type Account = { id: number; name: string; balance: string; currency: string };
type DashboardData = {
  period: string;
  todaySales: string; todaySalesCount: number; todayPurchases: string; todayExpenses: string;
  totalCustomers: number; totalProducts: number; totalSuppliers: number;
  creditReceivable: string; creditReceivableCount: number;
  creditPayable: string; creditPayableCount: number;
  pendingCredits: string; pendingCreditsCount: number;
  totalStockValue: string; totalAccountsBalance: string;
  recentSales: Sale[]; accountBalances: Account[];
};

function HeroMetric({ label, value, sub, color, icon, bg }: {
  label: string; value: string; sub?: string; color: string; icon: keyof typeof Feather.glyphMap; bg: string;
}) {
  return (
    <View style={[heroStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={[heroStyles.iconBox, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[heroStyles.value, { color }]}>{value}</Text>
      <Text style={heroStyles.label}>{label}</Text>
      {sub ? <Text style={heroStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1.5, minWidth: 130 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  value: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 22 },
  label: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#64748B" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#94A3B8" },
});

function StatCard({ title, value, sub, color, bg, icon }: { title: string; value: string; sub?: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={[statStyles.card, { backgroundColor: bg, borderColor: color + "33" }]}>
      <View style={[statStyles.iconBox, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.title}>{title}</Text>
      {sub ? <Text style={statStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, padding: 14, gap: 5, borderWidth: 1, minWidth: 120 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  value: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 21 },
  title: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#64748B" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8" },
});

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const [period, setPeriod] = useState<Period>("today");

  const { data: dash, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["dashboard", period],
    queryFn: () => customFetch<DashboardData>(`/api/dashboard?period=${period}`),
  });

  const fmt = (v?: string) => v ? `$${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
  const fmtK = (v?: string) => {
    if (!v) return "$0";
    const n = parseFloat(v);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name?.split(" ")[0] ?? "User"} 👋</Text>
            <Text style={styles.headerSub}>Business Dashboard</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {PERIODS.map(p => {
            const active = p.key === period;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                onPress={() => setPeriod(p.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", padding: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>Loading dashboard...</Text>
          </View>
        ) : dash ? (
          <>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Financial Overview</Text>
              <View style={[styles.heroRow, { marginBottom: 10 }]}>
                <HeroMetric
                  label="Total Accounts"
                  value={fmtK(dash.totalAccountsBalance)}
                  sub={`${(dash.accountBalances ?? []).length} account${(dash.accountBalances ?? []).length !== 1 ? "s" : ""}`}
                  color={colors.primary}
                  bg={colors.secondary}
                  icon="credit-card"
                />
                <HeroMetric
                  label="Stock Value"
                  value={fmtK(dash.totalStockValue)}
                  sub="goods in hand"
                  color={colors.purchase}
                  bg={colors.purchaseBg}
                  icon="package"
                />
              </View>
              <View style={styles.heroRow}>
                <HeroMetric
                  label="Receivable"
                  value={fmtK(dash.creditReceivable)}
                  sub={`${dash.creditReceivableCount} open`}
                  color={colors.success}
                  bg={colors.saleBg}
                  icon="arrow-down-left"
                />
                <HeroMetric
                  label="Payable"
                  value={fmtK(dash.creditPayable)}
                  sub={`${dash.creditPayableCount} open`}
                  color={colors.credit}
                  bg={colors.creditBg}
                  icon="arrow-up-right"
                />
              </View>
            </View>

            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{PERIOD_LABELS[period]}</Text>
              <View style={styles.statsGrid}>
                <StatCard title="Sales" value={fmt(dash.todaySales)} sub={`${dash.todaySalesCount} txn`} color={colors.sale} bg={colors.saleBg} icon="trending-up" />
                <StatCard title="Purchases" value={fmt(dash.todayPurchases)} color={colors.purchase} bg={colors.purchaseBg} icon="shopping-bag" />
              </View>
              <View style={[styles.statsGrid, { marginTop: 10 }]}>
                <StatCard title="Expenses" value={fmt(dash.todayExpenses)} color={colors.expense} bg={colors.expenseBg} icon="arrow-down-circle" />
                <StatCard title="Net Credits" value={fmt(dash.pendingCredits)} sub={`${dash.pendingCreditsCount} open`} color={colors.credit} bg={colors.creditBg} icon="clock" />
              </View>
            </View>

            {(dash.accountBalances ?? []).length > 0 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Balances</Text>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {dash.accountBalances.map((acc, idx, arr) => (
                    <View key={acc.id} style={[styles.summaryRow, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}>
                      <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "15" }]}>
                        <Feather name="credit-card" size={16} color={colors.primary} />
                      </View>
                      <Text style={[styles.summaryLabel, { color: colors.text }]}>{acc.name}</Text>
                      <Text style={[styles.summaryValue, { color: parseFloat(acc.balance) >= 0 ? colors.success : colors.danger }]}>
                        {acc.currency} {parseFloat(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Summary</Text>
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Total Customers", value: String(dash.totalCustomers), icon: "users" as const, color: colors.primary },
                  { label: "Total Products", value: String(dash.totalProducts), icon: "package" as const, color: colors.purchase },
                  { label: "Total Suppliers", value: String(dash.totalSuppliers), icon: "truck" as const, color: colors.expense },
                ].map((item, idx, arr) => (
                  <View key={item.label} style={[styles.summaryRow, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}>
                    <View style={[styles.summaryIcon, { backgroundColor: item.color + "15" }]}>
                      <Feather name={item.icon} size={16} color={item.color} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {(dash.recentSales ?? []).length > 0 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {period === "today" || period === "yesterday" ? "Recent Sales" : `Sales — ${PERIOD_LABELS[period]}`}
                </Text>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {dash.recentSales.map((sale, idx, arr) => (
                    <View key={sale.id} style={[styles.summaryRow, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}>
                      <View style={[styles.summaryIcon, { backgroundColor: colors.saleBg }]}>
                        <Feather name="shopping-cart" size={16} color={colors.sale} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.summaryLabel, { color: colors.text }]}>{sale.invoiceNo}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{sale.customerName ?? "Walk-in"}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.summaryValue, { color: colors.success }]}>{fmt(sale.total)}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{new Date(sale.createdAt).toLocaleDateString()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {(dash.recentSales ?? []).length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="inbox" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No sales {period === "today" ? "today" : period === "yesterday" ? "yesterday" : "this period"}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={{ alignItems: "center", padding: 40 }}>
            <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
            <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 12 }}>No data available</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  greeting: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  roleText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFFFFF", letterSpacing: 1 },
  pillRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  pill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  pillActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.3)" },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  pillTextActive: { color: "#1E40AF" },
  pillTextInactive: { color: "rgba(255,255,255,0.9)" },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 10 },
  heroRow: { flexDirection: "row", gap: 10 },
  statsGrid: { flexDirection: "row", gap: 10 },
  summaryCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  emptyBox: { borderRadius: 14, borderWidth: 1, alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14 },
});

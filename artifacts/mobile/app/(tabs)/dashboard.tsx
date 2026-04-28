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
  today: "Today", yesterday: "Yesterday",
  weekly: "This Week", monthly: "This Month",
};

type Account = { id: number; name: string; balance: string; currency: string };
type DashboardData = {
  period: string;
  todaySales: string; todaySalesCount: number; todayPurchases: string; todayExpenses: string;
  totalCustomers: number; totalProducts: number; totalSuppliers: number;
  creditReceivable: string; creditReceivableCount: number;
  creditPayable: string; creditPayableCount: number;
  pendingCredits: string; pendingCreditsCount: number;
  totalStockValue: string; totalAccountsBalance: string;
  totalProductsQty: number;
  receivedStockQty: number; receivedStockValue: string; receivedStockCount: number;
  cashTransferredToCompany: string; cashTransferredCount: number;
  stockTransferredQty: number; stockTransferredValue: string; stockTransferredCount: number;
  dollarReceivedUsd: string; dollarExchangedPkr: string; dollarAvgRate: string; dollarReceivedCount: number;
  accountBalances: Account[];
};

// PKR formatting (₨)
const fmtPKR = (v?: string) => {
  if (!v) return "₨0";
  const n = parseFloat(v);
  return `₨${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const fmtPKRk = (v?: string) => {
  if (!v) return "₨0";
  const n = parseFloat(v);
  if (n >= 10_000_000) return `₨${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₨${(n / 100_000).toFixed(2)}L`;
  if (n >= 1000) return `₨${(n / 1000).toFixed(1)}K`;
  return `₨${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const fmtUSD = (v?: string) => {
  if (!v) return "$0";
  const n = parseFloat(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n?: number) => (n ?? 0).toLocaleString();

function HeroCard({ icon, label, value, sub, color, bg }: {
  icon: keyof typeof Feather.glyphMap; label: string; value: string; sub?: string; color: string; bg: string;
}) {
  return (
    <View style={[heroStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={[heroStyles.iconBox, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={[heroStyles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={heroStyles.label}>{label}</Text>
      {sub ? <Text style={heroStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1.5, minWidth: 130 },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { fontFamily: "Inter_700Bold", fontSize: 20, lineHeight: 24 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#475569" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8" },
});

function DualMetricCard({ icon, title, primaryLabel, primaryValue, secondaryLabel, secondaryValue, footer, color, bg }: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  primaryLabel: string; primaryValue: string;
  secondaryLabel: string; secondaryValue: string;
  footer?: string;
  color: string; bg: string;
}) {
  return (
    <View style={[dualStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={dualStyles.header}>
        <View style={[dualStyles.iconBox, { backgroundColor: color + "22" }]}>
          <Feather name={icon} size={18} color={color} />
        </View>
        <Text style={[dualStyles.title, { color: color }]}>{title}</Text>
      </View>
      <View style={dualStyles.row}>
        <View style={dualStyles.col}>
          <Text style={dualStyles.colLabel}>{primaryLabel}</Text>
          <Text style={[dualStyles.colValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{primaryValue}</Text>
        </View>
        <View style={[dualStyles.divider, { backgroundColor: color + "33" }]} />
        <View style={dualStyles.col}>
          <Text style={dualStyles.colLabel}>{secondaryLabel}</Text>
          <Text style={[dualStyles.colValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{secondaryValue}</Text>
        </View>
      </View>
      {footer ? <Text style={dualStyles.footer}>{footer}</Text> : null}
    </View>
  );
}

const dualStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1.5 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
  row: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  col: { flex: 1, gap: 4 },
  colLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#64748B" },
  colValue: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 22 },
  divider: { width: 1, alignSelf: "stretch" },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8", marginTop: -4 },
});

function DollarFlowCard({ usd, pkr, rate, count, color, bg }: {
  usd: string; pkr: string; rate: string; count: number; color: string; bg: string;
}) {
  return (
    <View style={[dollarStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={dollarStyles.header}>
        <View style={[dollarStyles.iconBox, { backgroundColor: color + "22" }]}>
          <Feather name="dollar-sign" size={18} color={color} />
        </View>
        <Text style={[dollarStyles.title, { color }]}>Dollar → Coins Exchange</Text>
      </View>

      <View style={dollarStyles.flowRow}>
        <View style={dollarStyles.flowBox}>
          <Text style={dollarStyles.flowLabel}>Received</Text>
          <Text style={[dollarStyles.flowValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{fmtUSD(usd)}</Text>
        </View>
        <View style={[dollarStyles.arrow, { backgroundColor: color + "22" }]}>
          <Feather name="arrow-right" size={16} color={color} />
        </View>
        <View style={dollarStyles.flowBox}>
          <Text style={dollarStyles.flowLabel}>Rate</Text>
          <Text style={[dollarStyles.flowValue, { color, fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit>
            ₨{parseFloat(rate || "0").toFixed(2)}
          </Text>
        </View>
        <View style={[dollarStyles.arrow, { backgroundColor: color + "22" }]}>
          <Feather name="arrow-right" size={16} color={color} />
        </View>
        <View style={dollarStyles.flowBox}>
          <Text style={dollarStyles.flowLabel}>Coins (PKR)</Text>
          <Text style={[dollarStyles.flowValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{fmtPKRk(pkr)}</Text>
        </View>
      </View>
      <Text style={dollarStyles.footer}>{count} exchange{count !== 1 ? "s" : ""}</Text>
    </View>
  );
}

const dollarStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 14, borderWidth: 1.5 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
  flowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flowBox: { flex: 1, alignItems: "center", gap: 4 },
  flowLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#64748B" },
  flowValue: { fontFamily: "Inter_700Bold", fontSize: 17, textAlign: "center" },
  arrow: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" },
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
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 18 }}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", padding: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>Loading dashboard...</Text>
          </View>
        ) : dash ? (
          <>
            {/* 1. Total Account Balance */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Total Account Balance</Text>
              <HeroCard
                icon="credit-card"
                label="All Accounts Combined"
                value={fmtPKRk(dash.totalAccountsBalance)}
                sub={`${(dash.accountBalances ?? []).length} account${(dash.accountBalances ?? []).length !== 1 ? "s" : ""}`}
                color={colors.primary}
                bg={colors.secondary}
              />
            </View>

            {/* 2. Product Qty + Stock Value */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Inventory in Hand</Text>
              <DualMetricCard
                icon="package"
                title="Product Qty & Stock Value"
                primaryLabel="Total Qty"
                primaryValue={fmtNum(dash.totalProductsQty)}
                secondaryLabel="Stock Value"
                secondaryValue={fmtPKRk(dash.totalStockValue)}
                footer={`${dash.totalProducts} product${dash.totalProducts !== 1 ? "s" : ""} active`}
                color={colors.purchase}
                bg={colors.purchaseBg}
              />
            </View>

            {/* 3. Received Stock (period) */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Received Stock — {PERIOD_LABELS[period]}</Text>
              <DualMetricCard
                icon="download"
                title="Total Stock Received"
                primaryLabel="Qty Received"
                primaryValue={fmtNum(dash.receivedStockQty)}
                secondaryLabel="Qty Value"
                secondaryValue={fmtPKRk(dash.receivedStockValue)}
                footer={`${dash.receivedStockCount} purchase${dash.receivedStockCount !== 1 ? "s" : ""}`}
                color={colors.success}
                bg={colors.saleBg}
              />
            </View>

            {/* 4. Cash Transferred to Company (period) */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Cash Transferred to Company — {PERIOD_LABELS[period]}</Text>
              <HeroCard
                icon="send"
                label="Total Cash Sent Out"
                value={fmtPKRk(dash.cashTransferredToCompany)}
                sub={`${dash.cashTransferredCount} transfer${dash.cashTransferredCount !== 1 ? "s" : ""}`}
                color={colors.expense}
                bg={colors.expenseBg}
              />
            </View>

            {/* 5. Stock Transferred to Other Company (period) */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Stock Transferred to Other Co. — {PERIOD_LABELS[period]}</Text>
              <DualMetricCard
                icon="truck"
                title="Outgoing Stock Transfers"
                primaryLabel="Qty Transferred"
                primaryValue={fmtNum(dash.stockTransferredQty)}
                secondaryLabel="Qty Value"
                secondaryValue={fmtPKRk(dash.stockTransferredValue)}
                footer={`${dash.stockTransferredCount} transfer${dash.stockTransferredCount !== 1 ? "s" : ""}`}
                color={colors.credit}
                bg={colors.creditBg}
              />
            </View>

            {/* 6. Dollar received → Exchanged → Coins (period) */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Dollar Module — {PERIOD_LABELS[period]}</Text>
              <DollarFlowCard
                usd={dash.dollarReceivedUsd}
                pkr={dash.dollarExchangedPkr}
                rate={dash.dollarAvgRate}
                count={dash.dollarReceivedCount}
                color={colors.sale}
                bg={colors.saleBg}
              />
            </View>

            {/* Account Balances breakdown */}
            {(dash.accountBalances ?? []).length > 0 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Balances Breakdown</Text>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {dash.accountBalances.map((acc, idx, arr) => (
                    <View key={acc.id} style={[styles.summaryRow, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}>
                      <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "15" }]}>
                        <Feather name="credit-card" size={16} color={colors.primary} />
                      </View>
                      <Text style={[styles.summaryLabel, { color: colors.text }]}>{acc.name}</Text>
                      <Text style={[styles.summaryValue, { color: parseFloat(acc.balance) >= 0 ? colors.success : colors.danger }]}>
                        {acc.currency === "USD" ? fmtUSD(acc.balance) : `₨${parseFloat(acc.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      </Text>
                    </View>
                  ))}
                </View>
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
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 10 },
  summaryCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
});

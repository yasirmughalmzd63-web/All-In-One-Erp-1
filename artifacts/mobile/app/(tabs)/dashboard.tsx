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
type InventoryLoc = {
  locationId: number | null;
  locationName: string;
  qty: number;
  value: string;
  productCount: number;
};
type DollarWalletBreakdown = {
  id: number;
  name: string;
  balanceUsd: string;
  valuePkr: string;
};
type TotalsBreakdown = {
  cash: string;
  stock: string;
  credit: string;
  creditReceivable: string;
  creditPayable: string;
  other: string;
  // USD wallet inventory valued at the most recent SALE rate
  dollarInventoryUsd?: string;
  dollarInventoryPkr?: string;
  dollarSaleRate?: string;
  total: string;
};
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
  inventoryByLocation: InventoryLoc[];
  dollarWalletsBreakdown?: DollarWalletBreakdown[];
  totalsBreakdown: TotalsBreakdown;
  scope: { isAdmin: boolean; userId: number | null; locationId: number | null; role: string | null };
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
  icon: string; label: string; value: string; sub?: string; color: string; bg: string;
}) {
  return (
    <View style={[heroStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={[heroStyles.iconBox, { backgroundColor: color + "22" }]}>
        
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
  icon: string;
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

function BreakdownRow({ label, icon, color, value, sub }: {
  label: string;
  icon: string;
  color: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={breakdownStyles.row}>
      <View style={[breakdownStyles.iconBox, { backgroundColor: color + "22" }]}>
        
      </View>
      <View style={{ flex: 1 }}>
        <Text style={breakdownStyles.label}>{label}</Text>
        {sub ? <Text style={breakdownStyles.sub}>{sub}</Text> : null}
      </View>
      <Text style={[breakdownStyles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const breakdownStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#334155" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#94A3B8", marginTop: 2 },
  value: { fontFamily: "Inter_700Bold", fontSize: 15, maxWidth: 130 },
  totalRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderTopWidth: 1.5, marginTop: 4 },
  totalLabel: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 14 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 18, maxWidth: 150 },
});

const outstandingStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 14 },
  row: { flexDirection: "row", alignItems: "stretch" },
  col: { flex: 1, alignItems: "center", paddingVertical: 4 },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: 8 },
  iconWrap: { width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  label: { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: 0.4, marginBottom: 4 },
  value: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF", maxWidth: 130, textAlign: "center" },
  totalBox: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFFFFF", letterSpacing: 0.3 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF", maxWidth: 180 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: -4 },
});

const locStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  locName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  locSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  locQty: { fontFamily: "Inter_700Bold", fontSize: 14 },
  locValue: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
});

function DollarFlowCard({ usd, pkr, rate, count, color, bg }: {
  usd: string; pkr: string; rate: string; count: number; color: string; bg: string;
}) {
  return (
    <View style={[dollarStyles.card, { backgroundColor: bg, borderColor: color + "44" }]}>
      <View style={dollarStyles.header}>
        <View style={[dollarStyles.iconBox, { backgroundColor: color + "22" }]}>
          
        </View>
        <Text style={[dollarStyles.title, { color }]}>Dollar → Coins Exchange</Text>
      </View>

      <View style={dollarStyles.flowRow}>
        <View style={dollarStyles.flowBox}>
          <Text style={dollarStyles.flowLabel}>Received</Text>
          <Text style={[dollarStyles.flowValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{fmtUSD(usd)}</Text>
        </View>
        <View style={[dollarStyles.arrow, { backgroundColor: color + "22" }]}>
          
        </View>
        <View style={dollarStyles.flowBox}>
          <Text style={dollarStyles.flowLabel}>Rate</Text>
          <Text style={[dollarStyles.flowValue, { color, fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit>
            ₨{parseFloat(rate || "0").toFixed(2)}
          </Text>
        </View>
        <View style={[dollarStyles.arrow, { backgroundColor: color + "22" }]}>
          
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

            {/* 2. Inventory in Hand — Per App breakdown */}
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Inventory in Hand</Text>
                <View style={[styles.scopeBadge, { backgroundColor: dash.scope.isAdmin ? colors.primary + "15" : colors.purchase + "15" }]}>
                  
                  <Text style={[styles.scopeBadgeText, { color: dash.scope.isAdmin ? colors.primary : colors.purchase }]}>
                    {dash.scope.isAdmin ? "All Apps" : "Your App"}
                  </Text>
                </View>
              </View>

              {/* Per-location breakdown list */}
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}>
                {(dash.inventoryByLocation ?? []).length === 0 ? (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground, marginTop: 8 }}>
                      No inventory yet
                    </Text>
                  </View>
                ) : (
                  dash.inventoryByLocation.map((loc, idx, arr) => (
                    <View
                      key={String(loc.locationId ?? "unassigned")}
                      style={[locStyles.row, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}
                    >
                      <View style={[locStyles.iconBox, { backgroundColor: colors.purchase + "18" }]}>
                        
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[locStyles.locName, { color: colors.text }]} numberOfLines={1}>{loc.locationName}</Text>
                        <Text style={[locStyles.locSub, { color: colors.mutedForeground }]}>
                          {loc.productCount} product{loc.productCount !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[locStyles.locQty, { color: colors.purchase }]}>{fmtNum(loc.qty)} pcs</Text>
                        <Text style={[locStyles.locValue, { color: colors.text }]}>{fmtPKRk(loc.value)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Grand totals row */}
              <DualMetricCard
                icon="package"
                title="Inventory Total"
                primaryLabel="Total Qty"
                primaryValue={fmtNum(dash.totalProductsQty)}
                secondaryLabel="Total Value"
                secondaryValue={fmtPKRk(dash.totalStockValue)}
                footer={`${dash.totalProducts} product${dash.totalProducts !== 1 ? "s" : ""} • ${(dash.inventoryByLocation ?? []).length} app${(dash.inventoryByLocation ?? []).length !== 1 ? "s" : ""}`}
                color={colors.purchase}
                bg={colors.purchaseBg}
              />
            </View>

            {/* 2.4 Dollar in Hand — Per USD wallet breakdown + activity */}
            {(() => {
              const wallets = dash.dollarWalletsBreakdown ?? [];
              const totalUsd = parseFloat(dash.totalsBreakdown?.dollarInventoryUsd ?? "0");
              const totalPkr = parseFloat(dash.totalsBreakdown?.dollarInventoryPkr ?? "0");
              const saleRate = parseFloat(dash.totalsBreakdown?.dollarSaleRate ?? "0");
              const periodReceivedUsd = parseFloat(dash.dollarReceivedUsd ?? "0");
              const periodReceivedPkr = parseFloat(dash.dollarExchangedPkr ?? "0");
              const periodCount = dash.dollarReceivedCount ?? 0;
              if (wallets.length === 0 && totalUsd === 0 && periodCount === 0) return null;
              return (
                <View>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Dollar in Hand</Text>
                    <View style={[styles.scopeBadge, { backgroundColor: colors.sale + "15" }]}>
                      <Text style={[styles.scopeBadgeText, { color: colors.sale }]}>
                        {saleRate > 0 ? `Sale ₨${saleRate.toFixed(0)}` : "No Sale Yet"}
                      </Text>
                    </View>
                  </View>

                  {/* Per-wallet breakdown list */}
                  <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}>
                    {wallets.length === 0 ? (
                      <View style={{ padding: 20, alignItems: "center" }}>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground }}>
                          No USD wallets yet
                        </Text>
                      </View>
                    ) : (
                      wallets.map((w, idx, arr) => (
                        <View
                          key={String(w.id)}
                          style={[locStyles.row, { borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}
                        >
                          <View style={[locStyles.iconBox, { backgroundColor: colors.sale + "18" }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[locStyles.locName, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                            <Text style={[locStyles.locSub, { color: colors.mutedForeground }]}>
                              USD wallet
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={[locStyles.locQty, { color: colors.sale }]}>{fmtUSD(w.balanceUsd)}</Text>
                            <Text style={[locStyles.locValue, { color: colors.text }]}>{fmtPKRk(w.valuePkr)}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Grand totals card */}
                  <DualMetricCard
                    icon="dollar-sign"
                    title="Dollar Total (Sale Value)"
                    primaryLabel="Total USD"
                    primaryValue={fmtUSD(totalUsd.toFixed(2))}
                    secondaryLabel="Total PKR @ Sale"
                    secondaryValue={fmtPKRk(totalPkr.toString())}
                    footer={`${wallets.length} wallet${wallets.length !== 1 ? "s" : ""}${saleRate > 0 ? ` • valued at ₨${saleRate.toFixed(0)}/USD` : ""}`}
                    color={colors.sale}
                    bg={colors.saleBg}
                  />

                  {/* Period activity row — Dollar received in this period */}
                  {periodCount > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <DualMetricCard
                        icon="arrow-down-circle"
                        title={`Dollar Received — ${PERIOD_LABELS[period]}`}
                        primaryLabel="USD Received"
                        primaryValue={fmtUSD(periodReceivedUsd.toFixed(2))}
                        secondaryLabel="PKR Earned (at sale rate)"
                        secondaryValue={fmtPKRk(periodReceivedPkr.toString())}
                        footer={`${periodCount} transaction${periodCount !== 1 ? "s" : ""}${parseFloat(dash.dollarAvgRate ?? "0") > 0 ? ` • avg ₨${parseFloat(dash.dollarAvgRate).toFixed(2)}/USD` : ""}`}
                        color={colors.success}
                        bg={colors.saleBg}
                      />
                    </View>
                  )}
                </View>
              );
            })()}

            {/* 2.5 Net Worth Breakdown — Cash / Stock / Credit / Other → Total */}
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Net Worth Breakdown</Text>
              <View style={[breakdownStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <BreakdownRow label="Cash" icon="dollar-sign" color={colors.success} value={fmtPKRk(dash.totalsBreakdown?.cash)} />
                <BreakdownRow label="Stock" icon="package" color={colors.purchase} value={fmtPKRk(dash.totalsBreakdown?.stock)} />
                {/* USD Inventory — valued at SALE PRICE (most recent received rate) */}
                {parseFloat(dash.totalsBreakdown?.dollarInventoryUsd ?? "0") > 0 && (
                  <BreakdownRow
                    label="Dollar"
                    icon="dollar-sign"
                    color={colors.sale}
                    value={fmtPKRk(dash.totalsBreakdown?.dollarInventoryPkr)}
                    sub={`${fmtUSD(dash.totalsBreakdown?.dollarInventoryUsd)} @ sale ₨${parseFloat(dash.totalsBreakdown?.dollarSaleRate ?? "0").toFixed(0)}`}
                  />
                )}
                <BreakdownRow
                  label="Credit (Net)"
                  icon="repeat"
                  color={colors.credit}
                  value={fmtPKRk(dash.totalsBreakdown?.credit)}
                  sub={`+${fmtPKRk(dash.totalsBreakdown?.creditReceivable)} − ${fmtPKRk(dash.totalsBreakdown?.creditPayable)}`}
                />
                <BreakdownRow label="Other Accounts" icon="credit-card" color={colors.expense} value={fmtPKRk(dash.totalsBreakdown?.other)} />
                <View style={[breakdownStyles.totalRow, { borderTopColor: colors.border }]}>
                  <View style={[breakdownStyles.iconBox, { backgroundColor: colors.primary + "22" }]}>
                    
                  </View>
                  <Text style={[breakdownStyles.totalLabel, { color: colors.text }]}>Grand Total</Text>
                  <Text style={[breakdownStyles.totalValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {fmtPKRk(dash.totalsBreakdown?.total)}
                  </Text>
                </View>
              </View>
            </View>

            {/* 2.6 Outstanding Balance — Cash Left + Stock Left after transfers */}
            {(() => {
              const cashLeft = parseFloat(dash.totalsBreakdown?.cash ?? "0") || 0;
              const stockLeft = parseFloat(dash.totalsBreakdown?.stock ?? "0") || 0;
              const outstanding = (cashLeft + stockLeft).toString();
              return (
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Outstanding Balance</Text>
                  <View style={[outstandingStyles.card, { backgroundColor: colors.primary }]}>
                    <View style={outstandingStyles.row}>
                      <View style={outstandingStyles.col}>
                        <View style={outstandingStyles.iconWrap}>
                          
                        </View>
                        <Text style={outstandingStyles.label}>Cash Left</Text>
                        <Text style={outstandingStyles.value} numberOfLines={1} adjustsFontSizeToFit>
                          {fmtPKRk(cashLeft.toString())}
                        </Text>
                      </View>
                      <View style={outstandingStyles.divider} />
                      <View style={outstandingStyles.col}>
                        <View style={outstandingStyles.iconWrap}>
                          
                        </View>
                        <Text style={outstandingStyles.label}>Stock Left</Text>
                        <Text style={outstandingStyles.value} numberOfLines={1} adjustsFontSizeToFit>
                          {fmtPKRk(stockLeft.toString())}
                        </Text>
                      </View>
                    </View>
                    <View style={outstandingStyles.totalBox}>
                      <Text style={outstandingStyles.totalLabel}>Outstanding Balance</Text>
                      <Text style={outstandingStyles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
                        {fmtPKRk(outstanding)}
                      </Text>
                    </View>
                    <Text style={outstandingStyles.hint}>
                      Cash + Stock remaining after all transfers
                    </Text>
                  </View>
                </View>
              );
            })()}

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
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  scopeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  scopeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  summaryCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
});

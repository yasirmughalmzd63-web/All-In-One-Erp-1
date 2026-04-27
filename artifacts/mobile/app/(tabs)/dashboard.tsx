import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetDashboard } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Sale = { id: number; invoiceNo: string; customerName?: string | null; total: string; paymentMethod: string; createdAt: string };
type Account = { id: number; name: string; balance: string; currency: string };
type DashboardData = {
  todaySales: string; todaySalesCount: number; todayPurchases: string; todayExpenses: string;
  totalCustomers: number; totalProducts: number; totalSuppliers: number;
  pendingCredits: string; pendingCreditsCount: number;
  recentSales: Sale[]; accountBalances: Account[];
};

function StatCard({ title, value, sub, color, bg, icon }: { title: string; value: string; sub?: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={[statStyles.card, { backgroundColor: bg, borderColor: color + "33" }]}>
      <View style={[statStyles.iconBox, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.title}>{title}</Text>
      {sub && <Text style={statStyles.sub}>{sub}</Text>}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, minWidth: 140 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  value: { fontFamily: "Inter_700Bold", fontSize: 20, lineHeight: 24 },
  title: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#64748B" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8" },
});

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const { data: raw, isLoading, refetch, isFetching } = useGetDashboard();
  const dash = raw as unknown as DashboardData | undefined;

  const fmt = (v?: string) => v ? `$${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name?.split(" ")[0] ?? "User"} 👋</Text>
          <Text style={styles.headerSub}>Business Dashboard</Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
        </View>
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
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Activity</Text>
              <View style={styles.statsGrid}>
                <StatCard title="Sales" value={fmt(dash.todaySales)} sub={`${dash.todaySalesCount} transactions`} color={colors.sale} bg={colors.saleBg} icon="trending-up" />
                <StatCard title="Purchases" value={fmt(dash.todayPurchases)} color={colors.purchase} bg={colors.purchaseBg} icon="shopping-bag" />
              </View>
              <View style={[styles.statsGrid, { marginTop: 10 }]}>
                <StatCard title="Expenses" value={fmt(dash.todayExpenses)} color={colors.expense} bg={colors.expenseBg} icon="arrow-down-circle" />
                <StatCard title="Pending Credits" value={fmt(dash.pendingCredits)} sub={`${dash.pendingCreditsCount} open`} color={colors.credit} bg={colors.creditBg} icon="clock" />
              </View>
            </View>

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

            {(dash.recentSales ?? []).length > 0 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Sales</Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  greeting: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  roleText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFFFFF", letterSpacing: 1 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 10 },
  statsGrid: { flexDirection: "row", gap: 10 },
  summaryCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
});

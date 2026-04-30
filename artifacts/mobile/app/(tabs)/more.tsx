import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth, hasPrivilege, type AppModule } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type MenuItem = {
  label: string; icon: string; route: string;
  color: string; bg: string; desc: string;
  module: AppModule; adminOnly?: boolean;
};

const MANAGEMENT_ITEMS: MenuItem[] = [
  { label: "Credits",    icon: "clock",        route: "/credits",    color: "#7C3AED", bg: "#F3E8FF", desc: "Receivables & payables",    module: "credits" },
];

const INVENTORY_ITEMS: MenuItem[] = [
  { label: "Topup",            icon: "activity",    route: "/daily-report",              color: "#0F172A", bg: "#F1F5F9", desc: "Stock, bank & credit in PKR/$",       module: "dashboard" },
  { label: "Inventory Ledger", icon: "package",     route: "/inventory-ledger",          color: "#059669", bg: "#ECFDF5", desc: "Opening / Received / Sold / Balance", module: "inventory" },
  { label: "App Summary",      icon: "map",         route: "/location-summary",          color: "#0891B2", bg: "#ECFEFF", desc: "Per-app sales & profit",              module: "dashboard" },
  { label: "Cash Flow",        icon: "trending-up", route: "/cash-flow",                 color: "#0369A1", bg: "#E0F2FE", desc: "Per-account credits & debits",        module: "accounts" },
  { label: "Dollar Wallet",    icon: "pocket",      route: "/wallets",                   color: "#0369A1", bg: "#E0F2FE", desc: "USD ledger & exchange",               module: "currency" },
  { label: "Cust. $ Report",   icon: "users",       route: "/customer-dollar-report",    color: "#0891B2", bg: "#ECFEFF", desc: "Customer USD activity & balances",    module: "currency" },
];

const REPORTS_ITEMS: MenuItem[] = [
  { label: "Profit & Loss", icon: "trending-up", route: "/profit-loss",  color: "#059669", bg: "#ECFDF5", desc: "Sales − COGS − Expenses",       module: "dashboard" },
  { label: "Balance Sheet", icon: "layers",      route: "/balance-sheet", color: "#1E40AF", bg: "#EFF6FF", desc: "Assets / Liabilities / Equity", module: "dashboard" },
  { label: "Product Profit", icon: "award",      route: "/product-profit", color: "#7C3AED", bg: "#F3E8FF", desc: "Per-coin revenue & profit",     module: "inventory" },
  { label: "Audit Checks",  icon: "alert-triangle", route: "/audit-checks", color: "#DC2626", bg: "#FEF2F2", desc: "Negative stock, unpaid sales", module: "audit" },
  { label: "User Report",  icon: "bar-chart-2", route: "/user-report",  color: "#7C3AED", bg: "#F3E8FF", desc: "Stock issued & cash per user",  module: "users", adminOnly: true },
  { label: "Cash Count",       icon: "archive",       route: "/cash-count",       color: "#7C3AED", bg: "#F3E8FF", desc: "Balance sheet & reconcile",            module: "cash_count" },
  { label: "Reconciliation",  icon: "check-circle",  route: "/reconciliation",   color: "#059669", bg: "#ECFDF5", desc: "Daily reconcile · Dollar · Exchange",   module: "reconciliation" },
  { label: "Privileges",   icon: "shield",      route: "/privileges",   color: "#059669", bg: "#ECFDF5", desc: "User access control",           module: "users", adminOnly: true },
  { label: "Registrations", icon: "user-plus",  route: "/registrations", color: "#D97706", bg: "#FFF7ED", desc: "Approve business accounts",     module: "users", adminOnly: true },
];

const OTHER_ITEMS: MenuItem[] = [
  { label: "Currency",   icon: "dollar-sign", route: "/currency",   color: "#0891B2", bg: "#ECFEFF", desc: "Forex transactions",            module: "currency" },
  { label: "Audit Log",  icon: "shield",      route: "/audit",      color: "#475569", bg: "#F8FAFC", desc: "Activity history",              module: "audit" },
  { label: "Customers",  icon: "users",       route: "/customers",  color: "#2563EB", bg: "#EFF6FF", desc: "Manage customer records",       module: "customers" },
  { label: "Suppliers",  icon: "truck",       route: "/suppliers",  color: "#0284C7", bg: "#E0F2FE", desc: "Manage supplier records",       module: "suppliers" },
  { label: "Users",      icon: "user-check",  route: "/users",      color: "#7C3AED", bg: "#F3E8FF", desc: "Manage user accounts",          module: "users", adminOnly: true },
  { label: "Apps",       icon: "map-pin",     route: "/locations",  color: "#059669", bg: "#ECFDF5", desc: "Manage store apps",             module: "locations" },
  { label: "Accounts",   icon: "credit-card", route: "/accounts",   color: "#D97706", bg: "#FFF7ED", desc: "Financial accounts",            module: "accounts" },
  { label: "Categories", icon: "tag",         route: "/categories", color: "#DC2626", bg: "#FEF2F2", desc: "Product categories",            module: "categories" },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const canSee = (item: MenuItem) => {
    if (item.adminOnly && !isAdmin) return false;
    return hasPrivilege(user, item.module);
  };

  const visibleManagement = MANAGEMENT_ITEMS.filter(canSee);
  const visibleInventory = INVENTORY_ITEMS.filter(canSee);
  const visibleReports = REPORTS_ITEMS.filter(canSee);
  const visibleOther = OTHER_ITEMS.filter(canSee);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

  const renderItem = (item: MenuItem) => (
    <TouchableOpacity
      key={item.label}
      style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(item.route as `/customers`)}
      activeOpacity={0.8}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
        
      </View>
      <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
      <Text style={[styles.menuDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() ?? "U"}</Text>
          </View>
          <View>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userRole}>{user?.role?.toUpperCase()} • @{user?.username}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {visibleManagement.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MANAGEMENT</Text>
            <View style={styles.grid}>
              {visibleManagement.map(renderItem)}
            </View>
          </>
        )}

        {visibleInventory.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>INVENTORY</Text>
            <View style={styles.grid}>
              {visibleInventory.map(renderItem)}
            </View>
          </>
        )}

        {visibleReports.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>REPORTS & TOOLS</Text>
            <View style={styles.grid}>
              {visibleReports.map(renderItem)}
            </View>
          </>
        )}

        {visibleOther.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>OTHER</Text>
            <View style={styles.grid}>
              {visibleOther.map(renderItem)}
            </View>
          </>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Version</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>Coins Sale 1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Logged in as</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{user?.username}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger }]} onPress={handleLogout}>
          
          <Text style={[styles.logoutText, { color: colors.danger }]}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  userName: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFFFFF" },
  userRole: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1, marginBottom: 12, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  menuItem: { width: "47.5%", borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  menuIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontFamily: "Inter_700Bold", fontSize: 14 },
  menuDesc: { fontFamily: "Inter_400Regular", fontSize: 11 },
  infoCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  infoLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  logoutBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  logoutText: { fontFamily: "Inter_700Bold", fontSize: 15 },
});

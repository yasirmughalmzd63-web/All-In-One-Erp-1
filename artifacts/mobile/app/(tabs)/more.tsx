import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth, hasPrivilege, type AppModule } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type MenuItem = {
  label: string;
  icon: FeatherName;
  route: string;
  color: string;
  bg: string;
  desc: string;
  module: AppModule;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

type Section = {
  title: string;
  icon: FeatherName;
  accent: string;
  items: MenuItem[];
};

// ─── Category definitions (logically grouped) ──────────────────────────────
const SECTIONS: Section[] = [
  {
    title: "Daily Operations",
    icon: "zap",
    accent: "#059669",
    items: [
      { label: "Cash Mgmt",     icon: "briefcase",    route: "/cash-management", color: "#059669", bg: "#ECFDF5", desc: "Cash, bank & wallet ledger",   module: "accounts" },
      { label: "Credits",       icon: "clock",        route: "/credits",         color: "#7C3AED", bg: "#F3E8FF", desc: "Receivables & payables",       module: "credits" },
      { label: "Topup",         icon: "activity",     route: "/daily-report",    color: "#0F172A", bg: "#F1F5F9", desc: "Stock, bank & credit recap",   module: "dashboard" },
      { label: "Cash Count",    icon: "archive",      route: "/cash-count",      color: "#7C3AED", bg: "#F3E8FF", desc: "Balance sheet & reconcile",    module: "cash_count" },
      { label: "Reconcile",     icon: "check-circle", route: "/reconciliation",  color: "#059669", bg: "#ECFDF5", desc: "Daily · Dollar · Exchange",    module: "reconciliation" },
      { label: "HRM",           icon: "user-check",   route: "/hrm",             color: "#0891B2", bg: "#ECFEFF", desc: "Staff, attendance & payroll",  module: "users" },
    ],
  },
  {
    title: "Wallets & USD",
    icon: "dollar-sign",
    accent: "#0369A1",
    items: [
      { label: "USD Bridge",     icon: "repeat",       route: "/usd-bridge",             color: "#0891B2", bg: "#ECFEFF", desc: "Buy USD from customers",          module: "currency" },
      { label: "Dollar Wallet",  icon: "pocket",       route: "/wallets",                color: "#0369A1", bg: "#E0F2FE", desc: "USD ledger & exchange",           module: "currency" },
      { label: "App Wallets",    icon: "layers",       route: "/app-wallets",            color: "#7C3AED", bg: "#F3E8FF", desc: "Coins · Dollars · Credit",        module: "currency" },
      { label: "$ Statement",    icon: "bar-chart-2",  route: "/dollar-statement",       color: "#F0B90B", bg: "#FFFBEB", desc: "USDT purchases & wallets",        module: "currency" },
      { label: "Cust. $ Report", icon: "users",        route: "/customer-dollar-report", color: "#0891B2", bg: "#ECFEFF", desc: "Customer USD activity",           module: "currency" },
      { label: "Currency",       icon: "refresh-cw",   route: "/currency",               color: "#0369A1", bg: "#E0F2FE", desc: "Forex transactions",              module: "currency" },
    ],
  },
  {
    title: "Inventory",
    icon: "package",
    accent: "#7C3AED",
    items: [
      { label: "Inventory Ledger", icon: "list",        route: "/inventory-ledger", color: "#059669", bg: "#ECFDF5", desc: "Opening · Received · Sold",  module: "inventory" },
      { label: "App Summary",      icon: "map",         route: "/location-summary", color: "#0891B2", bg: "#ECFEFF", desc: "Per-app sales & profit",     module: "dashboard" },
      { label: "Product Profit",   icon: "award",       route: "/product-profit",   color: "#7C3AED", bg: "#F3E8FF", desc: "Per-coin revenue & profit",  module: "inventory" },
      { label: "Cash Flow",        icon: "trending-up", route: "/cash-flow",        color: "#0369A1", bg: "#E0F2FE", desc: "Per-account credits/debits", module: "accounts" },
    ],
  },
  {
    title: "Reports",
    icon: "pie-chart",
    accent: "#16A34A",
    items: [
      { label: "Profit & Loss",  icon: "trending-up",     route: "/profit-loss",   color: "#059669", bg: "#ECFDF5", desc: "Sales − COGS − Expenses",     module: "dashboard" },
      { label: "Balance Sheet",  icon: "grid",            route: "/balance-sheet", color: "#1E40AF", bg: "#EFF6FF", desc: "Assets / Liabilities / Equity", module: "dashboard" },
      { label: "User Report",    icon: "user",            route: "/user-report",   color: "#7C3AED", bg: "#F3E8FF", desc: "Stock issued & cash per user", module: "users", adminOnly: true },
      { label: "Audit Log",      icon: "file-text",       route: "/audit",         color: "#475569", bg: "#F8FAFC", desc: "Full activity history",        module: "audit" },
    ],
  },
  {
    title: "Master Data",
    icon: "database",
    accent: "#2563EB",
    items: [
      { label: "Customers",  icon: "users",       route: "/customers",  color: "#2563EB", bg: "#EFF6FF", desc: "Customer records",   module: "customers" },
      { label: "Suppliers",  icon: "truck",       route: "/suppliers",  color: "#0284C7", bg: "#E0F2FE", desc: "Supplier records",   module: "suppliers" },
      { label: "Users",      icon: "user-plus",   route: "/users",      color: "#7C3AED", bg: "#F3E8FF", desc: "User accounts",      module: "users", adminOnly: true },
      { label: "Apps",       icon: "map-pin",     route: "/locations",  color: "#059669", bg: "#ECFDF5", desc: "Store apps",         module: "locations" },
      { label: "Accounts",   icon: "credit-card", route: "/accounts",   color: "#D97706", bg: "#FFF7ED", desc: "Financial accounts", module: "accounts" },
      { label: "Categories", icon: "tag",         route: "/categories", color: "#DC2626", bg: "#FEF2F2", desc: "Product categories", module: "categories" },
    ],
  },
  {
    title: "Admin & Security",
    icon: "shield",
    accent: "#DC2626",
    items: [
      { label: "Privileges",    icon: "key",            route: "/privileges",    color: "#059669", bg: "#ECFDF5", desc: "User access control",            module: "users", adminOnly: true },
      { label: "Reset Center",  icon: "alert-octagon",  route: "/reset-center",  color: "#DC2626", bg: "#FEF2F2", desc: "Clear application data safely",  module: "users", adminOnly: true },
      { label: "Super Admin",   icon: "shield",         route: "/super-admin",   color: "#1E1B4B", bg: "#EDE9FE", desc: "Dashboard, stats & controls",    module: "users", superAdminOnly: true },
      { label: "Registrations", icon: "user-plus",      route: "/registrations", color: "#D97706", bg: "#FFF7ED", desc: "Approve business accounts",      module: "users", superAdminOnly: true },
      { label: "Businesses",    icon: "briefcase",      route: "/businesses",    color: "#7C3AED", bg: "#F3E8FF", desc: "Manage all businesses",          module: "users", superAdminOnly: true },
    ],
  },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  const canSee = (item: MenuItem) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    return hasPrivilege(user, item.module);
  };

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
      activeOpacity={0.7}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
        <Feather name={item.icon} size={22} color={item.color} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.text }]} numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.headerBg, colors.primary]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{user?.name}</Text>
            <View style={styles.userMeta}>
              <View style={styles.roleBadge}>
                <Feather
                  name={isSuperAdmin ? "star" : isAdmin ? "shield" : "user"}
                  size={10}
                  color="#FFFFFF"
                />
                <Text style={styles.roleBadgeText}>
                  {user?.role?.replace("_", " ").toUpperCase()}
                </Text>
              </View>
              <Text style={styles.userHandle}>@{user?.username}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {SECTIONS.map((section) => {
          const visible = section.items.filter(canSee);
          if (visible.length === 0) return null;

          return (
            <View key={section.title} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: section.accent + "15" }]}>
                  <Feather name={section.icon} size={14} color={section.accent} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {section.title}
                </Text>
                <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
                <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                  {visible.length}
                </Text>
              </View>
              <View style={styles.grid}>{visible.map(renderItem)}</View>
            </View>
          );
        })}

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <Feather name="info" size={16} color={colors.mutedForeground} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Version</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>Coins Sale 1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="user" size={16} color={colors.mutedForeground} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Logged in as</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{user?.username}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.danger }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={18} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  userName: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFFFFF" },
  userMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  userHandle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
  },

  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionDivider: { flex: 1, height: 1, marginLeft: 4 },
  sectionCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    minWidth: 18,
    textAlign: "right",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuItem: {
    width: "31.8%",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 92,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11.5,
    lineHeight: 14,
    textAlign: "center",
  },

  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  logoutBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  logoutText: { fontFamily: "Inter_700Bold", fontSize: 15 },
});

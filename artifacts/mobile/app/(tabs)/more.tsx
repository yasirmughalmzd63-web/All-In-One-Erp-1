import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const MENU_ITEMS = [
  { label: "Customers", icon: "users" as const, route: "/customers", color: "#2563EB", bg: "#EFF6FF", desc: "Manage customer records" },
  { label: "Suppliers", icon: "truck" as const, route: "/suppliers", color: "#0284C7", bg: "#E0F2FE", desc: "Manage supplier records" },
  { label: "Users", icon: "user-check" as const, route: "/users", color: "#7C3AED", bg: "#F3E8FF", desc: "Manage user accounts" },
  { label: "Locations", icon: "map-pin" as const, route: "/locations", color: "#059669", bg: "#ECFDF5", desc: "Manage store locations" },
  { label: "Accounts", icon: "credit-card" as const, route: "/accounts", color: "#D97706", bg: "#FFF7ED", desc: "Financial accounts" },
  { label: "Categories", icon: "tag" as const, route: "/categories", color: "#DC2626", bg: "#FEF2F2", desc: "Product categories" },
  { label: "Wallets", icon: "pocket" as const, route: "/wallets", color: "#0891B2", bg: "#ECFEFF", desc: "Wallet balances" },
  { label: "Audit Log", icon: "shield" as const, route: "/audit", color: "#475569", bg: "#F8FAFC", desc: "Activity history" },
  { label: "Credits", icon: "clock" as const, route: "/credits", color: "#7C3AED", bg: "#F3E8FF", desc: "Receivables & payables" },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

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
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MANAGEMENT</Text>
        <View style={styles.grid}>
          {MENU_ITEMS.map(item => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(item.route as `/customers`)}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                <Feather name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.menuDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

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

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger }]} onPress={handleLogout}>
          <Feather name="log-out" size={18} color={colors.danger} />
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

import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListUsers } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { ALL_MODULES, type AppModule } from "@/context/AuthContext";

type User = { id: number; name: string; username: string; role: string; isActive: boolean; privileges: string[] | null };

type ModuleMeta = { label: string; icon: string; group: string; desc: string };

const MODULE_META: Record<AppModule, ModuleMeta> = {
  // Main screens
  dashboard:           { label: "Dashboard",            icon: "grid",             group: "Main Screens",    desc: "View dashboard & stats" },
  pos:                 { label: "POS / Sales",          icon: "shopping-cart",    group: "Main Screens",    desc: "Use the Point of Sale screen" },
  sales:               { label: "Sales List",           icon: "file-text",        group: "Main Screens",    desc: "View & delete sales history" },
  purchases:           { label: "Purchases",            icon: "shopping-bag",     group: "Main Screens",    desc: "Add & view purchases" },
  expenses:            { label: "Expenses",             icon: "arrow-down-circle",group: "Main Screens",    desc: "Add & view expenses" },
  credits:             { label: "Credits",              icon: "clock",            group: "Main Screens",    desc: "View credit receivables & payables" },
  inventory:           { label: "Inventory",            icon: "box",              group: "Main Screens",    desc: "View & manage stock levels" },
  // Management
  customers:           { label: "Customers",            icon: "users",            group: "Management",      desc: "Add & manage customers" },
  suppliers:           { label: "Suppliers",            icon: "truck",            group: "Management",      desc: "Add & manage suppliers" },
  accounts:            { label: "Accounts",             icon: "credit-card",      group: "Management",      desc: "Manage payment accounts" },
  locations:           { label: "Locations",            icon: "map-pin",          group: "Management",      desc: "Manage store locations" },
  categories:          { label: "Categories",           icon: "tag",              group: "Management",      desc: "Manage product categories" },
  users:               { label: "Users",                icon: "user-check",       group: "Management",      desc: "View & manage user accounts" },
  // Reports
  audit:               { label: "Audit Log",            icon: "shield",           group: "Reports",         desc: "View system activity history" },
  currency:            { label: "Currency / Dollar",    icon: "dollar-sign",      group: "Reports",         desc: "Forex & dollar wallet" },
  cash_count:          { label: "Cash Count",           icon: "archive",          group: "Reports",         desc: "Balance sheet & reconciliation" },
  // POS granular controls
  pos_product:         { label: "Select Product",       icon: "package",          group: "POS Controls",    desc: "Can choose which product to sell" },
  pos_location:        { label: "Select Location",      icon: "map-pin",          group: "POS Controls",    desc: "Can change the sale location" },
  pos_account:         { label: "Select Account",       icon: "credit-card",      group: "POS Controls",    desc: "Can choose payment account" },
  pos_credit_customer: { label: "Credit Sales",         icon: "clock",            group: "POS Controls",    desc: "Can create credit sales & pick customer" },
};

const GROUPS = ["Main Screens", "POS Controls", "Management", "Reports"];

const GROUP_COLORS: Record<string, { header: string; bg: string; icon: string }> = {
  "Main Screens": { header: "#2563EB", bg: "#EFF6FF", icon: "#2563EB" },
  "POS Controls": { header: "#059669", bg: "#ECFDF5", icon: "#059669" },
  "Management":   { header: "#D97706", bg: "#FFF7ED", icon: "#D97706" },
  "Reports":      { header: "#7C3AED", bg: "#F3E8FF", icon: "#7C3AED" },
};

export default function PrivilegesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const { data: usersRaw, isLoading, refetch } = useListUsers();
  const users = ((usersRaw ?? []) as unknown as User[]).filter(u => u.role !== "admin");

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [privileges, setPrivileges] = useState<Set<string>>(new Set());
  const [allAccess, setAllAccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const openUser = (u: User) => {
    setSelectedUser(u);
    if (!u.privileges || u.privileges.length === 0) {
      setAllAccess(true);
      setPrivileges(new Set(ALL_MODULES));
    } else {
      setAllAccess(false);
      setPrivileges(new Set(u.privileges));
    }
  };

  const toggleModule = (m: AppModule) => {
    if (allAccess) return;
    setPrivileges(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const toggleGroup = (group: string, enable: boolean) => {
    if (allAccess) return;
    const groupModules = (ALL_MODULES as unknown as AppModule[]).filter(m => MODULE_META[m].group === group);
    setPrivileges(prev => {
      const next = new Set(prev);
      groupModules.forEach(m => { if (enable) next.add(m); else next.delete(m); });
      return next;
    });
  };

  const toggleAll = (v: boolean) => {
    setAllAccess(v);
    if (v) setPrivileges(new Set(ALL_MODULES));
    else setPrivileges(new Set());
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await customFetch<unknown>(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ privileges: allAccess ? null : Array.from(privileges) }),
      });
      queryClient.invalidateQueries();
      refetch();
      setSelectedUser(null);
      Alert.alert("Saved", `Privileges updated for ${selectedUser.name}`);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const getPrivilegeCount = (u: User) => {
    if (!u.privileges || u.privileges.length === 0) return ALL_MODULES.length;
    return u.privileges.length;
  };

  const renderUser = ({ item }: { item: User }) => {
    const hasAll = !item.privileges || item.privileges.length === 0;
    const count = getPrivilegeCount(item);
    const hasPosProduct = hasAll || (item.privileges?.includes("pos_product") ?? false);
    const hasPosAccount = hasAll || (item.privileges?.includes("pos_account") ?? false);
    const hasCreditSale = hasAll || (item.privileges?.includes("pos_credit_customer") ?? false);
    return (
      <TouchableOpacity
        style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openUser(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { backgroundColor: item.isActive ? colors.primary : colors.mutedForeground }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
            {!item.isActive && (
              <View style={[styles.pill, { backgroundColor: colors.dangerBg }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: colors.danger }}>INACTIVE</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userSub, { color: colors.mutedForeground }]}>@{item.username} · {item.role}</Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            <PrivPill label="Product" on={hasPosProduct} colors={colors} />
            <PrivPill label="Account" on={hasPosAccount} colors={colors} />
            <PrivPill label="Credit" on={hasCreditSale} colors={colors} />
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[styles.pill, { backgroundColor: hasAll ? "#DCFCE7" : "#EFF6FF" }]}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: hasAll ? "#16A34A" : "#2563EB" }}>
              {hasAll ? "Full Access" : `${count} privs`}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#059669", "#047857"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>User Privileges</Text>
          <Text style={styles.headerSub}>Granular access control per user</Text>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => String(u.id)}
          renderItem={renderUser}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 10 }}
          ListHeaderComponent={
            <View style={[styles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Admin users always have full access. Set access below for cashiers and other roles.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="user-x" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No non-admin users found</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selectedUser} animationType="slide" transparent onRequestClose={() => setSelectedUser(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "94%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.avatar, { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20 }]}>
                  <Text style={[styles.avatarText, { fontSize: 16 }]}>{selectedUser?.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: colors.text }}>{selectedUser?.name}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>@{selectedUser?.username} · {selectedUser?.role}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedUser(null)} style={{ padding: 4 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Full Access toggle */}
              <TouchableOpacity
                style={[styles.allAccessRow, { backgroundColor: allAccess ? "#DCFCE7" : colors.secondary, borderColor: allAccess ? "#16A34A" : colors.border }]}
                onPress={() => toggleAll(!allAccess)}
                activeOpacity={0.8}
              >
                <View style={[styles.allAccessIcon, { backgroundColor: allAccess ? "#16A34A" : colors.mutedForeground }]}>
                  <Feather name={allAccess ? "unlock" : "lock"} size={16} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>Full Access</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Allow access to all modules & POS controls</Text>
                </View>
                <Switch value={allAccess} onValueChange={toggleAll} trackColor={{ true: "#16A34A" }} />
              </TouchableOpacity>

              {/* Module groups */}
              {!allAccess && GROUPS.map(group => {
                const groupModules = (ALL_MODULES as unknown as AppModule[]).filter(m => MODULE_META[m].group === group);
                const groupEnabled = groupModules.filter(m => privileges.has(m)).length;
                const groupTotal = groupModules.length;
                const allGroupOn = groupEnabled === groupTotal;
                const gc = GROUP_COLORS[group]!;
                return (
                  <View key={group} style={[styles.groupCard, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={[styles.groupHeader, { backgroundColor: gc.bg }]}
                      onPress={() => toggleGroup(group, !allGroupOn)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.groupDot, { backgroundColor: gc.header }]} />
                      <Text style={[styles.groupTitle, { color: gc.header }]}>{group}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: gc.header, flex: 1 }}>
                        {groupEnabled}/{groupTotal} enabled
                      </Text>
                      <View style={[styles.groupToggle, { backgroundColor: allGroupOn ? gc.header : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#FFF" }}>
                          {allGroupOn ? "ALL ON" : "ALL OFF"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      {groupModules.map((m, idx) => {
                        const on = privileges.has(m);
                        const meta = MODULE_META[m];
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.moduleRow, {
                              borderTopColor: colors.border,
                              borderTopWidth: idx === 0 ? 0 : 1,
                            }]}
                            onPress={() => toggleModule(m)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.moduleIcon, { backgroundColor: on ? gc.bg : colors.input }]}>
                              <Feather name={meta.icon as "grid"} size={15} color={on ? gc.icon : colors.mutedForeground} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.moduleLabel, { color: on ? colors.text : colors.mutedForeground }]}>{meta.label}</Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{meta.desc}</Text>
                            </View>
                            <View style={[styles.checkBox, {
                              backgroundColor: on ? gc.header : "transparent",
                              borderColor: on ? gc.header : colors.border,
                            }]}>
                              {on && <Feather name="check" size={12} color="#FFF" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#059669", opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Feather name="check" size={18} color="#FFF" />
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Privileges"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PrivPill({ label, on, colors }: { label: string; on: boolean; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: on ? "#DCFCE7" : "#FEF2F2" }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: on ? "#16A34A" : "#DC2626" }}>
        {on ? "✓" : "✗"} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },
  userCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" },
  userName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  userSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  empty: { alignItems: "center", paddingVertical: 50, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  allAccessRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 16 },
  allAccessIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  groupCard: { borderRadius: 14, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontFamily: "Inter_700Bold", fontSize: 13 },
  groupToggle: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  moduleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  moduleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 1 },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  saveBtn: { borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, marginBottom: 24 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

const MODULE_META: Record<AppModule, { label: string; icon: string; group: string }> = {
  dashboard:  { label: "Dashboard",      icon: "grid",       group: "Main" },
  pos:        { label: "POS / Sales",    icon: "shopping-cart", group: "Main" },
  sales:      { label: "Sales List",     icon: "file-text",  group: "Main" },
  purchases:  { label: "Purchases",      icon: "shopping-bag", group: "Main" },
  expenses:   { label: "Expenses",       icon: "arrow-down-circle", group: "Main" },
  credits:    { label: "Credits",        icon: "clock",      group: "Main" },
  inventory:  { label: "Inventory",      icon: "box",        group: "Main" },
  customers:  { label: "Customers",      icon: "users",      group: "Management" },
  suppliers:  { label: "Suppliers",      icon: "truck",      group: "Management" },
  accounts:   { label: "Accounts",       icon: "credit-card", group: "Management" },
  locations:  { label: "Locations",      icon: "map-pin",    group: "Management" },
  categories: { label: "Categories",     icon: "tag",        group: "Management" },
  users:      { label: "Users",          icon: "user-check", group: "Management" },
  audit:      { label: "Audit Log",      icon: "shield",     group: "Reports" },
  currency:   { label: "Currency/Dollar", icon: "dollar-sign", group: "Reports" },
  cash_count: { label: "Cash Count",     icon: "archive",    group: "Reports" },
};

const GROUPS = ["Main", "Management", "Reports"];

export default function PrivilegesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
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
    setPrivileges(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const toggleAll = (v: boolean) => {
    setAllAccess(v);
    if (v) setPrivileges(new Set(ALL_MODULES));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await customFetch<unknown>(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          privileges: allAccess ? null : Array.from(privileges),
        }),
      });
      queryClient.invalidateQueries();
      refetch();
      setSelectedUser(null);
      Alert.alert("Saved", `Privileges updated for ${selectedUser.name}`);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const renderUser = ({ item }: { item: User }) => {
    const hasAll = !item.privileges || item.privileges.length === 0;
    const count = hasAll ? ALL_MODULES.length : (item.privileges?.length ?? 0);
    return (
      <TouchableOpacity style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => openUser(item)}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.userSub, { color: colors.mutedForeground }]}>@{item.username} • {item.role}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={[styles.badge, { backgroundColor: hasAll ? "#DCFCE7" : "#EFF6FF" }]}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: hasAll ? "#16A34A" : "#2563EB" }}>
              {hasAll ? "Full Access" : `${count} modules`}
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
        <Text style={styles.headerTitle}>User Privileges</Text>
        <Text style={styles.headerSub}>Control which modules each user can access</Text>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => String(u.id)}
          renderItem={renderUser}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          ListHeaderComponent={
            <Text style={[styles.sectionNote, { color: colors.mutedForeground, backgroundColor: colors.card, borderColor: colors.border }]}>
              Admin users always have full access. Configure below for cashiers and other roles.
            </Text>
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
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{selectedUser?.name}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>@{selectedUser?.username} • {selectedUser?.role}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedUser(null)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <View style={[styles.allAccessRow, { backgroundColor: allAccess ? "#DCFCE7" : colors.secondary, borderColor: allAccess ? "#16A34A" : colors.border }]}>
                <View>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>Full Access</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Allow access to all modules</Text>
                </View>
                <Switch value={allAccess} onValueChange={toggleAll} trackColor={{ true: "#16A34A" }} />
              </View>

              {!allAccess && GROUPS.map(group => (
                <View key={group} style={{ marginBottom: 16 }}>
                  <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{group.toUpperCase()}</Text>
                  {(ALL_MODULES as unknown as AppModule[]).filter(m => MODULE_META[m].group === group).map(m => (
                    <TouchableOpacity key={m} style={[styles.moduleRow, { backgroundColor: colors.card, borderColor: privileges.has(m) ? colors.primary : colors.border }]}
                      onPress={() => toggleModule(m)}>
                      <View style={[styles.moduleIcon, { backgroundColor: privileges.has(m) ? colors.secondary : colors.input }]}>
                        <Feather name={MODULE_META[m].icon as "grid"} size={16} color={privileges.has(m) ? colors.primary : colors.mutedForeground} />
                      </View>
                      <Text style={[styles.moduleLabel, { color: colors.text }]}>{MODULE_META[m].label}</Text>
                      <View style={[styles.checkBox, { backgroundColor: privileges.has(m) ? colors.primary : "transparent", borderColor: privileges.has(m) ? colors.primary : colors.border }]}>
                        {privileges.has(m) && <Feather name="check" size={12} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#059669", opacity: saving ? 0.6 : 1 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Privileges"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF", marginBottom: 2 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" },
  sectionNote: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  userCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" },
  userName: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 2 },
  userSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { alignItems: "center", paddingVertical: 50, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  allAccessRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  groupLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  moduleIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  moduleLabel: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8, marginTop: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

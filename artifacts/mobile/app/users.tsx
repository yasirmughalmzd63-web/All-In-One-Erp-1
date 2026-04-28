import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useListLocations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type User = { id: number; name: string; username: string; role: string; isActive: boolean; locationId?: number | null };
type Location = { id: number; name: string };
const ROLES = ["admin", "manager", "cashier"];
const emptyForm = { name: "", username: "", password: "", role: "cashier", locationId: "" };

export default function UsersScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListUsers();
  const { data: locationsRaw } = useListLocations();
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const deleteMut = useDeleteUser();

  const items = (raw ?? []) as unknown as User[];
  const locations = (locationsRaw ?? []) as unknown as Location[];

  const getLocationName = (id?: number | null) => locations.find(l => l.id === id)?.name;

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (u: User) => {
    setEditItem(u);
    setForm({ name: u.name, username: u.username, password: "", role: u.role, locationId: u.locationId ? String(u.locationId) : "" });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.username.trim()) { Alert.alert("Error", "Name and username required"); return; }
    if (!editItem && !form.password) { Alert.alert("Error", "Password required for new user"); return; }
    if (form.role !== "admin" && !form.locationId) {
      Alert.alert("Error", "App is required for non-admin users");
      return;
    }
    try {
      const data: Record<string, unknown> = {
        name: form.name.trim(),
        role: form.role,
        locationId: form.locationId ? parseInt(form.locationId) : null,
      };
      if (!editItem) { Object.assign(data, { username: form.username.trim(), password: form.password }); }
      if (form.password && editItem) { data.password = form.password; }
      if (editItem) {
        await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data });
      } else {
        await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data });
      }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (u: User) => {
    Alert.alert("Delete User", `Delete "${u.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: u.id }); queryClient.invalidateQueries(); } catch (e) {} }},
    ]);
  };

  const roleColors: Record<string, [string, string]> = {
    admin: [colors.danger, colors.dangerBg],
    manager: [colors.expense, colors.expenseBg],
    cashier: [colors.purchase, colors.purchaseBg],
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No users</Text></View>}
          renderItem={({ item: u }) => {
            const [rc, rb] = roleColors[u.role] ?? [colors.mutedForeground, colors.muted];
            const locName = getLocationName(u.locationId);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardMain}>
                  <View style={[styles.avatar, { backgroundColor: rb }]}>
                    <Text style={[styles.avatarText, { color: rc }]}>{u.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{u.name}</Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>@{u.username}</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <View style={[styles.badge, { backgroundColor: rb }]}><Text style={[styles.badgeText, { color: rc }]}>{u.role}</Text></View>
                      {locName
                        ? <View style={[styles.badge, { backgroundColor: colors.secondary }]}><Text style={[styles.badgeText, { color: colors.primary }]}> {locName}</Text></View>
                        : u.role !== "admin" && <View style={[styles.badge, { backgroundColor: colors.dangerBg }]}><Text style={[styles.badgeText, { color: colors.danger }]}>No app</Text></View>
                      }
                      {!u.isActive && <View style={[styles.badge, { backgroundColor: colors.dangerBg }]}><Text style={[styles.badgeText, { color: colors.danger }]}>Inactive</Text></View>}
                    </View>
                  </View>
                  <View style={{ gap: 8 }}>
                    {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(u)}></TouchableOpacity>}
                    {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(u)}></TouchableOpacity>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAdd}>
        <Text style={{ color: "#FFF", fontSize: 32, fontFamily: "Inter_500Medium", lineHeight: 36 }}>+</Text>
      </TouchableOpacity>}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit User" : "New User"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {[["Full Name *", "name"], ["Username *", "username"], ["Password" + (editItem ? " (leave blank to keep)" : " *"), "password"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }} value={form[key as keyof typeof form]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} secureTextEntry={key === "password"} autoCapitalize={key === "username" ? "none" : "words"} placeholderTextColor={colors.mutedForeground} editable={key !== "username" || !editItem} />
                </View>
              ))}

              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Role</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                {ROLES.map(r => {
                  const [rc, rb] = roleColors[r] ?? [colors.mutedForeground, colors.muted];
                  return (
                    <TouchableOpacity key={r} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center", backgroundColor: form.role === r ? rc : colors.input, borderColor: form.role === r ? rc : colors.border }} onPress={() => setForm(f => ({ ...f, role: r }))}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.role === r ? "#FFF" : colors.text }}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
                Assigned App {form.role !== "admin" && <Text style={{ color: colors.danger }}>*</Text>}
              </Text>
              {locations.length === 0
                ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 12 }}>No apps available — create an app first</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {form.role === "admin" && (
                        <TouchableOpacity
                          style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center", backgroundColor: !form.locationId ? colors.primary : colors.input, borderColor: !form.locationId ? colors.primary : colors.border }}
                          onPress={() => setForm(f => ({ ...f, locationId: "" }))}
                        >
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: !form.locationId ? "#FFF" : colors.mutedForeground }}>All (Admin)</Text>
                        </TouchableOpacity>
                      )}
                      {locations.map(l => (
                        <TouchableOpacity
                          key={l.id}
                          style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center", backgroundColor: form.locationId === String(l.id) ? colors.primary : colors.input, borderColor: form.locationId === String(l.id) ? colors.primary : colors.border }}
                          onPress={() => setForm(f => ({ ...f, locationId: String(l.id) }))}
                        >
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.locationId === String(l.id) ? "#FFF" : colors.text }}>{l.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )
              }

              <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} User</Text>
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
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

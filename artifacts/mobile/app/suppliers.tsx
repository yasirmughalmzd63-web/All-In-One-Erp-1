import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useListLocations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Supplier = { id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; balance: string; locationId?: number | null };
type Location = { id: number; name: string };
const emptyForm = { name: "", phone: "", email: "", address: "", locationId: "" };

export default function SuppliersScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListSuppliers();
  const { data: locationsRaw } = useListLocations();
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const items = (raw ?? []) as unknown as Supplier[];
  const locations = (locationsRaw ?? []) as unknown as Location[];
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const locationName = (id?: number | null) => locations.find(l => l.id === id)?.name;

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...emptyForm, locationId: user?.locationId ? String(user.locationId) : "" });
    setShowModal(true);
  };
  const openEdit = (s: Supplier) => {
    setEditItem(s);
    setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", locationId: s.locationId ? String(s.locationId) : "" });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    const data = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      locationId: form.locationId ? parseInt(form.locationId) : null,
    };
    try {
      if (editItem) {
        await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data });
      } else {
        await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data });
      }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (s: Supplier) => {
    Alert.alert("Delete", `Delete "${s.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: s.id }); queryClient.invalidateQueries(); } catch {}
      }},
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search suppliers..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={15} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListHeaderComponent={filtered.length > 0 ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>{filtered.length} supplier{filtered.length !== 1 ? "s" : ""}</Text> : null}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Feather name="truck" size={40} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No suppliers</Text>
            </View>
          }
          renderItem={({ item: s }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardMain}>
                <View style={[styles.avatar, { backgroundColor: colors.purchaseBg }]}>
                  <Feather name="truck" size={20} color={colors.purchase} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, { color: colors.text }]}>{s.name}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {locationName(s.locationId) && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#EFF6FF", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                        <Feather name="map-pin" size={9} color="#2563EB" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#2563EB" }}>{locationName(s.locationId)}</Text>
                      </View>
                    )}
                    {s.phone && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Feather name="phone" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{s.phone}</Text>
                      </View>
                    )}
                    {s.email && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Feather name="mail" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{s.email}</Text>
                      </View>
                    )}
                  </View>
                  {parseFloat(s.balance) > 0 && (
                    <Text style={[styles.cardSub, { color: colors.purchase, marginTop: 4 }]}>Balance: ${parseFloat(s.balance).toFixed(2)}</Text>
                  )}
                </View>
                <View style={{ gap: 8 }}>
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(s)}>
                    <Feather name="edit-2" size={14} color={colors.primary} />
                  </TouchableOpacity>}
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(s)}>
                    <Feather name="trash-2" size={14} color={colors.danger} />
                  </TouchableOpacity>}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: colors.purchase }]} onPress={openAdd}>
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Supplier" : "New Supplier"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {[["Name *", "name"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                    value={form[key as keyof typeof form]}
                    onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}

              {/* Location selector */}
              {locations.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Feather name="map-pin" size={12} color={colors.purchase} />
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>Location</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.locChip, { borderColor: form.locationId === "" ? colors.purchase : colors.border, backgroundColor: form.locationId === "" ? colors.purchaseBg : colors.input }]}
                        onPress={() => setForm(f => ({ ...f, locationId: "" }))}
                      >
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: form.locationId === "" ? colors.purchase : colors.mutedForeground }}>No Location</Text>
                      </TouchableOpacity>
                      {locations.map(l => (
                        <TouchableOpacity
                          key={l.id}
                          style={[styles.locChip, {
                            backgroundColor: form.locationId === String(l.id) ? colors.purchase : colors.input,
                            borderColor: form.locationId === String(l.id) ? colors.purchase : colors.border,
                          }]}
                          onPress={() => setForm(f => ({ ...f, locationId: String(l.id) }))}
                        >
                          <Feather name="map-pin" size={11} color={form.locationId === String(l.id) ? "#FFF" : colors.purchase} />
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: form.locationId === String(l.id) ? "#FFF" : colors.text }}>{l.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity style={{ backgroundColor: colors.purchase, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8, marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} Supplier</Text>
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
  searchRow: { flexDirection: "row", alignItems: "center", margin: 16, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, height: 44, gap: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  locChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
});

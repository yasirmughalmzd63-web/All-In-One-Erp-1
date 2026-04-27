import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListLocations, useCreateLocation, useUpdateLocation, useDeleteLocation } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Location = { id: number; name: string; address?: string | null; phone?: string | null; isActive: boolean };
const emptyForm = { name: "", address: "", phone: "" };

export default function LocationsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListLocations();
  const createMut = useCreateLocation();
  const updateMut = useUpdateLocation();
  const deleteMut = useDeleteLocation();
  const items = (raw ?? []) as unknown as Location[];

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (l: Location) => { setEditItem(l); setForm({ name: l.name, address: l.address ?? "", phone: l.phone ?? "" }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    const data = { name: form.name.trim(), address: form.address || null, phone: form.phone || null };
    try {
      if (editItem) { await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data }); }
      else { await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data }); }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (l: Location) => {
    Alert.alert("Delete", `Delete "${l.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: l.id }); queryClient.invalidateQueries(); } catch {} }},
    ]);
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="map-pin" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No locations</Text></View>}
          renderItem={({ item: l }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View style={[{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, { backgroundColor: "#ECFDF5" }]}><Feather name="map-pin" size={20} color="#059669" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text, marginBottom: 4 }}>{l.name}</Text>
                  {l.address && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{l.address}</Text>}
                  {l.phone && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{l.phone}</Text>}
                </View>
                <View style={{ gap: 8 }}>
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(l)}><Feather name="edit-2" size={14} color={colors.primary} /></TouchableOpacity>}
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(l)}><Feather name="trash-2" size={14} color={colors.danger} /></TouchableOpacity>}
                </View>
              </View>
            </View>
          )}
        />
      )}
      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: "#059669" }]} onPress={openAdd}><Feather name="plus" size={24} color="#FFFFFF" /></TouchableOpacity>}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Location" : "New Location"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              {[["Name *", "name"], ["Address", "address"], ["Phone", "phone"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }} value={form[key as keyof typeof form]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} placeholderTextColor={colors.mutedForeground} />
                </View>
              ))}
              <TouchableOpacity style={{ backgroundColor: "#059669", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8, marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

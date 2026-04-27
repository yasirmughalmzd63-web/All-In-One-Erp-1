import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Category = { id: number; name: string; type: string; description?: string | null };
const TYPES = ["product", "expense", "other"];
const emptyForm = { name: "", type: "product", description: "" };
const typeColor = { product: ["#2563EB", "#EFF6FF"], expense: ["#EA580C", "#FFF7ED"], other: ["#475569", "#F8FAFC"] } as Record<string, [string, string]>;

export default function CategoriesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListCategories();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();
  const items = (raw ?? []) as unknown as Category[];

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: Category) => { setEditItem(c); setForm({ name: c.name, type: c.type, description: c.description ?? "" }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    const data = { name: form.name.trim(), type: form.type, description: form.description || null };
    try {
      if (editItem) { await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data }); }
      else { await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data }); }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (c: Category) => {
    Alert.alert("Delete", `Delete "${c.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: c.id }); queryClient.invalidateQueries(); } catch {} }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="tag" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No categories</Text></View>}
          renderItem={({ item: c }) => {
            const [tc, tb] = typeColor[c.type] ?? ["#475569", "#F8FAFC"];
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={[styles.iconBox, { backgroundColor: tb }]}><Feather name="tag" size={18} color={tc} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{c.name}</Text>
                    {c.description && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{c.description}</Text>}
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: tb }]}><Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: tc }}>{c.type}</Text></View>
                  <View style={{ gap: 6 }}>
                    {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(c)}><Feather name="edit-2" size={13} color={colors.primary} /></TouchableOpacity>}
                    {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(c)}><Feather name="trash-2" size={13} color={colors.danger} /></TouchableOpacity>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: colors.danger }]} onPress={openAdd}><Feather name="plus" size={24} color="#FFFFFF" /></TouchableOpacity>}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Category" : "New Category"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Name *</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Type</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                {TYPES.map(t => {
                  const [tc, tb] = typeColor[t] ?? ["#475569", "#F8FAFC"];
                  return (
                    <TouchableOpacity key={t} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center", backgroundColor: form.type === t ? tc : colors.input, borderColor: form.type === t ? tc : colors.border }} onPress={() => setForm(f => ({ ...f, type: t }))}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.type === t ? "#FFF" : colors.text }}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Description</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 20 }} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />
              <TouchableOpacity style={{ backgroundColor: colors.danger, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} Category</Text>
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
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  actionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

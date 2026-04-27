import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Account = { id: number; name: string; type: string; balance: string; currency: string; isActive: boolean };
const ACCOUNT_TYPES = ["cash", "bank", "mobile", "other"];
const emptyForm = { name: "", type: "cash", currency: "USD", balance: "0" };

export default function AccountsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListAccounts();
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const deleteMut = useDeleteAccount();
  const items = (raw ?? []) as unknown as Account[];
  const total = items.reduce((sum, a) => sum + parseFloat(a.balance), 0);

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a: Account) => { setEditItem(a); setForm({ name: a.name, type: a.type, currency: a.currency, balance: a.balance }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    try {
      const data = { name: form.name.trim(), type: form.type, currency: form.currency };
      if (editItem) { await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data }); }
      else { await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data: { ...data, balance: parseFloat(form.balance || "0").toFixed(8) } }); }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (a: Account) => {
    Alert.alert("Delete", `Delete "${a.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: a.id }); queryClient.invalidateQueries(); } catch {} }},
    ]);
  };

  const typeIcon = (t: string) => ({ cash: "dollar-sign" as const, bank: "briefcase" as const, mobile: "smartphone" as const, other: "circle" as const }[t] ?? "circle" as const);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>TOTAL BALANCE</Text>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFFFFF", marginTop: 4 }}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      </View>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="credit-card" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No accounts</Text></View>}
          renderItem={({ item: a }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}><Feather name={typeIcon(a.type)} size={20} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{a.name}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{a.type} • {a.currency}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: parseFloat(a.balance) >= 0 ? colors.success : colors.danger }}>{a.currency} {parseFloat(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(a)}><Feather name="edit-2" size={13} color={colors.primary} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(a)}><Feather name="trash-2" size={13} color={colors.danger} /></TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAdd}><Feather name="plus" size={24} color="#FFFFFF" /></TouchableOpacity>
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Account" : "New Account"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Name *</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Account Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {ACCOUNT_TYPES.map(t => (
                  <TouchableOpacity key={t} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, backgroundColor: form.type === t ? colors.primary : colors.input, borderColor: form.type === t ? colors.primary : colors.border }} onPress={() => setForm(f => ({ ...f, type: t }))}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.type === t ? "#FFF" : colors.text }}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Currency</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.currency} onChangeText={v => setForm(f => ({ ...f, currency: v }))} autoCapitalize="characters" />
              {!editItem && (
                <>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Initial Balance</Text>
                  <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.balance} onChangeText={v => setForm(f => ({ ...f, balance: v }))} keyboardType="decimal-pad" />
                </>
              )}
              <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8, marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  totalCard: { margin: 16, borderRadius: 16, padding: 20 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

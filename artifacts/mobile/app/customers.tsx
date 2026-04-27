import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Customer = { id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; creditBalance: string };
const emptyForm = { name: "", phone: "", email: "", address: "", openingCreditBalance: "", openingCreditType: "receivable" as "receivable" | "payable" };

export default function CustomersScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListCustomers();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const items = (raw ?? []) as unknown as Customer[];
  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) || (i.phone ?? "").includes(search)
  );

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: Customer) => {
    setEditItem(c);
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", openingCreditBalance: "", openingCreditType: "receivable" });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    const data: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
    };
    if (!editItem && form.openingCreditBalance) {
      const bal = parseFloat(form.openingCreditBalance);
      if (!isNaN(bal) && bal > 0) {
        data.openingCreditBalance = bal.toFixed(8);
        data.openingCreditType = form.openingCreditType;
      }
    }
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

  const handleDelete = (c: Customer) => {
    Alert.alert("Delete", `Delete "${c.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: c.id });
            queryClient.invalidateQueries();
          } catch {}
        }
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search customers..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No customers</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardMain}>
                <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, { color: colors.text }]}>{c.name}</Text>
                  {c.phone && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}><Feather name="phone" size={11} /> {c.phone}</Text>}
                  {c.email && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}><Feather name="mail" size={11} /> {c.email}</Text>}
                  {parseFloat(c.creditBalance) > 0 && (
                    <Text style={[styles.cardSub, { color: colors.credit }]}>Credit: ${parseFloat(c.creditBalance).toFixed(2)}</Text>
                  )}
                </View>
                <View style={{ gap: 8 }}>
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(c)}>
                    <Feather name="edit-2" size={14} color={colors.primary} />
                  </TouchableOpacity>}
                  {isAdmin && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(c)}>
                    <Feather name="trash-2" size={14} color={colors.danger} />
                  </TouchableOpacity>}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAdd}>
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Customer" : "New Customer"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {(["Name *", "name", "Phone", "phone", "Email", "email", "Address", "address"] as string[])
                .reduce<[string, string][]>((acc, _, i, arr) => { if (i % 2 === 0) acc.push([arr[i]!, arr[i + 1]!]); return acc; }, [])
                .map(([label, key]) => (
                  <View key={key} style={{ marginBottom: 12 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                    <TextInput
                      style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                      value={form[key as keyof typeof form] as string}
                      onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                      placeholderTextColor={colors.mutedForeground}
                      placeholder={label.replace(" *", "")}
                    />
                  </View>
                ))}

              {!editItem && (
                <View style={[styles.creditSection, { borderColor: colors.credit + "55", backgroundColor: colors.creditBg }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Feather name="credit-card" size={15} color={colors.credit} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.credit }}>Opening Credit Balance</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>(optional)</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Balance Amount</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }}
                    value={form.openingCreditBalance}
                    onChangeText={v => setForm(f => ({ ...f, openingCreditBalance: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Credit Type</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {(["receivable", "payable"] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeBtn, {
                          backgroundColor: form.openingCreditType === t ? (t === "receivable" ? colors.success : colors.credit) : colors.input,
                          borderColor: form.openingCreditType === t ? (t === "receivable" ? colors.success : colors.credit) : colors.border,
                          flex: 1,
                        }]}
                        onPress={() => setForm(f => ({ ...f, openingCreditType: t }))}
                      >
                        <Feather
                          name={t === "receivable" ? "arrow-down-left" : "arrow-up-right"}
                          size={14}
                          color={form.openingCreditType === t ? "#FFF" : colors.mutedForeground}
                        />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.openingCreditType === t ? "#FFF" : colors.mutedForeground }}>
                          {t === "receivable" ? "Receivable (to receive)" : "Payable (to pay)"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 16, marginBottom: 40 }}
                onPress={handleSubmit}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>
                  {editItem ? "Update" : "Create"} Customer
                </Text>
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
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 4 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  creditSection: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5 },
});

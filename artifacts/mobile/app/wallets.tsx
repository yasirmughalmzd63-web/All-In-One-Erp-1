import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListWallets, useCreateWallet, useWalletTransfer } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Wallet = { id: number; name: string; type: string; balance: string; currency: string; isActive: boolean };
const TYPES = ["cash", "bank", "mobile", "crypto", "other"];
const emptyForm = { name: "", type: "cash", currency: "USD", balance: "0" };

export default function WalletsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [transfer, setTransfer] = useState({ fromId: "", toId: "", amount: "", notes: "" });

  const { data: raw, isLoading, refetch } = useListWallets();
  const createMut = useCreateWallet();
  const transferMut = useWalletTransfer();
  const items = (raw ?? []) as unknown as Wallet[];
  const total = items.reduce((sum, w) => sum + parseFloat(w.balance), 0);

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    try {
      await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data: { name: form.name, type: form.type, currency: form.currency, balance: parseFloat(form.balance || "0").toFixed(8) } });
      queryClient.invalidateQueries();
      setShowAddModal(false);
      setForm(emptyForm);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleTransfer = async () => {
    if (!transfer.amount || parseFloat(transfer.amount) <= 0) { Alert.alert("Error", "Valid amount required"); return; }
    try {
      await (transferMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          fromWalletId: transfer.fromId ? parseInt(transfer.fromId) : null,
          toWalletId: transfer.toId ? parseInt(transfer.toId) : null,
          amount: parseFloat(transfer.amount).toFixed(8),
          notes: transfer.notes || null,
        },
      });
      queryClient.invalidateQueries();
      setShowTransferModal(false);
      setTransfer({ fromId: "", toId: "", amount: "", notes: "" });
      Alert.alert("Success", "Transfer completed");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.totalCard, { backgroundColor: "#0891B2" }]}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>TOTAL WALLET BALANCE</Text>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFFFFF", marginTop: 4 }}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        <TouchableOpacity style={[styles.transferBtn, { backgroundColor: "rgba(255,255,255,0.25)" }]} onPress={() => setShowTransferModal(true)}>
          <Feather name="arrow-right-circle" size={16} color="#FFF" />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF" }}>Transfer</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="pocket" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No wallets</Text></View>}
          renderItem={({ item: w }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.iconBox, { backgroundColor: "#ECFEFF" }]}><Feather name="pocket" size={20} color="#0891B2" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{w.name}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{w.type} • {w.currency}</Text>
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: parseFloat(w.balance) >= 0 ? colors.success : colors.danger }}>
                  {parseFloat(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          )}
        />
      )}
      <TouchableOpacity style={[styles.fab, { backgroundColor: "#0891B2" }]} onPress={() => setShowAddModal(true)}><Feather name="plus" size={24} color="#FFFFFF" /></TouchableOpacity>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New Wallet</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Name *</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {TYPES.map(t => (
                  <TouchableOpacity key={t} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, backgroundColor: form.type === t ? "#0891B2" : colors.input, borderColor: form.type === t ? "#0891B2" : colors.border }} onPress={() => setForm(f => ({ ...f, type: t }))}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.type === t ? "#FFF" : colors.text }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Currency</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }} value={form.currency} onChangeText={v => setForm(f => ({ ...f, currency: v }))} autoCapitalize="characters" />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Initial Balance</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 20 }} value={form.balance} onChangeText={v => setForm(f => ({ ...f, balance: v }))} keyboardType="decimal-pad" />
              <TouchableOpacity style={{ backgroundColor: "#0891B2", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 40 }} onPress={handleCreate}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>Create Wallet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => setShowTransferModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Transfer Funds</Text>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>From Wallet</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, backgroundColor: !transfer.fromId ? "#0891B2" : colors.input, borderColor: "#0891B2" }} onPress={() => setTransfer(t => ({ ...t, fromId: "" }))}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: !transfer.fromId ? "#FFF" : colors.text }}>External</Text>
                </TouchableOpacity>
                {items.map(w => (
                  <TouchableOpacity key={w.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, backgroundColor: transfer.fromId === String(w.id) ? "#0891B2" : colors.input, borderColor: colors.border }} onPress={() => setTransfer(t => ({ ...t, fromId: String(w.id) }))}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: transfer.fromId === String(w.id) ? "#FFF" : colors.text }}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>To Wallet</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {items.map(w => (
                  <TouchableOpacity key={w.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, backgroundColor: transfer.toId === String(w.id) ? "#0891B2" : colors.input, borderColor: colors.border }} onPress={() => setTransfer(t => ({ ...t, toId: String(w.id) }))}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: transfer.toId === String(w.id) ? "#FFF" : colors.text }}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Amount</Text>
              <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 20 }} value={transfer.amount} onChangeText={v => setTransfer(t => ({ ...t, amount: v }))} keyboardType="decimal-pad" />
              <TouchableOpacity style={{ backgroundColor: "#0891B2", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 40 }} onPress={handleTransfer}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>Confirm Transfer</Text>
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
  transferBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginTop: 12, alignSelf: "flex-start" },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

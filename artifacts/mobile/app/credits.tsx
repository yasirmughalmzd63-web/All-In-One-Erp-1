import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListCredits, usePayCredit } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Credit = { id: number; type: string; partyName: string; partyType: string; amount: string; paidAmount: string; remainingAmount: string; status: string; dueDate?: string | null };

export default function CreditsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Credit | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "partial" | "paid">("all");

  const { data: raw, isLoading, refetch } = useListCredits();
  const payMut = usePayCredit();
  const credits = (raw ?? []) as unknown as Credit[];

  const filtered = filter === "all" ? credits : credits.filter(c => c.status === filter);
  const totalReceivable = credits.filter(c => c.type === "receivable").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const totalPayable = credits.filter(c => c.type === "payable").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);

  const handlePay = async () => {
    if (!selected || !payAmount || parseFloat(payAmount) <= 0) { Alert.alert("Error", "Enter valid amount"); return; }
    try {
      await (payMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: selected.id, data: { payAmount: parseFloat(payAmount).toFixed(8) } });
      queryClient.invalidateQueries();
      setSelected(null);
      setPayAmount("");
      Alert.alert("Success", "Payment recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const statusColor = (s: string, t: string) => {
    if (s === "paid") return [colors.success, colors.saleBg];
    if (s === "partial") return [colors.expense, colors.expenseBg];
    return t === "receivable" ? [colors.primary, colors.secondary] : [colors.credit, colors.creditBg];
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", gap: 12, padding: 16, paddingBottom: 0 }}>
        <View style={[styles.summaryCard, { backgroundColor: colors.saleBg, flex: 1 }]}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.success }}>RECEIVABLE</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.success, marginTop: 2 }}>${totalReceivable.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.creditBg, flex: 1 }]}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.credit }}>PAYABLE</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.credit, marginTop: 2 }}>${totalPayable.toFixed(2)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        {(["all", "pending", "partial", "paid"] as const).map(f => (
          <TouchableOpacity key={f} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: filter === f ? colors.primary : colors.card, borderWidth: 1.5, borderColor: filter === f ? colors.primary : colors.border }} onPress={() => setFilter(f)}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: filter === f ? "#FFF" : colors.mutedForeground }}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="clock" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No credits</Text></View>}
          renderItem={({ item: c }) => {
            const [tc, tb] = statusColor(c.status, c.type);
            const pct = parseFloat(c.amount) > 0 ? (parseFloat(c.paidAmount) / parseFloat(c.amount)) * 100 : 0;
            return (
              <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { if (c.status !== "paid") { setSelected(c); setPayAmount(""); } }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={[styles.iconBox, { backgroundColor: tb }]}><Feather name={c.type === "receivable" ? "arrow-down-left" : "arrow-up-right"} size={18} color={tc} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{c.partyName}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{c.type === "receivable" ? "To Receive" : "To Pay"} • {c.partyType}</Text>
                    {c.dueDate && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.expense, marginTop: 2 }}>Due: {c.dueDate}</Text>}
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Paid: ${parseFloat(c.paidAmount).toFixed(2)}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Remaining: ${parseFloat(c.remainingAmount).toFixed(2)}</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
                        <View style={{ height: 4, width: `${Math.min(100, pct)}%`, backgroundColor: tc, borderRadius: 2 }} />
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: tc }}>${parseFloat(c.remainingAmount).toFixed(2)}</Text>
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 }, { backgroundColor: tb }]}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: tc }}>{c.status}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 6 }}>Record Payment</Text>
            {selected && (
              <>
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4 }}>Party: {selected.partyName}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 16 }}>Remaining: ${parseFloat(selected.remainingAmount).toFixed(8)}</Text>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Pay Amount</Text>
                <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 16 }} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
                <TouchableOpacity style={{ backgroundColor: colors.credit, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 8 }} onPress={handlePay}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>Confirm Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: "center", paddingVertical: 12, marginBottom: 24 }} onPress={() => setSelected(null)}>
                  <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { borderRadius: 12, padding: 14 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

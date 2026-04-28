import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListCredits, usePayCredit, useListAccounts } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Credit = {
  id: number; type: string; partyName: string; partyType: string;
  amount: string; paidAmount: string; remainingAmount: string;
  status: string; dueDate?: string | null; notes?: string | null;
  createdAt: string;
};
type Account = { id: number; name: string; type: string; balance: string };
type FilterKey = "all" | "new" | "pending" | "received";

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: "all",      label: "All",      icon: "list"            },
  { key: "new",      label: "New",      icon: "plus-circle"     },
  { key: "pending",  label: "Pending",  icon: "clock"           },
  { key: "received", label: "Received", icon: "check-circle"    },
];

function matchFilter(c: Credit, f: FilterKey): boolean {
  if (f === "all")      return true;
  if (f === "new")      return c.status === "pending";
  if (f === "pending")  return c.status === "partial";
  if (f === "received") return c.status === "paid";
  return true;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function CreditsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Credit | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: raw, isLoading, refetch } = useListCredits();
  const { data: accountsRaw } = useListAccounts();
  const payMut = usePayCredit();

  const credits  = (raw ?? []) as unknown as Credit[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];

  // Summary numbers — receivable = money customers owe us
  const custCredits   = credits.filter(c => c.type === "receivable");
  const newCount      = custCredits.filter(c => c.status === "pending").length;
  const pendingCount  = custCredits.filter(c => c.status === "partial").length;
  const receivedTotal = custCredits.filter(c => c.status === "paid").reduce((s, c) => s + parseFloat(c.amount), 0);
  const outstandingTotal = custCredits.filter(c => c.status !== "paid").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const newAmount     = custCredits.filter(c => c.status === "pending").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const pendingAmount = custCredits.filter(c => c.status === "partial").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);

  const filtered = credits.filter(c => matchFilter(c, filter));

  const handlePay = async () => {
    if (!selected || !payAmount || parseFloat(payAmount) <= 0) { Alert.alert("Error", "Enter valid amount"); return; }
    if (parseFloat(payAmount) > parseFloat(selected.remainingAmount)) {
      Alert.alert("Error", "Amount exceeds remaining balance"); return;
    }
    try {
      await (payMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({
        id: selected.id,
        data: {
          payAmount: parseFloat(payAmount).toFixed(8),
          accountId: selectedAccountId ? parseInt(selectedAccountId) : null,
        },
      });
      queryClient.invalidateQueries();
      setSelected(null);
      setPayAmount("");
      setSelectedAccountId("");
      Alert.alert("Success", "Payment recorded successfully");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const statusMeta = (c: Credit): { label: string; color: string; bg: string; icon: string } => {
    if (c.status === "paid")    return { label: "Received",  color: colors.success, bg: colors.saleBg,    icon: "check-circle"  };
    if (c.status === "partial") return { label: "Pending",   color: colors.expense, bg: colors.expenseBg, icon: "clock"         };
    return c.type === "receivable"
      ? { label: "New",     color: colors.primary, bg: colors.secondary, icon: "plus-circle"   }
      : { label: "Payable", color: colors.credit,  bg: colors.creditBg,  icon: "arrow-up-right" };
  };

  const filterCount = (k: FilterKey) => credits.filter(c => matchFilter(c, k)).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── 2×2 Summary Grid ─────────────────────────────────────────────── */}
      <View style={{ padding: 16, paddingBottom: 6, gap: 10 }}>
        {/* Row 1 */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {/* Outstanding */}
          <View style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 14, padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="alert-circle" size={13} color="#FFF" />
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>OUTSTANDING</Text>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" }}>{fmt(outstandingTotal)}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {newCount + pendingCount} unpaid credit{newCount + pendingCount !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Received */}
          <View style={{ flex: 1, backgroundColor: colors.saleBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.success + "33" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.success + "22", alignItems: "center", justifyContent: "center" }}>
                <Feather name="check-circle" size={13} color={colors.success} />
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.success, letterSpacing: 0.5 }}>RECEIVED</Text>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: colors.success }}>{fmt(receivedTotal)}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.success + "99", marginTop: 3 }}>
              {custCredits.filter(c => c.status === "paid").length} collected
            </Text>
          </View>
        </View>

        {/* Row 2 */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {/* New (not yet paid at all) */}
          <View style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.primary + "22" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Feather name="plus-circle" size={13} color={colors.primary} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.primary, letterSpacing: 0.5 }}>NEW CREDITS</Text>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.primary }}>{fmt(newAmount)}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>{newCount} awaiting first payment</Text>
          </View>

          {/* Pending (partially paid) */}
          <View style={{ flex: 1, backgroundColor: colors.expenseBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.expense + "33" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Feather name="clock" size={13} color={colors.expense} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.expense, letterSpacing: 0.5 }}>PARTIALLY PAID</Text>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.expense }}>{fmt(pendingAmount)}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.expense + "AA", marginTop: 2 }}>{pendingCount} still pending</Text>
          </View>
        </View>
      </View>

      {/* ── Filter tabs ───────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 14, paddingVertical: 8 }} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
        {FILTERS.map(f => {
          const cnt = filterCount(f.key);
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: active ? colors.primary : colors.card,
                borderWidth: 1.5, borderColor: active ? colors.primary : colors.border,
              }}
              onPress={() => setFilter(f.key)}
            >
              <Feather name={f.icon as never} size={12} color={active ? "#FFF" : colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: active ? "#FFF" : colors.mutedForeground }}>
                {f.label}
              </Text>
              {cnt > 0 && (
                <View style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.secondary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: active ? "#FFF" : colors.primary }}>{cnt}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Credit list ───────────────────────────────────────────────────── */}
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Feather name="clock" size={32} color={colors.primary} />
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>No credits here</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
                {filter === "all" ? "No credits recorded yet" : `No ${filter} credits`}
              </Text>
            </View>
          }
          renderItem={({ item: c }) => {
            const meta = statusMeta(c);
            const pct = parseFloat(c.amount) > 0 ? (parseFloat(c.paidAmount) / parseFloat(c.amount)) * 100 : 0;
            const canPay = c.status !== "paid";
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: canPay ? colors.border : colors.success + "44" }]}
                onPress={() => { if (canPay) { setSelected(c); setPayAmount(""); setSelectedAccountId(""); } }}
                activeOpacity={canPay ? 0.7 : 1}
              >
                {/* Top row */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
                    <Feather name={meta.icon as never} size={18} color={meta.color} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text, flex: 1, marginRight: 8 }} numberOfLines={1}>{c.partyName}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: meta.color }}>{fmt(parseFloat(c.remainingAmount))}</Text>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                        {c.type === "receivable" ? "Customer owes" : "We owe"} · {c.partyType}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: meta.color }}>{meta.label}</Text>
                      </View>
                    </View>

                    {c.dueDate && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.expense, marginBottom: 2 }}>
                        <Feather name="calendar" size={10} /> Due: {c.dueDate}
                      </Text>
                    )}

                    {/* Progress bar */}
                    {pct > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                            Paid: {fmt(parseFloat(c.paidAmount))}
                          </Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                            Left: {fmt(parseFloat(c.remainingAmount))}
                          </Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
                          <View style={{ height: 4, width: `${Math.min(100, pct)}%` as unknown as number, backgroundColor: meta.color, borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground, marginTop: 2 }}>
                          {pct.toFixed(0)}% paid of {fmt(parseFloat(c.amount))}
                        </Text>
                      </View>
                    )}

                    {pct === 0 && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                        Total: {fmt(parseFloat(c.amount))} · No payments yet
                      </Text>
                    )}
                  </View>
                </View>

                {/* "Tap to record payment" hint */}
                {canPay && (
                  <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Feather name="arrow-right-circle" size={13} color={colors.primary} />
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.primary }}>Tap to record payment</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Pay Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            {selected && (
              <>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Record Payment</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>{selected.partyName}</Text>
                  </View>
                  <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={() => setSelected(null)}>
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Summary row */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
                  <View style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 10, padding: 12, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.4 }}>TOTAL</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, marginTop: 2 }}>{fmt(parseFloat(selected.amount))}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.saleBg, borderRadius: 10, padding: 12, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.success, letterSpacing: 0.4 }}>PAID</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.success, marginTop: 2 }}>{fmt(parseFloat(selected.paidAmount))}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.primary + "18", borderRadius: 10, padding: 12, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.primary, letterSpacing: 0.4 }}>REMAINING</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.primary, marginTop: 2 }}>{fmt(parseFloat(selected.remainingAmount))}</Text>
                  </View>
                </View>

                {/* Amount input */}
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Payment Amount</Text>
                <View style={{ position: "relative", marginBottom: 14 }}>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text, backgroundColor: colors.input }}
                    value={payAmount}
                    onChangeText={setPayAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  {/* Quick fill buttons */}
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                    {[25, 50, 75, 100].map(pct => (
                      <TouchableOpacity
                        key={pct}
                        style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 8, paddingVertical: 7, alignItems: "center", borderWidth: 1, borderColor: colors.primary + "33" }}
                        onPress={() => setPayAmount((parseFloat(selected.remainingAmount) * pct / 100).toFixed(2))}
                      >
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary }}>{pct}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Account selector */}
                {accounts.length > 0 && (
                  <View style={{ marginBottom: 18 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Receive Into Account (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.accChip, { backgroundColor: selectedAccountId === "" ? colors.primary : colors.input, borderColor: selectedAccountId === "" ? colors.primary : colors.border }]}
                          onPress={() => setSelectedAccountId("")}
                        >
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: selectedAccountId === "" ? "#FFF" : colors.mutedForeground }}>None</Text>
                        </TouchableOpacity>
                        {accounts.map(a => (
                          <TouchableOpacity
                            key={a.id}
                            style={[styles.accChip, { backgroundColor: selectedAccountId === String(a.id) ? colors.primary : colors.input, borderColor: selectedAccountId === String(a.id) ? colors.primary : colors.border }]}
                            onPress={() => setSelectedAccountId(String(a.id))}
                          >
                            <Feather name="briefcase" size={11} color={selectedAccountId === String(a.id) ? "#FFF" : colors.primary} />
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: selectedAccountId === String(a.id) ? "#FFF" : colors.text }}>{a.name}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: selectedAccountId === String(a.id) ? "rgba(255,255,255,0.7)" : colors.mutedForeground }}>
                              {fmt(parseFloat(a.balance))}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <TouchableOpacity
                  style={{ backgroundColor: colors.success, paddingVertical: 16, borderRadius: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }}
                  onPress={handlePay}
                >
                  <Feather name="check-circle" size={18} color="#FFF" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>Confirm Payment Received</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: "center", paddingVertical: 12, marginBottom: 8 }} onPress={() => setSelected(null)}>
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
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  iconBox: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  accChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
});

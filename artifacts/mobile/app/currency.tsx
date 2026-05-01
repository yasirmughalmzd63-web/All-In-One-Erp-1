import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, useListAccounts } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type CurrencyTx = {
  id: number; currencyType: string; type: string;
  amount: string; rate: string; totalInBase: string;
  accountId: number | null; accountName: string | null;
  userId: number; notes: string | null; date: string; createdAt: string;
};
type Account = { id: number; name: string; balance: string };

const CURRENCIES = ["USD", "SAR", "EUR", "GBP", "AED", "CNY"];
const TX_TYPES = [
  { key: "purchase", label: "Purchase (Buy)", desc: "Deduct from account" },
  { key: "exchange", label: "Exchange (Sell)", desc: "Add to account" },
];

const emptyForm = { currencyType: "USD", type: "purchase", amount: "", rate: "", notes: "", accountId: "", date: new Date().toISOString().split("T")[0]! };

export default function CurrencyScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [transactions, setTransactions] = useState<CurrencyTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: accountsRaw } = useListAccounts();
  const accounts = (accountsRaw ?? []) as unknown as Account[];

  const amountNum = parseFloat(form.amount || "0");
  const rateNum   = parseFloat(form.rate   || "0");
  const totalInBaseNum = amountNum * rateNum;
  const totalInBase = totalInBaseNum.toFixed(2);

  const isBuy = form.type === "purchase";
  const selectedAccount = form.accountId
    ? accounts.find(a => String(a.id) === form.accountId) ?? null
    : null;
  const currentBal = selectedAccount ? parseFloat(selectedAccount.balance) : 0;
  const newBal = isBuy ? currentBal - totalInBaseNum : currentBal + totalInBaseNum;
  const balanceWarn = isBuy && selectedAccount && newBal < 0;
  const previewReady = amountNum > 0 && rateNum > 0;

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await customFetch<CurrencyTx[]>("/api/currencies");
      setTransactions(data);
    } catch (e) {}  setLoading(false);
    setRefreshing(false);
  };

  React.useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.amount || !form.rate || !form.date) {
      Alert.alert("Error", "Amount, rate and date are required");
      return;
    }
    setSaving(true);
    try {
      await customFetch<CurrencyTx>("/api/currencies", {
        method: "POST",
        body: JSON.stringify({
          currencyType: form.currencyType,
          type: form.type,
          amount: parseFloat(form.amount).toFixed(8),
          rate: parseFloat(form.rate).toFixed(8),
          totalInBase: (parseFloat(form.amount) * parseFloat(form.rate)).toFixed(8),
          accountId: form.accountId ? parseInt(form.accountId) : null,
          notes: form.notes || null,
          date: form.date,
        }),
      });
      setShowModal(false);
      setForm(emptyForm);
      queryClient.invalidateQueries();
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = (item: CurrencyTx) => {
    Alert.alert("Delete", `Delete this ${item.currencyType} ${item.type} transaction?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await customFetch<void>(`/api/currencies/${item.id}`, { method: "DELETE" });
          load();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const totalPurchased: Record<string, number> = {};
  transactions.filter(t => t.type === "purchase").forEach(t => {
    totalPurchased[t.currencyType] = (totalPurchased[t.currencyType] ?? 0) + parseFloat(t.amount);
  });

  const renderItem = ({ item }: { item: CurrencyTx }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <View style={[styles.iconBox, { backgroundColor: item.type === "purchase" ? "#EFF6FF" : "#ECFDF5" }]}>
            
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {item.type === "purchase" ? "Bought" : "Sold"} {parseFloat(item.amount).toFixed(2)} {item.currencyType}
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Rate: {parseFloat(item.rate).toFixed(2)} • {item.accountName ?? "No account"} • {item.date}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={[styles.cardAmount, { color: item.type === "purchase" ? colors.expense : colors.sale }]}>
            ₨{parseFloat(item.totalInBase).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          {isAdmin && (
            <TouchableOpacity style={[styles.delBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(item)}>
              
            </TouchableOpacity>
          )}
        </View>
      </View>
      {item.notes && <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{item.notes}</Text>}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0891B2", "#0E7490"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.headerTitle}>Currency / Dollar</Text>
        <Text style={styles.headerSub}>Foreign currency transactions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {Object.entries(totalPurchased).map(([cur, amt]) => (
            <View key={cur} style={styles.chip}>
              <Text style={styles.chipLabel}>{cur}</Text>
              <Text style={styles.chipValue}>{amt.toFixed(2)}</Text>
            </View>
          ))}
          {Object.keys(totalPurchased).length === 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>No transactions yet</Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No currency transactions</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[styles.fab, { backgroundColor: "#0891B2" }]} onPress={() => setShowModal(true)}>
        
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New Currency Transaction</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TRANSACTION TYPE</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {TX_TYPES.map(t => (
                  <TouchableOpacity key={t.key} style={[styles.typeBtn, { backgroundColor: form.type === t.key ? "#0891B2" : colors.card, borderColor: form.type === t.key ? "#0891B2" : colors.border, flex: 1 }]}
                    onPress={() => setForm(f => ({ ...f, type: t.key }))}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: form.type === t.key ? "#FFF" : colors.text }}>{t.label}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: form.type === t.key ? "#BAE6FD" : colors.mutedForeground }}>{t.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>CURRENCY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity key={c} style={[styles.currencyChip, { backgroundColor: form.currencyType === c ? "#0891B2" : colors.card, borderColor: form.currencyType === c ? "#0891B2" : colors.border }]}
                      onPress={() => setForm(f => ({ ...f, currencyType: c }))}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.currencyType === c ? "#FFF" : colors.text }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>AMOUNT ({form.currencyType})</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                    placeholder="100" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>RATE (PKR)</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.rate} onChangeText={v => setForm(f => ({ ...f, rate: v }))}
                    placeholder="280" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              <View style={[styles.previewBox, {
                backgroundColor: previewReady ? (isBuy ? "#EFF6FF" : "#ECFDF5") : colors.secondary,
                borderColor:     previewReady ? (isBuy ? "#3B82F6" : "#10B981") : colors.border,
              }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.6,
                    color: previewReady ? (isBuy ? "#1D4ED8" : "#047857") : colors.mutedForeground }}>
                    EXCHANGE PREVIEW
                  </Text>
                  <View style={{
                    backgroundColor: previewReady ? (isBuy ? "#1D4ED8" : "#047857") : colors.muted,
                    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: previewReady ? "#FFF" : colors.mutedForeground }}>
                      {isBuy ? "BUY" : "SELL"}
                    </Text>
                  </View>
                </View>

                {previewReady ? (
                  <>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>
                      {isBuy ? "Buy" : "Sell"} {amountNum.toFixed(2)} {form.currencyType}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {amountNum.toFixed(2)} {form.currencyType} × ₨{rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                    <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 10 }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.mutedForeground }}>
                        {isBuy ? "Total to pay" : "Total to receive"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: isBuy ? "#1D4ED8" : "#047857" }}>
                        ₨{totalInBaseNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>

                    {selectedAccount ? (
                      <View style={{
                        marginTop: 10, padding: 10, borderRadius: 10,
                        backgroundColor: balanceWarn ? "#FEF2F2" : "rgba(255,255,255,0.7)",
                        borderWidth: 1, borderColor: balanceWarn ? "#FCA5A5" : "rgba(0,0,0,0.06)",
                      }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: balanceWarn ? "#991B1B" : colors.mutedForeground, letterSpacing: 0.4 }}>
                          {selectedAccount.name.toUpperCase()} BALANCE
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text }}>
                            ₨{currentBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.mutedForeground }}>→</Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: balanceWarn ? "#DC2626" : (isBuy ? "#1D4ED8" : "#047857") }}>
                            ₨{newBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </Text>
                          <View style={{ marginLeft: "auto", backgroundColor: balanceWarn ? "#FEE2E2" : (isBuy ? "#DBEAFE" : "#D1FAE5"), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: balanceWarn ? "#991B1B" : (isBuy ? "#1D4ED8" : "#047857") }}>
                              {isBuy ? "−" : "+"}₨{totalInBaseNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                        </View>
                        {balanceWarn ? (
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#991B1B", marginTop: 6 }}>
                            ⚠  This account will go negative.
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 10, fontStyle: "italic" }}>
                        No account selected — pick one below to see the balance impact.
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                    Enter amount and rate to see the preview.
                  </Text>
                )}
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>{isBuy ? "PAY FROM ACCOUNT" : "DEPOSIT TO ACCOUNT"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={[styles.currencyChip, { backgroundColor: !form.accountId ? "#0891B2" : colors.card, borderColor: !form.accountId ? "#0891B2" : colors.border }]}
                    onPress={() => setForm(f => ({ ...f, accountId: "" }))}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: !form.accountId ? "#FFF" : colors.text }}>None</Text>
                  </TouchableOpacity>
                  {accounts.map(a => (
                    <TouchableOpacity key={a.id} style={[styles.currencyChip, { backgroundColor: form.accountId === String(a.id) ? "#0891B2" : colors.card, borderColor: form.accountId === String(a.id) ? "#0891B2" : colors.border }]}
                      onPress={() => setForm(f => ({ ...f, accountId: String(a.id) }))}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: form.accountId === String(a.id) ? "#FFF" : colors.text }}>{a.name}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: form.accountId === String(a.id) ? "#BAE6FD" : colors.mutedForeground }}>₨{parseFloat(a.balance).toFixed(0)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 24 }]}
                value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Notes..." placeholderTextColor={colors.mutedForeground} />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#0891B2", opacity: saving ? 0.6 : 1 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Transaction"}</Text>
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
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 12 },
  chipRow: { flexDirection: "row" },
  chip: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  chipLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#FFF" },
  chipValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardLeft: { flexDirection: "row", gap: 10, flex: 1 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  cardAmount: { fontFamily: "Inter_700Bold", fontSize: 15 },
  delBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8, fontStyle: "italic" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  formLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Inter_400Regular", fontSize: 14 },
  typeBtn: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  currencyChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  previewBox: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 16 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type DollarEntry = {
  id: number;
  entryType: string;
  amountUsd: string;
  rate: string;
  totalPkr: string;
  partyName: string | null;
  notes: string | null;
  date: string;
  createdAt: string;
};

const ENTRY_TYPES: { key: string; label: string; desc: string; sign: 1 | -1; color: string; bg: string; icon: string }[] = [
  { key: "received",  label: "Received USD",      desc: "Customer paid in dollars",    sign:  1, color: "#16A34A", bg: "#DCFCE7", icon: "arrow-down-circle" },
  { key: "product",   label: "Sent Product",       desc: "Goods given — deduct USD",    sign: -1, color: "#DC2626", bg: "#FEE2E2", icon: "package" },
  { key: "partial",   label: "Partial Payment",    desc: "Part cash, part credit",      sign:  1, color: "#0891B2", bg: "#ECFEFF", icon: "divide-circle" },
  { key: "recovery",  label: "Credit Recovery",    desc: "Old credit recovered as USD", sign:  1, color: "#7C3AED", bg: "#F3E8FF", icon: "refresh-cw" },
];

const emptyForm = {
  entryType: "received",
  amountUsd: "",
  rate: "",
  partyName: "",
  notes: "",
  date: new Date().toISOString().split("T")[0]!,
};

const WALLET_KEY = "/api/dollar-wallet";

async function loadEntries(): Promise<DollarEntry[]> {
  try { return await customFetch<DollarEntry[]>(WALLET_KEY); } catch { return []; }
}

async function saveEntry(body: object): Promise<void> {
  await customFetch<DollarEntry>(WALLET_KEY, { method: "POST", body: JSON.stringify(body) });
}

async function deleteEntry(id: number): Promise<void> {
  await customFetch<void>(`${WALLET_KEY}/${id}`, { method: "DELETE" });
}

export default function WalletsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [entries, setEntries] = useState<DollarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await loadEntries();
    setEntries(data);
    setLoading(false);
    setRefreshing(false);
  };

  React.useEffect(() => { load(); }, []);

  const totalUsd = entries.reduce((sum, e) => {
    const et = ENTRY_TYPES.find(t => t.key === e.entryType);
    return sum + (et?.sign ?? 1) * parseFloat(e.amountUsd);
  }, 0);

  const lastRate = entries.length > 0 ? parseFloat(entries[0]!.rate) : 0;
  const totalPkr = totalUsd * lastRate;

  const totalInBase = form.amountUsd && form.rate
    ? (parseFloat(form.amountUsd || "0") * parseFloat(form.rate || "0")).toFixed(2)
    : "0.00";

  const handleSave = async () => {
    if (!form.amountUsd || !form.rate || !form.date) {
      Alert.alert("Error", "Amount, rate and date are required");
      return;
    }
    setSaving(true);
    try {
      await saveEntry({
        entryType: form.entryType,
        amountUsd: parseFloat(form.amountUsd).toFixed(8),
        rate: parseFloat(form.rate).toFixed(8),
        totalPkr: (parseFloat(form.amountUsd) * parseFloat(form.rate)).toFixed(8),
        partyName: form.partyName || null,
        notes: form.notes || null,
        date: form.date,
      });
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = (item: DollarEntry) => {
    Alert.alert("Delete Entry", "Remove this dollar wallet entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try { await deleteEntry(item.id); load(); }
          catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: DollarEntry }) => {
    const et = ENTRY_TYPES.find(t => t.key === item.entryType);
    const sign = et?.sign ?? 1;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardRow}>
          <View style={[styles.iconBox, { backgroundColor: et?.bg ?? colors.secondary }]}>
            <Feather name={(et?.icon ?? "circle") as "circle"} size={17} color={et?.color ?? colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {et?.label ?? item.entryType}
              {item.partyName ? <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> — {item.partyName}</Text> : null}
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Rate: {parseFloat(item.rate).toFixed(2)} • {item.date}
            </Text>
            {item.notes ? <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{item.notes}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={[styles.usdAmt, { color: sign > 0 ? colors.success : colors.danger }]}>
              {sign > 0 ? "+" : "-"}{parseFloat(item.amountUsd).toFixed(2)} USD
            </Text>
            <Text style={[styles.pkrAmt, { color: colors.mutedForeground }]}>
              ₨{parseFloat(item.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
            {isAdmin && (
              <TouchableOpacity style={[styles.delBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(item)}>
                <Feather name="trash-2" size={13} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const selectedType = ENTRY_TYPES.find(t => t.key === form.entryType);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0369A1", "#0891B2"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.headerTitle}>Dollar Wallet</Text>
        <Text style={styles.headerSub}>USD ledger with PKR exchange</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>DOLLAR BALANCE</Text>
            <Text style={[styles.balValue, { color: totalUsd >= 0 ? "#4ADE80" : "#F87171" }]}>
              {totalUsd >= 0 ? "+" : ""}{totalUsd.toFixed(2)} USD
            </Text>
          </View>
          <View style={[styles.balCard, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Text style={styles.balLabel}>IN PKR ({lastRate > 0 ? `@${lastRate.toFixed(0)}` : "set rate"})</Text>
            <Text style={styles.balValue}>
              ₨{totalPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="dollar-sign" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No dollar wallet entries yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Tap + to record received dollars, products, payments or credit recoveries</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[styles.fab, { backgroundColor: "#0891B2" }]} onPress={() => setShowModal(true)}>
        <Feather name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New Dollar Entry</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ENTRY TYPE</Text>
              <View style={styles.typeGrid}>
                {ENTRY_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeBtn, {
                      backgroundColor: form.entryType === t.key ? t.color : colors.card,
                      borderColor: form.entryType === t.key ? t.color : colors.border,
                    }]}
                    onPress={() => setForm(f => ({ ...f, entryType: t.key }))}
                  >
                    <Feather name={t.icon as "circle"} size={14} color={form.entryType === t.key ? "#FFF" : t.color} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: form.entryType === t.key ? "#FFF" : colors.text, marginTop: 4 }}>{t.label}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: form.entryType === t.key ? "rgba(255,255,255,0.8)" : colors.mutedForeground }}>{t.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>AMOUNT (USD)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.amountUsd} onChangeText={v => setForm(f => ({ ...f, amountUsd: v }))}
                    placeholder="100" keyboardType="numeric" placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>EXCHANGE RATE (PKR)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.rate} onChangeText={v => setForm(f => ({ ...f, rate: v }))}
                    placeholder="280" keyboardType="numeric" placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>

              <View style={[styles.totalBox, { backgroundColor: selectedType ? selectedType.bg : colors.secondary, borderColor: selectedType?.color ?? colors.primary }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                  {selectedType?.sign === -1 ? "Deduction" : "Receipt"} in PKR
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: selectedType?.color ?? colors.primary }}>
                  ₨{parseFloat(totalInBase).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTY NAME (CUSTOMER / SUPPLIER)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={form.partyName} onChangeText={v => setForm(f => ({ ...f, partyName: v }))}
                placeholder="e.g. Ahmed Khan" placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 20 }]}
                value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Any notes..." placeholderTextColor={colors.mutedForeground}
                multiline numberOfLines={2}
              />

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: selectedType?.color ?? "#0891B2", opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave} disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Entry"}</Text>
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
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 16 },
  balanceRow: { flexDirection: "row", gap: 10 },
  balCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 14 },
  balLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.75)", letterSpacing: 0.5, marginBottom: 4 },
  balValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  usdAmt: { fontFamily: "Inter_700Bold", fontSize: 15 },
  pkrAmt: { fontFamily: "Inter_400Regular", fontSize: 12 },
  delBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic", marginTop: 3 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10, paddingHorizontal: 40 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 15, textAlign: "center" },
  emptyHint: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  formLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 0 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeBtn: { width: "47.5%", borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 2 },
  totalBox: { borderWidth: 1.5, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: "center", gap: 4 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

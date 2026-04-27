import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Snapshot = {
  stockValue: string; bankBalance: string; creditReceivable: string;
  creditsReceived: string; transfersIn: string; transfersOut: string;
  openingBalance: string; expectedBalance: string;
};

type CashCount = {
  id: number; date: string; stockValue: string; bankBalance: string;
  creditReceivable: string; creditsReceived: string; transfersIn: string;
  transfersOut: string; openingBalance: string; expectedBalance: string;
  physicalBalance: string; difference: string; notes: string | null; createdAt: string;
};

const fmt = (v: string) => parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashCountScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<CashCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [physicalBalance, setPhysicalBalance] = useState("");
  const [transfersIn, setTransfersIn] = useState("0");
  const [transfersOut, setTransfersOut] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [snap, hist] = await Promise.all([
        customFetch<Snapshot>("/api/cash-counts/snapshot"),
        customFetch<CashCount[]>("/api/cash-counts"),
      ]);
      setSnapshot(snap);
      setHistory(hist);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const adjustedExpected = snapshot
    ? (parseFloat(snapshot.expectedBalance) + parseFloat(transfersIn || "0") - parseFloat(transfersOut || "0")).toFixed(2)
    : "0.00";

  const difference = physicalBalance
    ? (parseFloat(physicalBalance || "0") - parseFloat(adjustedExpected)).toFixed(2)
    : "0.00";

  const diffColor = parseFloat(difference) >= 0 ? colors.sale : colors.danger;

  const handleSave = async () => {
    if (!physicalBalance) { Alert.alert("Error", "Enter physical balance"); return; }
    setSaving(true);
    try {
      await customFetch<CashCount>("/api/cash-counts", {
        method: "POST",
        body: JSON.stringify({
          date: new Date().toISOString().split("T")[0],
          stockValue: snapshot?.stockValue ?? "0",
          bankBalance: snapshot?.bankBalance ?? "0",
          creditReceivable: snapshot?.creditReceivable ?? "0",
          creditsReceived: snapshot?.creditsReceived ?? "0",
          transfersIn: parseFloat(transfersIn || "0").toFixed(8),
          transfersOut: parseFloat(transfersOut || "0").toFixed(8),
          openingBalance: snapshot?.openingBalance ?? "0",
          expectedBalance: adjustedExpected,
          physicalBalance: parseFloat(physicalBalance).toFixed(8),
          notes: notes || null,
        }),
      });
      setShowModal(false);
      setPhysicalBalance("");
      setTransfersIn("0");
      setTransfersOut("0");
      setNotes("");
      load();
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const handleDelete = (item: CashCount) => {
    if (!isAdmin) return;
    Alert.alert("Delete", `Delete cash count for ${item.date}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await customFetch<void>(`/api/cash-counts/${item.id}`, { method: "DELETE" });
          load();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const StatRow = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <View style={[styles.statRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.statValue, { color: color ?? colors.text }]}>₨{fmt(value)}</Text>
        {sub && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{sub}</Text>}
      </View>
    </View>
  );

  const renderHistory = ({ item }: { item: CashCount }) => {
    const diff = parseFloat(item.difference);
    return (
      <View style={[styles.histCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.histHeader}>
          <View>
            <Text style={[styles.histDate, { color: colors.text }]}>{item.date}</Text>
            <Text style={[styles.histTime, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={[styles.diffBadge, { backgroundColor: diff >= 0 ? "#DCFCE7" : "#FEF2F2" }]}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: diff >= 0 ? "#16A34A" : "#DC2626" }}>
                {diff >= 0 ? "+" : ""}₨{fmt(item.difference)}
              </Text>
            </View>
            {isAdmin && (
              <TouchableOpacity style={[styles.delBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(item)}>
                <Feather name="trash-2" size={12} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>Expected</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>₨{fmt(item.expectedBalance)}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>Physical</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>₨{fmt(item.physicalBalance)}</Text>
          </View>
        </View>
        {item.notes && <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{item.notes}</Text>}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#7C3AED", "#6D28D9"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.headerTitle}>Cash Count</Text>
        <Text style={styles.headerSub}>Balance sheet reconciliation</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={i => String(i.id)}
          renderItem={renderHistory}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListHeaderComponent={snapshot ? (
            <View style={[styles.snapshotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.snapshotTitle, { color: colors.text }]}>Current Balance Snapshot</Text>
              <StatRow label="Stock Value" value={snapshot.stockValue} sub="Inventory at cost" color="#0284C7" />
              <StatRow label="Bank / Accounts" value={snapshot.bankBalance} sub="All accounts total" color="#2563EB" />
              <StatRow label="Credit Receivable" value={snapshot.creditReceivable} sub="Outstanding receivables" color="#7C3AED" />
              <StatRow label="Credits Received" value={snapshot.creditsReceived} sub="Payments collected" color="#16A34A" />
              <View style={[styles.totalRow, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Opening Balance</Text>
                <Text style={[styles.totalValue, { color: "#7C3AED" }]}>₨{fmt(snapshot.openingBalance)}</Text>
              </View>
              <View style={[styles.totalRow, { backgroundColor: "#F0FDF4" }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Expected Balance</Text>
                <Text style={[styles.totalValue, { color: "#16A34A" }]}>₨{fmt(snapshot.expectedBalance)}</Text>
              </View>
              <TouchableOpacity style={[styles.countBtn, { backgroundColor: "#7C3AED" }]} onPress={() => setShowModal(true)}>
                <Feather name="check-circle" size={16} color="#FFF" />
                <Text style={styles.countBtnText}>Start Cash Count</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="archive" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No cash counts recorded yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Cash Count Entry</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {snapshot && (
                <>
                  <View style={[styles.infoBox, { backgroundColor: colors.secondary }]}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Stock Value</Text>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>₨{fmt(snapshot.stockValue)}</Text>
                  </View>
                  <View style={[styles.infoBox, { backgroundColor: colors.secondary }]}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Bank / Account Total</Text>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>₨{fmt(snapshot.bankBalance)}</Text>
                  </View>
                  <View style={[styles.infoBox, { backgroundColor: colors.secondary }]}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Credit Receivable</Text>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>₨{fmt(snapshot.creditReceivable)}</Text>
                  </View>
                </>
              )}

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TRANSFERS IN (to company)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={transfersIn} onChangeText={setTransfersIn}
                placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TRANSFERS OUT (from company)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 16 }]}
                value={transfersOut} onChangeText={setTransfersOut}
                placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />

              <View style={[styles.expectedBox, { backgroundColor: "#EDE9FE" }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#5B21B6" }}>Expected Balance</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#7C3AED" }}>₨{parseFloat(adjustedExpected).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PHYSICAL BALANCE (actual count)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={physicalBalance} onChangeText={setPhysicalBalance}
                placeholder="Enter physical count..." keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />

              {physicalBalance ? (
                <View style={[styles.diffBox, { backgroundColor: parseFloat(difference) >= 0 ? "#DCFCE7" : "#FEF2F2" }]}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: diffColor }}>Difference (Physical − Expected)</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: diffColor }}>
                    {parseFloat(difference) >= 0 ? "+" : ""}₨{parseFloat(difference).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: diffColor, textAlign: "center" }}>
                    {parseFloat(difference) >= 0 ? "Cash surplus" : "Cash shortage"}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 24 }]}
                value={notes} onChangeText={setNotes}
                placeholder="Notes..." placeholderTextColor={colors.mutedForeground} />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#7C3AED", opacity: saving ? 0.6 : 1 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Cash Count"}</Text>
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
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" },
  snapshotCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  snapshotTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 12 },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  statValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 10, marginTop: 8 },
  totalLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  countBtn: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", borderRadius: 12, padding: 14, marginTop: 16 },
  countBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF" },
  histCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  histHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  histDate: { fontFamily: "Inter_700Bold", fontSize: 15 },
  histTime: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  diffBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  delBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 6, fontStyle: "italic" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  formLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Inter_400Regular", fontSize: 14 },
  infoBox: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 10, marginBottom: 8 },
  expectedBox: { borderRadius: 12, padding: 16, marginBottom: 16, alignItems: "center", gap: 4 },
  diffBox: { borderRadius: 12, padding: 16, marginBottom: 16, alignItems: "center", gap: 4 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

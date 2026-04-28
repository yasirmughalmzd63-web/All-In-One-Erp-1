import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
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
  creditsReceived: string; openingBalance: string; expectedBalance: string;
};

type AuditEntry = {
  id: number; date: string;
  stockValue: string; bankBalance: string; creditReceivable: string;
  expectedBalance: string; physicalBalance: string; difference: string;
  diffType: string; status: string; reason: string | null; notes: string | null;
  createdAt: string;
};

const fmt = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtShort = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return fmt(n.toString());
};

export default function AuditScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [snapshot, setSnapshot]         = useState<Snapshot | null>(null);
  const [history, setHistory]           = useState<AuditEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [showResolve, setShowResolve]   = useState<AuditEntry | null>(null);
  const [physicalBalance, setPhysical]  = useState("");
  const [transfersIn, setTransIn]       = useState("0");
  const [transfersOut, setTransOut]     = useState("0");
  const [reason, setReason]             = useState("");
  const [notes, setNotes]               = useState("");
  const [resolveReason, setResolveReason] = useState("");
  const [saving, setSaving]             = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [snap, hist] = await Promise.all([
        customFetch<Snapshot>("/api/cash-counts/snapshot"),
        customFetch<AuditEntry[]>("/api/cash-counts"),
      ]);
      setSnapshot(snap);
      setHistory(hist);
    } catch (e) {}  setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const adjustedExpected = snapshot
    ? (parseFloat(snapshot.expectedBalance) + parseFloat(transfersIn || "0") - parseFloat(transfersOut || "0")).toFixed(2)
    : "0.00";

  const difference  = physicalBalance
    ? (parseFloat(physicalBalance || "0") - parseFloat(adjustedExpected)).toFixed(2)
    : "0.00";
  const diffNum     = parseFloat(difference);
  const diffType    = Math.abs(diffNum) < 0.01 ? "balanced" : diffNum > 0 ? "excess" : "short";

  // Summary stats
  const totalShort   = history.filter(e => e.diffType === "short").reduce((s, e) => s + Math.abs(parseFloat(e.difference)), 0);
  const totalExcess  = history.filter(e => e.diffType === "excess").reduce((s, e) => s + parseFloat(e.difference), 0);
  const pendingCount = history.filter(e => e.status === "pending").length;
  const pendingShort = history.filter(e => e.status === "pending" && e.diffType === "short").reduce((s, e) => s + Math.abs(parseFloat(e.difference)), 0);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of history) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const handleSave = async () => {
    if (!physicalBalance) { Alert.alert("Error", "Enter physical balance"); return; }
    setSaving(true);
    try {
      await customFetch<AuditEntry>("/api/cash-counts", {
        method: "POST",
        body: JSON.stringify({
          date:             new Date().toISOString().split("T")[0],
          stockValue:       snapshot?.stockValue   ?? "0",
          bankBalance:      snapshot?.bankBalance  ?? "0",
          creditReceivable: snapshot?.creditReceivable ?? "0",
          creditsReceived:  snapshot?.creditsReceived  ?? "0",
          transfersIn:      parseFloat(transfersIn  || "0").toFixed(8),
          transfersOut:     parseFloat(transfersOut || "0").toFixed(8),
          openingBalance:   snapshot?.openingBalance  ?? "0",
          expectedBalance:  adjustedExpected,
          physicalBalance:  parseFloat(physicalBalance).toFixed(8),
          reason:  reason  || null,
          notes:   notes   || null,
        }),
      });
      setShowModal(false);
      setPhysical(""); setTransIn("0"); setTransOut("0"); setReason(""); setNotes("");
      load();
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const handleResolve = async () => {
    if (!showResolve) return;
    try {
      await customFetch(`/api/cash-counts/${showResolve.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ reason: resolveReason || null }),
      });
      setShowResolve(null);
      setResolveReason("");
      load();
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (item: AuditEntry) => {
    if (!isAdmin) return;
    Alert.alert("Delete", `Delete audit for ${item.date}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch<void>(`/api/cash-counts/${item.id}`, { method: "DELETE" }); load(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const diffMeta = (type: string, status: string): { label: string; color: string; bg: string; icon: string } => {
    if (type === "short")    return { label: "SHORT",    color: "#DC2626", bg: "#FEF2F2", icon: "trending-down"  };
    if (type === "excess")   return { label: "EXCESS",   color: "#16A34A", bg: "#DCFCE7", icon: "trending-up"    };
    if (status === "pending") return { label: "BALANCED", color: "#2563EB", bg: "#EFF6FF", icon: "check-circle"   };
    return                          { label: "BALANCED", color: "#16A34A", bg: "#DCFCE7", icon: "check-circle"   };
  };

  const statusMeta = (status: string, diffType: string): { label: string; color: string; bg: string } => {
    if (status === "resolved") return { label: "Resolved", color: "#16A34A", bg: "#DCFCE7" };
    if (diffType === "balanced") return { label: "OK",     color: "#16A34A", bg: "#DCFCE7" };
    return                            { label: "Pending",  color: "#D97706", bg: "#FFF7ED" };
  };

  const renderEntry = (e: AuditEntry) => {
    const diff    = parseFloat(e.difference);
    const dm      = diffMeta(e.diffType, e.status);
    const sm      = statusMeta(e.status, e.diffType);
    const canResolve = e.status === "pending" && e.diffType !== "balanced";
    return (
      <View key={e.id} style={[styles.entryCard, { backgroundColor: colors.card, borderColor: e.status === "pending" && e.diffType !== "balanced" ? dm.color + "55" : colors.border }]}>
        {/* Top */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={[styles.iconBox, { backgroundColor: dm.bg }]}>
            
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={[styles.badge, { backgroundColor: dm.bg }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: dm.color, letterSpacing: 0.5 }}>{dm.label}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: sm.bg }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: sm.color }}>{sm.label}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: dm.color }}>
                {diff >= 0 ? "+" : ""}₨{fmtShort(Math.abs(diff).toString())}
              </Text>
            </View>
          </View>
          {isAdmin && (
            <TouchableOpacity style={[styles.delBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(e)}>
              
            </TouchableOpacity>
          )}
        </View>

        {/* Stats mini row */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.4 }}>EXPECTED</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>₨{fmtShort(e.expectedBalance)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.4 }}>PHYSICAL</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>₨{fmtShort(e.physicalBalance)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.4 }}>DIFFERENCE</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: dm.color }}>
              {diff >= 0 ? "+" : ""}₨{fmtShort(e.difference)}
            </Text>
          </View>
        </View>

        {/* Reason if exists */}
        {e.reason && (
          <View style={{ marginTop: 8, backgroundColor: "#FFFBEB", borderRadius: 8, padding: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#92400E", flex: 1 }}>Reason: {e.reason}</Text>
          </View>
        )}
        {e.notes && !e.reason && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 6, fontStyle: "italic" }}>"{e.notes}"</Text>
        )}

        {/* Resolve button for pending differences */}
        {canResolve && (
          <TouchableOpacity
            style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FFF7ED", borderRadius: 8, paddingVertical: 9, borderWidth: 1, borderColor: "#FED7AA" }}
            onPress={() => { setShowResolve(e); setResolveReason(""); }}
          >
            
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#D97706" }}>Mark as Resolved</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const diffTypeColor = diffType === "short" ? colors.danger : diffType === "excess" ? colors.success : colors.primary;
  const diffTypeBg    = diffType === "short" ? "#FEF2F2"   : diffType === "excess" ? "#DCFCE7"   : colors.secondary;
  const diffTypeLabel = diffType === "short" ? "SHORT (shortage)" : diffType === "excess" ? "EXCESS (surplus)" : "BALANCED";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#7C3AED", "#6D28D9"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.headerTitle}>Audit</Text>
            <Text style={styles.headerSub}>Daily cash reconciliation log</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={() => setShowModal(true)}>
            
            <Text style={styles.newBtnText}>New Entry</Text>
          </TouchableOpacity>
        </View>

        {/* Summary chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <View style={styles.chip}>
            
            <Text style={styles.chipLabel}>Total Short</Text>
            <Text style={styles.chipVal}>₨{fmtShort(totalShort.toString())}</Text>
          </View>
          <View style={styles.chip}>
            
            <Text style={styles.chipLabel}>Total Excess</Text>
            <Text style={styles.chipVal}>₨{fmtShort(totalExcess.toString())}</Text>
          </View>
          <View style={[styles.chip, pendingCount > 0 && { borderColor: "#FCD34D", borderWidth: 1 }]}>
            
            <Text style={styles.chipLabel}>Pending</Text>
            <Text style={[styles.chipVal, pendingCount > 0 && { color: "#FCD34D" }]}>{pendingCount}</Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([date]) => date}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListHeaderComponent={
            /* ── Pending short amount ──────────────────────────────────── */
            pendingShort > 0 ? (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#FECACA", flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                  
                </View>
                <View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#DC2626" }}>Outstanding Shortage</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#991B1B", marginTop: 2 }}>
                    ₨{fmt(pendingShort.toString())} unresolved across {pendingCount} audit{pendingCount !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>No audit entries yet</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4, textAlign: "center" }}>Tap "New Entry" to start your first daily cash audit</Text>
            </View>
          }
          renderItem={({ item: [date, entries] }) => (
            <View style={{ marginBottom: 18 }}>
              {/* Date header */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <View style={{ backgroundColor: "#7C3AED", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFF" }}>
                    {new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                  {entries.length} audit{entries.length !== 1 ? "s" : ""}
                </Text>
              </View>
              {/* Entries */}
              <View style={{ gap: 8 }}>
                {entries.map(e => renderEntry(e))}
              </View>
            </View>
          )}
        />
      )}

      {/* ── New Entry Modal ─────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "93%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New Audit Entry</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                  {new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long" })}
                </Text>
              </View>
              <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={() => setShowModal(false)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>

              {/* Live snapshot info boxes */}
              {snapshot && (
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 4 }}>CURRENT SNAPSHOT</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#2563EB", marginTop: 3 }}>₨{fmtShort(snapshot.bankBalance)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#93C5FD" }}>BANK</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#059669", marginTop: 3 }}>₨{fmtShort(snapshot.stockValue)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#6EE7B7" }}>STOCK</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "#EDE9FE", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#7C3AED", marginTop: 3 }}>₨{fmtShort(snapshot.creditReceivable)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#C4B5FD" }}>CREDIT</Text>
                    </View>
                  </View>

                  {/* Expected */}
                  <View style={{ backgroundColor: "#EDE9FE", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#5B21B6" }}>Expected Balance</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#7C3AED" }}>₨{parseFloat(adjustedExpected).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                  </View>
                </View>
              )}

              {/* Transfers */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TRANSFERS IN</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.success + "88", color: colors.text }]}
                    value={transfersIn} onChangeText={setTransIn} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>TRANSFERS OUT</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.danger + "88", color: colors.text }]}
                    value={transfersOut} onChangeText={setTransOut} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              {/* Physical balance */}
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PHYSICAL BALANCE (actual count)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.primary, color: colors.text, marginBottom: 14, fontFamily: "Inter_700Bold", fontSize: 18 }]}
                value={physicalBalance} onChangeText={setPhysical}
                placeholder="Enter actual cash count..." keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground}
              />

              {/* Live difference indicator */}
              {physicalBalance ? (
                <View style={[styles.diffBox, { backgroundColor: diffTypeBg, borderWidth: 1.5, borderColor: diffTypeColor + "55" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: diffTypeColor }}>{diffTypeLabel}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: diffTypeColor }}>
                    {diffNum >= 0 ? "+" : ""}₨{parseFloat(difference).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: diffTypeColor + "CC", marginTop: 2, textAlign: "center" }}>
                    Physical ₨{fmtShort(physicalBalance)} − Expected ₨{fmtShort(adjustedExpected)}
                  </Text>
                </View>
              ) : null}

              {/* Reason for difference */}
              {(diffType === "short" || diffType === "excess") && physicalBalance && (
                <>
                  <Text style={[styles.formLabel, { color: diffTypeColor }]}>REASON FOR {diffType.toUpperCase()}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: diffTypeColor, color: colors.text, marginBottom: 14 }]}
                    value={reason}
                    onChangeText={setReason}
                    placeholder={diffType === "short" ? "e.g. payment not entered, theft, error..." : "e.g. advance received, extra returned..."}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </>
              )}

              {/* Notes */}
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 24 }]}
                value={notes} onChangeText={setNotes}
                placeholder="Additional notes..." placeholderTextColor={colors.mutedForeground}
              />

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#7C3AED", opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave} disabled={saving}
              >
                
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Audit Entry"}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Resolve Modal ───────────────────────────────────────────────── */}
      <Modal visible={!!showResolve} animationType="slide" transparent onRequestClose={() => setShowResolve(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            {showResolve && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Resolve Audit</Text>
                  <TouchableOpacity onPress={() => setShowResolve(null)}>
                    
                  </TouchableOpacity>
                </View>

                <View style={{ backgroundColor: showResolve.diffType === "short" ? "#FEF2F2" : "#DCFCE7", borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  
                  <View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: showResolve.diffType === "short" ? "#DC2626" : "#16A34A" }}>
                      {showResolve.diffType === "short" ? "Cash Short" : "Cash Excess"}: ₨{fmt(Math.abs(parseFloat(showResolve.difference)).toString())}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{showResolve.date}</Text>
                  </View>
                </View>

                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>REASON / EXPLANATION</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, borderColor: "#D97706", color: colors.text, marginBottom: 20 }]}
                  value={resolveReason}
                  onChangeText={setResolveReason}
                  placeholder="Explain how this was resolved..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />

                <TouchableOpacity
                  style={{ backgroundColor: "#16A34A", paddingVertical: 16, borderRadius: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }}
                  onPress={handleResolve}
                >
                  
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" }}>Mark as Resolved</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: "center", paddingVertical: 10, marginBottom: 16 }} onPress={() => setShowResolve(null)}>
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
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF", marginBottom: 2 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF" },
  chip: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 3 },
  chipLabel: { fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.65)", letterSpacing: 0.4 },
  chipVal: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFF" },
  entryCard: { borderRadius: 14, borderWidth: 1.5, padding: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  delBtn: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 50, gap: 6 },
  formLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Inter_400Regular", fontSize: 14 },
  diffBox: { borderRadius: 14, padding: 16, marginBottom: 14, alignItems: "center", gap: 2 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

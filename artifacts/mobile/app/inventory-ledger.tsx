import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Period = "today" | "yesterday" | "week" | "month" | "all";

type LedgerRow = {
  productId: number;
  productName: string;
  sku: string | null;
  locationId: number | null;
  locationName: string | null;
  currentStock: number;
  opening: number;
  received: number;
  receivedValue: string;
  sold: number;
  soldValue: string;
  balance: number;
  unitPrice: string;
  costPrice: string;
  stockValueAtCost: string;
  stockValueAtPrice: string;
};
type LedgerTotals = {
  opening: number;
  received: number;
  receivedValue: string;
  sold: number;
  soldValue: string;
  balance: number;
  stockValueAtCost: string;
  stockValueAtPrice: string;
};
type LedgerResp = {
  startDate: string;
  endDate: string;
  scope: { isAdmin: boolean; locationId: number | null; role: string | null };
  rows: LedgerRow[];
  totals: LedgerTotals;
};
type Location = { id: number; name: string };

function fmtPKR(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
}
function fmtNum(n: number): string {
  return n.toLocaleString();
}

function periodToRange(p: Period): { start: string | null; end: string | null; label: string } {
  if (p === "all") return { start: null, end: null, label: "All time" };
  const today = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "today") return { start: fmt(today), end: fmt(today), label: "Today" };
  if (p === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: fmt(y), end: fmt(y), label: "Yesterday" };
  }
  if (p === "week") {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: fmt(s), end: fmt(today), label: "Last 7 days" };
  }
  // month
  const s = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: fmt(s), end: fmt(today), label: "This month" };
}

export default function InventoryLedgerScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [period, setPeriod] = useState<Period>("today");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [data, setData] = useState<LedgerResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [valueMode, setValueMode] = useState<"cost" | "price">("price");

  // Load apps for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try { setLocations(await customFetch<Location[]>("/api/locations")); } catch (e) {} })();
  }, [isAdmin]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = periodToRange(period);
      const params = new URLSearchParams();
      if (r.start) params.set("startDate", r.start);
      if (r.end)   params.set("endDate",   r.end);
      if (locationId) params.set("locationId", String(locationId));
      const url = `/api/inventory/ledger${params.toString() ? `?${params.toString()}` : ""}`;
      const resp = await customFetch<LedgerResp>(url);
      setData(resp);
    } catch (e) {}  setLoading(false);
    setRefreshing(false);
  }, [period, locationId]);

  useEffect(() => { load(); }, [load]);

  const periodLabel = useMemo(() => periodToRange(period).label, [period]);
  const currentLocName = useMemo(() => {
    if (!locationId) return "All apps";
    return locations.find(l => l.id === locationId)?.name ?? "App";
  }, [locationId, locations]);

  const totalValue = useMemo(() => {
    if (!data) return 0;
    return parseFloat(valueMode === "cost" ? data.totals.stockValueAtCost : data.totals.stockValueAtPrice);
  }, [data, valueMode]);

  const renderRow = ({ item }: { item: LedgerRow }) => {
    const value = parseFloat(valueMode === "cost" ? item.stockValueAtCost : item.stockValueAtPrice);
    return (
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{item.productName}</Text>
          {item.locationName && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground }}>{item.locationName}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowGrid}>
          <View style={styles.cell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>OPENING</Text>
            <Text style={[styles.cellValue, { color: colors.text }]}>{fmtNum(item.opening)}</Text>
          </View>
          <View style={styles.cell}>
            <Text style={[styles.cellLabel, { color: "#059669" }]}>RECEIVED</Text>
            <Text style={[styles.cellValue, { color: "#059669" }]}>+{fmtNum(item.received)}</Text>
          </View>
          <View style={styles.cell}>
            <Text style={[styles.cellLabel, { color: "#DC2626" }]}>SOLD</Text>
            <Text style={[styles.cellValue, { color: "#DC2626" }]}>-{fmtNum(item.sold)}</Text>
          </View>
          <View style={styles.cell}>
            <Text style={[styles.cellLabel, { color: colors.primary }]}>BALANCE</Text>
            <Text style={[styles.cellValue, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{fmtNum(item.balance)}</Text>
          </View>
        </View>
        <View style={[styles.valueRow, { borderTopColor: colors.border }]}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground }}>
            {valueMode === "cost" ? "Stock value (cost)" : "Stock value (price)"}
          </Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>{fmtPKR(value)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient colors={["#0F172A", "#1E293B"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Inventory Ledger</Text>
            <Text style={styles.headerSub}>{periodLabel} · {currentLocName}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => load(true)}>
            
          </TouchableOpacity>
        </View>

        {/* Hero totals */}
        {data && (
          <View style={styles.heroGrid}>
            <View style={styles.heroCell}>
              <Text style={styles.heroLabel}>OPENING</Text>
              <Text style={styles.heroValue}>{fmtNum(data.totals.opening)}</Text>
            </View>
            <View style={styles.heroCell}>
              <Text style={[styles.heroLabel, { color: "#86EFAC" }]}>RECEIVED</Text>
              <Text style={[styles.heroValue, { color: "#86EFAC" }]}>+{fmtNum(data.totals.received)}</Text>
            </View>
            <View style={styles.heroCell}>
              <Text style={[styles.heroLabel, { color: "#FCA5A5" }]}>SOLD</Text>
              <Text style={[styles.heroValue, { color: "#FCA5A5" }]}>-{fmtNum(data.totals.sold)}</Text>
            </View>
            <View style={styles.heroCell}>
              <Text style={[styles.heroLabel, { color: "#93C5FD" }]}>BALANCE</Text>
              <Text style={[styles.heroValue, { color: "#FFFFFF" }]}>{fmtNum(data.totals.balance)}</Text>
            </View>
          </View>
        )}
        {data && (
          <View style={styles.totalValueBar}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.4 }}>
              TOTAL STOCK VALUE ({valueMode.toUpperCase()})
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" }}>{fmtPKR(totalValue)}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Filters bar */}
      <View style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(["today", "yesterday", "week", "month", "all"] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[
                styles.chip,
                {
                  backgroundColor: period === p ? colors.primary : colors.background,
                  borderColor: period === p ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setPeriod(p)}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: period === p ? "#FFF" : colors.text }}>
                {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "week" ? "7 days" : p === "month" ? "Month" : "All"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => setShowLocPicker(true)}
            >
              
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.text, flex: 1 }} numberOfLines={1}>
                {currentLocName}
              </Text>
              
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setValueMode(valueMode === "cost" ? "price" : "cost")}
          >
            
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.text, flex: 1 }}>
              {valueMode === "cost" ? "At Cost" : "At Price"}
            </Text>
            
          </TouchableOpacity>
        </View>
        {/* Targets shortcut */}
        <TouchableOpacity
          style={[styles.dropdownBtn, { backgroundColor: "#7C3AED" + "15", borderColor: "#7C3AED" + "40", gap: 5 }]}
          onPress={() => router.push("/targets")}
        >
          <Feather name="target" size={13} color="#7C3AED" />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#7C3AED" }}>Targets</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={r => String(r.productId)}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 }}>No products in this scope</Text>
            </View>
          }
        />
      )}

      {/* App picker modal */}
      <Modal visible={showLocPicker} transparent animationType="fade" onRequestClose={() => setShowLocPicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLocPicker(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>Select App</Text>
              <TouchableOpacity onPress={() => setShowLocPicker(false)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: 0, name: "All apps" } as Location, ...locations]}
              keyExtractor={l => String(l.id)}
              renderItem={({ item }) => {
                const sel = (item.id === 0 && locationId === null) || item.id === locationId;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, { borderBottomColor: colors.border, backgroundColor: sel ? colors.background : "transparent" }]}
                    onPress={() => { setLocationId(item.id === 0 ? null : item.id); setShowLocPicker(false); }}
                  >
                    
                    <Text style={{ flex: 1, fontFamily: sel ? "Inter_700Bold" : "Inter_500Medium", fontSize: 13, color: sel ? colors.primary : colors.text }}>{item.name}</Text>
                    {null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 19, color: "#FFF" },
  headerSub:   { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },

  heroGrid: { flexDirection: "row", gap: 6, marginBottom: 10 },
  heroCell: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 10, alignItems: "center", gap: 4 },
  heroLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 },
  heroValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" },

  totalValueBar: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  filterBar: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  dropdownBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },

  row: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  rowGrid: { flexDirection: "row", gap: 6 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  cellLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.4, marginBottom: 3 },
  cellValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, marginTop: 8, paddingTop: 8 },

  empty: { padding: 40, alignItems: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 360, maxHeight: "70%", borderRadius: 14, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  modalItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
});

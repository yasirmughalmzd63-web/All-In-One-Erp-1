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
type Row = {
  productId: number; productName: string; locationId: number | null; locationName: string | null;
  opening: number; purchased: number; purchasedValue: string;
  sold: number; revenue: string; cogs: string;
  balance: number; balanceValue: string; profit: string; margin: string;
};
type Resp = {
  startDate: string; endDate: string;
  scope: { isAdmin: boolean; locationId: number | null };
  rows: Row[];
  totals: { opening: number; purchased: number; purchasedValue: string; sold: number; revenue: string; cogs: string; balance: number; balanceValue: string; profit: string; margin: string };
};
type Location = { id: number; name: string };

const fmt = (s: string | number) => {
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
};
function periodToRange(p: Period): { start: string | null; end: string | null; label: string } {
  if (p === "all") return { start: null, end: null, label: "All time" };
  const today = new Date();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "today") return { start: f(today), end: f(today), label: "Today" };
  if (p === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: f(y), end: f(y), label: "Yesterday" }; }
  if (p === "week") { const s = new Date(today); s.setDate(s.getDate() - 6); return { start: f(s), end: f(today), label: "Last 7 days" }; }
  const s = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: f(s), end: f(today), label: "This month" };
}

export default function ProductProfitScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Resp | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const range = useMemo(() => periodToRange(period), [period]);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.start) params.set("startDate", range.start);
      if (range.end)   params.set("endDate",   range.end);
      if (locId)       params.set("locationId", String(locId));
      const r = await customFetch(`/api/reports/product-profit?${params.toString()}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [range, locId]);

  useEffect(() => {
    if (isAdmin) {
      customFetch("/api/locations").then((r: Response) => r.ok ? r.json() : []).then((arr: Location[]) => setLocations(Array.isArray(arr) ? arr : []));
    }
  }, [isAdmin]);
  useEffect(() => { void load(true); }, [load]);

  const styles = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const selectedLocName = locId ? locations.find(l => l.id === locId)?.name : "All apps";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#7C3AED", "#5B21B6"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}></TouchableOpacity>
          <Text style={styles.title}>Product Profit</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.iconBtn}></TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{range.label} • {selectedLocName}</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Revenue</Text><Text style={styles.heroValue}>{data ? fmt(data.totals.revenue) : "—"}</Text></View>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Profit</Text><Text style={styles.heroValue}>{data ? fmt(data.totals.profit) : "—"}</Text></View>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Margin</Text><Text style={styles.heroValue}>{data?.totals.margin ?? "0"}%</Text></View>
        </View>
      </LinearGradient>

      <View style={styles.chipRow}>
        {(["today","yesterday","week","month","all"] as Period[]).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[styles.chip, period === p && styles.chipActive]}>
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>{p[0].toUpperCase() + p.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isAdmin && (
        <TouchableOpacity style={styles.locBtn} onPress={() => setPickerOpen(true)}>
          
          <Text style={[styles.locText, { color: colors.text }]}>App: {selectedLocName}</Text>
          
        </TouchableOpacity>
      )}

      {loading && !refreshing ? (
        <View style={styles.loader}><ActivityIndicator color={colors.tint} /></View>
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={r => String(r.productId)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 40 }}>No data</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.tint} />}
          renderItem={({ item }) => {
            const profitNum = parseFloat(item.profit);
            return (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.prodName, { color: colors.text }]}>{item.productName}</Text>
                    {item.locationName && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{item.locationName}</Text>}
                  </View>
                  <View style={[styles.profitBadge, { backgroundColor: profitNum >= 0 ? "#ECFDF5" : "#FEF2F2" }]}>
                    <Text style={{ color: profitNum >= 0 ? "#059669" : "#DC2626", fontWeight: "800", fontSize: 14 }}>{fmt(item.profit)}</Text>
                    <Text style={{ color: profitNum >= 0 ? "#059669" : "#DC2626", fontSize: 10 }}>{item.margin}% margin</Text>
                  </View>
                </View>
                <View style={styles.gridRow}>
                  <Mini label="Opening"   v={item.opening.toLocaleString()}            colors={colors} />
                  <Mini label="Purchased" v={item.purchased.toLocaleString()}          colors={colors} />
                  <Mini label="Sold"      v={item.sold.toLocaleString()}               colors={colors} />
                  <Mini label="Balance"   v={item.balance.toLocaleString()}            colors={colors} bold />
                </View>
                <View style={styles.gridRow}>
                  <Mini label="Revenue" v={fmt(item.revenue)} colors={colors} />
                  <Mini label="COGS"    v={fmt(item.cogs)}    colors={colors} />
                  <Mini label="Stock $" v={fmt(item.balanceValue)} colors={colors} />
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filter by App</Text>
            <FlatList
              data={[{ id: 0, name: "All apps" } as Location, ...locations]}
              keyExtractor={l => String(l.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => { setLocId(item.id || null); setPickerOpen(false); }}>
                  <Text style={[styles.modalText, { color: colors.text }]}>{item.name}</Text>
                  {null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Mini({ label, v, colors, bold }: { label: string; v: string; colors: ReturnType<typeof useColors>; bold?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: bold ? "800" : "600", marginTop: 2 }}>{v}</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    title: { color: "#fff", fontSize: 18, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center", marginBottom: 12 },
    heroRow: { flexDirection: "row", gap: 8 },
    heroBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, alignItems: "center" },
    heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, marginBottom: 2 },
    heroValue: { color: "#fff", fontSize: 18, fontWeight: "900" },
    chipRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 10, flexWrap: "wrap" },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
    chipText: { fontSize: 12, color: colors.text, fontWeight: "600" },
    chipTextActive: { color: "#fff" },
    locBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 16, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start", marginBottom: 4 },
    locText: { fontSize: 13, fontWeight: "600" },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },
    card: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    prodName: { fontSize: 15, fontWeight: "700" },
    profitBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: "flex-end" },
    gridRow: { flexDirection: "row", gap: 8 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
    modal: { borderRadius: 16, padding: 16, maxHeight: 480 },
    modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
    modalItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
    modalText: { fontSize: 15 },
  });
}

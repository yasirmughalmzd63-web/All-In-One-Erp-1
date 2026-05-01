import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Period = "today" | "yesterday" | "week" | "month" | "all";
type PLResp = {
  startDate: string; endDate: string; allTime: boolean;
  scope: { isAdmin: boolean; locationId: number | null };
  sales:    { total: string; count: number; discount: string; collected: string };
  cogs:     { total: string; unitsSold: number };
  purchases:{ total: string; count: number };
  expenses: { total: string; count: number; breakdown: { categoryId: number | null; title: string; total: string }[] };
  grossProfit: string; netProfit: string; margin: string;
};
type Location = { id: number; name: string };

const fmt = (s: string) => {
  const n = parseFloat(s);
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

export default function ProfitLossScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<PLResp | null>(null);
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
      const r = await customFetch(`/api/reports/profit-loss?${params.toString()}`);
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
  const profitNum = data ? parseFloat(data.netProfit) : 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}></TouchableOpacity>
          <Text style={styles.title}>Profit & Loss</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.iconBtn}></TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{range.label} • {selectedLocName}</Text>
        <View style={styles.heroBox}>
          <Text style={styles.heroLabel}>Net Profit</Text>
          <Text style={[styles.heroValue, { color: profitNum >= 0 ? "#fff" : "#FECACA" }]}>{data ? fmt(data.netProfit) : "—"}</Text>
          <Text style={styles.heroSub}>Margin {data?.margin ?? "0"}%</Text>
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
        <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.tint} />} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {data && (<>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionH, { color: colors.text }]}>Income</Text>
              <Row label="Total Sales" value={fmt(data.sales.total)} sub={`${data.sales.count} invoices`} colors={colors} />
              <Row label="Less: Discount" value={`-${fmt(data.sales.discount)}`} colors={colors} />
              <Row label="Less: COGS" value={`-${fmt(data.cogs.total)}`} sub={`${data.cogs.unitsSold.toLocaleString()} units sold`} colors={colors} />
              <View style={styles.divider} />
              <Row label="Gross Profit" value={fmt(data.grossProfit)} bold colors={colors} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionH, { color: colors.text }]}>Expenses</Text>
              <Row label="Total Expenses" value={fmt(data.expenses.total)} sub={`${data.expenses.count} entries`} colors={colors} />
              {data.expenses.breakdown.slice(0, 6).map(b => (
                <Row key={`${b.categoryId}-${b.title}`} label={`  ${b.title}`} value={fmt(b.total)} colors={colors} small />
              ))}
              <View style={styles.divider} />
              <Row label="Net Profit" value={fmt(data.netProfit)} bold colors={colors} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionH, { color: colors.text }]}>Other</Text>
              <Row label="Cash Collected" value={fmt(data.sales.collected)} colors={colors} small />
              <Row label="Total Purchases" value={fmt(data.purchases.total)} sub={`${data.purchases.count} entries`} colors={colors} small />
            </View>
          </>)}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filter by App</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={styles.modalItem} onPress={() => { setLocId(null); setPickerOpen(false); }}>
                <Text style={[styles.modalText, { color: colors.text }]}>All apps</Text>
                {null}
              </TouchableOpacity>
              {locations.map(l => (
                <TouchableOpacity key={l.id} style={styles.modalItem} onPress={() => { setLocId(l.id); setPickerOpen(false); }}>
                  <Text style={[styles.modalText, { color: colors.text }]}>{l.name}</Text>
                  {null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ label, value, sub, bold, small, colors }: { label: string; value: string; sub?: string; bold?: boolean; small?: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles2.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: bold ? "800" : "500", fontSize: small ? 13 : 15 }}>{label}</Text>
        {sub && <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>{sub}</Text>}
      </View>
      <Text style={{ color: colors.text, fontWeight: bold ? "800" : "600", fontSize: bold ? 17 : 15 }}>{value}</Text>
    </View>
  );
}
const styles2 = StyleSheet.create({ row: { flexDirection: "row", paddingVertical: 8, alignItems: "center" } });

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    title: { color: "#fff", fontSize: 18, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center", marginBottom: 14 },
    heroBox: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 16, padding: 16, alignItems: "center" },
    heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginBottom: 4 },
    heroValue: { fontSize: 30, fontWeight: "900" },
    heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 4 },
    chipRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 10, flexWrap: "wrap" },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: "#059669", borderColor: "#059669" },
    chipText: { fontSize: 12, color: colors.text, fontWeight: "600" },
    chipTextActive: { color: "#fff" },
    locBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 16, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
    locText: { fontSize: 13, fontWeight: "600" },
    card: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    sectionH: { fontSize: 14, fontWeight: "800", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
    modal: { borderRadius: 16, padding: 16, maxHeight: 480 },
    modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
    modalItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
    modalText: { fontSize: 15 },
  });
}

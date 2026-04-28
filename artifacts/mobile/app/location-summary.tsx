import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Period = "today" | "yesterday" | "week" | "month" | "all";
type Row = {
  locationId: number; locationName: string;
  sales: string; salesCount: number;
  purchases: string; purchasesCount: number;
  cogs: string; grossProfit: string;
  stockValue: string; stockUnits: number;
  cashBalance: string; netWorth: string;
};
type Resp = {
  startDate: string; endDate: string;
  scope: { isAdmin: boolean; locationId: number | null };
  rows: Row[];
  totals: { sales: string; purchases: string; cogs: string; grossProfit: string; stockValue: string; cashBalance: string; netWorth: string };
};
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

export default function LocationSummaryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => periodToRange(period), [period]);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.start) params.set("startDate", range.start);
      if (range.end)   params.set("endDate",   range.end);
      const r = await customFetch(`/api/reports/location-summary?${params.toString()}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [range]);

  useEffect(() => { void load(true); }, [load]);

  const styles = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0891B2", "#0E7490"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><Feather name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
          <Text style={styles.title}>App Summary</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.iconBtn}><Feather name="refresh-cw" size={20} color="#fff" /></TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{range.label}</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Sales</Text><Text style={styles.heroValue}>{data ? fmt(data.totals.sales) : "—"}</Text></View>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Profit</Text><Text style={styles.heroValue}>{data ? fmt(data.totals.grossProfit) : "—"}</Text></View>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Net Worth</Text><Text style={styles.heroValue}>{data ? fmt(data.totals.netWorth) : "—"}</Text></View>
        </View>
      </LinearGradient>

      <View style={styles.chipRow}>
        {(["today","yesterday","week","month","all"] as Period[]).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[styles.chip, period === p && styles.chipActive]}>
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>{p[0].toUpperCase() + p.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loader}><ActivityIndicator color={colors.tint} /></View>
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={r => String(r.locationId)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 40 }}>No apps</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.tint} />}
          renderItem={({ item }) => {
            const profitNum = parseFloat(item.grossProfit);
            return (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.locName, { color: colors.text }]}>{item.locationName}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{item.salesCount} sales · {item.purchasesCount} purchases</Text>
                  </View>
                  <View style={[styles.profitBadge, { backgroundColor: profitNum >= 0 ? "#ECFDF5" : "#FEF2F2" }]}>
                    <Text style={{ color: profitNum >= 0 ? "#059669" : "#DC2626", fontWeight: "800", fontSize: 14 }}>{fmt(item.grossProfit)}</Text>
                    <Text style={{ color: profitNum >= 0 ? "#059669" : "#DC2626", fontSize: 10 }}>gross profit</Text>
                  </View>
                </View>
                <View style={styles.gridRow}>
                  <Mini label="Sales"     v={fmt(item.sales)}     colors={colors} />
                  <Mini label="Purchases" v={fmt(item.purchases)} colors={colors} />
                  <Mini label="COGS"      v={fmt(item.cogs)}      colors={colors} />
                </View>
                <View style={styles.gridRow}>
                  <Mini label="Stock Value" v={fmt(item.stockValue)} colors={colors} />
                  <Mini label="Cash"        v={fmt(item.cashBalance)} colors={colors} />
                  <Mini label="Net Worth"   v={fmt(item.netWorth)}    colors={colors} bold />
                </View>
              </View>
            );
          }}
        />
      )}
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
    heroValue: { color: "#fff", fontSize: 16, fontWeight: "900" },
    chipRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 10, flexWrap: "wrap" },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: "#0891B2", borderColor: "#0891B2" },
    chipText: { fontSize: 12, color: colors.text, fontWeight: "600" },
    chipTextActive: { color: "#fff" },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },
    card: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    locName: { fontSize: 15, fontWeight: "700" },
    profitBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: "flex-end" },
    gridRow: { flexDirection: "row", gap: 8 },
  });
}

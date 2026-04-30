import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type CustomerRow = {
  customerId: number;
  customerName: string;
  phone: string | null;
  period: { usdIn: string; usdOut: string; netUsd: string; pkrTotal: string; entryCount: number };
  lifetime: { usdIn: string; usdOut: string; netUsd: string; pkrTotal: string; entryCount: number };
};

type ReportData = {
  customers: CustomerRow[];
  totals: {
    periodUsdIn: string; periodUsdOut: string; periodNet: string;
    lifetimeUsdIn: string; lifetimeUsdOut: string; lifetimeNet: string;
  };
  allTime: boolean;
};

const today = new Date().toISOString().split("T")[0]!;
const monthStart = today.slice(0, 8) + "01";

function fmtUsd(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerDollarReportScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const result = await customFetch<ReportData>(`/api/reports/customer-dollar-report?${params}`);
      setData(result);
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, [startDate, endDate]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (data?.customers ?? []).filter(c =>
    !search || c.customerName.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? "").includes(search)
  );

  const renderItem = ({ item }: { item: CustomerRow }) => {
    const netPeriod = parseFloat(item.period.netUsd);
    const netLife   = parseFloat(item.lifetime.netUsd);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: "#E0F2FE" }]}>
            <Text style={[styles.avatarText, { color: "#0369A1" }]}>
              {item.customerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{item.customerName}</Text>
            {item.phone ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.phone}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: netLife >= 0 ? "#DCFCE7" : "#FEE2E2" }]}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: netLife >= 0 ? "#16A34A" : "#DC2626" }}>
              {netLife >= 0 ? "+" : "-"}{fmtUsd(Math.abs(netLife))}
            </Text>
          </View>
        </View>

        <View style={[styles.grid, { borderTopColor: colors.border }]}>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>USD IN (Period)</Text>
            <Text style={[styles.cellValue, { color: "#16A34A" }]}>{fmtUsd(item.period.usdIn)}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>USD OUT (Period)</Text>
            <Text style={[styles.cellValue, { color: "#DC2626" }]}>{fmtUsd(item.period.usdOut)}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>NET (Period)</Text>
            <Text style={[styles.cellValue, { color: netPeriod >= 0 ? "#16A34A" : "#DC2626" }]}>
              {netPeriod >= 0 ? "+" : "-"}{fmtUsd(Math.abs(netPeriod))}
            </Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>TRANSACTIONS</Text>
            <Text style={[styles.cellValue, { color: colors.text }]}>{item.lifetime.entryCount}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>LIFETIME IN</Text>
            <Text style={[styles.cellValue, { color: "#16A34A" }]}>{fmtUsd(item.lifetime.usdIn)}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>LIFETIME OUT</Text>
            <Text style={[styles.cellValue, { color: "#DC2626" }]}>{fmtUsd(item.lifetime.usdOut)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const totals = data?.totals;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={["#0369A1", "#0891B2"]} style={{ paddingTop: topPad + 8, paddingBottom: 20, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold" }}>{"<"}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" }}>Customer Dollar Report</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)" }}>USD activity by customer</Text>
          </View>
        </View>

        {totals && (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            <View style={[styles.summaryCard]}>
              <Text style={styles.summaryLabel}>PERIOD IN</Text>
              <Text style={[styles.summaryValue, { color: "#4ADE80" }]}>{fmtUsd(totals.periodUsdIn)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>PERIOD OUT</Text>
              <Text style={[styles.summaryValue, { color: "#F87171" }]}>{fmtUsd(totals.periodUsdOut)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>PERIOD NET</Text>
              <Text style={[styles.summaryValue, { color: parseFloat(totals.periodNet) >= 0 ? "#4ADE80" : "#F87171" }]}>
                {parseFloat(totals.periodNet) >= 0 ? "+" : "-"}{fmtUsd(Math.abs(parseFloat(totals.periodNet)))}
              </Text>
            </View>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>FROM</Text>
            <TextInput
              style={[styles.dateInput]}
              value={startDate}
              onChangeText={setStartDate}
              onEndEditing={() => load()}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>TO</Text>
            <TextInput
              style={[styles.dateInput]}
              value={endDate}
              onChangeText={setEndDate}
              onEndEditing={() => load()}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>
          <TouchableOpacity style={styles.applyBtn} onPress={() => load()}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#0369A1" }}>Apply</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
          placeholder="Search customer..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.customerId)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {search ? "No customers match your search" : "No customer dollar activity found"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 16 },
  name: { fontFamily: "Inter_700Bold", fontSize: 15 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1 },
  gridCell: { width: "33.33%", padding: 10 },
  cellLabel: { fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.3, marginBottom: 3 },
  cellValue: { fontFamily: "Inter_700Bold", fontSize: 13 },
  summaryCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10 },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3, marginBottom: 3 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 14 },
  dateInput: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#FFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  applyBtn: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-end",
    paddingVertical: 8,
  },
  searchInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});

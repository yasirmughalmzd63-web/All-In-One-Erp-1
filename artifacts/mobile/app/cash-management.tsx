import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface AccountSummary {
  id: number; name: string; type: string;
  balance: number; currency: string; locationId?: number | null;
}
interface StatementEntry {
  id: string; date: string; description: string;
  credit: number; debit: number; balance: number;
  kind: string; notes: string | null;
}
interface StatementData {
  account: AccountSummary;
  summary: {
    openingBalance: number; totalIn: number;
    totalOut: number; closingBalance: number; entryCount: number;
  };
  entries: StatementEntry[];
}
type Direction = "all" | "in" | "out";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isoToDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

const isoToTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

const todayStr = () => new Date().toISOString().slice(0, 10);
const thirtyDaysAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
};

const TYPE_META: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; bg: string; color: string; label: string }> = {
  sale:          { icon: "shopping-bag", bg: "#EFF6FF", color: "#2563EB", label: "Sale" },
  purchase:      { icon: "package",      bg: "#FEF3C7", color: "#D97706", label: "Purchase" },
  expense:       { icon: "minus-circle", bg: "#FEF2F2", color: "#DC2626", label: "Expense" },
  credit_payment:{ icon: "check-circle", bg: "#ECFDF5", color: "#059669", label: "Credit Payment" },
};

const ACCOUNT_TYPE_COLOR: Record<string, { bg: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  cash:   { bg: "#ECFDF5", color: "#059669", icon: "dollar-sign" },
  bank:   { bg: "#EFF6FF", color: "#1D4ED8", icon: "credit-card" },
  mobile: { bg: "#F5F3FF", color: "#7C3AED", icon: "smartphone" },
  other:  { bg: "#F9FAFB", color: "#6B7280", icon: "archive" },
};

const getAccColor = (type: string) => ACCOUNT_TYPE_COLOR[type] ?? ACCOUNT_TYPE_COLOR["other"]!;

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CashManagementScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { token } = useAuth();
  const colors  = useColors();

  /* Account list */
  const [accounts,  setAccounts]  = useState<AccountSummary[]>([]);
  const [selAcc,    setSelAcc]    = useState<AccountSummary | null>(null);
  const [accsLoading, setAccsLoading] = useState(true);

  /* Statement */
  const [data,      setData]      = useState<StatementData | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* Filters */
  const [from,      setFrom]      = useState(thirtyDaysAgo);
  const [to,        setTo]        = useState(todayStr);
  const [direction, setDirection] = useState<Direction>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  /* ── Load accounts ── */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(getApiUrl("/api/cash-management/accounts"), { headers });
        if (r.ok) {
          const list: AccountSummary[] = await r.json();
          setAccounts(list);
          if (list.length > 0) setSelAcc(list[0]!);
        }
      } finally { setAccsLoading(false); }
    })();
  }, [token]);

  /* ── Load statement ── */
  const loadStatement = useCallback(async (refresh = false) => {
    if (!selAcc) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const url = getApiUrl(
        `/api/cash-management/statement?accountId=${selAcc.id}&from=${from}&to=${to}&direction=${direction}`
      );
      const r = await fetch(url, { headers });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [selAcc?.id, from, to, direction, token]);

  useEffect(() => { if (selAcc) loadStatement(); }, [selAcc?.id, from, to, direction]);

  /* ── Export ── */
  const handleExport = async () => {
    if (!data) return;
    const { account, summary, entries } = data;

    const header = [
      `Cash Management Statement — ${account.name}`,
      `Type: ${account.type.toUpperCase()} | Currency: ${account.currency}`,
      `Period: ${from} to ${to}`,
      "",
      `Opening Balance:  ${PKR(summary.openingBalance)}`,
      `Total In:         ${PKR(summary.totalIn)}`,
      `Total Out:        ${PKR(summary.totalOut)}`,
      `Closing Balance:  ${PKR(summary.closingBalance)}`,
      "",
      "Date,Time,Description,Debit,Credit,Balance,Kind",
    ].join("\n");

    const rows = entries.map(e =>
      `"${isoToDate(e.date)}","${isoToTime(e.date)}","${e.description.replace(/"/g, "'")}",` +
      `${e.debit > 0 ? PKR(e.debit) : ""},${e.credit > 0 ? PKR(e.credit) : ""},${PKR(e.balance)},${e.kind}`
    ).join("\n");

    await Share.share({
      message: header + "\n" + rows,
      title: `Statement — ${account.name} (${from} to ${to})`,
    });
  };

  /* ─── Render ─────────────────────────────────────────────────────────── */
  if (accsLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular" }}>
          Loading accounts…
        </Text>
      </View>
    );
  }

  const acc = selAcc;
  const accMeta = acc ? getAccColor(acc.type) : ACCOUNT_TYPE_COLOR["cash"]!;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 10 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Cash Management</Text>
            <Text style={s.headerSub}>Account statement · bank-style view</Text>
          </View>
          <TouchableOpacity onPress={handleExport} style={s.exportBtn}>
            <Feather name="share-2" size={17} color="#FFF" />
            <Text style={s.exportBtnText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Account tabs ── */}
      <View style={[s.accTabBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 10 }}>
          {accounts.map(a => {
            const meta = getAccColor(a.type);
            const active = selAcc?.id === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => setSelAcc(a)}
                style={[s.accTab, active && { backgroundColor: "#2563EB", borderColor: "#2563EB" }, !active && { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <View style={[s.accTabIcon, { backgroundColor: active ? "rgba(255,255,255,0.25)" : meta.bg }]}>
                  <Feather name={meta.icon} size={13} color={active ? "#FFF" : meta.color} />
                </View>
                <View>
                  <Text style={[s.accTabName, active && { color: "#FFF" }]}>{a.name}</Text>
                  <Text style={[s.accTabBal, active && { color: "rgba(255,255,255,0.8)" }]}>
                    {PKR(a.balance)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {accounts.length === 0 && (
            <Text style={{ color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 6 }}>
              No accounts found. Add accounts first.
            </Text>
          )}
        </ScrollView>
      </View>

      {/* ── Filter bar ── */}
      <View style={[s.filterBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity style={s.filterPill} onPress={() => setFilterOpen(true)}>
          <Feather name="calendar" size={14} color="#2563EB" />
          <Text style={s.filterPillText}>{from} → {to}</Text>
        </TouchableOpacity>
        <View style={s.dirTabs}>
          {(["all", "in", "out"] as Direction[]).map(d => (
            <TouchableOpacity
              key={d}
              style={[s.dirTab, direction === d && s.dirTabActive]}
              onPress={() => setDirection(d)}
            >
              <Text style={[s.dirTabText, direction === d && s.dirTabTextActive]}>
                {d === "all" ? "All" : d === "in" ? "↑ In" : "↓ Out"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Summary strip ── */}
      {data && (
        <View style={[s.summaryStrip, { backgroundColor: "#1E3A8A" }]}>
          <SumCell label="Opening" value={PKR(data.summary.openingBalance)} />
          <SumCell label="Total In" value={PKR(data.summary.totalIn)} color="#34D399" />
          <SumCell label="Total Out" value={PKR(data.summary.totalOut)} color="#F87171" />
          <SumCell label="Closing" value={PKR(data.summary.closingBalance)} color="#FCD34D" />
        </View>
      )}

      {/* ── Statement list ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : !data || data.entries.length === 0 ? (
        <View style={s.center}>
          <Feather name="file-text" size={44} color="#D1D5DB" />
          <Text style={{ color: "#9CA3AF", marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 15 }}>
            No transactions for this period
          </Text>
          <Text style={{ color: "#CBD5E1", marginTop: 4, fontFamily: "Inter_400Regular", fontSize: 13 }}>
            Adjust the date range or change filter
          </Text>
        </View>
      ) : (
        <>
          {/* ── Column header ── */}
          <View style={[s.colHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[s.colHdr, { flex: 2.8 }]}>DESCRIPTION</Text>
            <Text style={[s.colHdr, { flex: 1, textAlign: "right" }]}>DEBIT</Text>
            <Text style={[s.colHdr, { flex: 1, textAlign: "right" }]}>CREDIT</Text>
            <Text style={[s.colHdr, { flex: 1.2, textAlign: "right" }]}>BALANCE</Text>
          </View>

          <FlatList
            data={data.entries}
            keyExtractor={e => e.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStatement(true)} />}
            contentContainerStyle={{ paddingBottom: 60 }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 58 }} />}
            renderItem={({ item: e, index }) => {
              const meta = TYPE_META[e.kind] ?? TYPE_META["sale"]!;
              const isCredit = e.credit > 0;
              return (
                <View style={s.entryRow}>
                  {/* Icon */}
                  <View style={[s.entryIcon, { backgroundColor: meta.bg }]}>
                    <Feather name={meta.icon} size={15} color={meta.color} />
                  </View>

                  {/* Description + date */}
                  <View style={{ flex: 2.8 }}>
                    <Text style={s.entryDesc} numberOfLines={1}>{e.description}</Text>
                    <Text style={s.entryDate}>{isoToDate(e.date)} · {isoToTime(e.date)}</Text>
                    {e.notes ? <Text style={s.entryNotes} numberOfLines={1}>{e.notes}</Text> : null}
                  </View>

                  {/* Debit */}
                  <Text style={[s.entryAmt, { flex: 1, textAlign: "right", color: e.debit > 0 ? "#DC2626" : "#D1D5DB" }]}>
                    {e.debit > 0 ? PKR(e.debit) : "—"}
                  </Text>

                  {/* Credit */}
                  <Text style={[s.entryAmt, { flex: 1, textAlign: "right", color: e.credit > 0 ? "#059669" : "#D1D5DB" }]}>
                    {e.credit > 0 ? PKR(e.credit) : "—"}
                  </Text>

                  {/* Running balance */}
                  <Text style={[s.entryBal, { flex: 1.2, textAlign: "right", color: e.balance >= 0 ? "#1F2937" : "#DC2626" }]}>
                    {PKR(e.balance)}
                  </Text>
                </View>
              );
            }}
          />
        </>
      )}

      {/* ── Date filter modal ── */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setFilterOpen(false)} />
        <View style={[s.filterSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={s.filterSheetHandle} />
          <Text style={[s.filterSheetTitle, { color: colors.text }]}>Filter Statement</Text>

          <Text style={[s.filterLabel, { color: colors.textSecondary }]}>From Date</Text>
          <TextInput
            style={[s.dateInput, { color: colors.text, borderColor: colors.border }]}
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[s.filterLabel, { color: colors.textSecondary }]}>To Date</Text>
          <TextInput
            style={[s.dateInput, { color: colors.text, borderColor: colors.border }]}
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />

          {/* Quick ranges */}
          <Text style={[s.filterLabel, { color: colors.textSecondary, marginTop: 8 }]}>Quick Ranges</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "Today",    days: 0 },
              { label: "7 days",   days: 7 },
              { label: "30 days",  days: 30 },
              { label: "90 days",  days: 90 },
              { label: "This month", days: -1 },
            ].map(({ label, days }) => (
              <TouchableOpacity
                key={label}
                style={s.quickRange}
                onPress={() => {
                  if (days === -1) {
                    const now = new Date();
                    const f = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                    setFrom(f); setTo(todayStr());
                  } else {
                    const d = new Date(); d.setDate(d.getDate() - days);
                    setFrom(d.toISOString().slice(0, 10)); setTo(todayStr());
                  }
                }}
              >
                <Text style={s.quickRangeText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.applyBtn} onPress={() => setFilterOpen(false)}>
            <Text style={s.applyBtnText}>Apply Filter</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function SumCell({ label, value, color = "#FFF" }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "800", color, fontFamily: "Inter_700Bold" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },

  header: { backgroundColor: "#1E40AF", paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#FFF", fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: "Inter_400Regular", marginTop: 1 },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  exportBtnText: { color: "#FFF", fontSize: 13, fontFamily: "Inter_700Bold" },

  accTabBar: { borderBottomWidth: 1 },
  accTab: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8 },
  accTabIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  accTabName: { fontSize: 13, fontWeight: "700", color: "#1F2937", fontFamily: "Inter_700Bold" },
  accTabBal: { fontSize: 11, color: "#6B7280", fontFamily: "Inter_400Regular" },

  filterBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 10, borderBottomWidth: 1 },
  filterPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  filterPillText: { fontSize: 12, color: "#2563EB", fontFamily: "Inter_600SemiBold" },
  dirTabs: { flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB" },
  dirTab: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F9FAFB" },
  dirTabActive: { backgroundColor: "#2563EB" },
  dirTabText: { fontSize: 12, color: "#6B7280", fontFamily: "Inter_600SemiBold" },
  dirTabTextActive: { color: "#FFF" },

  summaryStrip: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, gap: 4 },

  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 4 },
  colHdr: { fontSize: 9, fontWeight: "800", color: "#9CA3AF", fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },

  entryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  entryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 6 },
  entryDesc: { fontSize: 12, fontWeight: "600", color: "#1F2937", fontFamily: "Inter_600SemiBold" },
  entryDate: { fontSize: 10, color: "#9CA3AF", fontFamily: "Inter_400Regular", marginTop: 1 },
  entryNotes: { fontSize: 10, color: "#6B7280", fontFamily: "Inter_400Regular", marginTop: 1 },
  entryAmt: { fontSize: 12, fontFamily: "Inter_700Bold" },
  entryBal: { fontSize: 12, fontFamily: "Inter_700Bold" },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  filterSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 6 },
  filterSheetHandle: { width: 36, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  filterSheetTitle: { fontSize: 17, fontWeight: "800", fontFamily: "Inter_700Bold", marginBottom: 8 },
  filterLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  dateInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  quickRange: { backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  quickRangeText: { fontSize: 12, color: "#2563EB", fontFamily: "Inter_600SemiBold" },
  applyBtn: { marginTop: 16, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  applyBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
});

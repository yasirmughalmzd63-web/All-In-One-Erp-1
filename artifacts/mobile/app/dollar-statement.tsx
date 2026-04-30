import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Platform, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface WalletStat {
  id: number; name: string; type: string;
  balance: number; totalIn: number; totalOut: number;
}
interface Purchase {
  id: number; date: string; createdAt: string;
  customerName: string; customerId?: number | null;
  dollarAmount: number; dollarRate: number; totalPkr: number;
  coinsPkr: number; cashPkr: number; creditPkr: number;
  coinsProductName?: string | null; coinsQty: number;
  cashAccountName?: string | null;
  locationId?: number | null; locationName?: string | null; notes?: string | null;
}
interface LedgerEntry {
  id: number; date: string; createdAt: string;
  entryType: string; amountUsd: number; rate: number; totalPkr: number;
  partyName?: string | null; partyType?: string | null;
  walletId?: number | null; walletName?: string | null;
  notes?: string | null; direction: "in" | "out";
}
interface LocationRow {
  locationId: number | null; locationName: string;
  count: number; totalUsd: number; totalPkr: number;
  coinsPkr: number; cashPkr: number; creditPkr: number; coinsQty: number;
}
interface CoinRow {
  productName: string; qty: number; pkrValue: number; count: number;
}
interface Summary {
  totalPurchasedUsd: number; totalPurchasedPkr: number;
  totalCoinsPkr: number; totalCashPkr: number; totalCreditPkr: number;
  totalCoinsQty: number; purchaseCount: number;
  ledgerIn: number; ledgerOut: number; walletBalanceUsd: number;
}
interface ReportData {
  period: { from: string; to: string };
  summary: Summary;
  wallets: WalletStat[];
  purchases: Purchase[];
  ledger: LedgerEntry[];
  locationBreakdown: LocationRow[];
  coinsBreakdown: CoinRow[];
}

type Tab = "overview" | "purchases" | "ledger" | "coins" | "byapp";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const BG_DARK   = "#0B0E11";  // Binance dark
const BG_CARD   = "#161A1E";
const BG_CARD2  = "#1E2329";
const GREEN     = "#0ECB81";
const RED       = "#F6465D";
const YELLOW    = "#F0B90B";
const TEXT_PRI  = "#EAECEF";
const TEXT_SEC  = "#848E9C";
const BORDER    = "#2B3139";

const ENTRY_META: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  received:     { label: "Received USD",      color: GREEN,   icon: "arrow-down-circle" },
  purchase:     { label: "USD Purchased",      color: GREEN,   icon: "arrow-down-circle" },
  partial:      { label: "Partial Payment",    color: GREEN,   icon: "arrow-down-circle" },
  recovery:     { label: "Credit Recovery",    color: GREEN,   icon: "refresh-cw" },
  transfer_in:  { label: "Transfer In",        color: GREEN,   icon: "corner-down-right" },
  product:      { label: "Sold as Product",    color: RED,     icon: "arrow-up-circle" },
  topup:        { label: "Stock Topup",        color: RED,     icon: "package" },
  transfer_out: { label: "Transfer Out",       color: RED,     icon: "corner-up-right" },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const USD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PKR = (n: number) => `₨${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const WALLET_TYPE_ICON: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  crypto: "cpu", online: "globe", bank: "credit-card", cash: "dollar-sign",
};

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function DollarStatementScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { token } = useAuth();

  const [data,      setData]      = useState<ReportData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,       setTab]       = useState<Tab>("overview");
  const [from,      setFrom]      = useState(daysAgoStr(30));
  const [to,        setTo]        = useState(todayStr);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selWallet, setSelWallet] = useState<number | null>(null); // null = all

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (selWallet) params.set("walletId", String(selWallet));
      const r = await fetch(getApiUrl(`/api/dollar-statement?${params}`), { headers });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [from, to, selWallet, token]);

  useEffect(() => { load(); }, [from, to, selWallet]);

  /* ── Export ── */
  const handleExport = async () => {
    if (!data) return;
    const { summary, purchases, period } = data;
    const lines = [
      `USDT / Dollar Statement`,
      `Period: ${period.from} → ${period.to}`,
      "",
      `Total Purchased:  ${USD(summary.totalPurchasedUsd)}  (${PKR(summary.totalPurchasedPkr)})`,
      `Coins Given:      ${PKR(summary.totalCoinsPkr)}  (${summary.totalCoinsQty.toFixed(2)} units)`,
      `Cash Paid:        ${PKR(summary.totalCashPkr)}`,
      `Credit:           ${PKR(summary.totalCreditPkr)}`,
      `Wallet Balance:   ${USD(summary.walletBalanceUsd)}`,
      "",
      "Date,Customer,USD,Rate,PKR Total,Coins PKR,Cash PKR,Credit PKR,App",
      ...purchases.map(p =>
        `"${p.date}","${p.customerName}",${USD(p.dollarAmount)},${p.dollarRate},` +
        `${PKR(p.totalPkr)},${PKR(p.coinsPkr)},${PKR(p.cashPkr)},${PKR(p.creditPkr)},"${p.locationName ?? ""}"`
      ),
    ].join("\n");
    await Share.share({ message: lines, title: "USDT Dollar Statement" });
  };

  /* ─── Render ──────────────────────────────────────────────────────────── */
  const topPad = (Platform.OS === "web" ? 20 : insets.top) + 10;

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator size="large" color={YELLOW} />
        <Text style={[s.txt12, { color: TEXT_SEC, marginTop: 12 }]}>Loading statement…</Text>
      </View>
    );
  }

  const summ = data?.summary;

  return (
    <View style={s.root}>
      {/* ── Top header (Binance dark) ── */}
      <View style={[s.header, { paddingTop: topPad }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={TEXT_PRI} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.headerTitle}>Dollar Statement</Text>
            <Text style={s.headerSub}>{from} → {to}</Text>
          </View>
          <TouchableOpacity onPress={() => setFilterOpen(true)} style={s.filterBtn}>
            <Feather name="sliders" size={15} color={YELLOW} />
            <Text style={[s.txt11, { color: YELLOW }]}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExport} style={[s.filterBtn, { marginLeft: 8 }]}>
            <Feather name="share-2" size={15} color={TEXT_SEC} />
            <Text style={[s.txt11, { color: TEXT_SEC }]}>Export</Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary ticker ── */}
        {summ && (
          <View style={s.tickerRow}>
            <TickerCell label="USDT Purchased" value={USD(summ.totalPurchasedUsd)} color={GREEN} />
            <TickerDivider />
            <TickerCell label="PKR Value" value={PKR(summ.totalPurchasedPkr)} color={TEXT_PRI} />
            <TickerDivider />
            <TickerCell label="Wallet Balance" value={USD(summ.walletBalanceUsd)} color={YELLOW} />
            <TickerDivider />
            <TickerCell label="Transactions" value={String(summ.purchaseCount)} color={TEXT_SEC} />
          </View>
        )}
      </View>

      {/* ── Wallet filter tabs ── */}
      {data && data.wallets.length > 0 && (
        <View style={[s.walletBar, { borderBottomColor: BORDER }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}>
            {/* All wallets */}
            <TouchableOpacity
              onPress={() => setSelWallet(null)}
              style={[s.walletTab, selWallet === null && s.walletTabActive]}
            >
              <Feather name="layers" size={12} color={selWallet === null ? BG_DARK : TEXT_SEC} />
              <Text style={[s.walletTabText, selWallet === null && { color: BG_DARK }]}>All</Text>
            </TouchableOpacity>
            {data.wallets.map(w => {
              const active = selWallet === w.id;
              const icon = WALLET_TYPE_ICON[w.type ?? "cash"] ?? "dollar-sign";
              return (
                <TouchableOpacity key={w.id} onPress={() => setSelWallet(active ? null : w.id)}
                  style={[s.walletTab, active && s.walletTabActive]}>
                  <Feather name={icon} size={12} color={active ? BG_DARK : TEXT_SEC} />
                  <View>
                    <Text style={[s.walletTabText, active && { color: BG_DARK }]}>{w.name}</Text>
                    <Text style={[s.txt10, { color: active ? BG_DARK : GREEN }]}>{USD(w.balance)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Tab bar ── */}
      <View style={[s.tabBar, { borderBottomColor: BORDER }]}>
        {([
          ["overview",  "Overview"],
          ["purchases", "Purchases"],
          ["ledger",    "Ledger"],
          ["coins",     "Coins Out"],
          ["byapp",     "By App"],
        ] as [Tab, string][]).map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.tabItem, tab === k && s.tabItemActive]} onPress={() => setTab(k)}>
            <Text style={[s.tabLabel, tab === k && s.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ── */}
      <FlatList
        data={[1]} // single-item trick so we can use FlatList's refreshControl
        keyExtractor={() => "root"}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={YELLOW} />}
        contentContainerStyle={{ paddingBottom: 60 }}
        renderItem={() => (
          <View>
            {tab === "overview" && data && <OverviewTab data={data} />}
            {tab === "purchases" && data && <PurchasesTab purchases={data.purchases} />}
            {tab === "ledger"    && data && <LedgerTab entries={data.ledger} />}
            {tab === "coins"     && data && <CoinsTab purchases={data.purchases} breakdown={data.coinsBreakdown} summary={data.summary} />}
            {tab === "byapp"     && data && <ByAppTab rows={data.locationBreakdown} />}
          </View>
        )}
      />

      {/* ── Filter modal ── */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setFilterOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Filter Period</Text>

          <Text style={s.sheetLabel}>From</Text>
          <TextInput style={s.sheetInput} value={from} onChangeText={setFrom}
            placeholder="YYYY-MM-DD" placeholderTextColor={TEXT_SEC} />
          <Text style={s.sheetLabel}>To</Text>
          <TextInput style={s.sheetInput} value={to} onChangeText={setTo}
            placeholder="YYYY-MM-DD" placeholderTextColor={TEXT_SEC} />

          <Text style={[s.sheetLabel, { marginTop: 12 }]}>Quick Ranges</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {[["7d", 7], ["30d", 30], ["90d", 90], ["6m", 180], ["1y", 365]].map(([l, d]) => (
              <TouchableOpacity key={String(l)} style={s.qRange}
                onPress={() => { setFrom(daysAgoStr(Number(d))); setTo(todayStr()); }}>
                <Text style={s.qRangeText}>{l}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.qRange} onPress={() => {
              const now = new Date();
              setFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
              setTo(todayStr());
            }}>
              <Text style={s.qRangeText}>This month</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.applyBtn} onPress={() => setFilterOpen(false)}>
            <Text style={s.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Overview Tab ──────────────────────────────────────────────────────── */
function OverviewTab({ data }: { data: ReportData }) {
  const { summary, wallets, locationBreakdown } = data;
  return (
    <View style={{ padding: 14, gap: 14 }}>
      {/* Settlement breakdown */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Settlement Breakdown</Text>
        <BarRow label="Coins" value={summary.totalCoinsPkr} total={summary.totalPurchasedPkr} color="#F59E0B" />
        <BarRow label="Cash"  value={summary.totalCashPkr}  total={summary.totalPurchasedPkr} color={GREEN}  />
        <BarRow label="Credit" value={summary.totalCreditPkr} total={summary.totalPurchasedPkr} color={RED} />
        <View style={[s.divider, { marginVertical: 10 }]} />
        <KVRow label="Total PKR Paid" value={PKR(summary.totalPurchasedPkr)} bold />
        <KVRow label="Avg. per Transaction"
          value={summary.purchaseCount > 0 ? USD(summary.totalPurchasedUsd / summary.purchaseCount) : "—"} />
      </View>

      {/* Wallet balances */}
      {wallets.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Wallet Balances</Text>
          {wallets.map(w => (
            <View key={w.id} style={[s.walletRow, { marginBottom: 10 }]}>
              <View style={s.walletIcon}>
                <Feather name={WALLET_TYPE_ICON[w.type] ?? "dollar-sign"} size={14} color={YELLOW} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.walletName}>{w.name}</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                  <Text style={[s.txt11, { color: GREEN }]}>↓ {USD(w.totalIn)}</Text>
                  <Text style={[s.txt11, { color: RED }]}>↑ {USD(w.totalOut)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: YELLOW, fontFamily: "Inter_700Bold" }}>
                {USD(w.balance)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Top apps */}
      {locationBreakdown.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Top Apps (By USD)</Text>
          {locationBreakdown.slice(0, 5).map((l, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={[s.txt13, { color: TEXT_PRI }]}>{l.locationName}</Text>
                <Text style={[s.txt13, { color: GREEN, fontWeight: "700", fontFamily: "Inter_700Bold" }]}>
                  {USD(l.totalUsd)}
                </Text>
              </View>
              <View style={s.progressBg}>
                <View style={[s.progressFill, {
                  width: `${Math.min(100, (l.totalUsd / (locationBreakdown[0]?.totalUsd ?? 1)) * 100)}%`,
                  backgroundColor: GREEN,
                }]} />
              </View>
              <Text style={[s.txt10, { color: TEXT_SEC, marginTop: 2 }]}>
                {l.count} tx · {PKR(l.totalPkr)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─── Purchases Tab ─────────────────────────────────────────────────────── */
function PurchasesTab({ purchases }: { purchases: Purchase[] }) {
  if (purchases.length === 0) return <EmptyState icon="inbox" label="No purchases in this period" />;
  return (
    <View>
      {/* Column header */}
      <View style={[s.colHdrRow, { borderBottomColor: BORDER }]}>
        <Text style={[s.colHdrText, { flex: 2 }]}>CUSTOMER / DATE</Text>
        <Text style={[s.colHdrText, { flex: 1, textAlign: "right" }]}>USDT</Text>
        <Text style={[s.colHdrText, { flex: 1, textAlign: "right" }]}>PKR</Text>
        <Text style={[s.colHdrText, { flex: 1, textAlign: "right" }]}>SETTLE</Text>
      </View>
      {purchases.map(p => (
        <View key={p.id} style={[s.purchRow, { borderBottomColor: BORDER }]}>
          {/* Left green stripe */}
          <View style={{ width: 3, backgroundColor: GREEN, borderRadius: 2, marginRight: 10, alignSelf: "stretch" }} />

          <View style={{ flex: 2 }}>
            <Text style={s.purchName} numberOfLines={1}>{p.customerName}</Text>
            <Text style={s.purchDate}>{fmtDate(p.date)}</Text>
            {p.locationName && <Text style={s.purchApp}>{p.locationName}</Text>}
            {p.notes ? <Text style={s.purchNote} numberOfLines={1}>{p.notes}</Text> : null}
          </View>

          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: GREEN, fontFamily: "Inter_700Bold" }}>
              {USD(p.dollarAmount)}
            </Text>
            <Text style={[s.txt10, { color: TEXT_SEC }]}>@ {p.dollarRate}</Text>
          </View>

          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[s.txt12, { color: TEXT_PRI }]}>{PKR(p.totalPkr)}</Text>
          </View>

          {/* Settlement chips */}
          <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
            {p.coinsPkr > 0 && <Chip label={`🪙 ${PKR(p.coinsPkr)}`} color="#F59E0B" />}
            {p.cashPkr  > 0 && <Chip label={`💵 ${PKR(p.cashPkr)}`}  color={GREEN}   />}
            {p.creditPkr > 0 && <Chip label={`📋 ${PKR(p.creditPkr)}`} color={RED}   />}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ─── Ledger Tab ────────────────────────────────────────────────────────── */
function LedgerTab({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <EmptyState icon="file-text" label="No ledger entries" />;
  return (
    <View>
      <View style={[s.colHdrRow, { borderBottomColor: BORDER }]}>
        <Text style={[s.colHdrText, { flex: 2.5 }]}>TYPE / PARTY</Text>
        <Text style={[s.colHdrText, { flex: 1, textAlign: "right" }]}>USDT</Text>
        <Text style={[s.colHdrText, { flex: 1, textAlign: "right" }]}>PKR</Text>
      </View>
      {entries.map(e => {
        const meta = ENTRY_META[e.entryType] ?? { label: e.entryType, color: TEXT_SEC, icon: "activity" as const };
        const isIn = e.direction === "in";
        return (
          <View key={e.id} style={[s.ledgerRow, { borderBottomColor: BORDER }]}>
            <View style={[s.ledgerIcon, { backgroundColor: isIn ? "rgba(14,203,129,0.12)" : "rgba(246,70,93,0.12)" }]}>
              <Feather name={meta.icon} size={14} color={meta.color} />
            </View>
            <View style={{ flex: 2.5 }}>
              <Text style={[s.txt13, { color: meta.color, fontFamily: "Inter_600SemiBold" }]}>{meta.label}</Text>
              {e.partyName && <Text style={s.purchDate}>{e.partyName}</Text>}
              {e.walletName && <Text style={[s.txt10, { color: TEXT_SEC }]}>{e.walletName}</Text>}
              <Text style={s.purchDate}>{fmtDateTime(e.createdAt)}</Text>
              {e.notes ? <Text style={s.purchNote} numberOfLines={1}>{e.notes}</Text> : null}
            </View>
            <Text style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: "700", color: isIn ? GREEN : RED, fontFamily: "Inter_700Bold" }}>
              {isIn ? "+" : "−"}{USD(e.amountUsd)}
            </Text>
            <Text style={{ flex: 1, textAlign: "right", fontSize: 12, color: TEXT_SEC, fontFamily: "Inter_400Regular" }}>
              {PKR(e.totalPkr)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─── Coins Tab ─────────────────────────────────────────────────────────── */
function CoinsTab({ purchases, breakdown, summary }: { purchases: Purchase[]; breakdown: CoinRow[]; summary: Summary }) {
  const coinPurchases = purchases.filter(p => p.coinsPkr > 0);
  return (
    <View style={{ padding: 14, gap: 12 }}>
      {/* Summary card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Coins Given as Payment</Text>
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[s.bigNum, { color: "#F59E0B" }]}>{summary.totalCoinsQty.toFixed(2)}</Text>
            <Text style={s.bigLabel}>Total Units</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[s.bigNum, { color: TEXT_PRI }]}>{PKR(summary.totalCoinsPkr)}</Text>
            <Text style={s.bigLabel}>PKR Value</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[s.bigNum, { color: TEXT_SEC }]}>{coinPurchases.length}</Text>
            <Text style={s.bigLabel}>Transactions</Text>
          </View>
        </View>
      </View>

      {/* Product breakdown */}
      {breakdown.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>By Product</Text>
          {breakdown.map((b, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[s.txt13, { color: TEXT_PRI }]}>{b.productName}</Text>
                <Text style={[s.txt13, { color: "#F59E0B", fontWeight: "700", fontFamily: "Inter_700Bold" }]}>
                  {b.qty.toFixed(2)} units
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={[s.txt10, { color: TEXT_SEC }]}>{b.count} transactions</Text>
                <Text style={[s.txt10, { color: TEXT_SEC }]}>{PKR(b.pkrValue)}</Text>
              </View>
              <View style={[s.progressBg, { marginTop: 4 }]}>
                <View style={[s.progressFill, {
                  width: `${Math.min(100, (b.pkrValue / (breakdown[0]?.pkrValue ?? 1)) * 100)}%`,
                  backgroundColor: "#F59E0B",
                }]} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Coin transactions list */}
      {coinPurchases.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Coin Transactions</Text>
          {coinPurchases.map(p => (
            <View key={p.id} style={[s.walletRow, { marginBottom: 8 }]}>
              <View style={[s.walletIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                <Feather name="package" size={14} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.txt13, { color: TEXT_PRI }]}>{p.customerName}</Text>
                <Text style={s.purchDate}>
                  {p.coinsProductName ?? "Coins"} · {p.coinsQty.toFixed(2)} units · {fmtDate(p.date)}
                </Text>
                {p.locationName && <Text style={[s.txt10, { color: TEXT_SEC }]}>{p.locationName}</Text>}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.txt13, { color: "#F59E0B", fontWeight: "700", fontFamily: "Inter_700Bold" }]}>
                  {PKR(p.coinsPkr)}
                </Text>
                <Text style={[s.txt10, { color: TEXT_SEC }]}>for {USD(p.dollarAmount)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─── By App Tab ────────────────────────────────────────────────────────── */
function ByAppTab({ rows }: { rows: LocationRow[] }) {
  if (rows.length === 0) return <EmptyState icon="map-pin" label="No location data" />;
  const maxUsd = rows[0]?.totalUsd ?? 1;
  return (
    <View style={{ padding: 14, gap: 10 }}>
      {rows.map((r, i) => (
        <View key={i} style={s.card}>
          {/* App header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[s.appBadge, { backgroundColor: `hsl(${(i * 47) % 360},60%,30%)` }]}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800", fontFamily: "Inter_700Bold" }}>
                  {(r.locationName[0] ?? "?").toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[s.txt14, { color: TEXT_PRI }]}>{r.locationName}</Text>
                <Text style={[s.txt10, { color: TEXT_SEC }]}>{r.count} transactions</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[s.txt14, { color: GREEN, fontWeight: "800", fontFamily: "Inter_700Bold" }]}>
                {USD(r.totalUsd)}
              </Text>
              <Text style={[s.txt10, { color: TEXT_SEC }]}>{PKR(r.totalPkr)}</Text>
            </View>
          </View>

          {/* Bar */}
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${Math.min(100, (r.totalUsd / maxUsd) * 100)}%`, backgroundColor: GREEN }]} />
          </View>

          {/* Settlement split */}
          <View style={{ flexDirection: "row", gap: 0, marginTop: 10 }}>
            <AppStatCell label="Coins" value={PKR(r.coinsPkr)} color="#F59E0B" />
            <AppStatCell label="Cash"  value={PKR(r.cashPkr)}  color={GREEN} />
            <AppStatCell label="Credit" value={PKR(r.creditPkr)} color={RED} />
          </View>
        </View>
      ))}
    </View>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function TickerCell({ label, value, color = TEXT_PRI }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 9, color: TEXT_SEC, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "800", color, fontFamily: "Inter_700Bold" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
function TickerDivider() {
  return <View style={{ width: 1, backgroundColor: BORDER, alignSelf: "stretch", marginVertical: 2 }} />;
}

function KVRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
      <Text style={[s.txt12, { color: TEXT_SEC }]}>{label}</Text>
      <Text style={[s.txt12, { color: bold ? TEXT_PRI : TEXT_SEC, fontFamily: bold ? "Inter_700Bold" : "Inter_400Regular" }]}>{value}</Text>
    </View>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={[s.txt12, { color: TEXT_SEC }]}>{label}</Text>
        <Text style={[s.txt12, { color: TEXT_PRI }]}>{PKR(value)} <Text style={[s.txt10, { color: TEXT_SEC }]}>({pct.toFixed(0)}%)</Text></Text>
      </View>
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.chip, { borderColor: color + "44" }]}>
      <Text style={[s.txt10, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function AppStatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[s.txt10, { color: TEXT_SEC }]}>{label}</Text>
      <Text style={[s.txt11, { color, fontFamily: "Inter_700Bold" }]}>{value}</Text>
    </View>
  );
}

function EmptyState({ icon, label }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string }) {
  return (
    <View style={[s.center, { paddingTop: 80 }]}>
      <Feather name={icon} size={44} color={TEXT_SEC} />
      <Text style={[s.txt13, { color: TEXT_SEC, marginTop: 14 }]}>{label}</Text>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG_DARK },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header:     { backgroundColor: BG_DARK, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerRow:  { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  headerSub:  { fontSize: 11, color: TEXT_SEC, fontFamily: "Inter_400Regular", marginTop: 1 },
  filterBtn:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: BG_CARD2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tickerRow:  { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 0 },

  walletBar:  { backgroundColor: BG_CARD, borderBottomWidth: 1 },
  walletTab:  { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: BG_CARD2 },
  walletTabActive: { backgroundColor: YELLOW, borderColor: YELLOW },
  walletTabText: { fontSize: 12, color: TEXT_PRI, fontFamily: "Inter_600SemiBold" },
  walletName: { fontSize: 12, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },

  tabBar:     { flexDirection: "row", backgroundColor: BG_CARD, borderBottomWidth: 1 },
  tabItem:    { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: YELLOW },
  tabLabel:   { fontSize: 11, color: TEXT_SEC, fontFamily: "Inter_500Medium" },
  tabLabelActive: { color: YELLOW, fontFamily: "Inter_700Bold" },

  card:  { backgroundColor: BG_CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  cardTitle: { fontSize: 13, fontWeight: "800", color: TEXT_PRI, fontFamily: "Inter_700Bold", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  colHdrRow:  { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, backgroundColor: BG_CARD2 },
  colHdrText: { fontSize: 9, color: TEXT_SEC, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },

  purchRow:  { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 4 },
  purchName: { fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  purchDate: { fontSize: 10, color: TEXT_SEC, fontFamily: "Inter_400Regular", marginTop: 2 },
  purchApp:  { fontSize: 10, color: YELLOW, fontFamily: "Inter_500Medium", marginTop: 1 },
  purchNote: { fontSize: 10, color: TEXT_SEC, fontFamily: "Inter_400Regular", marginTop: 1 },

  ledgerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  ledgerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  walletRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  walletIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(240,185,11,0.12)", alignItems: "center", justifyContent: "center" },

  appBadge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  progressBg:   { height: 4, backgroundColor: BORDER, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },

  chip: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },

  divider: { height: 1, backgroundColor: BORDER },

  bigNum:   { fontSize: 18, fontWeight: "800", fontFamily: "Inter_700Bold" },
  bigLabel: { fontSize: 10, color: TEXT_SEC, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* Filter modal */
  overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet:    { backgroundColor: BG_CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetHandle: { width: 36, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: TEXT_PRI, fontFamily: "Inter_700Bold", marginBottom: 12 },
  sheetLabel: { fontSize: 11, color: TEXT_SEC, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  sheetInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: BG_CARD2, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: TEXT_PRI, marginBottom: 10 },
  qRange:   { backgroundColor: BG_CARD2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  qRangeText: { fontSize: 12, color: YELLOW, fontFamily: "Inter_600SemiBold" },
  applyBtn: { marginTop: 16, backgroundColor: YELLOW, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  applyText: { color: BG_DARK, fontSize: 15, fontWeight: "800", fontFamily: "Inter_700Bold" },

  txt10: { fontSize: 10, fontFamily: "Inter_400Regular" },
  txt11: { fontSize: 11, fontFamily: "Inter_500Medium" },
  txt12: { fontSize: 12, fontFamily: "Inter_400Regular" },
  txt13: { fontSize: 13, fontFamily: "Inter_500Medium" },
  txt14: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

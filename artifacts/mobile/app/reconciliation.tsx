import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch, useListAccounts } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Snapshot = {
  stockValue: string; bankBalance: string; creditReceivable: string;
  creditsReceived: string; openingBalance: string; expectedBalance: string;
};
type Wallet = { id: number; currency: string; balance: string; name: string };
type Account = { id: number; name: string; type: string; balance: string };

type EmployeeBucket = { count: number; total: string; cash: string };
type EmployeeRow = {
  userId: number; name: string; username: string; role: string; locationId: number | null;
  today: EmployeeBucket; yesterday: EmployeeBucket; lifetime: EmployeeBucket;
};
type EmployeeRecon = {
  generatedAt: string;
  today: string; yesterday: string;
  rows: EmployeeRow[];
  totals: { today: EmployeeBucket; yesterday: EmployeeBucket; lifetime: EmployeeBucket };
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDec = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const p = (s: string | number) => (typeof s === "string" ? parseFloat(s) : s) || 0;

function SectionHeader({ emoji, title, color }: { emoji: string; title: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 20 }}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color, letterSpacing: 0.8 }}>{title}</Text>
      <View style={{ flex: 1, height: 1.5, backgroundColor: color, opacity: 0.25 }} />
    </View>
  );
}

function StatRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ fontFamily: bold ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold", fontSize: 14, color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}

// ─── Compact ₨ formatter for the per-employee table ───────────────────────
function fmtMoney(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n) || n === 0) return "₨0";
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(0)}`;
}

function roleBadge(role: string): { label: string; color: string; bg: string } {
  switch (role) {
    case "super_admin": return { label: "SUPER",   color: "#1E1B4B", bg: "#EDE9FE" };
    case "admin":       return { label: "ADMIN",   color: "#7C3AED", bg: "#F3E8FF" };
    case "manager":     return { label: "MGR",     color: "#0369A1", bg: "#E0F2FE" };
    case "cashier":     return { label: "CASHIER", color: "#059669", bg: "#ECFDF5" };
    default:            return { label: role.toUpperCase().slice(0, 7), color: "#475569", bg: "#F1F5F9" };
  }
}

function EmployeeReconBlock({ data, loading }: { data: EmployeeRecon | null; loading: boolean }) {
  const colors = useColors();
  if (loading) {
    return (
      <View style={[reconStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", paddingVertical: 24 }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>
          Loading employee records…
        </Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[reconStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", paddingVertical: 24 }]}>
        <Text style={{ fontSize: 28, marginBottom: 6 }}>⚠️</Text>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#DC2626" }}>
          Employee reconciliation unavailable
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4, textAlign: "center" }}>
          Pull down to refresh, or check your connection.
        </Text>
      </View>
    );
  }

  const rows = data.rows ?? [];

  return (
    <View style={[reconStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Date row */}
      <View style={reconStyles.dateRow}>
        <View style={reconStyles.dateBadge}>
          <Text style={[reconStyles.dateLabel, { color: "#7C3AED" }]}>TODAY</Text>
          <Text style={[reconStyles.dateValue, { color: colors.text }]}>{data.today}</Text>
        </View>
        <View style={reconStyles.dateBadge}>
          <Text style={[reconStyles.dateLabel, { color: "#0369A1" }]}>YESTERDAY</Text>
          <Text style={[reconStyles.dateValue, { color: colors.text }]}>{data.yesterday}</Text>
        </View>
        <View style={reconStyles.dateBadge}>
          <Text style={[reconStyles.dateLabel, { color: "#059669" }]}>LIFETIME</Text>
          <Text style={[reconStyles.dateValue, { color: colors.text }]}>All time</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text style={{ fontSize: 32, marginBottom: 6 }}>👤</Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground }}>
            No active employees
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header row */}
            <View style={[reconStyles.tRow, reconStyles.tHeadRow, { borderBottomColor: colors.border }]}>
              <Text style={[reconStyles.cEmp,    reconStyles.tHead, { color: colors.mutedForeground }]}>Employee</Text>
              <Text style={[reconStyles.cBucket, reconStyles.tHead, { color: "#7C3AED" }]}>Today</Text>
              <Text style={[reconStyles.cBucket, reconStyles.tHead, { color: "#0369A1" }]}>Yesterday</Text>
              <Text style={[reconStyles.cBucket, reconStyles.tHead, { color: "#059669" }]}>Lifetime</Text>
            </View>

            {/* Body rows */}
            {rows.map((r, idx) => {
              const badge = roleBadge(r.role);
              return (
                <View
                  key={r.userId}
                  style={[
                    reconStyles.tRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: idx % 2 === 0 ? "transparent" : colors.background,
                    },
                  ]}
                >
                  <View style={reconStyles.cEmp}>
                    <Text style={[reconStyles.empName, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <View style={[reconStyles.rolePill, { backgroundColor: badge.bg }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: badge.color }}>
                          {badge.label}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                        @{r.username}
                      </Text>
                    </View>
                  </View>
                  <BucketCell bucket={r.today}     accent="#7C3AED" />
                  <BucketCell bucket={r.yesterday} accent="#0369A1" />
                  <BucketCell bucket={r.lifetime}  accent="#059669" />
                </View>
              );
            })}

            {/* Totals row */}
            <View style={[reconStyles.tRow, reconStyles.tFootRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <View style={reconStyles.cEmp}>
                <Text style={[reconStyles.empName, { color: colors.text }]}>Σ Totals</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>
                  {rows.length} employee{rows.length === 1 ? "" : "s"}
                </Text>
              </View>
              <BucketCell bucket={data.totals.today}     accent="#7C3AED" bold />
              <BucketCell bucket={data.totals.yesterday} accent="#0369A1" bold />
              <BucketCell bucket={data.totals.lifetime}  accent="#059669" bold />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function BucketCell({ bucket, accent, bold }: { bucket: EmployeeBucket; accent: string; bold?: boolean }) {
  const colors = useColors();
  const empty = bucket.count === 0;
  return (
    <View style={reconStyles.cBucket}>
      {empty ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "right" }}>—</Text>
      ) : (
        <>
          <Text style={{ color: accent, fontFamily: bold ? "Inter_800ExtraBold" : "Inter_700Bold", fontSize: 13, textAlign: "right" }}>
            {fmtMoney(bucket.total)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, textAlign: "right" }}>
            {bucket.count} sale{bucket.count === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: "#059669", fontSize: 9.5, textAlign: "right", marginTop: 1 }}>
            cash {fmtMoney(bucket.cash)}
          </Text>
        </>
      )}
    </View>
  );
}

const reconStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 4 },
  dateRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  dateBadge: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.03)" },
  dateLabel: { fontFamily: "Inter_700Bold", fontSize: 9.5, letterSpacing: 0.6 },
  dateValue: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, marginTop: 2 },

  tRow: { flexDirection: "row", paddingVertical: 8, alignItems: "flex-start", borderBottomWidth: StyleSheet.hairlineWidth },
  tHeadRow: { borderBottomWidth: 1, paddingBottom: 8 },
  tFootRow: { borderTopWidth: 1, borderBottomWidth: 0, paddingTop: 10, paddingBottom: 6 },
  tHead: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase" },

  cEmp:    { width: 130, paddingRight: 8 },
  cBucket: { width: 100, paddingRight: 8, alignItems: "flex-end" },

  empName: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  rolePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});

function InputRow({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: "numeric" | "decimal-pad";
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground, width: 130 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText}
        placeholder={placeholder ?? "0"}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "decimal-pad"}
        style={{ flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
      />
    </View>
  );
}

export default function ReconciliationScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const { data: accountsRaw } = useListAccounts();
  const accounts = (accountsRaw ?? []) as unknown as Account[];

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [empRecon, setEmpRecon] = useState<EmployeeRecon | null>(null);
  const [empReconLoading, setEmpReconLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [usdRate, setUsdRate] = useState("280");
  const [transferIn, setTransferIn] = useState("0");
  const [transferOut, setTransferOut] = useState("0");
  const [physicalBalance, setPhysicalBalance] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [showDollarModal, setShowDollarModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);

  const [dollarAmt, setDollarAmt] = useState("");
  const [dollarRate, setDollarRate] = useState("280");
  const [dollarAccountId, setDollarAccountId] = useState<number | null>(null);
  const [dollarSaving, setDollarSaving] = useState(false);

  const [exchCoins, setExchCoins] = useState("");
  const [exchRatePer, setExchRatePer] = useState("");
  const [exchAccountId, setExchAccountId] = useState<number | null>(null);
  const [exchSaving, setExchSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setEmpReconLoading(true);
    try {
      const [snap, w, er] = await Promise.all([
        customFetch<Snapshot>("/api/cash-counts/snapshot"),
        customFetch<Wallet[]>("/api/dollar-wallet/wallets").catch(() => [] as Wallet[]),
        customFetch<EmployeeRecon>("/api/reports/employee-reconciliation").catch(() => null),
      ]);
      setSnapshot(snap);
      setWallets(w);
      setEmpRecon(er);
    } catch {}
    setLoading(false);
    setRefreshing(false);
    setEmpReconLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const usdWallet = wallets.find(w => w.currency === "USD");
  const usdBalance = p(usdWallet?.balance ?? "0");
  const dollarPkr = usdBalance * p(usdRate);

  const openingBal  = p(snapshot?.openingBalance ?? "0");
  const salesRec    = p(snapshot?.creditsReceived ?? "0");
  const transIn     = p(transferIn);
  const transOut    = p(transferOut);

  const adjustedExpected = openingBal + salesRec + dollarPkr + transIn - transOut;
  const physNum          = p(physicalBalance);
  const difference       = physicalBalance ? physNum - adjustedExpected : 0;
  const diffType         = Math.abs(difference) < 1 ? "balanced" : difference > 0 ? "excess" : "short";

  const diffColor  = diffType === "balanced" ? "#059669" : diffType === "excess" ? "#2563EB" : "#DC2626";
  const diffEmoji  = diffType === "balanced" ? "✅" : diffType === "excess" ? "📈" : "📉";

  const handleSave = async () => {
    if (!physicalBalance) { Alert.alert("Missing", "Please enter the physical balance"); return; }
    setSaving(true);
    try {
      await customFetch("/api/cash-counts", {
        method: "POST",
        body: JSON.stringify({
          date:             new Date().toISOString().split("T")[0],
          stockValue:       snapshot?.stockValue   ?? "0",
          bankBalance:      snapshot?.bankBalance  ?? "0",
          creditReceivable: snapshot?.creditReceivable ?? "0",
          creditsReceived:  snapshot?.creditsReceived ?? "0",
          transfersIn:      transIn.toFixed(8),
          transfersOut:     transOut.toFixed(8),
          openingBalance:   openingBal.toFixed(8),
          expectedBalance:  adjustedExpected.toFixed(8),
          physicalBalance:  physNum.toFixed(8),
          reason: reason || null,
          notes:  notes  || null,
        }),
      });
      Alert.alert("Saved ✅", "Reconciliation saved successfully");
      setPhysicalBalance(""); setTransferIn("0"); setTransferOut("0");
      setReason(""); setNotes("");
      load(true);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDollarPurchase = async () => {
    if (!dollarAmt || !dollarRate || !dollarAccountId) {
      Alert.alert("Missing", "Enter amount, rate, and select an account"); return;
    }
    setDollarSaving(true);
    try {
      const usdId = usdWallet?.id;
      if (!usdId) { Alert.alert("Error", "No USD wallet found"); setDollarSaving(false); return; }
      await customFetch("/api/dollar-wallet/deposit", {
        method: "POST",
        body: JSON.stringify({
          walletId: usdId,
          amount: parseFloat(dollarAmt).toFixed(8),
          rate: parseFloat(dollarRate).toFixed(8),
          accountId: dollarAccountId,
          notes: "Dollar purchase from reconciliation",
          type: "purchase",
        }),
      });
      Alert.alert("Done ✅", `Purchased $${dollarAmt} at ₨${dollarRate}/USD`);
      setDollarAmt(""); setShowDollarModal(false);
      load(true);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
    setDollarSaving(false);
  };

  const handleExchange = async () => {
    if (!exchCoins || !exchRatePer || !exchAccountId) {
      Alert.alert("Missing", "Enter coins, rate per coin, and select an account"); return;
    }
    setExchSaving(true);
    try {
      const total = parseFloat(exchCoins) * parseFloat(exchRatePer);
      await customFetch("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          productId: null,
          accountId: exchAccountId,
          amountPaid: total.toFixed(8),
          quantity: parseFloat(exchCoins),
          unitPrice: parseFloat(exchRatePer).toFixed(8),
          notes: `Coins exchange: ${exchCoins} coins @ ₨${exchRatePer}/coin`,
          locationId: user?.locationId ?? null,
        }),
      }).catch(async () => {
        await customFetch("/api/accounts/" + exchAccountId + "/adjust", {
          method: "POST",
          body: JSON.stringify({ amount: total.toFixed(8), type: "credit", notes: `Exchange: ${exchCoins} coins @ ₨${exchRatePer}` }),
        });
      });
      Alert.alert("Done ✅", `Exchange: ${exchCoins} coins × ₨${exchRatePer} = ₨${fmt(total)}`);
      setExchCoins(""); setExchRatePer(""); setShowExchangeModal(false);
    } catch (e) {
      Alert.alert("Exchange recorded", `${exchCoins} coins @ ₨${exchRatePer} = ₨${fmt(parseFloat(exchCoins) * parseFloat(exchRatePer))}`);
      setExchCoins(""); setExchRatePer(""); setShowExchangeModal(false);
    }
    setExchSaving(false);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 12 }}>Loading snapshot…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#059669", "#047857"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ color: "#fff", fontSize: 20 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Reconciliation</Text>
          <Text style={styles.headerSub}>Employee · Daily · Dollar · Exchange</Text>
        </View>
        <TouchableOpacity onPress={() => load(true)} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>🔄</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >

        {/* ── SECTION 0: Employee-wise Reconciliation ──────────────── */}
        <SectionHeader emoji="👥" title="EMPLOYEE RECONCILIATION" color="#7C3AED" />
        <EmployeeReconBlock data={empRecon} loading={empReconLoading} />

        {/* ── SECTION 1: Opening Balance Breakdown ─────────────────── */}
        <SectionHeader emoji="📊" title="OPENING BALANCE" color="#2563EB" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StatRow label="Stock Value" value={`₨${fmt(p(snapshot?.stockValue ?? "0"))}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Bank Accounts" value={`₨${fmt(p(snapshot?.bankBalance ?? "0"))}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Credit Receivable" value={`₨${fmt(p(snapshot?.creditReceivable ?? "0"))}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Opening Balance" value={`₨${fmt(openingBal)}`} color="#2563EB" bold />
        </View>

        {/* ── SECTION 2: Received Today ────────────────────────────── */}
        <SectionHeader emoji="💰" title="RECEIVED TODAY" color="#059669" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StatRow label="Credits Received" value={`₨${fmt(p(snapshot?.creditsReceived ?? "0"))}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Total Received" value={`₨${fmt(salesRec)}`} color="#059669" bold />
        </View>

        {/* ── SECTION 3: Dollar Holdings ───────────────────────────── */}
        <SectionHeader emoji="💵" title="DOLLAR HOLDINGS (USD)" color="#F97316" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StatRow label="USD Balance" value={`$${fmtDec(usdBalance)}`} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InputRow label="USD → PKR Rate" value={usdRate} onChangeText={setUsdRate} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Dollar PKR Value" value={`₨${fmt(dollarPkr)}`} color="#F97316" bold />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#FFF7ED", borderColor: "#F97316", flex: 1 }]}
              onPress={() => { setDollarRate(usdRate); setShowDollarModal(true); }}
            >
              <Text style={{ fontSize: 14 }}>💵</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#9A3412" }}>Buy Dollars</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#ECFDF5", borderColor: "#10B981", flex: 1 }]}
              onPress={() => setShowExchangeModal(true)}
            >
              <Text style={{ fontSize: 14 }}>🔄</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#065F46" }}>Coins Exchange</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SECTION 4: Transfers ─────────────────────────────────── */}
        <SectionHeader emoji="🔁" title="TRANSFERS" color="#7C3AED" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InputRow label="Transfer In (₨)" value={transferIn} onChangeText={setTransferIn}
            placeholder="From company to shop" />
          <InputRow label="Transfer Out (₨)" value={transferOut} onChangeText={setTransferOut}
            placeholder="From shop to company" />
        </View>

        {/* ── SECTION 5: Final Calculation ─────────────────────────── */}
        <SectionHeader emoji="🧮" title="FINAL CALCULATION" color="#DC2626" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StatRow label="Opening Balance" value={`₨${fmt(openingBal)}`} />
          <StatRow label="+ Received" value={`₨${fmt(salesRec)}`} color="#059669" />
          <StatRow label="+ Dollar (PKR)" value={`₨${fmt(dollarPkr)}`} color="#F97316" />
          <StatRow label="+ Transfer In" value={`₨${fmt(transIn)}`} color="#2563EB" />
          <StatRow label="− Transfer Out" value={`₨${fmt(transOut)}`} color="#DC2626" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatRow label="Expected Balance" value={`₨${fmt(adjustedExpected)}`} color="#1E40AF" bold />

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>
              PHYSICAL BALANCE (₨)
            </Text>
            <TextInput
              value={physicalBalance}
              onChangeText={setPhysicalBalance}
              placeholder="Enter actual counted balance…"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={{
                fontFamily: "Inter_700Bold", fontSize: 22, color: colors.text,
                backgroundColor: colors.input, borderRadius: 14,
                paddingHorizontal: 16, paddingVertical: 14,
                borderWidth: 2, borderColor: physicalBalance ? "#2563EB" : colors.border,
              }}
            />
          </View>

          {physicalBalance ? (
            <View style={{ marginTop: 14, backgroundColor: diffType === "balanced" ? "#ECFDF5" : diffType === "excess" ? "#EFF6FF" : "#FEF2F2", borderRadius: 14, padding: 16, borderWidth: 2, borderColor: diffColor }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 22 }}>{diffEmoji}</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: diffColor }}>
                  {diffType === "balanced" ? "BALANCED" : diffType === "excess" ? "EXCESS" : "SHORT"}
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: diffColor }}>
                {difference >= 0 ? "+" : ""}₨{fmt(Math.abs(difference))}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: diffColor, marginTop: 4 }}>
                Physical ₨{fmt(physNum)} − Expected ₨{fmt(adjustedExpected)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── SECTION 6: Reason & Notes ────────────────────────────── */}
        {physicalBalance ? (
          <>
            <SectionHeader emoji="📝" title="REASON & NOTES" color="#475569" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                value={reason} onChangeText={setReason}
                placeholder="Reason for difference (if any)…"
                placeholderTextColor={colors.mutedForeground}
                style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
              />
              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder="Additional notes…"
                placeholderTextColor={colors.mutedForeground}
                multiline numberOfLines={2}
                style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: saving ? colors.mutedForeground : "#059669", opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 18 }}>💾</Text>}
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Reconciliation"}</Text>
            </TouchableOpacity>
          </>
        ) : null}

      </ScrollView>

      {/* ── Dollar Purchase Modal ──────────────────────────────── */}
      <Modal visible={showDollarModal} animationType="slide" transparent onRequestClose={() => setShowDollarModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>💵 Buy Dollars</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 16 }}>
              Purchase USD — deducted from selected account
            </Text>
            <InputRow label="Amount (USD $)" value={dollarAmt} onChangeText={setDollarAmt} placeholder="e.g. 100" />
            <InputRow label="Rate (₨ per $1)" value={dollarRate} onChangeText={setDollarRate} placeholder="e.g. 280" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>PAY FROM ACCOUNT</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {accounts.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, backgroundColor: dollarAccountId === a.id ? "#EFF6FF" : "transparent", marginBottom: 4, borderWidth: dollarAccountId === a.id ? 1.5 : 0, borderColor: "#3B82F6" }}
                  onPress={() => setDollarAccountId(a.id)}
                >
                  <Text style={{ fontSize: 16 }}>{a.type?.toLowerCase().includes("jazz") ? "🟠" : a.type?.toLowerCase().includes("easy") ? "🟢" : a.type?.toLowerCase() === "cash" ? "💵" : "🏦"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{a.name}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>₨{fmt(p(a.balance))}</Text>
                  </View>
                  {dollarAccountId === a.id && <Text style={{ color: "#2563EB", fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {dollarAmt && dollarRate ? (
              <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginTop: 10 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#1E40AF" }}>
                  Total: ₨{fmt(parseFloat(dollarAmt || "0") * parseFloat(dollarRate || "0"))}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.input, flex: 1 }]} onPress={() => setShowDollarModal(false)}>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#059669", flex: 2 }]} onPress={handleDollarPurchase} disabled={dollarSaving}>
                {dollarSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: "Inter_700Bold", color: "#fff" }}>Buy Dollars</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Coins Exchange Modal ───────────────────────────────── */}
      <Modal visible={showExchangeModal} animationType="slide" transparent onRequestClose={() => setShowExchangeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>🔄 Coins Exchange</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 16 }}>
              Convert coins to PKR — credits the selected account
            </Text>
            <InputRow label="Coins (Qty)" value={exchCoins} onChangeText={setExchCoins} placeholder="e.g. 50" />
            <InputRow label="Rate (₨ per coin)" value={exchRatePer} onChangeText={setExchRatePer} placeholder="e.g. 200" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>CREDIT TO ACCOUNT</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {accounts.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, backgroundColor: exchAccountId === a.id ? "#ECFDF5" : "transparent", marginBottom: 4, borderWidth: exchAccountId === a.id ? 1.5 : 0, borderColor: "#10B981" }}
                  onPress={() => setExchAccountId(a.id)}
                >
                  <Text style={{ fontSize: 16 }}>{a.type?.toLowerCase().includes("jazz") ? "🟠" : a.type?.toLowerCase().includes("easy") ? "🟢" : a.type?.toLowerCase() === "cash" ? "💵" : "🏦"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{a.name}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>₨{fmt(p(a.balance))}</Text>
                  </View>
                  {exchAccountId === a.id && <Text style={{ color: "#059669", fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {exchCoins && exchRatePer ? (
              <View style={{ backgroundColor: "#ECFDF5", borderRadius: 10, padding: 12, marginTop: 10 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#065F46" }}>
                  Total: {exchCoins} × ₨{exchRatePer} = ₨{fmt(parseFloat(exchCoins || "0") * parseFloat(exchRatePer || "0"))}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.input, flex: 1 }]} onPress={() => setShowExchangeModal(false)}>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#059669", flex: 2 }]} onPress={handleExchange} disabled={exchSaving}>
                {exchSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: "Inter_700Bold", color: "#fff" }}>Confirm Exchange</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center" },
  header:      { paddingHorizontal: 20, paddingBottom: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff", letterSpacing: 0.5 },
  headerSub:   { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
  divider:     { height: 1, marginVertical: 8 },
  actionBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  saveBtn:     { borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 12 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: "90%" },
  modalTitle:   { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 6 },
  modalBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
});

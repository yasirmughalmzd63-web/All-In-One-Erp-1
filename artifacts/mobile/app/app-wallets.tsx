import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppWalletSummary = {
  id: number; name: string; unit: string; stock: number;
  costPrice: string; unitPrice: string; wholesalePrice: string;
  topupCoinsPerUsd?: string | null; topupExchangeRatePkr?: string | null;
  usdInvested: string; pkrInvested: string;
  coinsIn: number; walletTopups: number; directTopups: number;
  coinsSold: number; pkrRevenue: string;
  creditTotalPkr: string; creditPaidPkr: string;
  creditRemainingPkr: string; creditQty: number; openCredits: number;
};

type TopupEntry = {
  id: number; amountUsd: string; rate: string; totalPkr: string;
  partyName: string | null; notes: string | null; date: string;
  qty: number | null; paymentMode: string | null; createdAt: string;
};

type CoinCredit = {
  id: number; productId: number; customerName: string; customerId: number | null;
  qty: number; unitPricePkr: string; totalPkr: string;
  paidPkr: string; remainingPkr: string; status: string;
  notes: string | null; date: string; dueDate: string | null; createdAt: string;
};

type SaleRow = {
  id: number; invoiceNo: string; qty: number; unitPrice: string;
  total: string; paymentMethod: string; createdAt: string;
};

type AppDetail = {
  product: AppWalletSummary;
  topups: TopupEntry[];
  credits: CoinCredit[];
  sales: SaleRow[];
};

type CreditPayment = { id: number; creditId: number; amountPkr: string; method: string; notes: string | null; date: string; createdAt: string };
type CreditDetail = { credit: CoinCredit; payments: CreditPayment[] };

type DetailTab = "coins" | "dollars" | "credit";
type CreditStatusFilter = "all" | "pending" | "partial" | "paid";

const pkrFmt = (n: number) => {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(0)}`;
};
const todayStr = () => new Date().toISOString().split("T")[0]!;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400E" },
  partial: { bg: "#DBEAFE", text: "#1E40AF" },
  paid:    { bg: "#D1FAE5", text: "#065F46" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AppWalletsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  // List state
  const [summaries, setSummaries] = useState<AppWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected app & detail
  const [selectedApp, setSelectedApp] = useState<AppWalletSummary | null>(null);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("coins");

  // Credit filters
  const [creditStatusFilter, setCreditStatusFilter] = useState<CreditStatusFilter>("all");

  // Add credit modal
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditForm, setCreditForm] = useState({
    customerName: "", qty: "", unitPricePkr: "",
    notes: "", date: todayStr(), dueDate: "",
  });
  const [savingCredit, setSavingCredit] = useState(false);

  // Credit payment modal
  const [creditDetail, setCreditDetail] = useState<CreditDetail | null>(null);
  const [payForm, setPayForm] = useState({ amountPkr: "", method: "cash", notes: "", date: todayStr() });
  const [savingPay, setSavingPay] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadSummaries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await customFetch<AppWalletSummary[]>("/api/app-wallets");
      setSummaries(data);
      if (!selectedApp && data.length > 0) setSelectedApp(data[0]!);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [selectedApp]);

  const loadDetail = useCallback(async (productId: number) => {
    setDetailLoading(true);
    try {
      const data = await customFetch<AppDetail>(`/api/app-wallets/${productId}`);
      setDetail(data);
    } catch { /* ignore */ }
    setDetailLoading(false);
  }, []);

  const loadCreditDetail = async (creditId: number) => {
    try {
      const data = await customFetch<CreditDetail>(`/api/app-wallets/credits/${creditId}`);
      setCreditDetail(data);
      setPayForm({ amountPkr: "", method: "cash", notes: "", date: todayStr() });
    } catch { Alert.alert("Error", "Could not load credit detail"); }
  };

  useEffect(() => { loadSummaries(); }, []);
  useEffect(() => { if (selectedApp) loadDetail(selectedApp.id); }, [selectedApp?.id]);

  // Sync selected summary from list after refresh
  const syncSelected = (freshList: AppWalletSummary[]) => {
    if (selectedApp) {
      const fresh = freshList.find(a => a.id === selectedApp.id);
      if (fresh) setSelectedApp(fresh);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await customFetch<AppWalletSummary[]>("/api/app-wallets");
      setSummaries(data);
      syncSelected(data);
      if (selectedApp) await loadDetail(selectedApp.id);
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  // ── Credit CRUD ───────────────────────────────────────────────────────────────

  const handleAddCredit = async () => {
    if (!selectedApp) return;
    const { customerName, qty, unitPricePkr, date } = creditForm;
    if (!customerName.trim() || !qty || !unitPricePkr || !date) {
      Alert.alert("Missing fields", "Customer name, quantity, unit price, and date are required.");
      return;
    }
    if (parseInt(qty) <= 0 || parseFloat(unitPricePkr) <= 0) {
      Alert.alert("Error", "Qty and unit price must be positive.");
      return;
    }
    setSavingCredit(true);
    try {
      await customFetch(`/api/app-wallets/${selectedApp.id}/credits`, {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName.trim(),
          qty: parseInt(qty),
          unitPricePkr,
          notes: creditForm.notes || null,
          date,
          dueDate: creditForm.dueDate || null,
        }),
      });
      Alert.alert("Credit recorded", `${qty} ${selectedApp.unit} on credit for ${customerName.trim()}`);
      setShowCreditModal(false);
      setCreditForm({ customerName: "", qty: "", unitPricePkr: selectedApp.unitPrice, notes: "", date: todayStr(), dueDate: "" });
      await loadDetail(selectedApp.id);
      const fresh = await customFetch<AppWalletSummary[]>("/api/app-wallets");
      setSummaries(fresh);
      syncSelected(fresh);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save credit");
    }
    setSavingCredit(false);
  };

  const handlePayment = async () => {
    if (!creditDetail) return;
    const { amountPkr, method, notes, date } = payForm;
    if (!amountPkr || !date) { Alert.alert("Missing fields", "Amount and date are required."); return; }
    if (parseFloat(amountPkr) <= 0) { Alert.alert("Error", "Amount must be positive."); return; }
    setSavingPay(true);
    try {
      await customFetch(`/api/app-wallets/credits/${creditDetail.credit.id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amountPkr, method, notes: notes || null, date }),
      });
      Alert.alert("Payment recorded", `₨${parseFloat(amountPkr).toFixed(2)} via ${method}`);
      setCreditDetail(null);
      if (selectedApp) { await loadDetail(selectedApp.id); const fresh = await customFetch<AppWalletSummary[]>("/api/app-wallets"); setSummaries(fresh); syncSelected(fresh); }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to record payment");
    }
    setSavingPay(false);
  };

  const handleDeleteCredit = (credit: CoinCredit) => {
    Alert.alert("Delete credit?", `Remove credit of ${credit.qty} coins for ${credit.customerName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await customFetch(`/api/app-wallets/credits/${credit.id}`, { method: "DELETE" });
            if (selectedApp) { await loadDetail(selectedApp.id); const fresh = await customFetch<AppWalletSummary[]>("/api/app-wallets"); setSummaries(fresh); syncSelected(fresh); }
          } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Delete failed"); }
        },
      },
    ]);
  };

  // ── Render Helpers ────────────────────────────────────────────────────────────

  const BalanceCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
    <View style={[styles.balCard, { borderColor: color + "40", backgroundColor: color + "10" }]}>
      <Text style={[styles.balLabel, { color }]}>{label}</Text>
      <Text style={[styles.balValue, { color }]}>{value}</Text>
      {sub ? <Text style={[styles.balSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
    </View>
  );

  const renderCoinsTab = () => {
    if (!detail) return null;
    const allRows = [
      ...detail.topups.map(t => ({ key: `t${t.id}`, type: "in" as const, label: "Top-up", qty: t.qty ?? 0, date: t.date, note: t.partyName, paymentMode: t.paymentMode })),
      ...detail.sales.map(s => ({ key: `s${s.id}`, type: "out" as const, label: `Sale #${s.invoiceNo}`, qty: s.qty, date: s.createdAt.split("T")[0]!, note: s.paymentMethod, paymentMode: null })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    if (allRows.length === 0) {
      return <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No coin transactions yet</Text>;
    }
    return (
      <>
        {allRows.map(row => (
          <View key={row.key} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.txBadge, { backgroundColor: row.type === "in" ? "#D1FAE5" : "#FEE2E2" }]}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: row.type === "in" ? "#065F46" : "#991B1B" }}>
                {row.type === "in" ? "+" : "-"}{(row.qty ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{row.label}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{row.date}{row.note ? ` · ${row.note}` : ""}</Text>
              {row.paymentMode ? (
                <View style={{ marginTop: 2, alignSelf: "flex-start", backgroundColor: row.paymentMode === "direct" ? "#FEF3C7" : "#EDE9FE", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 8, color: row.paymentMode === "direct" ? "#92400E" : "#5B21B6" }}>{row.paymentMode === "direct" ? "DIRECT" : "WALLET"}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </>
    );
  };

  const renderDollarsTab = () => {
    if (!detail || detail.topups.length === 0) {
      return <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No dollar topups yet</Text>;
    }
    return (
      <>
        {detail.topups.map(t => (
          <View key={t.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.txBadge, { backgroundColor: "#F3E8FF" }]}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#7C3AED" }}>${parseFloat(t.amountUsd).toFixed(2)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>
                {t.partyName ?? "Topup"}{t.qty ? ` · ${t.qty.toLocaleString()} coins` : ""}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                Rate ₨{parseFloat(t.rate).toFixed(2)} · ₨{parseFloat(t.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })} · {t.date}
              </Text>
            </View>
            {t.paymentMode === "direct" ? (
              <View style={{ backgroundColor: "#FEF3C7", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#92400E" }}>DIRECT</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: "#EDE9FE", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#5B21B6" }}>WALLET</Text>
              </View>
            )}
          </View>
        ))}
      </>
    );
  };

  const renderCreditTab = () => {
    if (!detail) return null;
    const filtered = detail.credits.filter(c => creditStatusFilter === "all" || c.status === creditStatusFilter);

    return (
      <>
        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["all", "pending", "partial", "paid"] as CreditStatusFilter[]).map(s => {
              const sel = creditStatusFilter === s;
              return (
                <TouchableOpacity key={s} onPress={() => setCreditStatusFilter(s)}
                  style={{ backgroundColor: sel ? "#7C3AED" : colors.card, borderColor: sel ? "#7C3AED" : colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: sel ? "Inter_700Bold" : "Inter_400Regular", fontSize: 12, color: sel ? "#FFF" : colors.text, textTransform: "capitalize" }}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {filtered.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {detail.credits.length === 0 ? "No credit entries for this app yet" : `No ${creditStatusFilter} credits`}
          </Text>
        ) : (
          filtered.map(c => {
            const sc = STATUS_COLORS[c.status] ?? STATUS_COLORS.pending!;
            const paidPct = parseFloat(c.totalPkr) > 0 ? (parseFloat(c.paidPkr) / parseFloat(c.totalPkr)) * 100 : 0;
            return (
              <TouchableOpacity key={c.id} onPress={() => loadCreditDetail(c.id)}
                style={[styles.creditCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{c.customerName}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                      {c.qty.toLocaleString()} {selectedApp?.unit ?? "coins"} · ₨{parseFloat(c.unitPricePkr).toFixed(2)}/unit · {c.date}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: sc.text, textTransform: "uppercase" }}>{c.status}</Text>
                    </View>
                    {isAdmin && c.status !== "paid" && (
                      <TouchableOpacity onPress={() => handleDeleteCredit(c)}>
                        <Text style={{ fontSize: 16, color: "#DC2626" }}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {/* Progress bar */}
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: 4 }}>
                  <View style={{ height: 4, backgroundColor: paidPct >= 100 ? "#10B981" : "#7C3AED", borderRadius: 2, width: `${Math.min(100, paidPct)}%` }} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                    Paid: {pkrFmt(parseFloat(c.paidPkr))}
                  </Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: parseFloat(c.remainingPkr) > 0 ? "#DC2626" : "#10B981" }}>
                    {parseFloat(c.remainingPkr) > 0 ? `Due: ${pkrFmt(parseFloat(c.remainingPkr))}` : "Cleared"}
                  </Text>
                </View>
                {c.dueDate ? (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>Due: {c.dueDate}</Text>
                ) : null}
                {c.notes ? (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2, fontStyle: "italic" }}>{c.notes}</Text>
                ) : null}
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground + "80", marginTop: 4 }}>Tap to record payment</Text>
              </TouchableOpacity>
            );
          })
        )}
      </>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────────

  const app = selectedApp;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={["#5B21B6", "#7C3AED"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 20, fontFamily: "Inter_400Regular" }}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>App Wallets</Text>
            <Text style={styles.headerSub}>Coins · Dollars · Credit per app</Text>
          </View>
        </View>

        {/* App selector */}
        {!loading && summaries.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {summaries.map(a => {
                const sel = a.id === selectedApp?.id;
                return (
                  <TouchableOpacity key={a.id} onPress={() => setSelectedApp(a)}
                    style={{ backgroundColor: sel ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: sel ? "rgba(255,255,255,0.5)" : "transparent" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFF" }}>{a.name}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{a.stock.toLocaleString()} {a.unit}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#7C3AED" />
      ) : !app ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products found. Add products to use App Wallets.</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        >
          {/* Balance Cards */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <BalanceCard label="🪙 Coins" value={app.stock.toLocaleString()} sub={`${app.coinsIn.toLocaleString()} in · ${app.coinsSold.toLocaleString()} sold`} color="#7C3AED" />
            <BalanceCard label="💵 USD" value={`$${parseFloat(app.usdInvested).toFixed(2)}`} sub={`${app.walletTopups}W · ${app.directTopups}D`} color="#0891B2" />
            <BalanceCard label="💳 Credit" value={pkrFmt(parseFloat(app.creditRemainingPkr))} sub={`${app.openCredits} open`} color={parseFloat(app.creditRemainingPkr) > 0 ? "#DC2626" : "#10B981"} />
          </View>

          {/* PKR invested & revenue */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>PKR INVESTED</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{pkrFmt(parseFloat(app.pkrInvested))}</Text>
            </View>
            <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>PKR REVENUE</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10B981" }}>{pkrFmt(parseFloat(app.pkrRevenue))}</Text>
            </View>
            <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>COST/UNIT</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>₨{parseFloat(app.costPrice || "0").toFixed(4)}</Text>
            </View>
          </View>

          {/* Detail Tabs */}
          <View style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            {(["coins", "dollars", "credit"] as DetailTab[]).map(tab => {
              const sel = detailTab === tab;
              const labels = { coins: "🪙 Coins", dollars: "💵 Dollars", credit: "💳 Credit" };
              return (
                <TouchableOpacity key={tab} onPress={() => setDetailTab(tab)} style={{ flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: sel ? "#7C3AED" : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: sel ? "Inter_700Bold" : "Inter_400Regular", fontSize: 12, color: sel ? "#FFF" : colors.mutedForeground }}>{labels[tab]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab content */}
          {detailLoading ? (
            <ActivityIndicator color="#7C3AED" />
          ) : (
            detailTab === "coins" ? renderCoinsTab() :
            detailTab === "dollars" ? renderDollarsTab() :
            renderCreditTab()
          )}
        </ScrollView>
      )}

      {/* FAB — add credit */}
      {app && detailTab === "credit" && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: "#7C3AED" }]}
          onPress={() => { setCreditForm({ customerName: "", qty: "", unitPricePkr: app.unitPrice, notes: "", date: todayStr(), dueDate: "" }); setShowCreditModal(true); }}>
          <Text style={styles.fabText}>+ Credit</Text>
        </TouchableOpacity>
      )}

      {/* ── Add Credit Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showCreditModal} animationType="slide" transparent onRequestClose={() => setShowCreditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Coin Credit — {app?.name}</Text>
              <TouchableOpacity onPress={() => setShowCreditModal(false)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium" }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CUSTOMER NAME</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                value={creditForm.customerName} onChangeText={v => setCreditForm(f => ({ ...f, customerName: v }))}
                placeholder="Customer or shop name" placeholderTextColor={colors.mutedForeground} />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>QTY ({app?.unit ?? "units"})</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={creditForm.qty} onChangeText={v => setCreditForm(f => ({ ...f, qty: v }))}
                    keyboardType="numeric" placeholder="e.g. 1000" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>PRICE / UNIT (₨)</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={creditForm.unitPricePkr} onChangeText={v => setCreditForm(f => ({ ...f, unitPricePkr: v }))}
                    keyboardType="decimal-pad" placeholder="0.06" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              {/* Live total */}
              {creditForm.qty && creditForm.unitPricePkr && parseFloat(creditForm.qty) > 0 && parseFloat(creditForm.unitPricePkr) > 0 && (
                <View style={{ backgroundColor: "#F3E8FF", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#5B21B6" }}>
                    Total: ₨{(parseFloat(creditForm.qty) * parseFloat(creditForm.unitPricePkr)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#7C3AED" }}>
                    {parseInt(creditForm.qty).toLocaleString()} {app?.unit} × ₨{parseFloat(creditForm.unitPricePkr).toFixed(4)}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={creditForm.date} onChangeText={v => setCreditForm(f => ({ ...f, date: v }))}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>DUE DATE (OPT.)</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={creditForm.dueDate} onChangeText={v => setCreditForm(f => ({ ...f, dueDate: v }))}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 24 }]}
                value={creditForm.notes} onChangeText={v => setCreditForm(f => ({ ...f, notes: v }))}
                placeholder="Any notes…" placeholderTextColor={colors.mutedForeground} multiline />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: savingCredit ? "#9CA3AF" : "#7C3AED" }]}
                disabled={savingCredit} onPress={handleAddCredit}>
                <Text style={styles.saveBtnText}>{savingCredit ? "Saving…" : "Record Credit"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Credit Payment Modal ──────────────────────────────────────────────── */}
      <Modal visible={!!creditDetail} animationType="slide" transparent onRequestClose={() => setCreditDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {creditDetail?.credit.customerName} — {creditDetail?.credit.qty.toLocaleString()} {app?.unit}
              </Text>
              <TouchableOpacity onPress={() => setCreditDetail(null)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium" }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {creditDetail && (
                <>
                  {/* Credit summary */}
                  <View style={{ backgroundColor: "#F3E8FF", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#5B21B6" }}>Total</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#5B21B6" }}>
                        ₨{parseFloat(creditDetail.credit.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#7C3AED" }}>Paid</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10B981" }}>
                        ₨{parseFloat(creditDetail.credit.paidPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#7C3AED" }}>Remaining</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: parseFloat(creditDetail.credit.remainingPkr) > 0 ? "#DC2626" : "#10B981" }}>
                        ₨{parseFloat(creditDetail.credit.remainingPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>

                  {/* Payment history */}
                  {creditDetail.payments.length > 0 && (
                    <>
                      <Text style={[styles.label, { color: colors.mutedForeground }]}>PAYMENT HISTORY</Text>
                      {creditDetail.payments.map(p => (
                        <View key={p.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 6 }]}>
                          <View style={[styles.txBadge, { backgroundColor: "#D1FAE5" }]}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#065F46" }}>+₨{parseFloat(p.amountPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, textTransform: "capitalize" }}>{p.method}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{p.date}{p.notes ? ` · ${p.notes}` : ""}</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {creditDetail.credit.status !== "paid" && (
                    <>
                      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 8 }]}>RECORD PAYMENT</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                        {(["cash", "transfer", "coins"] as const).map(m => {
                          const sel = payForm.method === m;
                          return (
                            <TouchableOpacity key={m} onPress={() => setPayForm(f => ({ ...f, method: m }))}
                              style={{ flex: 1, backgroundColor: sel ? "#7C3AED" : colors.card, borderColor: sel ? "#7C3AED" : colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text, textTransform: "capitalize" }}>{m}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.mutedForeground }]}>AMOUNT (₨)</Text>
                          <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                            value={payForm.amountPkr}
                            onChangeText={v => setPayForm(f => ({ ...f, amountPkr: v }))}
                            keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
                          <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                            value={payForm.date} onChangeText={v => setPayForm(f => ({ ...f, date: v }))}
                            placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />
                        </View>
                      </View>

                      {/* Quick fill buttons */}
                      <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
                        <TouchableOpacity onPress={() => setPayForm(f => ({ ...f, amountPkr: creditDetail.credit.remainingPkr.split(".")[0]! }))}
                          style={{ backgroundColor: "#7C3AED", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFF" }}>Full Amount</Text>
                        </TouchableOpacity>
                        {parseFloat(creditDetail.credit.remainingPkr) > 0 && (
                          <TouchableOpacity onPress={() => setPayForm(f => ({ ...f, amountPkr: (parseFloat(creditDetail.credit.remainingPkr) / 2).toFixed(0) }))}
                            style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.text }}>Half</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 20 }]}
                        value={payForm.notes} onChangeText={v => setPayForm(f => ({ ...f, notes: v }))}
                        placeholder="Notes (optional)" placeholderTextColor={colors.mutedForeground} />

                      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: savingPay ? "#9CA3AF" : "#7C3AED" }]}
                        disabled={savingPay} onPress={handlePayment}>
                        <Text style={styles.saveBtnText}>{savingPay ? "Saving…" : "Record Payment"}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  balCard: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1, alignItems: "center" },
  balLabel: { fontFamily: "Inter_400Regular", fontSize: 10, textTransform: "uppercase", marginBottom: 2 },
  balValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  balSub: { fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 1, textAlign: "center" },

  infoBox: { borderRadius: 10, padding: 10, borderWidth: 1 },

  txRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  txBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, minWidth: 60, alignItems: "center" },

  creditCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  statusBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", marginBottom: 8 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },

  label: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 12 },

  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF" },

  fab: { position: "absolute", bottom: 28, right: 20, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 15, elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" },
});

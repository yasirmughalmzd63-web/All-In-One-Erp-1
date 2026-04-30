import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth, isAdminOrAbove } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

/* ─── Types ─── */
interface Customer { id: number; name: string; }
interface Account  { id: number; name: string; balance: string; type: string; }
interface Product  { id: number; name: string; stock: number; price: string; }

interface UsdPurchase {
  id: number; customerId?: number; customerName: string;
  dollarAmount: string; dollarRate: string; totalPkr: string;
  coinsPkr: string; coinsProductName?: string; coinsQty: string;
  cashPkr: string; cashAccountName?: string;
  creditPkr: string;
  notes?: string; date: string; locationId?: number; createdAt: string;
}
interface Summary {
  totalUsd: number; totalPkr: number;
  totalCoins: number; totalCash: number; totalCredit: number; count: number;
}

const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TODAY = new Date().toISOString().slice(0, 10);

type Tab = "buy" | "history";

export default function UsdBridgeScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { token, user } = useAuth();
  const colors  = useColors();
  const isAdmin = isAdminOrAbove(user);

  const [tab,      setTab]      = useState<Tab>("buy");
  const [history,  setHistory]  = useState<UsdPurchase[]>([]);
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ─── Reference data ─── */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts,  setAccounts]  = useState<Account[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);

  /* ─── Buy form ─── */
  const [customerId,    setCustomerId]    = useState<number | null>(null);
  const [customerName,  setCustomerName]  = useState("");
  const [dollarAmount,  setDollarAmount]  = useState("");
  const [dollarRate,    setDollarRate]    = useState("");
  const [notes,         setNotes]         = useState("");
  const [txDate,        setTxDate]        = useState(TODAY);

  // Payment method toggles
  const [useCoins,  setUseCoins]  = useState(false);
  const [useCash,   setUseCash]   = useState(false);
  const [useCredit, setUseCredit] = useState(false);

  // Coins
  const [coinsProductId, setCoinsProductId] = useState<number | null>(null);
  const [coinsQty,       setCoinsQty]       = useState("");

  // Cash
  const [cashAccountId, setCashAccountId] = useState<number | null>(null);
  const [cashPkr,       setCashPkr]       = useState("");

  // Credit — auto-filled from remainder
  const [creditPkr, setCreditPkr] = useState("");

  /* ─── Modals ─── */
  const [showCustPicker, setShowCustPicker] = useState(false);
  const [showProdPicker, setShowProdPicker] = useState(false);
  const [showAcctPicker, setShowAcctPicker] = useState(false);
  const [custSearch,     setCustSearch]     = useState("");
  const [prodSearch,     setProdSearch]     = useState("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  /* ─── Fetch ─── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hr, sr, cr, ar, pr] = await Promise.all([
        fetch(getApiUrl("/api/usd-bridge"),          { headers }),
        fetch(getApiUrl("/api/usd-bridge/summary"),  { headers }),
        fetch(getApiUrl("/api/customers"),            { headers }),
        fetch(getApiUrl("/api/accounts"),             { headers }),
        fetch(getApiUrl("/api/products"),             { headers }),
      ]);
      if (hr.ok) setHistory(await hr.json());
      if (sr.ok) setSummary(await sr.json());
      if (cr.ok) setCustomers(await cr.json());
      if (ar.ok) setAccounts(await ar.json());
      if (pr.ok) setProducts(await pr.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─── Derived ─── */
  const totalPkr = useMemo(() => {
    const d = parseFloat(dollarAmount || "0");
    const r = parseFloat(dollarRate   || "0");
    return d * r;
  }, [dollarAmount, dollarRate]);

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === coinsProductId), [products, coinsProductId]);

  const coinsPkr = useMemo(() => {
    if (!selectedProduct || !coinsQty) return 0;
    return parseFloat(coinsQty) * parseFloat(selectedProduct.price || "0");
  }, [selectedProduct, coinsQty]);

  const cashVal   = parseFloat(cashPkr   || "0");
  const creditVal = parseFloat(creditPkr || "0");
  const settled   = coinsPkr + cashVal + creditVal;
  const remaining = Math.max(0, totalPkr - settled);

  const filteredCustomers = useMemo(() =>
    customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())),
    [customers, custSearch]);

  const filteredProducts = useMemo(() =>
    products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())),
    [products, prodSearch]);

  /* ─── Auto-fill credit from remainder ─── */
  const fillCreditFromRemainder = () => {
    if (remaining > 0) setCreditPkr(remaining.toFixed(0));
  };

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!customerName.trim()) { Alert.alert("Select a customer"); return; }
    if (!dollarAmount || parseFloat(dollarAmount) <= 0) { Alert.alert("Enter USD amount"); return; }
    if (!dollarRate   || parseFloat(dollarRate)   <= 0) { Alert.alert("Enter exchange rate"); return; }
    if (!useCoins && !useCash && !useCredit) { Alert.alert("Choose at least one payment method"); return; }
    if (useCoins && !coinsProductId) { Alert.alert("Select a product for coins payment"); return; }
    if (useCash  && cashVal <= 0)    { Alert.alert("Enter cash amount"); return; }
    if (useCredit && creditVal <= 0) { Alert.alert("Enter credit amount"); return; }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        customerId, customerName, dollarAmount, dollarRate,
        notes: notes || null, date: txDate,
      };
      if (useCoins && coinsProductId) {
        body.coinsProductId = coinsProductId;
        body.coinsQty       = coinsQty;
        body.coinsPkr       = coinsPkr.toFixed(2);
      }
      if (useCash && cashVal > 0) {
        body.cashAccountId = cashAccountId;
        body.cashPkr       = cashVal.toFixed(2);
      }
      if (useCredit && creditVal > 0) {
        body.creditPkr = creditVal.toFixed(2);
      }

      const r = await fetch(getApiUrl("/api/usd-bridge"), {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }

      Alert.alert("Success", `$${dollarAmount} bought from ${customerName}`);
      // Reset form
      setCustomerId(null); setCustomerName("");
      setDollarAmount(""); setDollarRate(""); setNotes(""); setTxDate(TODAY);
      setUseCoins(false); setUseCash(false); setUseCredit(false);
      setCoinsProductId(null); setCoinsQty(""); setCashAccountId(null); setCashPkr(""); setCreditPkr("");
      fetchAll();
      setTab("history");
    } finally { setSubmitting(false); }
  };

  /* ─── Delete ─── */
  const deletePurchase = (item: UsdPurchase) => {
    Alert.alert("Delete Record", `Remove this purchase of $${item.dollarAmount}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(getApiUrl(`/api/usd-bridge/${item.id}`), { method: "DELETE", headers });
        fetchAll();
      }},
    ]);
  };

  /* ─── Export ─── */
  const exportCsv = async () => {
    const lines = [
      "Date,Customer,USD,Rate,PKR,Coins(PKR),Product,Cash(PKR),Account,Credit(PKR)",
      ...history.map(h =>
        `${h.date},${h.customerName},${h.dollarAmount},${h.dollarRate},${h.totalPkr},${h.coinsPkr},${h.coinsProductName ?? ""},${h.cashPkr},${h.cashAccountName ?? ""},${h.creditPkr}`
      ),
    ];
    await Share.share({ message: lines.join("\n"), title: "USD Bridge Export" });
  };

  const s = styles(colors);

  /* ═══════════════ BUY TAB ═══════════════ */
  const renderBuyTab = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

      {/* Summary cards */}
      {summary && (
        <View style={s.summaryRow}>
          <View style={[s.sumCard, { backgroundColor: "#EFF6FF" }]}>
            <Text style={[s.sumVal, { color: "#2563EB" }]}>{USD(summary.totalUsd)}</Text>
            <Text style={s.sumLbl}>Total Bought</Text>
          </View>
          <View style={[s.sumCard, { backgroundColor: "#ECFDF5" }]}>
            <Text style={[s.sumVal, { color: "#059669" }]}>{summary.count}</Text>
            <Text style={s.sumLbl}>Transactions</Text>
          </View>
        </View>
      )}

      {/* Step 1 — Customer */}
      <Text style={s.stepLabel}>1. Select Customer</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => { setCustSearch(""); setShowCustPicker(true); }}>
        <Feather name="user" size={16} color={colors.primary} />
        <Text style={[s.pickerBtnTxt, !customerName && { color: colors.textSecondary }]}>
          {customerName || "Tap to select customer"}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      {/* manual name if no customer */}
      {!customerId && (
        <TextInput style={s.input} placeholder="Or type customer name manually"
          placeholderTextColor={colors.textSecondary}
          value={customerName} onChangeText={setCustomerName} />
      )}

      {/* Step 2 — USD details */}
      <Text style={s.stepLabel}>2. USD Transaction Details</Text>
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Amount (USD)</Text>
          <TextInput style={s.input} keyboardType="numeric" placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            value={dollarAmount} onChangeText={setDollarAmount} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Rate (₨ per $)</Text>
          <TextInput style={s.input} keyboardType="numeric" placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            value={dollarRate} onChangeText={setDollarRate} />
        </View>
      </View>
      {totalPkr > 0 && (
        <View style={s.totalBanner}>
          <Text style={s.totalLabel}>Total Value</Text>
          <Text style={s.totalAmount}>{PKR(totalPkr)}</Text>
          <Text style={s.totalSub}>({USD(parseFloat(dollarAmount || "0"))} × ₨{parseFloat(dollarRate || "0").toLocaleString()})</Text>
        </View>
      )}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Date</Text>
          <TextInput style={s.input} value={txDate} onChangeText={setTxDate}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Notes (optional)</Text>
          <TextInput style={s.input} value={notes} onChangeText={setNotes}
            placeholder="Notes" placeholderTextColor={colors.textSecondary} />
        </View>
      </View>

      {/* Step 3 — Payment Methods */}
      <Text style={s.stepLabel}>3. Payment to Customer</Text>
      <Text style={s.stepSub}>How are you paying the customer? (can combine methods)</Text>

      {/* ── Coins ── */}
      <View style={s.methodCard}>
        <TouchableOpacity style={s.methodHeader} onPress={() => setUseCoins(v => !v)}>
          <View style={[s.checkbox, useCoins && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            {useCoins && <Feather name="check" size={12} color="#fff" />}
          </View>
          <Text style={s.methodIcon}>🪙</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.methodTitle}>Coins (Products)</Text>
            <Text style={s.methodDesc}>Give products to customer as payment</Text>
          </View>
          {useCoins && coinsPkr > 0 && <Text style={[s.methodAmt, { color: "#7C3AED" }]}>{PKR(coinsPkr)}</Text>}
        </TouchableOpacity>
        {useCoins && (
          <View style={s.methodBody}>
            <TouchableOpacity style={s.pickerBtn} onPress={() => { setProdSearch(""); setShowProdPicker(true); }}>
              <Feather name="package" size={14} color={colors.primary} />
              <Text style={[s.pickerBtnTxt, !selectedProduct && { color: colors.textSecondary }]} numberOfLines={1}>
                {selectedProduct ? `${selectedProduct.name} (stock: ${selectedProduct.stock})` : "Select product"}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
            {selectedProduct && (
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Qty to Give</Text>
                  <TextInput style={s.input} keyboardType="numeric" placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    value={coinsQty} onChangeText={setCoinsQty} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Value</Text>
                  <View style={[s.input, { justifyContent: "center" }]}>
                    <Text style={{ color: "#7C3AED", fontWeight: "700" }}>{PKR(coinsPkr)}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Cash ── */}
      <View style={s.methodCard}>
        <TouchableOpacity style={s.methodHeader} onPress={() => setUseCash(v => !v)}>
          <View style={[s.checkbox, useCash && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            {useCash && <Feather name="check" size={12} color="#fff" />}
          </View>
          <Text style={s.methodIcon}>💵</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.methodTitle}>Cash (PKR)</Text>
            <Text style={s.methodDesc}>Pay PKR cash from an account</Text>
          </View>
          {useCash && cashVal > 0 && <Text style={[s.methodAmt, { color: "#059669" }]}>{PKR(cashVal)}</Text>}
        </TouchableOpacity>
        {useCash && (
          <View style={s.methodBody}>
            <Text style={s.fieldLabel}>Amount (₨)</Text>
            <TextInput style={s.input} keyboardType="numeric" placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={cashPkr} onChangeText={setCashPkr} />
            {totalPkr > 0 && remaining > 0 && (
              <TouchableOpacity onPress={() => setCashPkr(remaining.toFixed(0))} style={s.fillBtn}>
                <Text style={s.fillBtnTxt}>Fill remaining {PKR(remaining)}</Text>
              </TouchableOpacity>
            )}
            <Text style={s.fieldLabel}>From Account</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowAcctPicker(true)}>
              <Feather name="credit-card" size={14} color={colors.primary} />
              <Text style={[s.pickerBtnTxt, !cashAccountId && { color: colors.textSecondary }]} numberOfLines={1}>
                {cashAccountId ? (accounts.find(a => a.id === cashAccountId)?.name ?? "Selected") : "Select account"}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Credit ── */}
      <View style={s.methodCard}>
        <TouchableOpacity style={s.methodHeader} onPress={() => setUseCredit(v => !v)}>
          <View style={[s.checkbox, useCredit && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            {useCredit && <Feather name="check" size={12} color="#fff" />}
          </View>
          <Text style={s.methodIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.methodTitle}>Credit (Payable)</Text>
            <Text style={s.methodDesc}>Add to customer credit — pay later</Text>
          </View>
          {useCredit && creditVal > 0 && <Text style={[s.methodAmt, { color: "#D97706" }]}>{PKR(creditVal)}</Text>}
        </TouchableOpacity>
        {useCredit && (
          <View style={s.methodBody}>
            <Text style={s.fieldLabel}>Credit Amount (₨)</Text>
            <TextInput style={s.input} keyboardType="numeric" placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={creditPkr} onChangeText={setCreditPkr} />
            {totalPkr > 0 && remaining > 0 && (
              <TouchableOpacity onPress={fillCreditFromRemainder} style={s.fillBtn}>
                <Text style={s.fillBtnTxt}>Fill remaining {PKR(remaining)}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Settlement summary */}
      {totalPkr > 0 && (useCoins || useCash || useCredit) && (
        <View style={s.settlementBox}>
          <Text style={s.sectionTitle}>Settlement Breakdown</Text>
          <View style={s.settlementRow}>
            <Text style={s.settleLbl}>Total PKR owed to customer</Text>
            <Text style={s.settleVal}>{PKR(totalPkr)}</Text>
          </View>
          {useCoins && coinsPkr > 0 && (
            <View style={s.settlementRow}>
              <Text style={[s.settleLbl, { color: "#7C3AED" }]}>🪙 Coins</Text>
              <Text style={[s.settleVal, { color: "#7C3AED" }]}>-{PKR(coinsPkr)}</Text>
            </View>
          )}
          {useCash && cashVal > 0 && (
            <View style={s.settlementRow}>
              <Text style={[s.settleLbl, { color: "#059669" }]}>💵 Cash</Text>
              <Text style={[s.settleVal, { color: "#059669" }]}>-{PKR(cashVal)}</Text>
            </View>
          )}
          {useCredit && creditVal > 0 && (
            <View style={s.settlementRow}>
              <Text style={[s.settleLbl, { color: "#D97706" }]}>📋 Credit</Text>
              <Text style={[s.settleVal, { color: "#D97706" }]}>-{PKR(creditVal)}</Text>
            </View>
          )}
          <View style={[s.settlementRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
            <Text style={[s.settleLbl, { fontWeight: "700" }]}>Remaining</Text>
            <Text style={[s.settleVal, { color: remaining > 0.5 ? "#DC2626" : "#059669", fontWeight: "700" }]}>
              {PKR(remaining)}
            </Text>
          </View>
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <>
              <Feather name="arrow-down-circle" size={18} color="#fff" />
              <Text style={s.submitTxt}>Buy USD from Customer</Text>
            </>
        }
      </TouchableOpacity>
    </ScrollView>
  );

  /* ═══════════════ HISTORY TAB ═══════════════ */
  const renderHistoryTab = () => (
    <FlatList
      data={history}
      keyExtractor={i => String(i.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      ListHeaderComponent={summary ? (
        <View>
          <View style={s.summaryRow}>
            <View style={[s.sumCard, { backgroundColor: "#EFF6FF", flex: 1 }]}>
              <Text style={[s.sumVal, { color: "#2563EB" }]}>{USD(summary.totalUsd)}</Text>
              <Text style={s.sumLbl}>Total USD</Text>
            </View>
            <View style={[s.sumCard, { backgroundColor: "#F3F4F6", flex: 1 }]}>
              <Text style={[s.sumVal, { color: "#374151" }]}>{PKR(summary.totalPkr)}</Text>
              <Text style={s.sumLbl}>Total PKR</Text>
            </View>
          </View>
          <View style={s.summaryRow}>
            <View style={[s.sumCard, { backgroundColor: "#F3E8FF", flex: 1 }]}>
              <Text style={[s.sumVal, { color: "#7C3AED", fontSize: 14 }]}>{PKR(summary.totalCoins)}</Text>
              <Text style={s.sumLbl}>🪙 Coins</Text>
            </View>
            <View style={[s.sumCard, { backgroundColor: "#ECFDF5", flex: 1 }]}>
              <Text style={[s.sumVal, { color: "#059669", fontSize: 14 }]}>{PKR(summary.totalCash)}</Text>
              <Text style={s.sumLbl}>💵 Cash</Text>
            </View>
            <View style={[s.sumCard, { backgroundColor: "#FFF7ED", flex: 1 }]}>
              <Text style={[s.sumVal, { color: "#D97706", fontSize: 14 }]}>{PKR(summary.totalCredit)}</Text>
              <Text style={s.sumLbl}>📋 Credit</Text>
            </View>
          </View>
          <TouchableOpacity style={[s.exportBtn]} onPress={exportCsv}>
            <Feather name="share-2" size={14} color="#fff" />
            <Text style={s.exportBtnTxt}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      ListEmptyComponent={<Text style={s.empty}>{loading ? "Loading…" : "No purchases yet"}</Text>}
      renderItem={({ item: h }) => (
        <View style={s.histCard}>
          <View style={s.histLeft}>
            <View style={s.histHeader}>
              <Text style={s.histCustomer}>{h.customerName}</Text>
              <Text style={s.histDate}>{h.date}</Text>
            </View>
            <View style={s.histAmtRow}>
              <Text style={s.histUsd}>{USD(parseFloat(h.dollarAmount))}</Text>
              <Feather name="arrow-right" size={12} color={colors.textSecondary} style={{ marginHorizontal: 4 }} />
              <Text style={s.histPkr}>{PKR(parseFloat(h.totalPkr))}</Text>
              <Text style={s.histRate}> @ ₨{parseFloat(h.dollarRate).toLocaleString()}</Text>
            </View>
            <View style={s.histMethodRow}>
              {parseFloat(h.coinsPkr) > 0 && (
                <View style={[s.methodTag, { backgroundColor: "#F3E8FF" }]}>
                  <Text style={[s.methodTagTxt, { color: "#7C3AED" }]}>🪙 {PKR(parseFloat(h.coinsPkr))}</Text>
                </View>
              )}
              {parseFloat(h.cashPkr) > 0 && (
                <View style={[s.methodTag, { backgroundColor: "#ECFDF5" }]}>
                  <Text style={[s.methodTagTxt, { color: "#059669" }]}>💵 {PKR(parseFloat(h.cashPkr))}</Text>
                </View>
              )}
              {parseFloat(h.creditPkr) > 0 && (
                <View style={[s.methodTag, { backgroundColor: "#FFF7ED" }]}>
                  <Text style={[s.methodTagTxt, { color: "#D97706" }]}>📋 {PKR(parseFloat(h.creditPkr))}</Text>
                </View>
              )}
            </View>
            {h.notes ? <Text style={s.histNote}>📝 {h.notes}</Text> : null}
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={() => deletePurchase(h)} style={s.deleteBtn}>
              <Feather name="trash-2" size={16} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      )}
    />
  );

  /* ═══════════════ MAIN ═══════════════ */
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>USD Bridge</Text>
          <Text style={s.headerSub}>Buy USD from customers</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {([["buy", "💰 Buy USD"], ["history", "📜 History"]] as [Tab, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={[s.tabItem, tab === k && s.tabItemActive]} onPress={() => setTab(k)}>
            <Text style={[s.tabLabel, tab === k && { color: colors.primary, fontWeight: "700" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "buy"     && renderBuyTab()}
      {tab === "history" && renderHistoryTab()}

      {/* ─── Customer Picker Modal ─── */}
      <Modal visible={showCustPicker} animationType="slide" transparent onRequestClose={() => setShowCustPicker(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select Customer</Text>
            <View style={s.searchBox}>
              <Feather name="search" size={14} color={colors.textSecondary} />
              <TextInput style={s.searchInput} placeholder="Search…" placeholderTextColor={colors.textSecondary}
                value={custSearch} onChangeText={setCustSearch} autoFocus />
            </View>
            <FlatList
              data={filteredCustomers}
              keyExtractor={i => String(i.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.listRow} onPress={() => {
                  setCustomerId(item.id); setCustomerName(item.name); setShowCustPicker(false);
                }}>
                  <Feather name="user" size={14} color={colors.textSecondary} />
                  <Text style={s.listRowTxt}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCustPicker(false)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Product Picker Modal ─── */}
      <Modal visible={showProdPicker} animationType="slide" transparent onRequestClose={() => setShowProdPicker(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select Product</Text>
            <View style={s.searchBox}>
              <Feather name="search" size={14} color={colors.textSecondary} />
              <TextInput style={s.searchInput} placeholder="Search…" placeholderTextColor={colors.textSecondary}
                value={prodSearch} onChangeText={setProdSearch} autoFocus />
            </View>
            <FlatList
              data={filteredProducts}
              keyExtractor={i => String(i.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.listRow} onPress={() => {
                  setCoinsProductId(item.id); setShowProdPicker(false);
                }}>
                  <Feather name="package" size={14} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.listRowTxt}>{item.name}</Text>
                    <Text style={[s.listRowTxt, { fontSize: 11, color: colors.textSecondary }]}>
                      Stock: {item.stock} · {PKR(parseFloat(item.price || "0"))}/unit
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowProdPicker(false)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Account Picker Modal ─── */}
      <Modal visible={showAcctPicker} animationType="slide" transparent onRequestClose={() => setShowAcctPicker(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select Account</Text>
            <FlatList
              data={accounts}
              keyExtractor={i => String(i.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.listRow} onPress={() => {
                  setCashAccountId(item.id); setShowAcctPicker(false);
                }}>
                  <Feather name="credit-card" size={14} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.listRowTxt}>{item.name}</Text>
                    <Text style={[s.listRowTxt, { fontSize: 11, color: colors.textSecondary }]}>
                      Balance: {PKR(parseFloat(item.balance || "0"))}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAcctPicker(false)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.background },
  header:         { flexDirection: "row", alignItems: "center", backgroundColor: "#0891B2", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle:    { color: "#fff", fontSize: 20, fontWeight: "700" },
  headerSub:      { color: "#CFFAFE", fontSize: 12 },
  backBtn:        { marginRight: 12 },
  tabBar:         { flexDirection: "row", backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem:        { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabItemActive:  { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel:       { fontSize: 14, color: colors.textSecondary },
  summaryRow:     { flexDirection: "row", gap: 8, marginBottom: 8 },
  sumCard:        { borderRadius: 12, padding: 12, alignItems: "center" },
  sumVal:         { fontSize: 18, fontWeight: "800" },
  sumLbl:         { fontSize: 11, color: "#6B7280", marginTop: 2 },
  stepLabel:      { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 16, marginBottom: 8 },
  stepSub:        { fontSize: 12, color: colors.textSecondary, marginBottom: 8, marginTop: -6 },
  sectionTitle:   { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8 },
  row2:           { flexDirection: "row", gap: 10, marginBottom: 4 },
  input:          { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  fieldLabel:     { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  pickerBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  pickerBtnTxt:   { flex: 1, fontSize: 14, color: colors.text },
  totalBanner:    { backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "center" },
  totalLabel:     { fontSize: 11, color: "#2563EB", fontWeight: "600" },
  totalAmount:    { fontSize: 28, fontWeight: "800", color: "#2563EB" },
  totalSub:       { fontSize: 11, color: "#93C5FD", marginTop: 2 },
  methodCard:     { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: "hidden" },
  methodHeader:   { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  checkbox:       { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  methodIcon:     { fontSize: 20 },
  methodTitle:    { fontSize: 14, fontWeight: "700", color: colors.text },
  methodDesc:     { fontSize: 11, color: colors.textSecondary },
  methodAmt:      { fontSize: 15, fontWeight: "700" },
  methodBody:     { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border },
  fillBtn:        { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.background, borderRadius: 8, marginBottom: 8, alignSelf: "flex-start" },
  fillBtnTxt:     { fontSize: 12, color: colors.primary, fontWeight: "600" },
  settlementBox:  { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 },
  settlementRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  settleLbl:      { fontSize: 13, color: colors.textSecondary },
  settleVal:      { fontSize: 14, fontWeight: "700", color: colors.text },
  submitBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0891B2", borderRadius: 14, padding: 16 },
  submitTxt:      { color: "#fff", fontSize: 16, fontWeight: "700" },
  histCard:       { flexDirection: "row", backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: "#0891B2" },
  histLeft:       { flex: 1 },
  histHeader:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  histCustomer:   { fontSize: 15, fontWeight: "700", color: colors.text },
  histDate:       { fontSize: 12, color: colors.textSecondary },
  histAmtRow:     { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  histUsd:        { fontSize: 15, fontWeight: "700", color: "#2563EB" },
  histPkr:        { fontSize: 14, fontWeight: "700", color: colors.text },
  histRate:       { fontSize: 12, color: colors.textSecondary },
  histMethodRow:  { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 },
  methodTag:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  methodTagTxt:   { fontSize: 12, fontWeight: "600" },
  histNote:       { fontSize: 11, color: colors.textSecondary },
  deleteBtn:      { justifyContent: "center", paddingLeft: 10 },
  exportBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0891B2", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, justifyContent: "center", marginBottom: 12 },
  exportBtnTxt:   { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty:          { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
  overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:          { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetTitle:     { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 },
  searchBox:      { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  searchInput:    { flex: 1, fontSize: 14, color: colors.text },
  listRow:        { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  listRowTxt:     { fontSize: 14, color: colors.text },
  cancelBtn:      { marginTop: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelTxt:      { color: colors.textSecondary, fontWeight: "600" },
});

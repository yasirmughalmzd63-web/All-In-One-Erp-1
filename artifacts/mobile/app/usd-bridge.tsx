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
interface WalletData { id: number; name: string; currency: string; balance: string; isActive: boolean; }
interface WalletTx {
  id: number; entryType: string; amountUsd: string; rate: string; totalPkr: string;
  partyName?: string; partyType?: string; notes?: string; date: string; createdAt: string;
}
interface WalletSummary {
  totalIn: string; totalOut: string; totalInPkr: string; totalOutPkr: string;
  netUsd: string; txCount: number;
}
interface MonthStat { month: string; in: number; out: number; inPkr: number; outPkr: number; count: number; }
interface WalletDetail {
  wallet: WalletData; transactions: WalletTx[];
  summary: WalletSummary; monthly: MonthStat[];
}

const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TODAY = new Date().toISOString().slice(0, 10);

type Tab = "buy" | "history" | "wallets";

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

  /* ─── Wallets ─── */
  const [wallets,             setWallets]             = useState<WalletData[]>([]);
  const [walletDetail,        setWalletDetail]        = useState<WalletDetail | null>(null);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  const [showWalletDetail,    setShowWalletDetail]    = useState(false);

  /* ─── Transfer modal ─── */
  const [showTransfer,     setShowTransfer]     = useState(false);
  const [transferFrom,     setTransferFrom]     = useState<WalletData | null>(null);
  const [transferToId,     setTransferToId]     = useState<number | null>(null);
  const [transferAmount,   setTransferAmount]   = useState("");
  const [transferNotes,    setTransferNotes]    = useState("");
  const [transferDate,     setTransferDate]     = useState(TODAY);
  const [transferLoading,  setTransferLoading]  = useState(false);

  /* ─── Verify ─── */
  const [verifying, setVerifying] = useState<number | null>(null);

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
      const [hr, sr, cr, ar, pr, wr] = await Promise.all([
        fetch(getApiUrl("/api/usd-bridge"),               { headers }),
        fetch(getApiUrl("/api/usd-bridge/summary"),       { headers }),
        fetch(getApiUrl("/api/customers"),                 { headers }),
        fetch(getApiUrl("/api/accounts"),                  { headers }),
        fetch(getApiUrl("/api/products"),                  { headers }),
        fetch(getApiUrl("/api/dollar-wallet/wallets"),     { headers }),
      ]);
      if (hr.ok) setHistory(await hr.json());
      if (sr.ok) setSummary(await sr.json());
      if (cr.ok) setCustomers(await cr.json());
      if (ar.ok) setAccounts(await ar.json());
      if (pr.ok) setProducts(await pr.json());
      if (wr.ok) setWallets(await wr.json());
    } finally { setLoading(false); }
  }, [token]);

  const fetchWalletDetail = async (walletId: number) => {
    setWalletDetailLoading(true);
    setWalletDetail(null);
    setShowWalletDetail(true);
    try {
      const r = await fetch(getApiUrl(`/api/dollar-wallet/wallets/${walletId}/transactions`), { headers });
      if (r.ok) setWalletDetail(await r.json());
    } catch (_) {}
    setWalletDetailLoading(false);
  };

  const openTransfer = (wallet: WalletData) => {
    setTransferFrom(wallet);
    setTransferToId(null);
    setTransferAmount("");
    setTransferNotes("");
    setTransferDate(TODAY);
    setShowTransfer(true);
  };

  const submitTransfer = async () => {
    if (!transferFrom || !transferToId || !transferAmount) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }
    const usd = parseFloat(transferAmount);
    if (isNaN(usd) || usd <= 0) { Alert.alert("Invalid Amount", "Amount must be greater than zero."); return; }
    setTransferLoading(true);
    try {
      const r = await fetch(getApiUrl("/api/dollar-wallet/wallets/transfer"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          fromWalletId: transferFrom.id,
          toWalletId:   transferToId,
          amountUsd:    transferAmount,
          notes:        transferNotes || null,
          date:         transferDate,
        }),
      });
      const data = await r.json();
      if (!r.ok) { Alert.alert("Transfer Failed", data.error ?? "Unknown error"); return; }
      setShowTransfer(false);
      await fetchAll();
      Alert.alert("Transfer Successful", data.message);
    } catch (e) {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setTransferLoading(false);
    }
  };

  const verifyWallet = async (wallet: WalletData) => {
    setVerifying(wallet.id);
    try {
      const r = await fetch(getApiUrl(`/api/dollar-wallet/wallets/${wallet.id}/verify`), { headers });
      const data = await r.json();
      if (!r.ok) { Alert.alert("Error", data.error ?? "Verification failed"); return; }
      const stored     = parseFloat(data.storedBalance);
      const calculated = parseFloat(data.calculatedBalance);
      const diff       = parseFloat(data.discrepancy);
      const icon       = data.isReconciled ? "✅" : "⚠️";
      const status     = data.isReconciled ? "Balance Verified" : "Discrepancy Found";
      Alert.alert(
        `${icon} ${status}`,
        [
          `Wallet: ${data.walletName}`,
          "",
          `Stored Balance:      $${stored.toFixed(2)}`,
          `Calculated Balance:  $${calculated.toFixed(2)}`,
          `Discrepancy:         $${Math.abs(diff).toFixed(2)} ${diff < 0 ? "(under)" : diff > 0 ? "(over)" : ""}`,
          "",
          `Total In:   $${parseFloat(data.totalIn).toFixed(2)}`,
          `Total Out:  $${parseFloat(data.totalOut).toFixed(2)}`,
          `Transactions: ${data.txCount}`,
        ].join("\n"),
        [{ text: "OK" }]
      );
    } catch (_) {
      Alert.alert("Error", "Network error during verification.");
    } finally {
      setVerifying(null);
    }
  };

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

  /* ═══════════════ WALLETS TAB ═══════════════ */
  const renderWalletsTab = () => (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} />}
    >
      {/* Section header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Feather name="briefcase" size={18} color="#0891B2" />
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0891B2" }}>USD Wallets</Text>
        <View style={{ marginLeft: "auto", backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>{wallets.length} wallets</Text>
        </View>
      </View>

      {wallets.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 60, gap: 10 }}>
          <Feather name="briefcase" size={40} color="#D1D5DB" />
          <Text style={{ color: "#9CA3AF", fontSize: 15 }}>No wallets found</Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center" }}>
            USD wallets are created automatically when you record purchases
          </Text>
        </View>
      ) : (
        wallets.map(w => (
          <View key={w.id} style={{
            backgroundColor: "#fff",
            borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB",
            marginBottom: 12, overflow: "hidden",
            shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
          }}>
            {/* Wallet color bar */}
            <View style={{ height: 4, backgroundColor: w.isActive ? "#0891B2" : "#9CA3AF" }} />
            <View style={{ padding: 16 }}>
              {/* Name + active badge */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#E0F2FE", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>💼</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>{w.name}</Text>
                    <Text style={{ fontSize: 11, color: "#6B7280" }}>{w.currency} Wallet</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: w.isActive ? "#DCFCE7" : "#F3F4F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: w.isActive ? "#059669" : "#6B7280" }}>
                    {w.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              {/* Balance */}
              <View style={{ backgroundColor: "#F0F9FF", borderRadius: 12, padding: 14, marginBottom: 14, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: "#0891B2", fontWeight: "600", marginBottom: 2 }}>Current Balance</Text>
                <Text style={{ fontSize: 32, fontWeight: "800", color: "#0891B2" }}>
                  {USD(parseFloat(w.balance || "0"))}
                </Text>
              </View>

              {/* Action buttons */}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  backgroundColor: "#0891B2", borderRadius: 12, paddingVertical: 12, marginBottom: 8 }}
                onPress={() => fetchWalletDetail(w.id)}
              >
                <Feather name="list" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>View Transactions</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8 }}>
                {/* Transfer button */}
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 11 }}
                  onPress={() => openTransfer(w)}
                  disabled={!w.isActive}
                >
                  <Feather name="send" size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Transfer</Text>
                </TouchableOpacity>

                {/* Verify button */}
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    backgroundColor: verifying === w.id ? "#6B7280" : "#059669", borderRadius: 12, paddingVertical: 11 }}
                  onPress={() => verifyWallet(w)}
                  disabled={verifying === w.id}
                >
                  {verifying === w.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="shield" size={15} color="#fff" />
                  }
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                    {verifying === w.id ? "Checking…" : "Verify"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
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
        {([["buy", "💰 Buy"], ["history", "📜 History"], ["wallets", "💼 Wallets"]] as [Tab, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={[s.tabItem, tab === k && s.tabItemActive]} onPress={() => setTab(k)}>
            <Text style={[s.tabLabel, tab === k && { color: colors.primary, fontWeight: "700" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "buy"     && renderBuyTab()}
      {tab === "history" && renderHistoryTab()}
      {tab === "wallets" && renderWalletsTab()}

      {/* ─── Wallet Detail Modal ─── */}
      <Modal visible={showWalletDetail} animationType="slide" onRequestClose={() => setShowWalletDetail(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal header */}
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#0891B2", paddingHorizontal: 16, paddingVertical: 14, paddingTop: insets.top + 14, gap: 12 }}>
            <TouchableOpacity onPress={() => setShowWalletDetail(false)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
                {walletDetail?.wallet.name ?? "Wallet"}
              </Text>
              <Text style={{ color: "#CFFAFE", fontSize: 12 }}>Transaction History</Text>
            </View>
            {walletDetail && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>
                  {USD(parseFloat(walletDetail.wallet.balance || "0"))}
                </Text>
                <Text style={{ color: "#CFFAFE", fontSize: 11 }}>Current Balance</Text>
              </View>
            )}
          </View>

          {walletDetailLoading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <ActivityIndicator size="large" color="#0891B2" />
              <Text style={{ color: colors.textSecondary }}>Loading transactions…</Text>
            </View>
          ) : !walletDetail ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.textSecondary }}>Failed to load wallet data</Text>
            </View>
          ) : (
            <FlatList
              data={walletDetail.transactions}
              keyExtractor={t => String(t.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              ListHeaderComponent={(
                <View>
                  {/* Summary grid */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1, backgroundColor: "#ECFDF5", borderRadius: 14, padding: 14, alignItems: "center" }}>
                      <Feather name="arrow-down-circle" size={16} color="#059669" style={{ marginBottom: 4 }} />
                      <Text style={{ fontSize: 16, fontWeight: "800", color: "#059669" }}>
                        {USD(parseFloat(walletDetail.summary.totalIn))}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Total In</Text>
                      <Text style={{ fontSize: 10, color: "#9CA3AF" }}>{PKR(parseFloat(walletDetail.summary.totalInPkr))}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, alignItems: "center" }}>
                      <Feather name="arrow-up-circle" size={16} color="#DC2626" style={{ marginBottom: 4 }} />
                      <Text style={{ fontSize: 16, fontWeight: "800", color: "#DC2626" }}>
                        {USD(parseFloat(walletDetail.summary.totalOut))}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Total Out</Text>
                      <Text style={{ fontSize: 10, color: "#9CA3AF" }}>{PKR(parseFloat(walletDetail.summary.totalOutPkr))}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    <View style={{ flex: 1.2, backgroundColor: "#F0F9FF", borderRadius: 14, padding: 14, alignItems: "center" }}>
                      <Feather name="trending-up" size={16} color="#0891B2" style={{ marginBottom: 4 }} />
                      <Text style={{ fontSize: 18, fontWeight: "800", color: "#0891B2" }}>
                        {USD(parseFloat(walletDetail.summary.netUsd))}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Net USD Flow</Text>
                    </View>
                    <View style={{ flex: 0.8, backgroundColor: "#F9FAFB", borderRadius: 14, padding: 14, alignItems: "center" }}>
                      <Feather name="activity" size={16} color="#6B7280" style={{ marginBottom: 4 }} />
                      <Text style={{ fontSize: 18, fontWeight: "800", color: "#374151" }}>
                        {walletDetail.summary.txCount}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Transactions</Text>
                    </View>
                  </View>

                  {/* Monthly breakdown */}
                  {walletDetail.monthly.length > 0 && (
                    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: "hidden" }}>
                      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="calendar" size={14} color="#0891B2" />
                        <Text style={{ fontWeight: "700", color: colors.text, fontSize: 13 }}>Monthly Breakdown</Text>
                      </View>
                      {walletDetail.monthly.map((m, i) => (
                        <View key={m.month} style={[{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                          <Text style={{ fontWeight: "700", color: colors.text, width: 60, fontSize: 12 }}>{m.month}</Text>
                          <View style={{ flex: 1 }}>
                            {m.in > 0 && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <Feather name="arrow-down" size={10} color="#059669" />
                                <Text style={{ fontSize: 12, color: "#059669", fontWeight: "600" }}>+{USD(m.in)}</Text>
                                <Text style={{ fontSize: 10, color: "#9CA3AF" }}>{PKR(m.inPkr)}</Text>
                              </View>
                            )}
                            {m.out > 0 && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Feather name="arrow-up" size={10} color="#DC2626" />
                                <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>-{USD(m.out)}</Text>
                                <Text style={{ fontSize: 10, color: "#9CA3AF" }}>{PKR(m.outPkr)}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, color: "#6B7280" }}>{m.count} tx</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={{ fontWeight: "700", color: colors.text, fontSize: 13, marginBottom: 10 }}>
                    All Transactions ({walletDetail.transactions.length})
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", padding: 40, gap: 10 }}>
                  <Feather name="inbox" size={36} color="#D1D5DB" />
                  <Text style={{ color: "#9CA3AF" }}>No transactions yet</Text>
                </View>
              }
              renderItem={({ item: t }) => {
                const isIn = t.entryType === "purchase";
                const amt = parseFloat(t.amountUsd);
                const pkr = parseFloat(t.totalPkr);
                const rate = parseFloat(t.rate);
                return (
                  <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: isIn ? "#059669" : "#DC2626", padding: 14, marginBottom: 10 }}>
                    {/* Top row */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: isIn ? "#DCFCE7" : "#FEE2E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name={isIn ? "arrow-down-circle" : "arrow-up-circle"} size={11} color={isIn ? "#059669" : "#DC2626"} />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: isIn ? "#059669" : "#DC2626" }}>
                            {isIn ? "IN" : "OUT"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t.entryType}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t.date}</Text>
                    </View>
                    {/* Amounts */}
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 20, fontWeight: "800", color: isIn ? "#059669" : "#DC2626" }}>
                        {isIn ? "+" : "-"}{USD(amt)}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.text, fontWeight: "600" }}>
                        = {PKR(pkr)}
                      </Text>
                      {rate > 0 && (
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>@ ₨{rate.toFixed(0)}</Text>
                      )}
                    </View>
                    {/* Party */}
                    {t.partyName && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <Feather name={t.partyType === "supplier" ? "truck" : "user"} size={11} color={colors.textSecondary} />
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t.partyName}</Text>
                      </View>
                    )}
                    {/* Notes */}
                    {t.notes && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: "italic" }} numberOfLines={2}>
                        📝 {t.notes}
                      </Text>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>

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

      {/* ─── Transfer Modal ─── */}
      <Modal visible={showTransfer} animationType="slide" transparent onRequestClose={() => setShowTransfer(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: "85%" }]}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Feather name="send" size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#1F2937" }}>Transfer USD</Text>
                <Text style={{ fontSize: 12, color: "#6B7280" }}>Move funds between wallets</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTransfer(false)}>
                <Feather name="x" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* From wallet (read-only) */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>FROM WALLET</Text>
              <View style={{ backgroundColor: "#EDE9FE", borderRadius: 10, padding: 14, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="briefcase" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#1F2937" }}>{transferFrom?.name}</Text>
                  <Text style={{ fontSize: 12, color: "#7C3AED" }}>
                    Available: {USD(parseFloat(transferFrom?.balance ?? "0"))}
                  </Text>
                </View>
              </View>

              {/* To wallet picker */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>TO WALLET</Text>
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 14, overflow: "hidden" }}>
                {wallets
                  .filter(w => w.id !== transferFrom?.id && w.isActive)
                  .map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10,
                        backgroundColor: transferToId === w.id ? "#EDE9FE" : "#fff",
                        borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}
                      onPress={() => setTransferToId(w.id)}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14,
                        backgroundColor: transferToId === w.id ? "#7C3AED" : "#F3F4F6",
                        alignItems: "center", justifyContent: "center" }}>
                        {transferToId === w.id
                          ? <Feather name="check" size={14} color="#fff" />
                          : <Feather name="briefcase" size={12} color="#6B7280" />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600",
                          color: transferToId === w.id ? "#7C3AED" : "#1F2937" }}>{w.name}</Text>
                        <Text style={{ fontSize: 11, color: "#6B7280" }}>{USD(parseFloat(w.balance || "0"))}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                }
              </View>

              {/* Amount */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>AMOUNT (USD)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12,
                  fontSize: 22, fontWeight: "800", color: "#1F2937", marginBottom: 14, textAlign: "center" }}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={transferAmount}
                onChangeText={setTransferAmount}
              />

              {/* Date */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>DATE</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12,
                  fontSize: 14, color: "#1F2937", marginBottom: 14 }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                value={transferDate}
                onChangeText={setTransferDate}
              />

              {/* Notes */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>NOTES (optional)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12,
                  fontSize: 14, color: "#1F2937", marginBottom: 20, minHeight: 60, textAlignVertical: "top" }}
                placeholder="Add a note…"
                placeholderTextColor="#9CA3AF"
                multiline
                value={transferNotes}
                onChangeText={setTransferNotes}
              />

              {/* Summary strip */}
              {transferAmount && !isNaN(parseFloat(transferAmount)) && parseFloat(transferAmount) > 0 && transferFrom && transferToId && (
                <View style={{ backgroundColor: "#F5F3FF", borderRadius: 10, padding: 12, marginBottom: 16, gap: 4 }}>
                  <Text style={{ fontSize: 12, color: "#7C3AED", fontWeight: "700" }}>Transfer Preview</Text>
                  <Text style={{ fontSize: 12, color: "#374151" }}>
                    {transferFrom.name}: {USD(parseFloat(transferFrom.balance))} → {USD(parseFloat(transferFrom.balance) - parseFloat(transferAmount || "0"))}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#374151" }}>
                    {wallets.find(w => w.id === transferToId)?.name ?? "—"}:{" "}
                    {USD(parseFloat(wallets.find(w => w.id === transferToId)?.balance ?? "0"))} → {USD(parseFloat(wallets.find(w => w.id === transferToId)?.balance ?? "0") + parseFloat(transferAmount || "0"))}
                  </Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={{ backgroundColor: transferLoading ? "#9CA3AF" : "#7C3AED", borderRadius: 12,
                  paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                onPress={submitTransfer}
                disabled={transferLoading}
              >
                {transferLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="send" size={16} color="#fff" />
                }
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {transferLoading ? "Transferring…" : "Confirm Transfer"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
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

import React, { useState, useMemo } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useListCredits, usePayCredit, useListAccounts, useListLocations, useListProducts,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth, isAdminOrAbove } from "@/context/AuthContext";

type Credit = {
  id: number; type: string; partyName: string; partyType: string;
  amount: string; paidAmount: string; remainingAmount: string;
  status: string; dueDate?: string | null; notes?: string | null;
  createdAt: string; locationId?: number | null; partyId: number;
};
type Account  = { id: number; name: string; type: string; balance: string };
type Location = { id: number; name: string };
type Product  = { id: number; name: string; unitPrice: string; stock: number; unit: string };
type MainTab  = "list" | "report";
type TypeFilter   = "all" | "receivable" | "payable";
type StatusFilter = "all" | "pending" | "partial" | "paid";
type PayMethod    = "account" | "dollar" | "coins_withdraw";

const fmt = (n: number) => {
  if (isNaN(n)) return "₨0";
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(0)}`;
};
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

export default function CreditsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const queryClient = useQueryClient();
  const canAdmin = isAdminOrAbove(user);

  const [mainTab, setMainTab]         = useState<MainTab>("list");
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [search, setSearch]           = useState("");

  const [selected, setSelected]         = useState<Credit | null>(null);
  const [payMethod, setPayMethod]       = useState<PayMethod>("account");
  const [payAmount, setPayAmount]       = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [dollarAmount, setDollarAmount] = useState("");
  const [dollarRate, setDollarRate]     = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQty, setProductQty]     = useState("");
  const [payNotes, setPayNotes]         = useState("");

  const { data: raw, isLoading, refetch } = useListCredits();
  const { data: accountsRaw }  = useListAccounts();
  const { data: locationsRaw } = useListLocations();
  const { data: productsRaw }  = useListProducts();
  const payMut = usePayCredit();

  const credits       = (raw ?? []) as unknown as Credit[];
  const accounts      = (accountsRaw ?? []) as unknown as Account[];
  const locations     = (locationsRaw ?? []) as unknown as Location[];
  const allProducts   = (productsRaw ?? []) as unknown as Product[];
  const stockProducts = allProducts.filter(p => p.stock > 0);

  const filtered = useMemo(() => credits.filter(c => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (locationFilter !== "all" && c.locationId !== locationFilter) return false;
    if (search && !c.partyName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [credits, typeFilter, statusFilter, locationFilter, search]);

  const receivable    = credits.filter(c => c.type === "receivable");
  const outstanding   = receivable.filter(c => c.status !== "paid").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const received      = receivable.reduce((s, c) => s + parseFloat(c.paidAmount), 0);
  const newAmt        = receivable.filter(c => c.status === "pending").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const partialAmt    = receivable.filter(c => c.status === "partial").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);

  const locationName = (id?: number | null) => locations.find(l => l.id === id)?.name ?? null;

  const openPayModal = (c: Credit) => {
    setSelected(c);
    setPayMethod("account");
    setPayAmount(parseFloat(c.remainingAmount).toFixed(2));
    setSelectedAccountId("");
    setDollarAmount("");
    setDollarRate("");
    setSelectedProduct(null);
    setProductQty("");
    setPayNotes("");
  };

  const dollarPkrValue = dollarAmount && dollarRate
    ? (parseFloat(dollarAmount) * parseFloat(dollarRate)).toFixed(2) : "";
  const coinsValue = selectedProduct && productQty
    ? (parseFloat(productQty) * parseFloat(selectedProduct.unitPrice)).toFixed(2) : "";

  const handlePay = async () => {
    if (!selected) return;
    let finalAmount = "0";
    if (payMethod === "account") {
      if (!payAmount || parseFloat(payAmount) <= 0) { Alert.alert("Error", "Enter valid amount"); return; }
      finalAmount = parseFloat(payAmount).toFixed(8);
    } else if (payMethod === "dollar") {
      if (!dollarAmount || !dollarRate || parseFloat(dollarAmount) <= 0 || parseFloat(dollarRate) <= 0) {
        Alert.alert("Error", "Enter valid dollar amount and rate"); return;
      }
      finalAmount = (parseFloat(dollarAmount) * parseFloat(dollarRate)).toFixed(8);
    } else if (payMethod === "coins_withdraw") {
      if (!selectedProduct || !productQty || parseFloat(productQty) <= 0) {
        Alert.alert("Error", "Select product and enter quantity"); return;
      }
      finalAmount = (parseFloat(productQty) * parseFloat(selectedProduct.unitPrice)).toFixed(8);
    }

    if (parseFloat(finalAmount) > parseFloat(selected.remainingAmount) + 0.01) {
      Alert.alert("Error", "Amount exceeds remaining balance"); return;
    }

    try {
      const body: Record<string, unknown> = {
        payAmount: finalAmount, paymentMethod: payMethod, notes: payNotes || null,
      };
      if (payMethod === "account" && selectedAccountId) body.accountId = parseInt(selectedAccountId);
      if (payMethod === "dollar") {
        body.dollarAmount = parseFloat(dollarAmount).toFixed(8);
        body.dollarRate   = parseFloat(dollarRate).toFixed(8);
      }
      if (payMethod === "coins_withdraw" && selectedProduct) {
        body.productId       = selectedProduct.id;
        body.productName     = selectedProduct.name;
        body.productQty      = parseFloat(productQty).toFixed(8);
        body.productValuePkr = finalAmount;
      }

      await (payMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: selected.id, data: body });
      queryClient.invalidateQueries();
      setSelected(null);
      Alert.alert("✅ Payment Recorded",
        payMethod === "account" ? `₨${parseFloat(finalAmount).toLocaleString()} via account`
        : payMethod === "dollar" ? `$${dollarAmount} @ ₨${dollarRate} = ₨${parseFloat(finalAmount).toLocaleString()}`
        : `${productQty} ${selectedProduct?.unit} of ${selectedProduct?.name} → ₨${parseFloat(finalAmount).toLocaleString()}`
      );
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const statusMeta = (c: Credit) => {
    if (c.status === "paid")    return { label: "Received", color: "#059669", bg: "#F0FDF4" };
    if (c.status === "partial") return { label: "Partial",  color: "#F59E0B", bg: "#FFFBEB" };
    return c.type === "receivable"
      ? { label: "New",     color: colors.primary, bg: colors.secondary }
      : { label: "Payable", color: "#DC2626",      bg: "#FEF2F2" };
  };

  const handleExport = () => {
    const lines = ["Party,Type,Status,Total Amount,Paid,Remaining,Date"];
    filtered.forEach(c => {
      lines.push(`"${c.partyName}","${c.type}","${c.status}",${c.amount},${c.paidAmount},${c.remainingAmount},"${c.createdAt.slice(0,10)}"`);
    });
    Share.share({ message: lines.join("\n"), title: "Credits Report" });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ─── Header + stats ─────────────────────────────────────────────── */}
      <View style={{ backgroundColor: colors.primary, paddingTop: topPad + 8, paddingBottom: 14, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>Credits</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["list", "report"] as MainTab[]).map(t => (
              <TouchableOpacity key={t} onPress={() => setMainTab(t)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
                  backgroundColor: mainTab === t ? "rgba(255,255,255,0.25)" : "transparent" }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFF" }}>
                  {t === "list" ? "📋 List" : "📊 Report"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <StatCard label="Outstanding" value={fmt(outstanding)}
            sub={`${receivable.filter(c => c.status !== "paid").length} unpaid`} />
          <StatCard label="Received" value={fmt(received)}
            sub={`${receivable.filter(c => c.status === "paid").length} done`} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <StatCard label="New Credits" value={fmt(newAmt)}
            sub={`${receivable.filter(c => c.status === "pending").length} new`} />
          <StatCard label="Partially Paid" value={fmt(partialAmt)}
            sub={`${receivable.filter(c => c.status === "partial").length} partial`} />
        </View>
      </View>

      {mainTab === "list" ? (
        <>
          {/* ─── Filters ─────────────────────────────────────────────────── */}
          <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, gap: 8 }}>
              {([["all","All"],["receivable","📥 Receivable"],["payable","📤 Payable"]] as [TypeFilter,string][]).map(([k,l]) => (
                <FilterChip key={k} label={l} active={typeFilter===k} color={colors.primary} colors={colors} onPress={()=>setTypeFilter(k)} />
              ))}
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 2 }} />
              {([["all","All"],["pending","🆕 New"],["partial","⏳ Partial"],["paid","✅ Done"]] as [StatusFilter,string][]).map(([k,l]) => (
                <FilterChip key={k} label={l} active={statusFilter===k} color="#059669" colors={colors} onPress={()=>setStatusFilter(k)} />
              ))}
            </ScrollView>
            {canAdmin && locations.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8, gap: 8 }}>
                <FilterChip label="📍 All Apps" active={locationFilter==="all"} color="#7C3AED" colors={colors} onPress={()=>setLocationFilter("all")} />
                {locations.map(l=>(
                  <FilterChip key={l.id} label={`📍 ${l.name}`} active={locationFilter===l.id} color="#7C3AED" colors={colors} onPress={()=>setLocationFilter(l.id)} />
                ))}
              </ScrollView>
            )}
            <View style={[styles.searchRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={{ fontSize: 13 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search by party name..."
                placeholderTextColor={colors.mutedForeground}
                value={search} onChangeText={setSearch}
              />
              {search ? <TouchableOpacity onPress={()=>setSearch("")}><Text style={{ color: colors.mutedForeground, fontSize: 18 }}>×</Text></TouchableOpacity> : null}
            </View>
          </View>

          {/* ─── List ────────────────────────────────────────────────────── */}
          {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
            <FlatList
              data={filtered}
              keyExtractor={i => String(i.id)}
              refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
              contentContainerStyle={{ padding: 14, paddingBottom: 100, gap: 10 }}
              ListHeaderComponent={filtered.length > 0 ?
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                  {filtered.length} credit{filtered.length !== 1 ? "s" : ""}
                </Text> : null}
              ListEmptyComponent={
                <View style={{ alignItems: "center", padding: 40 }}>
                  <Text style={{ fontSize: 44 }}>📋</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, marginTop: 12 }}>No credits</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 4 }}>
                    {search ? "No matching credits" : "No credits in this filter"}
                  </Text>
                </View>
              }
              renderItem={({ item: c }) => {
                const meta = statusMeta(c);
                const pct = parseFloat(c.amount) > 0 ? (parseFloat(c.paidAmount) / parseFloat(c.amount)) * 100 : 0;
                const canPay = c.status !== "paid";
                const locName = locationName(c.locationId);
                return (
                  <TouchableOpacity
                    style={[styles.card, { backgroundColor: colors.card, borderColor: canPay ? colors.border : "#DCFCE7", borderLeftWidth: 4, borderLeftColor: meta.color }]}
                    onPress={() => canPay && openPayModal(c)}
                    activeOpacity={canPay ? 0.75 : 1}
                  >
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: meta.color }}>
                          {c.partyName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }} numberOfLines={1}>{c.partyName}</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: meta.color }}>{meta.label}</Text>
                              </View>
                              <View style={[styles.badge, { backgroundColor: c.type === "receivable" ? "#EFF6FF" : "#FEF2F2" }]}>
                                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: c.type === "receivable" ? "#2563EB" : "#DC2626" }}>
                                  {c.type === "receivable" ? "↓ Receive" : "↑ Pay"}
                                </Text>
                              </View>
                              {locName && <View style={[styles.badge, { backgroundColor: "#F3F4F6" }]}><Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#6B7280" }}>📍 {locName}</Text></View>}
                            </View>
                          </View>
                          <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: meta.color }}>{fmt(parseFloat(c.remainingAmount))}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>remaining</Text>
                          </View>
                        </View>

                        {parseFloat(c.paidAmount) > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 3 }}>
                              <View style={{ height: 5, width: `${Math.min(100, pct)}%` as unknown as number, backgroundColor: meta.color, borderRadius: 3 }} />
                            </View>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>Paid: {fmt(parseFloat(c.paidAmount))}</Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>Total: {fmt(parseFloat(c.amount))}</Text>
                            </View>
                          </View>
                        )}
                        {parseFloat(c.paidAmount) === 0 && (
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                            Total: {fmt(parseFloat(c.amount))} · No payments yet
                          </Text>
                        )}
                        {c.dueDate && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#F59E0B", marginTop: 4 }}>⏰ Due: {c.dueDate}</Text>}
                      </View>
                    </View>

                    {canPay && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary }}>💳 Tap to pay · Account · Dollar · Coins</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : (
        <ReportTab credits={credits} locations={locations} colors={colors} onExport={handleExport} canAdmin={canAdmin} />
      )}

      {/* ─── PAY MODAL ──────────────────────────────────────────────────── */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "96%" }}>
            {selected && (
              <ScrollView>
                {/* Modal header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Record Payment</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>
                      {selected.partyName} · Remaining: {fmt(parseFloat(selected.remainingAmount))}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>×</Text>
                  </TouchableOpacity>
                </View>

                {/* Credit summary row */}
                <View style={{ flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 }}>
                  <MiniStat label="TOTAL"  value={fmt(parseFloat(selected.amount))}          color={colors.text}    bg={colors.secondary} />
                  <MiniStat label="PAID"   value={fmt(parseFloat(selected.paidAmount))}       color="#059669"        bg="#F0FDF4" />
                  <MiniStat label="LEFT"   value={fmt(parseFloat(selected.remainingAmount))}  color={colors.primary} bg={colors.secondary} />
                </View>

                <View style={{ padding: 16 }}>
                  {/* Payment method tabs */}
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>Payment Method</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
                    {([
                      ["account",       "🏦 Account",       colors.primary],
                      ["dollar",        "💵 Dollar",         "#059669"],
                      ["coins_withdraw","🪙 Coins Withdraw", "#D97706"],
                    ] as [PayMethod, string, string][]).map(([k, label, color]) => (
                      <TouchableOpacity key={k} onPress={() => setPayMethod(k)}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2,
                          backgroundColor: payMethod === k ? color : colors.input,
                          borderColor: payMethod === k ? color : colors.border, alignItems: "center" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: payMethod === k ? "#FFF" : colors.mutedForeground, textAlign: "center" }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* ─── Account ─────────────────────────────────────────── */}
                  {payMethod === "account" && (
                    <>
                      <ModalLabel text="Amount (₨)" />
                      <AmountInput value={payAmount} onChange={setPayAmount} remaining={parseFloat(selected.remainingAmount)} colors={colors} />
                      {accounts.length > 0 && (
                        <>
                          <ModalLabel text="Receive into Account (optional)" />
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                              <AccountChip label="Cash / None" selected={selectedAccountId === ""} onPress={() => setSelectedAccountId("")} colors={colors} />
                              {accounts.map(a => (
                                <AccountChip key={a.id} label={`${a.name}`} sub={fmt(parseFloat(a.balance))} selected={selectedAccountId === String(a.id)} onPress={() => setSelectedAccountId(String(a.id))} colors={colors} />
                              ))}
                            </View>
                          </ScrollView>
                        </>
                      )}
                    </>
                  )}

                  {/* ─── Dollar ──────────────────────────────────────────── */}
                  {payMethod === "dollar" && (
                    <>
                      <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#DCFCE7" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#059669", marginBottom: 4 }}>💵 Dollar Payment</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#065F46" }}>
                          Customer pays in USD. Enter amount and exchange rate — PKR value auto-calculates and reduces the credit.
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <ModalLabel text="Amount (USD $)" />
                          <TextInput
                            style={[styles.modalInput, { borderColor: "#059669" }]}
                            value={dollarAmount}
                            onChangeText={v => { setDollarAmount(v); if (v && dollarRate) setPayAmount((parseFloat(v) * parseFloat(dollarRate)).toFixed(2)); }}
                            keyboardType="decimal-pad" placeholder="0.00"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ModalLabel text="Rate (₨ per $)" />
                          <TextInput
                            style={[styles.modalInput, { borderColor: "#059669" }]}
                            value={dollarRate}
                            onChangeText={v => { setDollarRate(v); if (dollarAmount && v) setPayAmount((parseFloat(dollarAmount) * parseFloat(v)).toFixed(2)); }}
                            keyboardType="decimal-pad" placeholder="278.00"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                      </View>
                      {dollarPkrValue && (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#1D4ED8" }}>
                            {fmtUsd(parseFloat(dollarAmount))} × ₨{dollarRate} =
                          </Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#1D4ED8" }}>
                            ₨{parseFloat(dollarPkrValue).toLocaleString()}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {/* ─── Coins Withdraw ──────────────────────────────────── */}
                  {payMethod === "coins_withdraw" && (
                    <>
                      <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#FEF3C7" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#D97706", marginBottom: 4 }}>🪙 Coins / Stock Withdrawal</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#92400E" }}>
                          Customer returns product as payment. Qty × unit price = credit reduction. Stock is deducted automatically.
                        </Text>
                      </View>
                      <ModalLabel text="Select Product" />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                          {stockProducts.length === 0 ? (
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>No products in stock</Text>
                          ) : stockProducts.map(p => (
                            <TouchableOpacity key={p.id} onPress={() => setSelectedProduct(p)}
                              style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 2,
                                backgroundColor: selectedProduct?.id === p.id ? "#D97706" : colors.input,
                                borderColor: selectedProduct?.id === p.id ? "#D97706" : colors.border, minWidth: 100 }}>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: selectedProduct?.id === p.id ? "#FFF" : colors.text }} numberOfLines={1}>{p.name}</Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: selectedProduct?.id === p.id ? "rgba(255,255,255,0.8)" : colors.mutedForeground }}>
                                {fmt(parseFloat(p.unitPrice))}/{p.unit}
                              </Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: selectedProduct?.id === p.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }}>
                                🏪 {p.stock} in stock
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      {selectedProduct && (
                        <>
                          <ModalLabel text={`Quantity (${selectedProduct.unit})`} />
                          <TextInput
                            style={[styles.modalInput, { borderColor: "#D97706", marginBottom: 8 }]}
                            value={productQty}
                            onChangeText={setProductQty}
                            keyboardType="decimal-pad" placeholder="0"
                            placeholderTextColor={colors.mutedForeground}
                          />
                          {coinsValue && (
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFBEB", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#D97706" }}>
                                {productQty} × {fmt(parseFloat(selectedProduct.unitPrice))} =
                              </Text>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#D97706" }}>
                                ₨{parseFloat(coinsValue).toLocaleString()}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* Notes */}
                  <ModalLabel text="Notes (optional)" />
                  <TextInput
                    style={[styles.modalInput, { marginBottom: 20 }]}
                    value={payNotes} onChangeText={setPayNotes}
                    placeholder="Payment notes..."
                    placeholderTextColor={colors.mutedForeground}
                  />

                  {/* Confirm */}
                  <TouchableOpacity
                    style={{ backgroundColor: payMethod === "account" ? "#059669" : payMethod === "dollar" ? "#1D4ED8" : "#D97706",
                      paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 8 }}
                    onPress={handlePay}
                  >
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" }}>
                      {payMethod === "account" ? "✅ Confirm Payment" : payMethod === "dollar" ? "💵 Confirm Dollar Receipt" : "🪙 Confirm Coins Withdraw"}
                    </Text>
                    {payMethod === "dollar" && dollarPkrValue && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>
                        {fmtUsd(parseFloat(dollarAmount || "0"))} → ₨{parseFloat(dollarPkrValue).toLocaleString()}
                      </Text>
                    )}
                    {payMethod === "coins_withdraw" && coinsValue && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>
                        {productQty} {selectedProduct?.unit} of {selectedProduct?.name}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={{ alignItems: "center", paddingVertical: 12, marginBottom: 20 }} onPress={() => setSelected(null)}>
                    <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Report Tab ─────────────────────────────────────────────────────────── */
function ReportTab({ credits, locations, colors, onExport, canAdmin }: {
  credits: Credit[];
  locations: Location[];
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onExport: () => void;
  canAdmin: boolean;
}) {
  const [locFilter, setLocFilter]   = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "receivable" | "payable">("all");

  const f = credits.filter(c => {
    if (locFilter !== "all" && c.locationId !== locFilter) return false;
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    return true;
  });

  const totalAmount    = f.reduce((s, c) => s + parseFloat(c.amount), 0);
  const totalPaid      = f.reduce((s, c) => s + parseFloat(c.paidAmount), 0);
  const totalRemaining = f.reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const newAmt         = f.filter(c => c.status === "pending").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const partialAmt     = f.filter(c => c.status === "partial").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const paidAmt        = f.filter(c => c.status === "paid").reduce((s, c) => s + parseFloat(c.amount), 0);
  const receivableAmt  = f.filter(c => c.type === "receivable").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);
  const payableAmt     = f.filter(c => c.type === "payable").reduce((s, c) => s + parseFloat(c.remainingAmount), 0);

  const fmt = (n: number) => {
    if (isNaN(n)) return "₨0";
    if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
    return `₨${n.toFixed(0)}`;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      {/* Filters */}
      {canAdmin && locations.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Filter by App</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([["all","All Apps"]] as [string,string][]).concat(locations.map(l=>[String(l.id),l.name])).map(([k,label])=>(
                <FilterChip key={k} label={label} active={String(locFilter)===k} color="#7C3AED" colors={colors}
                  onPress={()=>setLocFilter(k==="all"?"all":parseInt(k))} />
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {([["all","All"],["receivable","Receivable"],["payable","Payable"]] as ["all"|"receivable"|"payable",string][]).map(([k,l])=>(
          <FilterChip key={k} label={l} active={typeFilter===k} color={colors.primary} colors={colors} onPress={()=>setTypeFilter(k)} />
        ))}
      </View>

      {/* Overview */}
      <RSection title="📊 Overview" />
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
        <RRow label="Total Credit Amount"  value={fmt(totalAmount)}    colors={colors} />
        <RRow label="Total Collected"      value={fmt(totalPaid)}      colors={colors} valueColor="#059669" />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
        <RRow label="Outstanding Balance"  value={fmt(totalRemaining)} colors={colors} valueColor={colors.credit} bold />
      </View>

      {/* By status */}
      <RSection title="📋 By Status" />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={[styles.reportCard, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.primary+"22" }]}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: colors.primary, marginBottom: 4 }}>🆕 NEW</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.primary }}>{fmt(newAmt)}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>{f.filter(c=>c.status==="pending").length} credits</Text>
        </View>
        <View style={[styles.reportCard, { flex: 1, backgroundColor: "#FFFBEB", borderColor: "#FEF3C7" }]}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#D97706", marginBottom: 4 }}>⏳ PARTIAL</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#D97706" }}>{fmt(partialAmt)}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#92400E", marginTop: 2 }}>{f.filter(c=>c.status==="partial").length} credits</Text>
        </View>
        <View style={[styles.reportCard, { flex: 1, backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" }]}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#059669", marginBottom: 4 }}>✅ DONE</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#059669" }}>{fmt(paidAmt)}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#065F46", marginTop: 2 }}>{f.filter(c=>c.status==="paid").length} credits</Text>
        </View>
      </View>

      {/* Receivable vs Payable */}
      <RSection title="↕️ Take / Give" />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={[styles.reportCard, { flex: 1, backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#2563EB", marginBottom: 4 }}>📥 TO TAKE</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#2563EB" }}>{fmt(receivableAmt)}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#1E40AF", marginTop: 2 }}>Customers owe you</Text>
        </View>
        <View style={[styles.reportCard, { flex: 1, backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#DC2626", marginBottom: 4 }}>📤 TO GIVE</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#DC2626" }}>{fmt(payableAmt)}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#991B1B", marginTop: 2 }}>You owe suppliers</Text>
        </View>
      </View>

      {/* Opening/Closing */}
      <RSection title="📅 Opening / Closing Balance" />
      <View style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
        <RRow label="Opening (Total Credits Given)"  value={fmt(totalAmount)}    colors={colors} />
        <RRow label="Recovered (Total Paid)"         value={fmt(totalPaid)}      colors={colors} valueColor="#059669" />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
        <RRow label="Closing (Still Outstanding)"    value={fmt(totalRemaining)} colors={colors} valueColor="#DC2626" bold />
      </View>

      {/* Top parties */}
      <RSection title="👥 Top Outstanding" />
      {f.filter(c => c.status !== "paid").sort((a,b) => parseFloat(b.remainingAmount)-parseFloat(a.remainingAmount)).slice(0,10).map(c => (
        <View key={c.id} style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{c.partyName}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                {c.type === "receivable" ? "📥 Owes you" : "📤 You owe"} · {c.status}
              </Text>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: c.type === "receivable" ? "#2563EB" : "#DC2626" }}>
              {fmt(parseFloat(c.remainingAmount))}
            </Text>
          </View>
          {parseFloat(c.paidAmount) > 0 && (
            <View style={{ marginTop: 6, height: 3, backgroundColor: colors.border, borderRadius: 2 }}>
              <View style={{ height: 3, width: `${Math.min(100,(parseFloat(c.paidAmount)/parseFloat(c.amount))*100)}%` as unknown as number, backgroundColor: "#059669", borderRadius: 2 }} />
            </View>
          )}
        </View>
      ))}

      {/* Export */}
      <TouchableOpacity
        style={{ backgroundColor: "#059669", paddingVertical: 16, borderRadius: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 12 }}
        onPress={onExport}
      >
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF" }}>📤 Export CSV</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ─── Helper components ─────────────────────────────────────────────────── */
function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 12 }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF", marginTop: 2 }}>{value}</Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function MiniStat({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 10, padding: 10, alignItems: "center" }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color, letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function FilterChip({ label, active, color, colors, onPress }: {
  label: string; active: boolean; color: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
        backgroundColor: active ? color : colors.input, borderColor: active ? color : colors.border }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: active ? "#FFF" : colors.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  );
}

function AccountChip({ label, sub, selected, onPress, colors }: {
  label: string; sub?: string; selected: boolean; onPress: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5,
        backgroundColor: selected ? colors.primary : colors.input,
        borderColor: selected ? colors.primary : colors.border, minWidth: 80, alignItems: "center" }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: selected ? "#FFF" : colors.text }}>{label}</Text>
      {sub && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: selected ? "rgba(255,255,255,0.7)" : colors.mutedForeground }}>{sub}</Text>}
    </TouchableOpacity>
  );
}

function AmountInput({ value, onChange, remaining, colors }: {
  value: string; onChange: (v: string) => void; remaining: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <TextInput
        style={[styles.modalInput, { fontFamily: "Inter_700Bold", fontSize: 20, borderColor: colors.primary }]}
        value={value} onChangeText={onChange}
        keyboardType="decimal-pad" placeholder="0.00"
        placeholderTextColor={colors.mutedForeground}
      />
      <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
        {[25, 50, 75, 100].map(p => (
          <TouchableOpacity key={p} onPress={() => onChange((remaining * p / 100).toFixed(2))}
            style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 8, paddingVertical: 7, alignItems: "center", borderWidth: 1, borderColor: colors.primary + "33" }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary }}>{p}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ModalLabel({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{text}</Text>;
}

function RSection({ title }: { title: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

function RRow({ label, value, colors, bold, valueColor }: {
  label: string; value: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  bold?: boolean; valueColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ fontFamily: bold ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 13, color: colors.mutedForeground, flex: 1 }}>{label}</Text>
      <Text style={{ fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold", fontSize: 14, color: valueColor ?? colors.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 10, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, height: 40, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  modalInput: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 14 },
  reportCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
});

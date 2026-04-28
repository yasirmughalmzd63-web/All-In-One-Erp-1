import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch, useListAccounts, useListProducts, useListSuppliers, useListCustomers } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type DollarEntry = {
  id: number;
  entryType: string;
  amountUsd: string;
  rate: string;
  totalPkr: string;
  partyName: string | null;
  notes: string | null;
  date: string;
  createdAt: string;
};

const ENTRY_TYPES: { key: string; label: string; desc: string; sign: 1 | -1; color: string; bg: string; icon: string }[] = [
  { key: "received",  label: "Received USD",      desc: "Customer paid in dollars",    sign:  1, color: "#16A34A", bg: "#DCFCE7", icon: "arrow-down-circle" },
  { key: "product",   label: "Sent Product",       desc: "Goods given — deduct USD",    sign: -1, color: "#DC2626", bg: "#FEE2E2", icon: "package" },
  { key: "partial",   label: "Partial Payment",    desc: "Part cash, part credit",      sign:  1, color: "#0891B2", bg: "#ECFEFF", icon: "divide-circle" },
  { key: "recovery",  label: "Credit Recovery",    desc: "Old credit recovered as USD", sign:  1, color: "#7C3AED", bg: "#F3E8FF", icon: "refresh-cw" },
  { key: "purchase",  label: "Bought USD",         desc: "Bought from market account",   sign:  1, color: "#0EA5E9", bg: "#E0F2FE", icon: "shopping-bag" },
  { key: "topup",     label: "Coin Top-up",        desc: "USD spent on coin stock",      sign: -1, color: "#9333EA", bg: "#F3E8FF", icon: "zap" },
];

type Account = { id: number; name: string; type: string; currency: string; balance: string };
type Product = { id: number; name: string; unit: string; stock: number; costPrice: string; unitPrice: string; wholesalePrice: string };
type Wallet = { id: number; name: string; type: string; currency: string; balance: string };
type Party = { id: number; name: string };

const emptyBuyForm = {
  amountUsd: "",
  rate: "",
  accountId: "",
  walletId: "",
  partyType: "supplier" as "supplier" | "customer",
  partyId: "",
  notes: "",
  date: new Date().toISOString().split("T")[0]!,
};
const emptyTopupForm = {
  productId: "",
  walletId: "",
  partyType: "supplier" as "supplier" | "customer",
  partyId: "",
  amountUsd: "",
  coinsPerUsd: "6000",
  exchangeRatePkr: "333.33",
  costPricePkr: "0.0556",
  salePricePkr: "",
  wholesalePricePkr: "",
  notes: "",
  date: new Date().toISOString().split("T")[0]!,
};

const emptyForm = {
  entryType: "received",
  amountUsd: "",
  rate: "",
  partyName: "",
  notes: "",
  date: new Date().toISOString().split("T")[0]!,
};

const WALLET_KEY = "/api/dollar-wallet";

async function loadEntries(): Promise<DollarEntry[]> {
  try { return await customFetch<DollarEntry[]>(WALLET_KEY); } catch { return []; }
}

async function saveEntry(body: object): Promise<void> {
  await customFetch<DollarEntry>(WALLET_KEY, { method: "POST", body: JSON.stringify(body) });
}

async function deleteEntry(id: number): Promise<void> {
  await customFetch<void>(`${WALLET_KEY}/${id}`, { method: "DELETE" });
}

export default function WalletsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [entries, setEntries] = useState<DollarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [buyForm, setBuyForm] = useState(emptyBuyForm);
  const [topupForm, setTopupForm] = useState(emptyTopupForm);
  const [saving, setSaving] = useState(false);

  const { data: accountsRaw } = useListAccounts();
  const { data: productsRaw } = useListProducts();
  const { data: suppliersRaw } = useListSuppliers();
  const { data: customersRaw } = useListCustomers();
  const accounts = (accountsRaw ?? []) as unknown as Account[];
  const products = (productsRaw ?? []) as unknown as Product[];
  const suppliers = (suppliersRaw ?? []) as unknown as Party[];
  const customers = (customersRaw ?? []) as unknown as Party[];

  const [dollarWallets, setDollarWallets] = useState<Wallet[]>([]);
  const loadWallets = async () => {
    try {
      const w = await customFetch<Wallet[]>("/api/dollar-wallet/wallets");
      setDollarWallets(w);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadWallets(); }, []);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await loadEntries();
    setEntries(data);
    setLoading(false);
    setRefreshing(false);
  };

  React.useEffect(() => { load(); }, []);

  const params = useLocalSearchParams<{ topup?: string }>();
  useEffect(() => {
    if (params.topup) {
      setTopupForm(f => ({ ...f, productId: String(params.topup) }));
      setShowTopupModal(true);
    }
  }, [params.topup]);

  const handleBuyUsd = async () => {
    if (!buyForm.amountUsd || !buyForm.rate || !buyForm.accountId || !buyForm.walletId || !buyForm.partyId || !buyForm.date) {
      Alert.alert("Error", "Amount, rate, dollar wallet, party, account and date are all required");
      return;
    }
    setSaving(true);
    try {
      await customFetch("/api/dollar-wallet/purchase", {
        method: "POST",
        body: JSON.stringify({
          amountUsd: buyForm.amountUsd,
          rate: buyForm.rate,
          accountId: parseInt(buyForm.accountId, 10),
          walletId: parseInt(buyForm.walletId, 10),
          partyType: buyForm.partyType,
          partyId: parseInt(buyForm.partyId, 10),
          date: buyForm.date,
          notes: buyForm.notes || null,
        }),
      });
      setShowBuyModal(false);
      setBuyForm(emptyBuyForm);
      load();
      loadWallets();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to buy USD");
    }
    setSaving(false);
  };

  const handleTopup = async () => {
    if (!topupForm.productId || !topupForm.walletId || !topupForm.amountUsd || !topupForm.coinsPerUsd || !topupForm.exchangeRatePkr || !topupForm.date) {
      Alert.alert("Error", "Coin, dollar wallet, USD amount, coins per USD, PKR rate and date are required");
      return;
    }
    if (!topupForm.partyId) {
      Alert.alert("Pick party", "Choose which supplier or customer is selling you the coins.");
      return;
    }
    const selWallet = dollarWallets.find(x => String(x.id) === topupForm.walletId);
    const needUsd = parseFloat(topupForm.amountUsd);
    if (!selWallet || parseFloat(selWallet.balance) < needUsd) {
      Alert.alert(
        "Insufficient dollars",
        selWallet
          ? `${selWallet.name} only has $${parseFloat(selWallet.balance).toFixed(2)} but you need $${needUsd.toFixed(2)}.\n\nBuy more USD into this wallet first.`
          : "Pick a dollar wallet first."
      );
      return;
    }
    setSaving(true);
    try {
      const res = await customFetch<{ qty: number; newStock: number }>("/api/dollar-wallet/topup", {
        method: "POST",
        body: JSON.stringify({
          productId: parseInt(topupForm.productId, 10),
          walletId: parseInt(topupForm.walletId, 10),
          partyType: topupForm.partyType,
          partyId: parseInt(topupForm.partyId, 10),
          amountUsd: topupForm.amountUsd,
          coinsPerUsd: topupForm.coinsPerUsd,
          exchangeRatePkr: topupForm.exchangeRatePkr,
          costPricePkr: topupForm.costPricePkr || null,
          salePricePkr: topupForm.salePricePkr || null,
          wholesalePricePkr: topupForm.wholesalePricePkr || null,
          date: topupForm.date,
          notes: topupForm.notes || null,
        }),
      });
      Alert.alert("Top-up complete", `Added ${res.qty} coins · new stock ${res.newStock}`);
      setShowTopupModal(false);
      setTopupForm(emptyTopupForm);
      load();
      loadWallets();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to top-up coins");
    }
    setSaving(false);
  };

  const topupQty = topupForm.amountUsd && topupForm.coinsPerUsd
    ? Math.floor(parseFloat(topupForm.amountUsd) * parseFloat(topupForm.coinsPerUsd))
    : 0;
  const topupPkr = topupForm.amountUsd && topupForm.exchangeRatePkr
    ? parseFloat(topupForm.amountUsd) * parseFloat(topupForm.exchangeRatePkr)
    : 0;
  const buyPkr = buyForm.amountUsd && buyForm.rate
    ? parseFloat(buyForm.amountUsd) * parseFloat(buyForm.rate)
    : 0;

  const totalUsd = entries.reduce((sum, e) => {
    const et = ENTRY_TYPES.find(t => t.key === e.entryType);
    return sum + (et?.sign ?? 1) * parseFloat(e.amountUsd);
  }, 0);

  const lastRate = entries.length > 0 ? parseFloat(entries[0]!.rate) : 0;
  const totalPkr = totalUsd * lastRate;

  const totalInBase = form.amountUsd && form.rate
    ? (parseFloat(form.amountUsd || "0") * parseFloat(form.rate || "0")).toFixed(2)
    : "0.00";

  const handleSave = async () => {
    if (!form.amountUsd || !form.rate || !form.date) {
      Alert.alert("Error", "Amount, rate and date are required");
      return;
    }
    setSaving(true);
    try {
      await saveEntry({
        entryType: form.entryType,
        amountUsd: parseFloat(form.amountUsd).toFixed(8),
        rate: parseFloat(form.rate).toFixed(8),
        totalPkr: (parseFloat(form.amountUsd) * parseFloat(form.rate)).toFixed(8),
        partyName: form.partyName || null,
        notes: form.notes || null,
        date: form.date,
      });
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = (item: DollarEntry) => {
    Alert.alert("Delete Entry", "Remove this dollar wallet entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try { await deleteEntry(item.id); load(); }
          catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: DollarEntry }) => {
    const et = ENTRY_TYPES.find(t => t.key === item.entryType);
    const sign = et?.sign ?? 1;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardRow}>
          <View style={[styles.iconBox, { backgroundColor: et?.bg ?? colors.secondary }]}>
            
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {et?.label ?? item.entryType}
              {item.partyName ? <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> — {item.partyName}</Text> : null}
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Rate: {parseFloat(item.rate).toFixed(2)} • {item.date}
            </Text>
            {item.notes ? <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{item.notes}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={[styles.usdAmt, { color: sign > 0 ? colors.success : colors.danger }]}>
              {sign > 0 ? "+" : "-"}{parseFloat(item.amountUsd).toFixed(2)} USD
            </Text>
            <Text style={[styles.pkrAmt, { color: colors.mutedForeground }]}>
              ₨{parseFloat(item.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
            {isAdmin && (
              <TouchableOpacity style={[styles.delBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(item)}>
                
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const selectedType = ENTRY_TYPES.find(t => t.key === form.entryType);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0369A1", "#0891B2"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.headerTitle}>Dollar Wallet</Text>
        <Text style={styles.headerSub}>USD ledger with PKR exchange</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>DOLLAR BALANCE</Text>
            <Text style={[styles.balValue, { color: totalUsd >= 0 ? "#4ADE80" : "#F87171" }]}>
              {totalUsd >= 0 ? "+" : ""}{totalUsd.toFixed(2)} USD
            </Text>
          </View>
          <View style={[styles.balCard, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Text style={styles.balLabel}>IN PKR ({lastRate > 0 ? `@${lastRate.toFixed(0)}` : "set rate"})</Text>
            <Text style={styles.balValue}>
              ₨{totalPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>
        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => setShowBuyModal(true)}>
            
            <Text style={styles.quickText}>Buy USD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: "rgba(147,51,234,0.85)" }]} onPress={() => setShowTopupModal(true)}>
            
            <Text style={styles.quickText}>Top-up Coins</Text>
          </TouchableOpacity>
        </View>

        {dollarWallets.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 }}>
              MY {dollarWallets.length} DOLLAR WALLETS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {dollarWallets.map(w => (
                  <View key={w.id} style={{
                    backgroundColor: "rgba(255,255,255,0.18)",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    minWidth: 110,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.25)",
                  }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFF" }} numberOfLines={1}>{w.name}</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#4ADE80", marginTop: 2 }}>
                      ${parseFloat(w.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>{w.type}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No dollar wallet entries yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Tap + to record received dollars, products, payments or credit recoveries</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[styles.fab, { backgroundColor: "#0891B2" }]} onPress={() => setShowModal(true)}>
        
      </TouchableOpacity>

      {/* BUY USD MODAL */}
      <Modal visible={showBuyModal} animationType="slide" transparent onRequestClose={() => setShowBuyModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Buy USD from Account</Text>
              <TouchableOpacity onPress={() => setShowBuyModal(false)}><Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DOLLAR WALLET (USD GOES IN)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {dollarWallets.map(w => {
                    const sel = buyForm.walletId === String(w.id);
                    return (
                      <TouchableOpacity key={w.id} onPress={() => setBuyForm(f => ({ ...f, walletId: String(w.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#16A34A" : colors.card, borderColor: sel ? "#16A34A" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{w.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : colors.mutedForeground }}>
                          ${parseFloat(w.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTY TYPE</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["supplier", "customer"] as const).map(t => {
                  const sel = buyForm.partyType === t;
                  return (
                    <TouchableOpacity key={t} onPress={() => setBuyForm(f => ({ ...f, partyType: t, partyId: "" }))}
                      style={{ flex: 1, padding: 10, borderRadius: 8, alignItems: "center",
                        backgroundColor: sel ? "#0EA5E9" : colors.card,
                        borderWidth: 1, borderColor: sel ? "#0EA5E9" : colors.border }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: sel ? "#FFF" : colors.text, textTransform: "capitalize" }}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                {buyForm.partyType === "supplier" ? "SUPPLIER (USD SOURCE)" : "CUSTOMER (USD SOURCE)"}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(buyForm.partyType === "supplier" ? suppliers : customers).map(p => {
                    const sel = buyForm.partyId === String(p.id);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setBuyForm(f => ({ ...f, partyId: String(p.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#7C3AED" : colors.card, borderColor: sel ? "#7C3AED" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(buyForm.partyType === "supplier" ? suppliers : customers).length === 0 ? (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, padding: 8 }}>
                      No {buyForm.partyType}s yet — add one first.
                    </Text>
                  ) : null}
                </View>
              </ScrollView>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PAY FROM COMPANY ACCOUNT (PKR)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {accounts.map(a => {
                    const sel = buyForm.accountId === String(a.id);
                    return (
                      <TouchableOpacity key={a.id} onPress={() => setBuyForm(f => ({ ...f, accountId: String(a.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#0EA5E9" : colors.card, borderColor: sel ? "#0EA5E9" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{a.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : colors.mutedForeground }}>
                          ₨{parseFloat(a.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>USD AMOUNT</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={buyForm.amountUsd} onChangeText={v => setBuyForm(f => ({ ...f, amountUsd: v }))}
                    keyboardType="decimal-pad" placeholder="100" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>RATE PKR/USD</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={buyForm.rate} onChangeText={v => setBuyForm(f => ({ ...f, rate: v }))}
                    keyboardType="decimal-pad" placeholder="280" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              <View style={[styles.totalBox, { backgroundColor: "#E0F2FE", borderColor: "#0EA5E9" }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>Will deduct from account</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: "#0369A1" }}>
                  ₨{buyPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
                {buyForm.walletId && buyForm.amountUsd ? (() => {
                  const w = dollarWallets.find(x => String(x.id) === buyForm.walletId);
                  return w ? (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                      ${w.balance} → ${(parseFloat(w.balance) + parseFloat(buyForm.amountUsd)).toFixed(2)} in {w.name}
                    </Text>
                  ) : null;
                })() : null}
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={buyForm.date} onChangeText={v => setBuyForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 20 }]}
                value={buyForm.notes} onChangeText={v => setBuyForm(f => ({ ...f, notes: v }))} placeholder="Any notes..." placeholderTextColor={colors.mutedForeground} multiline />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#0EA5E9", opacity: saving ? 0.6 : 1 }]} disabled={saving} onPress={handleBuyUsd}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Buy USD"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TOPUP COINS MODAL */}
      <Modal visible={showTopupModal} animationType="slide" transparent onRequestClose={() => setShowTopupModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Top-up Coins with USD</Text>
              <TouchableOpacity onPress={() => setShowTopupModal(false)}><Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>PARTY (WHO SELLS YOU COINS)</Text>
                <TouchableOpacity onPress={() => setTopupForm(f => ({ ...f, coinsPerUsd: "6000", exchangeRatePkr: "333.33", costPricePkr: "0.0556" }))}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#92400E" }}>AUTO 6000/USD · 18/PKR</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                {(["supplier", "customer"] as const).map(t => {
                  const sel = topupForm.partyType === t;
                  return (
                    <TouchableOpacity key={t} onPress={() => setTopupForm(f => ({ ...f, partyType: t, partyId: "" }))}
                      style={{ flex: 1, backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>
                        {t === "supplier" ? "Supplier" : "Customer"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(topupForm.partyType === "supplier" ? suppliers : customers).map(p => {
                    const sel = topupForm.partyId === String(p.id);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setTopupForm(f => ({ ...f, partyId: String(p.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(topupForm.partyType === "supplier" ? suppliers : customers).length === 0 ? (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, padding: 8 }}>
                      No {topupForm.partyType}s yet
                    </Text>
                  ) : null}
                </View>
              </ScrollView>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DOLLAR WALLET (USD COMES OUT OF)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {dollarWallets.map(w => {
                    const sel = topupForm.walletId === String(w.id);
                    const insufficient = topupForm.amountUsd ? parseFloat(w.balance) < parseFloat(topupForm.amountUsd) : false;
                    return (
                      <TouchableOpacity key={w.id} onPress={() => setTopupForm(f => ({ ...f, walletId: String(w.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : insufficient ? "#DC2626" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{w.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : insufficient ? "#DC2626" : colors.mutedForeground }}>
                          ${parseFloat(w.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>COIN PRODUCT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {products.map(p => {
                    const sel = topupForm.productId === String(p.id);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setTopupForm(f => ({
                        ...f,
                        productId: String(p.id),
                        costPricePkr: parseFloat(p.costPrice || "0") > 0 ? parseFloat(p.costPrice).toFixed(4) : f.costPricePkr,
                        salePricePkr: parseFloat(p.unitPrice || "0") > 0 ? parseFloat(p.unitPrice).toFixed(4) : f.salePricePkr,
                        wholesalePricePkr: parseFloat(p.wholesalePrice || "0") > 0 ? parseFloat(p.wholesalePrice).toFixed(4) : f.wholesalePricePkr,
                      }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : colors.mutedForeground }}>
                          stock {p.stock}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>USD AMOUNT</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={topupForm.amountUsd} onChangeText={v => setTopupForm(f => ({ ...f, amountUsd: v }))}
                    keyboardType="decimal-pad" placeholder="100" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>COINS PER 1 USD</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={topupForm.coinsPerUsd}
                    onChangeText={v => setTopupForm(f => {
                      const next = { ...f, coinsPerUsd: v };
                      const cpu = parseFloat(v);
                      const fx = parseFloat(f.exchangeRatePkr || (lastRate > 0 ? String(lastRate) : "0"));
                      if (cpu > 0 && fx > 0 && !f.salePricePkr) {
                        next.salePricePkr = (fx / cpu).toFixed(4);
                      }
                      return next;
                    })}
                    keyboardType="decimal-pad" placeholder="6000" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              {topupForm.coinsPerUsd && parseFloat(topupForm.coinsPerUsd) > 0 && topupForm.amountUsd ? (
                <View style={{ backgroundColor: "#ECFDF5", borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#10B981", gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#065F46" }}>
                      ${topupForm.amountUsd} → {topupQty.toLocaleString()} coins
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#065F46", marginLeft: 22 }}>
                    Rate: 1 USD = {parseFloat(topupForm.coinsPerUsd).toLocaleString()} coins  ·  Cost ${(1 / parseFloat(topupForm.coinsPerUsd)).toFixed(6)}/coin
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>EXCHANGE RATE PKR/USD (for cost in PKR)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={topupForm.exchangeRatePkr}
                onChangeText={v => setTopupForm(f => {
                  const next = { ...f, exchangeRatePkr: v };
                  const fx = parseFloat(v);
                  const cpu = parseFloat(f.coinsPerUsd);
                  if (cpu > 0 && fx > 0 && !f.salePricePkr) {
                    next.salePricePkr = (fx / cpu).toFixed(4);
                  }
                  return next;
                })}
                keyboardType="decimal-pad"
                placeholder={lastRate > 0 ? String(lastRate.toFixed(0)) : "280"}
                placeholderTextColor={colors.mutedForeground} />

              <View style={[styles.totalBox, { backgroundColor: "#F3E8FF", borderColor: "#9333EA" }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>You will receive</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: "#7C3AED" }}>{topupQty} coins</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
                  Stock cost: ₨{topupPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {topupQty > 0 ? ` (₨${(topupPkr / topupQty).toFixed(2)} / coin)` : ""}
                </Text>
                {topupForm.productId ? (() => {
                  const p = products.find(x => String(x.id) === topupForm.productId);
                  return p ? (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                      Goes to inventory · stock {p.stock} → {p.stock + topupQty}
                    </Text>
                  ) : null;
                })() : null}
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>COIN PRICES (PKR PER COIN)</Text>
              {(() => {
                const p = topupForm.productId ? products.find(x => String(x.id) === topupForm.productId) : null;
                const curCost = p ? parseFloat(p.costPrice || "0") : 0;
                const curRetail = p ? parseFloat(p.unitPrice || "0") : 0;
                const curWhole = p ? parseFloat(p.wholesalePrice || "0") : 0;
                const autoCost = topupQty > 0 ? topupPkr / topupQty : 0;
                const effectiveCost = topupForm.costPricePkr ? parseFloat(topupForm.costPricePkr) : autoCost;
                const sale = topupForm.salePricePkr ? parseFloat(topupForm.salePricePkr) : 0;
                return (
                  <>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>
                          COST {curCost > 0 ? `(₨${curCost.toFixed(2)})` : ""}
                        </Text>
                        <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                          value={topupForm.costPricePkr} onChangeText={v => setTopupForm(f => ({ ...f, costPricePkr: v }))}
                          keyboardType="decimal-pad" placeholder={autoCost > 0 ? `auto ${autoCost.toFixed(2)}` : "auto"} placeholderTextColor={colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>
                          SALE {curRetail > 0 ? `(₨${curRetail.toFixed(2)})` : ""}
                        </Text>
                        <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                          value={topupForm.salePricePkr} onChangeText={v => setTopupForm(f => ({ ...f, salePricePkr: v }))}
                          keyboardType="decimal-pad" placeholder={curRetail > 0 ? curRetail.toFixed(2) : "Leave blank"} placeholderTextColor={colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>
                          WHOLESALE {curWhole > 0 ? `(₨${curWhole.toFixed(2)})` : ""}
                        </Text>
                        <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                          value={topupForm.wholesalePricePkr} onChangeText={v => setTopupForm(f => ({ ...f, wholesalePricePkr: v }))}
                          keyboardType="decimal-pad" placeholder={curWhole > 0 ? curWhole.toFixed(2) : "Leave blank"} placeholderTextColor={colors.mutedForeground} />
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginBottom: 12, fontStyle: "italic" }}>
                      Cost auto-set from purchase (₨{autoCost.toFixed(2)}/coin). Override above if needed.
                    </Text>
                    {sale > 0 && topupQty > 0 ? (
                      <View style={[styles.totalBox, { backgroundColor: "#DCFCE7", borderColor: "#16A34A", marginBottom: 12 }]}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Estimated profit</Text>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#15803D" }}>
                          ₨{((sale - effectiveCost) * topupQty).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                          if all {topupQty} coins sell @ ₨{sale.toFixed(2)} (cost ₨{effectiveCost.toFixed(2)})
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.totalBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", marginBottom: 12 }]}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#92400E", letterSpacing: 0.5 }}>WHEN YOU CONFIRM</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#78350F", marginTop: 4, textAlign: "center" }}>
                        ${topupForm.amountUsd || "0"} debited from USD wallet (bal ${totalUsd.toFixed(2)} → ${(totalUsd - parseFloat(topupForm.amountUsd || "0")).toFixed(2)})
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#78350F", textAlign: "center" }}>
                        +{topupQty} coins added to {p ? p.name : "product"} stock
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#78350F", textAlign: "center" }}>
                        Inventory value +₨{(effectiveCost * topupQty).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </>
                );
              })()}

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={topupForm.date} onChangeText={v => setTopupForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 20 }]}
                value={topupForm.notes} onChangeText={v => setTopupForm(f => ({ ...f, notes: v }))} placeholder="e.g. Hayuki batch from Binance" placeholderTextColor={colors.mutedForeground} multiline />

              {(() => {
                const selW = dollarWallets.find(x => String(x.id) === topupForm.walletId);
                const need = parseFloat(topupForm.amountUsd || "0");
                const have = selW ? parseFloat(selW.balance) : 0;
                const blocked = !selW || (need > 0 && have < need);
                const showWarn = topupForm.walletId && need > 0 && have < need;
                return (
                  <>
                    {showWarn ? (
                      <View style={{ backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#DC2626", flexDirection: "row", alignItems: "center", gap: 10 }}>
                        
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#991B1B" }}>
                            Not enough dollars in {selW!.name}
                          </Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#7F1D1D", marginTop: 2 }}>
                            Have ${have.toFixed(2)} · Need ${need.toFixed(2)} · Short ${(need - have).toFixed(2)}.
                            Buy USD into this wallet first.
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: blocked ? "#9CA3AF" : "#9333EA", opacity: saving ? 0.6 : 1 }]}
                      disabled={saving || blocked}
                      onPress={handleTopup}>
                      <Text style={styles.saveBtnText}>
                        {saving ? "Saving..." : blocked ? (selW ? `Insufficient $${have.toFixed(2)}` : "Pick a wallet") : "Top-up Coins"}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New Dollar Entry</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ENTRY TYPE</Text>
              <View style={styles.typeGrid}>
                {ENTRY_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeBtn, {
                      backgroundColor: form.entryType === t.key ? t.color : colors.card,
                      borderColor: form.entryType === t.key ? t.color : colors.border,
                    }]}
                    onPress={() => setForm(f => ({ ...f, entryType: t.key }))}
                  >
                    
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: form.entryType === t.key ? "#FFF" : colors.text, marginTop: 4 }}>{t.label}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: form.entryType === t.key ? "rgba(255,255,255,0.8)" : colors.mutedForeground }}>{t.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>AMOUNT (USD)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.amountUsd} onChangeText={v => setForm(f => ({ ...f, amountUsd: v }))}
                    placeholder="100" keyboardType="numeric" placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>EXCHANGE RATE (PKR)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={form.rate} onChangeText={v => setForm(f => ({ ...f, rate: v }))}
                    placeholder="280" keyboardType="numeric" placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>

              <View style={[styles.totalBox, { backgroundColor: selectedType ? selectedType.bg : colors.secondary, borderColor: selectedType?.color ?? colors.primary }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                  {selectedType?.sign === -1 ? "Deduction" : "Receipt"} in PKR
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: selectedType?.color ?? colors.primary }}>
                  ₨{parseFloat(totalInBase).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </View>

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTY NAME (CUSTOMER / SUPPLIER)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={form.partyName} onChangeText={v => setForm(f => ({ ...f, partyName: v }))}
                placeholder="e.g. Ahmed Khan" placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 12 }]}
                value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 20 }]}
                value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Any notes..." placeholderTextColor={colors.mutedForeground}
                multiline numberOfLines={2}
              />

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: selectedType?.color ?? "#0891B2", opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave} disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Entry"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF", marginBottom: 2 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 16 },
  balanceRow: { flexDirection: "row", gap: 10 },
  balCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 14 },
  balLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.75)", letterSpacing: 0.5, marginBottom: 4 },
  balValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  usdAmt: { fontFamily: "Inter_700Bold", fontSize: 15 },
  pkrAmt: { fontFamily: "Inter_400Regular", fontSize: 12 },
  delBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic", marginTop: 3 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10, paddingHorizontal: 40 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 15, textAlign: "center" },
  emptyHint: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  formLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 0 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeBtn: { width: "47.5%", borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 2 },
  totalBox: { borderWidth: 1.5, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: "center", gap: 4 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
  quickRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  quickBtn: { flex: 1, backgroundColor: "rgba(14,165,233,0.85)", borderRadius: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  quickText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFF" },
  acctChip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 2, minWidth: 110 },
});

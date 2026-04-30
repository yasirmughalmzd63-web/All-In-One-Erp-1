import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Platform,
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
  productId?: number | null;
  qty?: number | null;
  paymentMode?: string | null;
  walletId?: number | null;
  paymentProofUrl?: string | null;
  paymentProofKey?: string | null;
  proofVerifiedAt?: string | null;
  proofVerifiedBy?: number | null;
};

const ENTRY_TYPES: { key: string; label: string; desc: string; sign: 1 | -1; color: string; bg: string; icon: string }[] = [
  { key: "received",  label: "Received USD",   desc: "Customer paid in dollars",  sign:  1, color: "#16A34A", bg: "#DCFCE7", icon: "arrow-down-circle" },
  { key: "product",   label: "Sent Product",   desc: "Goods given — deduct USD",  sign: -1, color: "#DC2626", bg: "#FEE2E2", icon: "package" },
  { key: "purchase",  label: "Bought USD",     desc: "Bought from market account", sign:  1, color: "#0EA5E9", bg: "#E0F2FE", icon: "shopping-bag" },
  { key: "topup",     label: "Coin Top-up",    desc: "USD spent on coin stock",   sign: -1, color: "#9333EA", bg: "#F3E8FF", icon: "zap" },
];

type Account = { id: number; name: string; type: string; currency: string; balance: string };
type Product = { id: number; name: string; unit: string; stock: number; costPrice: string; unitPrice: string; wholesalePrice: string; topupCoinsPerUsd?: string | null; topupExchangeRatePkr?: string | null };
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
  paymentProofUrl: "",
  paymentProofKey: "",
};
const emptyTopupForm = {
  productId: "",
  walletId: "",
  paymentMode: "wallet" as "wallet" | "direct",
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
const WALLET_PAGE_SIZE = 200;

async function loadEntries(limit = WALLET_PAGE_SIZE, offset = 0): Promise<DollarEntry[]> {
  try {
    return await customFetch<DollarEntry[]>(`${WALLET_KEY}?limit=${limit}&offset=${offset}`);
  } catch { return []; }
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
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [entries, setEntries] = useState<DollarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProductId, setFilterProductId] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [renameWallet, setRenameWallet] = useState<Wallet | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [buyForm, setBuyForm] = useState(emptyBuyForm);
  const [topupForm, setTopupForm] = useState(emptyTopupForm);
  const [saving, setSaving] = useState(false);

  type SplitRow = { id: string; productId: string; amountUsd: string; coinsPerUsd: string; exchangeRatePkr: string };
  const newSplitRow = (): SplitRow => ({ id: Math.random().toString(36).slice(2), productId: "", amountUsd: "", coinsPerUsd: "6000", exchangeRatePkr: "333.33" });
  const [splitHeader, setSplitHeader] = useState({ partyType: "supplier" as "supplier" | "customer", partyId: "", walletId: "", paymentMode: "wallet" as "wallet" | "direct", date: new Date().toISOString().split("T")[0]!, notes: "" });
  const [splitRows, setSplitRows] = useState<SplitRow[]>([newSplitRow()]);

  // Payment screenshot state for Buy USD modal
  const [proofUploading, setProofUploading] = useState(false);
  // Full-screen proof viewer (also used for verifying)
  const [viewProofEntry, setViewProofEntry] = useState<DollarEntry | null>(null);
  const [verifying, setVerifying] = useState(false);

  const pickAndUploadProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library to attach a payment screenshot.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0]!;
    setProofUploading(true);
    try {
      // Compress: resize down to max 1280px wide and re-encode as JPEG ~60% quality.
      // Payment screenshots are usually 2-8 MB straight from the gallery; this brings them
      // down to ~80-200 KB, dramatically improving upload time on slow connections.
      const MAX_WIDTH = 1280;
      const needsResize = (asset.width ?? 0) > MAX_WIDTH;
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        needsResize ? [{ resize: { width: MAX_WIDTH } }] : [],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) { Alert.alert("Error", "Could not process image"); return; }
      const { url, key } = await customFetch<{ url: string; key: string }>("/api/upload/product-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: manipulated.base64, mimeType: "image/jpeg" }),
      });
      setBuyForm(f => ({ ...f, paymentProofUrl: url, paymentProofKey: key }));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setProofUploading(false);
    }
  };

  const handleVerifyProof = async (entry: DollarEntry, verify: boolean) => {
    setVerifying(true);
    try {
      const path = verify ? `/api/dollar-wallet/${entry.id}/verify-proof` : `/api/dollar-wallet/${entry.id}/unverify-proof`;
      const updated = await customFetch<DollarEntry>(path, { method: "POST" });
      setEntries(prev => prev.map(e => (e.id === entry.id ? { ...e, ...updated } : e)));
      setViewProofEntry(updated);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update verification");
    } finally {
      setVerifying(false);
    }
  };

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

  // Wallet detail modal
  type WalletDetail = {
    wallet: Wallet;
    transactions: DollarEntry[];
    summary: { totalIn: string; totalOut: string; totalInPkr: string; totalOutPkr: string; netUsd: string; txCount: number };
    monthly: { month: string; in: number; out: number; inPkr: number; outPkr: number; count: number }[];
  };
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [walletDetail, setWalletDetail] = useState<WalletDetail | null>(null);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  const [walletDetailOpen, setWalletDetailOpen] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");

  const openWalletDetail = async (w: Wallet) => {
    setSelectedWallet(w);
    setWalletDetail(null);
    setTxFilter("all");
    setWalletDetailOpen(true);
    setWalletDetailLoading(true);
    try {
      const data = await customFetch<WalletDetail>(`/api/dollar-wallet/wallets/${w.id}/transactions`);
      setWalletDetail(data);
    } catch { /* ignore */ }
    setWalletDetailLoading(false);
  };

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
          paymentProofUrl: buyForm.paymentProofUrl || null,
          paymentProofKey: buyForm.paymentProofKey || null,
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
    if (!topupForm.productId || !topupForm.amountUsd || !topupForm.coinsPerUsd || !topupForm.exchangeRatePkr || !topupForm.date) {
      Alert.alert("Error", "Coin, USD amount, coins per USD, PKR rate and date are required");
      return;
    }
    if (!topupForm.partyId) {
      Alert.alert("Pick party", "Choose which supplier or customer is selling you the coins.");
      return;
    }
    // Wallet is required only when payment mode is "wallet"
    if (topupForm.paymentMode === "wallet") {
      const selWallet = dollarWallets.find(x => String(x.id) === topupForm.walletId);
      const needUsd = parseFloat(topupForm.amountUsd);
      if (!selWallet) {
        Alert.alert("Pick wallet", "Select a dollar wallet to deduct from, or switch to Direct Purchase.");
        return;
      }
      if (parseFloat(selWallet.balance) < needUsd) {
        Alert.alert(
          "Insufficient dollars",
          `${selWallet.name} only has $${parseFloat(selWallet.balance).toFixed(2)} but you need $${needUsd.toFixed(2)}.\n\nBuy more USD into this wallet first, or switch to Direct Purchase.`
        );
        return;
      }
    }
    setSaving(true);
    try {
      const res = await customFetch<{ qty: number; newStock: number }>("/api/dollar-wallet/topup", {
        method: "POST",
        body: JSON.stringify({
          productId: parseInt(topupForm.productId, 10),
          walletId: topupForm.paymentMode === "wallet" && topupForm.walletId ? parseInt(topupForm.walletId, 10) : null,
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

  const saveProductRate = async () => {
    if (!topupForm.productId || !topupForm.coinsPerUsd || !topupForm.exchangeRatePkr) {
      Alert.alert("Error", "Pick a product and enter coins-per-USD and exchange rate to save");
      return;
    }
    try {
      await customFetch(`/api/products/${topupForm.productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          topupCoinsPerUsd: topupForm.coinsPerUsd,
          topupExchangeRatePkr: topupForm.exchangeRatePkr,
        }),
      });
      Alert.alert("Rate saved", `Rates for this app saved: ${topupForm.coinsPerUsd} coins/USD @ ₨${topupForm.exchangeRatePkr}`);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save rate");
    }
  };

  const handleSplitSubmit = async () => {
    if (!splitHeader.partyId) { Alert.alert("Validation", "Select a party"); return; }
    if (splitHeader.paymentMode === "wallet" && !splitHeader.walletId) { Alert.alert("Validation", "Select a dollar wallet"); return; }
    const validRows = splitRows.filter(r => r.productId && parseFloat(r.amountUsd) > 0 && parseFloat(r.coinsPerUsd) > 0 && parseFloat(r.exchangeRatePkr) > 0);
    if (validRows.length === 0) { Alert.alert("Validation", "Add at least one complete split row (product, amount, coins/USD, rate)"); return; }
    setSaving(true);
    try {
      await customFetch("/api/dollar-wallet/topup/split", {
        method: "POST",
        body: JSON.stringify({
          walletId: splitHeader.paymentMode === "wallet" ? parseInt(splitHeader.walletId) : null,
          paymentMode: splitHeader.paymentMode,
          partyType: splitHeader.partyType,
          partyId: parseInt(splitHeader.partyId),
          date: splitHeader.date,
          notes: splitHeader.notes || null,
          splits: validRows.map(r => ({
            productId: parseInt(r.productId),
            amountUsd: r.amountUsd,
            coinsPerUsd: r.coinsPerUsd,
            exchangeRatePkr: r.exchangeRatePkr,
          })),
        }),
      });
      const totalUsdSplit = validRows.reduce((s, r) => s + parseFloat(r.amountUsd || "0"), 0);
      Alert.alert("Split Complete!", `$${totalUsdSplit.toFixed(2)} split across ${validRows.length} app${validRows.length > 1 ? "s" : ""} — all inventory updated atomically.`);
      setShowSplitModal(false);
      setSplitHeader({ partyType: "supplier", partyId: "", walletId: "", paymentMode: "wallet", date: new Date().toISOString().split("T")[0]!, notes: "" });
      setSplitRows([newSplitRow()]);
      load();
      loadWallets();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Split topup failed");
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

  // SALE rate = most recent "received" entry rate (the rate at which we
  // last sold USD to a customer). This is the price USD is worth right now.
  // Falls back to the latest entry of any type if no received exists yet.
  const lastReceived = entries.find(e => e.entryType === "received");
  const saleRate = lastReceived
    ? parseFloat(lastReceived.rate)
    : (entries.length > 0 ? parseFloat(entries[0]!.rate) : 0);
  const lastRate = saleRate;
  const totalPkr = totalUsd * saleRate;

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
    const isTopup = item.entryType === "topup";
    const isDirect = item.paymentMode === "direct";
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardRow}>
          <View style={[styles.iconBox, { backgroundColor: et?.bg ?? colors.secondary }]}>
            
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {et?.label ?? item.entryType}
                {item.partyName ? <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> — {item.partyName}</Text> : null}
              </Text>
              {isTopup && isDirect && (
                <View style={{ backgroundColor: "#FEF3C7", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#92400E" }}>DIRECT</Text>
                </View>
              )}
              {isTopup && !isDirect && (
                <View style={{ backgroundColor: "#EDE9FE", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#5B21B6" }}>WALLET</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Rate: {parseFloat(item.rate).toFixed(2)} • {item.date}
              {isTopup && item.qty ? ` • ${item.qty.toLocaleString()} coins` : ""}
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
            {item.paymentProofUrl ? (
              <TouchableOpacity onPress={() => setViewProofEntry(item)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4,
                  backgroundColor: item.proofVerifiedAt ? "#DCFCE7" : "#FEF3C7",
                  borderColor: item.proofVerifiedAt ? "#16A34A" : "#F59E0B",
                  borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                <Image source={{ uri: item.paymentProofUrl }} style={{ width: 22, height: 22, borderRadius: 3 }} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9,
                  color: item.proofVerifiedAt ? "#15803D" : "#92400E" }}>
                  {item.proofVerifiedAt ? "✓ VERIFIED" : "PENDING"}
                </Text>
              </TouchableOpacity>
            ) : null}
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
            <Text style={styles.balLabel}>
              SALE VALUE {saleRate > 0 ? `@₨${saleRate.toFixed(0)}` : "(no sale rate)"}
            </Text>
            <Text style={styles.balValue}>
              ₨{totalPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {lastReceived ? "based on last sold rate" : "no USD sales yet"}
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
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: "rgba(234,88,12,0.85)" }]} onPress={() => setShowSplitModal(true)}>
            <Text style={styles.quickText}>🔀 Rapid Split</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: "rgba(2,132,199,0.85)" }]} onPress={() => router.push("/customer-dollar-report" as never)}>
            <Text style={styles.quickText}>Cust. Report</Text>
          </TouchableOpacity>
        </View>

        {dollarWallets.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 }}>
              MY {dollarWallets.length} DOLLAR WALLETS · TAP FOR HISTORY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {dollarWallets.map(w => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => openWalletDetail(w)}
                    onLongPress={() => { setRenameWallet(w); setRenameValue(w.name); }}
                    delayLongPress={350}
                    activeOpacity={0.75}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.18)",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      minWidth: 110,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.35)",
                    }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFF" }} numberOfLines={1}>{w.name}</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#4ADE80", marginTop: 2 }}>
                      ${parseFloat(w.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>{w.type} · long-press to rename</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </LinearGradient>

      {/* Ledger Filters */}
      {!loading && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          {/* Entry type filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[{ k: "all", label: "All" }, ...ENTRY_TYPES.map(e => ({ k: e.key, label: e.label }))].map(f => {
                const sel = filterType === f.k;
                return (
                  <TouchableOpacity key={f.k} onPress={() => { setFilterType(f.k); setFilterProductId("all"); }}
                    style={{ backgroundColor: sel ? "#0891B2" : colors.card, borderColor: sel ? "#0891B2" : colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: sel ? "Inter_700Bold" : "Inter_400Regular", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          {/* Per-app filter (only visible when topup filter is active or there are topup entries) */}
          {(filterType === "topup" || filterType === "all") && (() => {
            const topupProductIds = [...new Set(entries.filter(e => e.entryType === "topup" && e.productId).map(e => String(e.productId)))];
            if (topupProductIds.length === 0) return null;
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity onPress={() => setFilterProductId("all")}
                    style={{ backgroundColor: filterProductId === "all" ? "#9333EA" : colors.card, borderColor: filterProductId === "all" ? "#9333EA" : colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: filterProductId === "all" ? "Inter_700Bold" : "Inter_400Regular", fontSize: 11, color: filterProductId === "all" ? "#FFF" : colors.mutedForeground }}>All Apps</Text>
                  </TouchableOpacity>
                  {topupProductIds.map(pid => {
                    const p = products.find(x => String(x.id) === pid);
                    if (!p) return null;
                    const sel = filterProductId === pid;
                    return (
                      <TouchableOpacity key={pid} onPress={() => setFilterProductId(sel ? "all" : pid)}
                        style={{ backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: sel ? "Inter_700Bold" : "Inter_400Regular", fontSize: 11, color: sel ? "#FFF" : colors.mutedForeground }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            );
          })()}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={entries.filter(e => {
            if (filterType !== "all" && e.entryType !== filterType) return false;
            if (filterProductId !== "all" && String(e.productId) !== filterProductId) return false;
            return true;
          })}
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
              <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, marginBottom: 16 }]}
                value={buyForm.notes} onChangeText={v => setBuyForm(f => ({ ...f, notes: v }))} placeholder="Any notes..." placeholderTextColor={colors.mutedForeground} multiline />

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PAYMENT SCREENSHOT (OPTIONAL)</Text>
              <View style={{ marginBottom: 20 }}>
                {buyForm.paymentProofUrl ? (
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <TouchableOpacity onPress={() => setViewProofEntry({
                      id: -1, entryType: "purchase", amountUsd: buyForm.amountUsd || "0",
                      rate: buyForm.rate || "0", totalPkr: "0", partyName: null, notes: null,
                      date: buyForm.date, createdAt: new Date().toISOString(),
                      paymentProofUrl: buyForm.paymentProofUrl, paymentProofKey: buyForm.paymentProofKey,
                      proofVerifiedAt: null, proofVerifiedBy: null,
                    })}>
                      <Image source={{ uri: buyForm.paymentProofUrl }} style={{ width: 88, height: 88, borderRadius: 8, borderWidth: 1, borderColor: colors.border }} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#16A34A" }}>✓ Screenshot attached</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>Tap thumbnail to preview</Text>
                      <TouchableOpacity onPress={() => setBuyForm(f => ({ ...f, paymentProofUrl: "", paymentProofKey: "" }))}
                        style={{ marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.dangerBg }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.danger }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={pickAndUploadProof} disabled={proofUploading}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      borderWidth: 2, borderStyle: "dashed", borderColor: colors.border,
                      backgroundColor: colors.input, borderRadius: 10, paddingVertical: 16, opacity: proofUploading ? 0.6 : 1 }}>
                    {proofUploading ? <ActivityIndicator size="small" /> : null}
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>
                      {proofUploading ? "Uploading..." : "📷  Attach Payment Screenshot"}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 6 }}>
                  Attach a screenshot of your bank/Jazz Cash/EasyPaisa transfer for verification.
                </Text>
              </View>

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

              {/* Payment Mode Toggle */}
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PAYMENT METHOD</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {([{ k: "wallet", label: "Dollar Wallet", icon: "💳" }, { k: "direct", label: "Direct/Cash", icon: "💵" }] as const).map(opt => {
                  const sel = topupForm.paymentMode === opt.k;
                  return (
                    <TouchableOpacity key={opt.k}
                      onPress={() => setTopupForm(f => ({ ...f, paymentMode: opt.k, walletId: opt.k === "direct" ? "" : f.walletId }))}
                      style={[styles.acctChip, { flex: 1, backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border, paddingVertical: 10 }]}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: sel ? "#FFF" : colors.text, textAlign: "center" }}>{opt.icon} {opt.label}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.8)" : colors.mutedForeground, textAlign: "center" }}>
                        {opt.k === "wallet" ? "Deducts from USD wallet" : "No wallet deduction"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Dollar Wallet selector — only shown when payment mode is "wallet" */}
              {topupForm.paymentMode === "wallet" && (
                <>
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
                </>
              )}

              {/* Direct purchase info banner */}
              {topupForm.paymentMode === "direct" && (
                <View style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 14 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#92400E" }}>💵 Direct/Cash Purchase</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#78350F", marginTop: 2 }}>
                    Inventory will be updated but no USD wallet balance will be deducted. Use this for cash purchases or external top-ups.
                  </Text>
                </View>
              )}

              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>COIN PRODUCT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {products.map(p => {
                    const sel = topupForm.productId === String(p.id);
                    const hasSavedRate = !!(p.topupCoinsPerUsd && p.topupExchangeRatePkr);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setTopupForm(f => ({
                        ...f,
                        productId: String(p.id),
                        coinsPerUsd: p.topupCoinsPerUsd && parseFloat(p.topupCoinsPerUsd) > 0 ? p.topupCoinsPerUsd : f.coinsPerUsd,
                        exchangeRatePkr: p.topupExchangeRatePkr && parseFloat(p.topupExchangeRatePkr) > 0 ? p.topupExchangeRatePkr : f.exchangeRatePkr,
                        costPricePkr: parseFloat(p.costPrice || "0") > 0 ? parseFloat(p.costPrice).toFixed(4) : f.costPricePkr,
                        salePricePkr: parseFloat(p.unitPrice || "0") > 0 ? parseFloat(p.unitPrice).toFixed(4) : f.salePricePkr,
                        wholesalePricePkr: parseFloat(p.wholesalePrice || "0") > 0 ? parseFloat(p.wholesalePrice).toFixed(4) : f.wholesalePricePkr,
                      }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#9333EA" : colors.card, borderColor: sel ? "#9333EA" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : colors.mutedForeground }}>
                          stock {p.stock}
                        </Text>
                        {hasSavedRate ? (
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: sel ? "#D8B4FE" : "#7C3AED" }}>
                            {parseFloat(p.topupCoinsPerUsd!).toLocaleString()}/USD
                          </Text>
                        ) : (
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: sel ? "rgba(255,255,255,0.55)" : colors.mutedForeground }}>
                            no rate saved
                          </Text>
                        )}
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
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>COINS / USD</Text>
                    {topupForm.productId ? (
                      <TouchableOpacity onPress={saveProductRate}
                        style={{ backgroundColor: "#EDE9FE", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#8B5CF6" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#5B21B6" }}>SAVE RATE</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
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
                const isDirect = topupForm.paymentMode === "direct";
                const selW = dollarWallets.find(x => String(x.id) === topupForm.walletId);
                const need = parseFloat(topupForm.amountUsd || "0");
                const have = selW ? parseFloat(selW.balance) : 0;
                const walletBlocked = !isDirect && (!selW || (need > 0 && have < need));
                const showWarn = !isDirect && topupForm.walletId && need > 0 && have < need;
                const btnLabel = saving ? "Saving..." : isDirect ? "Top-up (Direct)" : walletBlocked ? (selW ? `Insufficient $${have.toFixed(2)}` : "Pick a wallet") : "Top-up Coins";
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
                            Switch to Direct Purchase or buy more USD first.
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: walletBlocked ? "#9CA3AF" : isDirect ? "#D97706" : "#9333EA", opacity: saving ? 0.6 : 1 }]}
                      disabled={saving || walletBlocked}
                      onPress={handleTopup}>
                      <Text style={styles.saveBtnText}>{btnLabel}</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Rapid Split Modal ─── */}
      <Modal visible={showSplitModal} animationType="slide" transparent onRequestClose={() => setShowSplitModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "95%" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>🔀 Rapid Split Topup</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>One USD batch → multiple apps, atomically</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                <Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Party */}
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTY (COIN SELLER)</Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                {(["supplier", "customer"] as const).map(t => {
                  const sel = splitHeader.partyType === t;
                  return (
                    <TouchableOpacity key={t} onPress={() => setSplitHeader(h => ({ ...h, partyType: t, partyId: "" }))}
                      style={{ flex: 1, backgroundColor: sel ? "#EA580C" : colors.card, borderColor: sel ? "#EA580C" : colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>
                        {t === "supplier" ? "Supplier" : "Customer"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(splitHeader.partyType === "supplier" ? suppliers : customers).map(p => {
                    const sel = splitHeader.partyId === String(p.id);
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setSplitHeader(h => ({ ...h, partyId: String(p.id) }))}
                        style={[styles.acctChip, { backgroundColor: sel ? "#EA580C" : colors.card, borderColor: sel ? "#EA580C" : colors.border }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(splitHeader.partyType === "supplier" ? suppliers : customers).length === 0 && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, padding: 8 }}>No {splitHeader.partyType}s yet</Text>
                  )}
                </View>
              </ScrollView>

              {/* Payment Mode */}
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PAYMENT METHOD</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {([{ k: "wallet", label: "Dollar Wallet", icon: "💳" }, { k: "direct", label: "Direct/Cash", icon: "💵" }] as const).map(opt => {
                  const sel = splitHeader.paymentMode === opt.k;
                  return (
                    <TouchableOpacity key={opt.k}
                      onPress={() => setSplitHeader(h => ({ ...h, paymentMode: opt.k, walletId: opt.k === "direct" ? "" : h.walletId }))}
                      style={[styles.acctChip, { flex: 1, backgroundColor: sel ? "#EA580C" : colors.card, borderColor: sel ? "#EA580C" : colors.border, paddingVertical: 10 }]}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: sel ? "#FFF" : colors.text, textAlign: "center" }}>{opt.icon} {opt.label}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.8)" : colors.mutedForeground, textAlign: "center" }}>
                        {opt.k === "wallet" ? "Deducts total USD from wallet" : "No wallet deduction"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Wallet Selector */}
              {splitHeader.paymentMode === "wallet" && (
                <>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DOLLAR WALLET</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {dollarWallets.map(w => {
                        const sel = splitHeader.walletId === String(w.id);
                        const totalSplitUsd = splitRows.reduce((s, r) => s + parseFloat(r.amountUsd || "0"), 0);
                        const insufficient = totalSplitUsd > 0 && parseFloat(w.balance) < totalSplitUsd;
                        return (
                          <TouchableOpacity key={w.id} onPress={() => setSplitHeader(h => ({ ...h, walletId: String(w.id) }))}
                            style={[styles.acctChip, { backgroundColor: sel ? "#EA580C" : colors.card, borderColor: sel ? "#EA580C" : insufficient ? "#DC2626" : colors.border }]}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: sel ? "#FFF" : colors.text }}>{w.name}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: sel ? "rgba(255,255,255,0.85)" : insufficient ? "#DC2626" : colors.mutedForeground }}>
                              ${parseFloat(w.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Date + Notes */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DATE</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={splitHeader.date} onChangeText={v => setSplitHeader(h => ({ ...h, date: v }))}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                    value={splitHeader.notes} onChangeText={v => setSplitHeader(h => ({ ...h, notes: v }))}
                    placeholder="e.g. bulk purchase" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              {/* Divider + section header */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 14, paddingTop: 14 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 4 }}>SPLIT ROWS</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Each row = one app's coin topup. All rows are saved in one atomic transaction.</Text>
              </View>

              {/* Split Rows */}
              {splitRows.map((row, idx) => {
                const qty = row.amountUsd && row.coinsPerUsd ? Math.floor(parseFloat(row.amountUsd) * parseFloat(row.coinsPerUsd)) : 0;
                const pkr = row.amountUsd && row.exchangeRatePkr ? parseFloat(row.amountUsd) * parseFloat(row.exchangeRatePkr) : 0;
                const selectedProduct = products.find(p => String(p.id) === row.productId);
                return (
                  <View key={row.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 12 }}>
                    {/* Row header */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <View style={{ backgroundColor: "#EA580C", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFF" }}>SPLIT {idx + 1}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {qty > 0 && (
                          <View style={{ backgroundColor: "#F3E8FF", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#9333EA" }}>
                              {qty.toLocaleString()} {selectedProduct?.unit ?? "coins"}  ·  ₨{pkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                        )}
                        {splitRows.length > 1 && (
                          <TouchableOpacity onPress={() => setSplitRows(rows => rows.filter(r => r.id !== row.id))}>
                            <Text style={{ color: "#DC2626", fontSize: 20, lineHeight: 22, fontFamily: "Inter_700Bold" }}>×</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Product selector */}
                    <Text style={[styles.formLabel, { color: colors.mutedForeground, fontSize: 9 }]}>APP / PRODUCT</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {products.map(p => {
                          const sel = row.productId === String(p.id);
                          return (
                            <TouchableOpacity key={p.id}
                              onPress={() => setSplitRows(rows => rows.map(r => r.id === row.id ? {
                                ...r,
                                productId: String(p.id),
                                coinsPerUsd: p.topupCoinsPerUsd && parseFloat(p.topupCoinsPerUsd) > 0 ? p.topupCoinsPerUsd : r.coinsPerUsd,
                                exchangeRatePkr: p.topupExchangeRatePkr && parseFloat(p.topupExchangeRatePkr) > 0 ? p.topupExchangeRatePkr : r.exchangeRatePkr,
                              } : r))}
                              style={[styles.acctChip, { backgroundColor: sel ? "#EA580C" : colors.background, borderColor: sel ? "#EA580C" : colors.border, paddingVertical: 5 }]}>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: sel ? "#FFF" : colors.text }}>{p.name}</Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: sel ? "rgba(255,255,255,0.8)" : colors.mutedForeground }}>stk {p.stock}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>

                    {/* USD + Rates row */}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formLabel, { color: colors.mutedForeground, fontSize: 9 }]}>USD AMOUNT</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 7 }]}
                          value={row.amountUsd} keyboardType="numeric"
                          onChangeText={v => setSplitRows(rows => rows.map(r => r.id === row.id ? { ...r, amountUsd: v } : r))}
                          placeholder="50" placeholderTextColor={colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formLabel, { color: colors.mutedForeground, fontSize: 9 }]}>COINS / USD</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 7 }]}
                          value={row.coinsPerUsd} keyboardType="numeric"
                          onChangeText={v => setSplitRows(rows => rows.map(r => r.id === row.id ? { ...r, coinsPerUsd: v } : r))}
                          placeholder="6000" placeholderTextColor={colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formLabel, { color: colors.mutedForeground, fontSize: 9 }]}>FX RATE (₨/$)</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 7 }]}
                          value={row.exchangeRatePkr} keyboardType="numeric"
                          onChangeText={v => setSplitRows(rows => rows.map(r => r.id === row.id ? { ...r, exchangeRatePkr: v } : r))}
                          placeholder="333.33" placeholderTextColor={colors.mutedForeground} />
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Add Row button */}
              <TouchableOpacity
                onPress={() => setSplitRows(rows => [...rows, newSplitRow()])}
                style={{ borderWidth: 1.5, borderColor: "#EA580C", borderStyle: "dashed", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#EA580C" }}>+ Add Another App</Text>
              </TouchableOpacity>

              {/* Summary + Submit */}
              {(() => {
                const totalSplitUsd = splitRows.reduce((s, r) => s + parseFloat(r.amountUsd || "0"), 0);
                const totalSplitCoins = splitRows.reduce((s, r) => {
                  const q = r.amountUsd && r.coinsPerUsd ? Math.floor(parseFloat(r.amountUsd) * parseFloat(r.coinsPerUsd)) : 0;
                  return s + q;
                }, 0);
                const validCount = splitRows.filter(r => r.productId && parseFloat(r.amountUsd) > 0).length;
                const walletBalance = splitHeader.walletId ? parseFloat(dollarWallets.find(w => String(w.id) === splitHeader.walletId)?.balance ?? "0") : 0;
                const walletBlocked = splitHeader.paymentMode === "wallet" && splitHeader.walletId && walletBalance < totalSplitUsd;

                return (
                  <>
                    {totalSplitUsd > 0 && (
                      <View style={{ backgroundColor: "#1E1B4B", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, marginBottom: 8 }}>SPLIT SUMMARY</Text>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>${totalSplitUsd.toFixed(2)}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>Total USD</Text>
                          </View>
                          <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{totalSplitCoins.toLocaleString()}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>Total Coins</Text>
                          </View>
                          <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{validCount}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>Apps</Text>
                          </View>
                        </View>
                        {splitHeader.paymentMode === "wallet" && splitHeader.walletId && (
                          <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                              Wallet balance after: ${(walletBalance - totalSplitUsd).toFixed(2)}
                            </Text>
                            {walletBlocked ? (
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FCA5A5" }}>⚠ Insufficient</Text>
                            ) : (
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#86EFAC" }}>✓ OK</Text>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: walletBlocked ? "#9CA3AF" : "#EA580C", opacity: saving ? 0.6 : 1, marginBottom: 32 }]}
                      disabled={!!saving || !!walletBlocked}
                      onPress={handleSplitSubmit}>
                      <Text style={styles.saveBtnText}>{saving ? "Saving…" : `Submit Split (${validCount} app${validCount !== 1 ? "s" : ""})`}</Text>
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

      {/* WALLET DETAIL MODAL */}
      <Modal visible={walletDetailOpen} animationType="slide" transparent onRequestClose={() => setWalletDetailOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", overflow: "hidden" }}>

            {/* Modal Header */}
            <LinearGradient colors={["#0369A1", "#0891B2"]} style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{selectedWallet?.name}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginTop: 2 }}>
                    {selectedWallet?.type} wallet · {selectedWallet?.currency}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: "#4ADE80" }}>
                    ${parseFloat(selectedWallet?.balance ?? "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Text>
                  <TouchableOpacity onPress={() => setWalletDetailOpen(false)}
                    style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF" }}>Close ×</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Summary Stats */}
              {walletDetail && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  <View style={{ flex: 1, backgroundColor: "rgba(74,222,128,0.2)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(74,222,128,0.4)" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TOTAL IN</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#4ADE80" }}>${parseFloat(walletDetail.summary.totalIn).toFixed(2)}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>₨{parseFloat(walletDetail.summary.totalInPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "rgba(248,113,113,0.2)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.4)" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TOTAL OUT</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#F87171" }}>${parseFloat(walletDetail.summary.totalOut).toFixed(2)}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>₨{parseFloat(walletDetail.summary.totalOutPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TXN COUNT</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" }}>{walletDetail.summary.txCount}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>transactions</Text>
                  </View>
                </View>
              )}
            </LinearGradient>

            {walletDetailLoading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, marginTop: 12 }}>Loading transactions...</Text>
              </View>
            ) : walletDetail ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

                {/* Filter tabs */}
                <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
                  {([
                    { key: "all", label: "All Transactions", count: walletDetail.summary.txCount },
                    { key: "in", label: "📥 Money In", count: walletDetail.transactions.filter(t => t.entryType === "purchase").length },
                    { key: "out", label: "📤 Money Out", count: walletDetail.transactions.filter(t => t.entryType === "topup").length },
                  ] as const).map(tab => (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setTxFilter(tab.key)}
                      style={{
                        flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center",
                        backgroundColor: txFilter === tab.key ? colors.primary : colors.input,
                        borderColor: txFilter === tab.key ? colors.primary : colors.border,
                      }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: txFilter === tab.key ? "#FFF" : colors.mutedForeground }}>{tab.label}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: txFilter === tab.key ? "#FFF" : colors.text }}>{tab.count}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Monthly Breakdown */}
                {walletDetail.monthly.length > 0 && (
                  <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>Monthly Breakdown</Text>
                    {walletDetail.monthly.map(m => (
                      <View key={m.month} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>
                            {new Date(m.month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                          </Text>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground }}>{m.count} txns</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: "#DCFCE7", borderRadius: 8, padding: 8 }}>
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#16A34A", letterSpacing: 0.5 }}>IN</Text>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#15803D" }}>${m.in.toFixed(2)}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#166534" }}>₨{m.inPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, padding: 8 }}>
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#DC2626", letterSpacing: 0.5 }}>OUT</Text>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#B91C1C" }}>${m.out.toFixed(2)}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#991B1B" }}>₨{m.outPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: colors.input, borderRadius: 8, padding: 8 }}>
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.5 }}>NET</Text>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: m.in - m.out >= 0 ? colors.success : colors.danger }}>
                              {m.in - m.out >= 0 ? "+" : ""}{(m.in - m.out).toFixed(2)}
                            </Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>USD</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Transaction History */}
                <View style={{ marginHorizontal: 16 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>Transaction History</Text>
                  {walletDetail.transactions
                    .filter(t => {
                      if (txFilter === "in") return t.entryType === "purchase";
                      if (txFilter === "out") return t.entryType === "topup";
                      return true;
                    })
                    .map(t => {
                      const et = ENTRY_TYPES.find(e => e.key === t.entryType);
                      const isIn = t.entryType === "purchase";
                      const isOut = t.entryType === "topup";
                      return (
                        <View key={t.id} style={{
                          backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                          padding: 14, marginBottom: 10,
                          borderLeftWidth: 4, borderLeftColor: isIn ? "#16A34A" : isOut ? "#9333EA" : colors.primary,
                        }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flex: 1, gap: 4 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: isIn ? "#DCFCE7" : isOut ? "#F3E8FF" : colors.input }}>
                                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: isIn ? "#15803D" : isOut ? "#7C3AED" : colors.text }}>
                                    {isIn ? "📥 IN" : isOut ? "📤 OUT" : et?.label ?? t.entryType}
                                  </Text>
                                </View>
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{t.date}</Text>
                              </View>
                              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>
                                {et?.label ?? t.entryType}
                              </Text>
                              {t.partyName ? (
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>👤 {t.partyName}</Text>
                              ) : null}
                              {t.notes ? (
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, fontStyle: "italic" }} numberOfLines={2}>{t.notes}</Text>
                              ) : null}
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 2 }}>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: isIn ? "#16A34A" : isOut ? "#DC2626" : colors.text }}>
                                {isIn ? "+" : isOut ? "-" : ""}{parseFloat(t.amountUsd).toFixed(2)} USD
                              </Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                                ₨{parseFloat(t.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                                @{parseFloat(t.rate).toFixed(0)}/USD
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  {walletDetail.transactions.filter(t => {
                    if (txFilter === "in") return t.entryType === "purchase";
                    if (txFilter === "out") return t.entryType === "topup";
                    return true;
                  }).length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40 }}>
                      <Text style={{ fontSize: 36 }}>📭</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground, marginTop: 8 }}>
                        No {txFilter === "all" ? "" : txFilter === "in" ? "inflow" : "outflow"} transactions yet
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 4, textAlign: "center" }}>
                        Use "Buy USD" to add money to this wallet
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                <Text style={{ fontSize: 36 }}>📂</Text>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground, marginTop: 8 }}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* RENAME WALLET MODAL */}
      <Modal visible={!!renameWallet} animationType="fade" transparent
        onRequestClose={() => { if (!renaming) setRenameWallet(null); }}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 18, padding: 20 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 4 }}>Rename Wallet</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 14 }}>
              Choose a new name for "{renameWallet?.name}". The balance and history stay the same.
            </Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Wallet name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              editable={!renaming}
              style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border, marginBottom: 14 }]}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity disabled={renaming} onPress={() => setRenameWallet(null)}
                style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: renaming ? 0.6 : 1 }}>
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={renaming || !renameValue.trim() || renameValue.trim() === renameWallet?.name}
                onPress={async () => {
                  const w = renameWallet;
                  const newName = renameValue.trim();
                  if (!w || !newName || newName === w.name) return;
                  setRenaming(true);
                  try {
                    await customFetch(`/api/wallets/${w.id}`, { method: "PATCH", body: JSON.stringify({ name: newName }) });
                    setDollarWallets(prev => prev.map(x => (x.id === w.id ? { ...x, name: newName } : x)));
                    setRenameWallet(null);
                  } catch (e) {
                    Alert.alert("Rename failed", e instanceof Error ? e.message : "Try again");
                  } finally {
                    setRenaming(false);
                  }
                }}
                style={{
                  flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center",
                  backgroundColor: "#0891B2",
                  opacity: (renaming || !renameValue.trim() || renameValue.trim() === renameWallet?.name) ? 0.5 : 1,
                }}>
                <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 }}>{renaming ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PAYMENT PROOF VIEWER MODAL */}
      <Modal visible={!!viewProofEntry} animationType="fade" transparent onRequestClose={() => setViewProofEntry(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 10 }}>
            <TouchableOpacity onPress={() => setViewProofEntry(null)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFF", fontSize: 24, fontFamily: "Inter_500Medium", lineHeight: 26 }}>×</Text>
            </TouchableOpacity>
          </View>
          {viewProofEntry?.paymentProofUrl ? (
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 60 }}
              maximumZoomScale={4} minimumZoomScale={1}>
              <Image source={{ uri: viewProofEntry.paymentProofUrl }}
                style={{ width: "100%", height: 480, resizeMode: "contain" }} />
            </ScrollView>
          ) : null}
          {viewProofEntry && viewProofEntry.id > 0 ? (
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: "rgba(0,0,0,0.85)" }}>
              <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14, marginBottom: 4 }}>
                ${parseFloat(viewProofEntry.amountUsd).toFixed(2)} @ ₨{parseFloat(viewProofEntry.rate).toFixed(2)}
                {viewProofEntry.partyName ? ` · ${viewProofEntry.partyName}` : ""}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 12 }}>
                {viewProofEntry.date}
                {viewProofEntry.proofVerifiedAt
                  ? ` · Verified ${new Date(viewProofEntry.proofVerifiedAt).toLocaleString()}`
                  : " · Awaiting verification"}
              </Text>
              {isAdmin ? (
                viewProofEntry.proofVerifiedAt ? (
                  <TouchableOpacity disabled={verifying} onPress={() => handleVerifyProof(viewProofEntry, false)}
                    style={{ backgroundColor: "#F59E0B", borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: verifying ? 0.6 : 1 }}>
                    <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 }}>
                      {verifying ? "Updating..." : "Mark as Unverified"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity disabled={verifying} onPress={() => handleVerifyProof(viewProofEntry, true)}
                    style={{ backgroundColor: "#16A34A", borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: verifying ? 0.6 : 1 }}>
                    <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 }}>
                      {verifying ? "Verifying..." : "✓  Verify Payment"}
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" }}>
                  Only admins can verify payments.
                </Text>
              )}
            </View>
          ) : null}
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

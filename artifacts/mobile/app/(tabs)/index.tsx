import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState, useMemo } from "react";
import {
  Alert, FlatList, Image, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useListProducts, useListCustomers, useListAccounts, useListLocations,
  useCreateSale, customFetch,
} from "@workspace/api-client-react";
import { useAuth, hasPrivilege, getAllowedProductIds, getAllowedAccountIds, getAllowedLocationIds } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const NUMPAD_KEYS = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [".", "0", "⌫"]];

function formatK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Product = { id: number; name: string; unitPrice: string; wholesalePrice: string; unit: string; stock: number; isActive?: boolean; imageUrl?: string | null; categoryName?: string | null };
type Customer = { id: number; name: string; phone?: string | null; creditBalance?: string | null; locationId?: number | null };
type Account = { id: number; name: string; type: string; balance: string; currency: string };
type Location = { id: number; name: string; address?: string | null };
type RateMode = "normal" | "wholesale";

// ── Account type helpers ────────────────────────────────────────────────
function acctEmoji(type: string): string {
  const t = type.toLowerCase();
  if (t === "cash")   return "💵";
  if (t === "bank")   return "🏦";
  if (t === "mobile") return "📱";
  return "💳";
}
function acctColor(type: string): { bg: string; border: string; text: string } {
  const t = type.toLowerCase();
  if (t === "cash")   return { bg: "#ECFDF5", border: "#059669", text: "#065F46" };
  if (t === "bank")   return { bg: "#EFF6FF", border: "#2563EB", text: "#1E3A8A" };
  if (t === "mobile") return { bg: "#F3E8FF", border: "#7C3AED", text: "#4C1D95" };
  return { bg: "#F1F5F9", border: "#94A3B8", text: "#334155" };
}

function AccountPickerModal({ visible, accounts, onSelect, onClose }: {
  visible: boolean;
  accounts: Account[];
  onSelect: (a: Account | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const ORDER = ["cash", "bank", "mobile", "other"];
  const grouped: Record<string, Account[]> = {};
  for (const a of accounts) {
    const key = a.type.toLowerCase();
    const group = ORDER.includes(key) ? key : "other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(a);
  }
  const sections = ORDER.filter(k => grouped[k]?.length);
  const TYPE_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", mobile: "Mobile Wallet", other: "Other" };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "85%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Select Account</Text>
            <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={onClose}>
              <Text style={{ color: colors.mutedForeground, fontSize: 22, lineHeight: 24 }}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {sections.map(typeKey => {
              const { bg, border, text } = acctColor(typeKey);
              return (
                <View key={typeKey}>
                  {/* Section header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 14 }}>{acctEmoji(typeKey)}</Text>
                    </View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: text, letterSpacing: 0.8 }}>
                      {TYPE_LABEL[typeKey] ?? typeKey.toUpperCase()}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: border, opacity: 0.3 }} />
                  </View>
                  {/* Accounts in this group */}
                  {grouped[typeKey].map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => { onSelect(a); onClose(); }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 18 }}>{acctEmoji(typeKey)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>{a.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                          Balance: ₨{parseFloat(a.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: border }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: text }}>
                          ₨{parseFloat(a.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PickerModal<T extends { id: number; name: string }>({
  visible, title, items, onSelect, onClose, renderSub,
}: { visible: boolean; title: string; items: T[]; onSelect: (item: T | null) => void; onClose: () => void; renderSub?: (item: T) => string }) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{title}</Text>
            <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={onClose}>
              <Text style={{ color: colors.mutedForeground, fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => { onSelect(null); onClose(); }} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, fontSize: 15 }}>— None —</Text>
          </TouchableOpacity>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { onSelect(item); onClose(); }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text }}>{item.name}</Text>
                {renderSub && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{renderSub(item)}</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function ProductPickerModal({ visible, products, onSelect, onClose }: {
  visible: boolean;
  products: Product[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q)) : products;
  }, [products, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const cat = p.categoryName?.trim() || "Uncategorized";
      const arr = map.get(cat) ?? [];
      arr.push(p);
      map.set(cat, arr);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [filtered]);

  const CARD_W = 104;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 19, color: colors.text }}>Select Product</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{products.length} items · {groups.length} categories</Text>
            </View>
            <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={onClose}>
              <Text style={{ color: colors.mutedForeground, fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={{ marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.input, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products or categories…"
              placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, paddingVertical: 10 }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} style={{ padding: 4 }}>
                <Text style={{ fontSize: 15, color: colors.mutedForeground }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {groups.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ fontSize: 36 }}>🔍</Text>
                <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 8 }}>No products found</Text>
              </View>
            ) : groups.map(([category, items]) => (
              <View key={category} style={{ marginBottom: 6 }}>
                {/* Category header */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
                  <View style={{ height: 1, width: 8, backgroundColor: colors.border }} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 }}>{category}</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{items.length}</Text>
                </View>

                {/* Product grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10, flexDirection: "row" }}>
                  {items.map(p => {
                    const inStock = (p.stock ?? 0) > 0;
                    const price = parseFloat(p.unitPrice);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onSelect(p); onClose(); }}
                        activeOpacity={0.75}
                        style={{
                          width: CARD_W, borderRadius: 18, borderWidth: 2,
                          borderColor: inStock ? colors.border : colors.danger,
                          backgroundColor: inStock ? colors.card : colors.dangerBg,
                          padding: 10, alignItems: "center", gap: 6,
                          shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
                          elevation: 2,
                        }}
                      >
                        {/* Image / emoji icon */}
                        {p.imageUrl ? (
                          <Image source={{ uri: p.imageUrl }} style={{ width: 56, height: 56, borderRadius: 14 }} />
                        ) : (
                          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: inStock ? colors.secondary : colors.dangerBg, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 28 }}>{inStock ? "📦" : "🚫"}</Text>
                          </View>
                        )}

                        {/* Out-of-stock banner */}
                        {!inStock && (
                          <View style={{ backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#FFF" }}>OUT OF STOCK</Text>
                          </View>
                        )}

                        {/* Name */}
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.text, textAlign: "center" }} numberOfLines={2}>{p.name}</Text>

                        {/* Price + stock row */}
                        <View style={{ alignItems: "center", gap: 2 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.primary }}>
                            ₨{price >= 1000 ? `${(price / 1000).toFixed(1)}K` : price.toFixed(0)}
                          </Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: inStock ? colors.success : colors.danger }}>
                            {inStock ? `${p.stock} ${p.unit}` : "0 in stock"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  // ── Privileges ─────────────────────────────────────────────────────────
  const isAdmin           = user?.role === "admin";
  const canSelectProduct  = hasPrivilege(user, "pos_product");
  const canSelectAccount  = hasPrivilege(user, "pos_account");
  const canCreditSale     = hasPrivilege(user, "pos_credit_customer");
  const canSelectLocation = hasPrivilege(user, "pos_location");

  const [amount, setAmount] = useState("0");
  const [rateMode, setRateMode] = useState<RateMode>("normal");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [copiedQty, setCopiedQty] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [dollarBalance, setDollarBalance] = useState<{ usd: number; pkr: number; rate: number } | null>(null);
  const [defaults, setDefaults] = useState<{ locationId?: number; accountId?: number; productId?: number }>({});

  const { data: productsRaw } = useListProducts();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const { data: locationsRaw } = useListLocations();
  const createSaleMutation = useCreateSale();

  React.useEffect(() => {
    customFetch<{ entryType: string; amountUsd: string; rate: string }[]>("/api/dollar-wallet")
      .then(rows => {
        const SIGNS: Record<string, number> = { received: 1, partial: 1, recovery: 1, product: -1 };
        let usd = 0; let lastRate = 0;
        rows.forEach(r => {
          usd += (SIGNS[r.entryType] ?? 1) * parseFloat(r.amountUsd);
          if (!lastRate) lastRate = parseFloat(r.rate);
        });
        setDollarBalance({ usd, pkr: usd * lastRate, rate: lastRate });
      }).catch(() => {});
  }, []);

  // ── Load persisted defaults ────────────────────────────────────────────
  React.useEffect(() => {
    AsyncStorage.getItem("pos_defaults").then(raw => {
      if (raw) {
        try { setDefaults(JSON.parse(raw)); } catch {}
      }
    }).catch(() => {});
  }, []);

  // ── Auto-apply defaults once data has loaded ───────────────────────────
  const defaultsAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (defaultsAppliedRef.current) return;
    const p = (productsRaw ?? []) as unknown as Product[];
    const a = (accountsRaw ?? []) as unknown as Account[];
    const l = (locationsRaw ?? []) as unknown as Location[];
    if (!p.length && !a.length && !l.length) return;
    defaultsAppliedRef.current = true;
    if (defaults.productId) {
      const found = p.find(x => x.id === defaults.productId && x.isActive !== false);
      if (found) setSelectedProduct(found);
    }
    if (defaults.accountId) {
      const found = a.find(x => x.id === defaults.accountId);
      if (found) setSelectedAccount(found);
    }
    if (defaults.locationId) {
      const found = l.find(x => x.id === defaults.locationId);
      if (found) setSelectedLocation(found);
    }
  }, [defaults, productsRaw, accountsRaw, locationsRaw]);

  const saveDefault = async (key: "locationId" | "accountId" | "productId", id: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const next = { ...defaults, [key]: id };
    setDefaults(next);
    try { await AsyncStorage.setItem("pos_defaults", JSON.stringify(next)); } catch {}
  };

  const products = (productsRaw ?? []) as unknown as Product[];
  const customers = (customersRaw ?? []) as unknown as Customer[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];
  const locations = (locationsRaw ?? []) as unknown as Location[];

  // ── Entity-level filtering ─────────────────────────────────────────────
  const allowedProductIds  = getAllowedProductIds(user);
  const allowedAccountIds  = getAllowedAccountIds(user);
  const allowedLocationIds = getAllowedLocationIds(user);

  const activeProducts = products
    .filter(p => p.isActive !== false)
    .filter(p => allowedProductIds === null || allowedProductIds.has(p.id));

  const allowedAccounts = accounts
    .filter(a => allowedAccountIds === null || allowedAccountIds.has(a.id));

  const allowedLocations = locations
    .filter(l => allowedLocationIds === null || allowedLocationIds.has(l.id));

  // Auto-select if only one option allowed
  React.useEffect(() => {
    if (allowedAccounts.length === 1 && !selectedAccount) {
      setSelectedAccount(allowedAccounts[0]!);
    }
  }, [allowedAccounts.length]);

  React.useEffect(() => {
    if (activeProducts.length === 1 && !selectedProduct) {
      setSelectedProduct(activeProducts[0]!);
    }
  }, [activeProducts.length]);

  // Lock non-admin to their assigned location immediately when locations load
  React.useEffect(() => {
    if (!isAdmin && user?.locationId) {
      const assigned = locations.find(l => l.id === user.locationId);
      if (assigned) setSelectedLocation(assigned);
    } else if (isAdmin && allowedLocations.length === 1 && !selectedLocation) {
      setSelectedLocation(allowedLocations[0]!);
    }
  }, [locations.length, user?.locationId, isAdmin]);

  const parsedAmount = parseFloat(amount) || 0;
  const activePrice = selectedProduct
    ? parseFloat(rateMode === "wholesale" ? (selectedProduct.wholesalePrice || selectedProduct.unitPrice) : selectedProduct.unitPrice)
    : 0;
  const qty = selectedProduct && parsedAmount > 0 && activePrice > 0 ? Math.round(parsedAmount / activePrice) : 0;

  // ── Strict validation ──────────────────────────────────────────────────
  const validations = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!selectedProduct) errors.push("No product selected");
    else {
      if ((selectedProduct.stock ?? 0) <= 0) errors.push(`"${selectedProduct.name}" is out of stock`);
      else if (qty > (selectedProduct.stock ?? 0)) errors.push(`Only ${selectedProduct.stock} in stock — need ${qty}`);
    }
    if (parsedAmount <= 0) errors.push("Enter an amount");
    if (qty <= 0 && selectedProduct && parsedAmount > 0) warnings.push("Amount too small for one unit");
    return { errors, warnings, canSell: errors.length === 0 };
  }, [selectedProduct, qty, parsedAmount]);

  const accountBalance = selectedAccount ? parseFloat(selectedAccount.balance) : null;
  const balanceShortfall = accountBalance !== null && parsedAmount > 0 && parsedAmount > accountBalance
    ? parsedAmount - accountBalance
    : 0;

  const cashValidations = useMemo(() => {
    const errors = [...validations.errors];
    if (!selectedAccount) {
      errors.push("Select an account to receive payment");
    } else {
      const bal = parseFloat(selectedAccount.balance);
      if (parsedAmount > bal) {
        errors.push(
          `Insufficient balance in "${selectedAccount.name}" — need ₨${parsedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}, have ₨${bal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        );
      }
    }
    return { errors, canComplete: errors.length === 0 };
  }, [validations.errors, selectedAccount, parsedAmount]);

  // ── Dashboard figures (location/user-filtered for non-admin) ───────────
  const dashParams = isAdmin
    ? ""
    : `?userId=${user?.id ?? ""}${selectedLocation ? `&locationId=${selectedLocation.id}` : ""}`;

  type DashData = {
    totalAccountsBalance?: string; totalStockValue?: string;
    creditReceivable?: string; creditPayable?: string;
    todaySales?: string; todaySalesCount?: number;
    todayPurchases?: string; todayExpenses?: string;
  };

  const { data: dashboardRaw } = useQuery<DashData>({
    queryKey: ["dashboard-pos", dashParams],
    queryFn: () => customFetch<DashData>(`/api/dashboard${dashParams}`),
    refetchInterval: 30000,
  });

  const sep = dashParams.includes("?") ? "&" : "?";
  const todayParams  = `${dashParams}${sep}period=today`;
  const yestParams   = `${dashParams}${sep}period=yesterday`;

  const { data: todayDash } = useQuery<DashData>({
    queryKey: ["dashboard-today", todayParams],
    queryFn: () => customFetch<DashData>(`/api/dashboard${todayParams}`),
    refetchInterval: 30000,
  });
  const { data: yestDash } = useQuery<DashData>({
    queryKey: ["dashboard-yesterday", yestParams],
    queryFn: () => customFetch<DashData>(`/api/dashboard${yestParams}`),
    refetchInterval: 60000,
  });

  const todaySales = todayDash?.todaySales ? parseFloat(todayDash.todaySales) : null;
  const todayCount = todayDash?.todaySalesCount ?? null;
  const yestSales  = yestDash?.todaySales  ? parseFloat(yestDash.todaySales)  : null;
  const yestCount  = yestDash?.todaySalesCount ?? null;
  const salesDiff  = todaySales !== null && yestSales !== null ? todaySales - yestSales : null;
  const salesDiffPct = yestSales && yestSales > 0 && salesDiff !== null
    ? ((salesDiff / yestSales) * 100) : null;

  // BANK: admin → global accounts sum, non-admin → allowed accounts sum
  const bankBal = isAdmin
    ? (dashboardRaw?.totalAccountsBalance ? parseFloat(dashboardRaw.totalAccountsBalance) : null)
    : allowedAccounts.length > 0
      ? allowedAccounts.reduce((s, a) => s + parseFloat((a as { balance?: string }).balance ?? "0"), 0)
      : null;

  // STOCK: admin → global stock value, non-admin → selected location products
  const stockVal = isAdmin
    ? (dashboardRaw?.totalStockValue ? parseFloat(dashboardRaw.totalStockValue) : null)
    : selectedLocation
      ? (products as unknown as { locationId?: number; stock?: number; unitPrice?: string; isActive?: boolean }[])
          .filter(p => p.isActive !== false && p.locationId === selectedLocation.id)
          .reduce((s, p) => s + (p.stock ?? 0) * parseFloat(p.unitPrice ?? "0"), 0)
      : null;

  // CREDIT IN / OUTSTANDING: from filtered dashboard (by userId for non-admin)
  const creditIn    = dashboardRaw?.creditReceivable ? parseFloat(dashboardRaw.creditReceivable) : null;
  const outstanding = dashboardRaw?.creditPayable    ? parseFloat(dashboardRaw.creditPayable)    : null;

  // Grand total = bank + stock + credit receivable
  const grandTotal = (bankBal !== null || stockVal !== null || creditIn !== null)
    ? (bankBal ?? 0) + (stockVal ?? 0) + (creditIn ?? 0)
    : null;

  // ── Display helpers ────────────────────────────────────────────────────
  // Show only what the user has typed — no ghost trailing zeros
  const typedPart = amount;
  const ghostPart = "";

  const handleNumpad = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (key === "⌫") { setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : "0"); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(prev => prev + "."); return; }
    if (amount === "0") setAmount(key);
    else setAmount(prev => {
      if (prev.includes(".") && (prev.split(".")[1]?.length ?? 0) >= 8) return prev;
      if (prev.length >= 16) return prev;
      return prev + key;
    });
  };

  const handleCopyQty = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        await navigator.clipboard.writeText(String(qty));
      } else {
        const Clip = await import("expo-clipboard");
        await Clip.setStringAsync(String(qty));
      }
      setCopiedQty(true);
      setTimeout(() => setCopiedQty(false), 2000);
    } catch {
      setCopyError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setTimeout(() => setCopyError(false), 2000);
    }
  };

  const handleCompleteSale = async () => {
    if (!cashValidations.canComplete) {
      Alert.alert("Cannot Complete Sale", cashValidations.errors.map(e => `• ${e}`).join("\n"));
      return;
    }
    if (!user) return;
    try {
      await (createSaleMutation as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id,
          customerId: selectedCustomer?.id ?? null,
          accountId: selectedAccount!.id,
          locationId: selectedLocation?.id ?? user.locationId ?? null,
          items: [{ productId: selectedProduct!.id, qty, unitPrice: activePrice.toFixed(8) }],
          discount: "0.00000000", tax: "0.00000000",
          amountPaid: parsedAmount.toFixed(8),
          paymentMethod: "cash",
          notes: rateMode === "wholesale" ? "Wholesale rate" : null,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries();
      setAmount("0");
      Alert.alert(
        "✓ Sale Complete",
        `${selectedProduct!.name}\nQTY: ${qty} ${selectedProduct!.unit}\nRate: ${rateMode === "wholesale" ? "Wholesale" : "Retail"} @ ${activePrice.toFixed(2)}\nPaid: ${parsedAmount.toFixed(2)}\nAccount: ${selectedAccount!.name}`,
        [{ text: "New Sale", onPress: () => { setSelectedProduct(null); setSelectedCustomer(null); } }, { text: "OK" }]
      );
    } catch (e: unknown) {
      Alert.alert("Sale Failed", e instanceof Error ? e.message : "Unexpected error");
    }
  };

  const handleCreditSale = async () => {
    if (!canCreditSale) {
      Alert.alert("Access Denied", "You do not have permission to make credit sales.");
      return;
    }
    if (!validations.canSell) {
      Alert.alert("Cannot Process Credit Sale", validations.errors.map(e => `• ${e}`).join("\n"));
      return;
    }
    if (!selectedCustomer) {
      Alert.alert("Customer Required", "Please select a customer to record a credit sale.");
      return;
    }
    if (!user) return;
    try {
      await (createSaleMutation as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id,
          customerId: selectedCustomer.id,
          accountId: selectedAccount?.id ?? null,
          locationId: selectedLocation?.id ?? user.locationId ?? null,
          items: [{ productId: selectedProduct!.id, qty, unitPrice: activePrice.toFixed(8) }],
          discount: "0.00000000", tax: "0.00000000",
          amountPaid: "0.00000000",
          paymentMethod: "credit",
          notes: rateMode === "wholesale" ? "Wholesale rate — credit" : "Credit sale",
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      queryClient.invalidateQueries();
      setAmount("0");
      Alert.alert(
        "Credit Entry Added",
        `${selectedProduct!.name}\nQTY: ${qty} ${selectedProduct!.unit}\nTotal: ${parsedAmount.toFixed(2)}\nCustomer: ${selectedCustomer.name}\n\nEntry saved to Credits.`,
        [{ text: "New Sale", onPress: () => { setSelectedProduct(null); setSelectedCustomer(null); } }, { text: "OK" }]
      );
    } catch (e: unknown) {
      Alert.alert("Credit Failed", e instanceof Error ? e.message : "Unexpected error");
    }
  };

  const stockWarning = selectedProduct && (selectedProduct.stock ?? 0) <= 0
    ? "out-of-stock"
    : selectedProduct && qty > (selectedProduct.stock ?? 0) && qty > 0
      ? "exceeds-stock" : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8, justifyContent: "center" }]}>
        <Text style={[styles.headerTitle, { textAlign: "center", fontSize: 22, letterSpacing: 2 }]}>COINS DYNASTY</Text>
      </LinearGradient>

      {/* ── Location banner ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.locationBanner, {
          backgroundColor: selectedLocation ? "#ECFDF5" : colors.card,
          borderBottomColor: selectedLocation ? "#A7F3D0" : colors.border,
        }]}
        onPress={isAdmin ? () => setShowLocationModal(true) : undefined}
        activeOpacity={isAdmin ? 0.7 : 1}
      >
        <View style={[styles.locationIconWrap, { backgroundColor: selectedLocation ? "#059669" : colors.primary }]}>
          <Text style={{ fontSize: 17, color: "#FFF", lineHeight: 22 }}>
            {selectedLocation ? "◉" : "⊕"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.locationBannerLabel, { color: colors.mutedForeground }]}>
            {isAdmin ? "ACTIVE APP" : "YOUR APP"}
          </Text>
          <Text style={[styles.locationBannerName, { color: selectedLocation ? "#065F46" : colors.primary }]}>
            {selectedLocation?.name ?? (isAdmin ? "Tap to select app" : "No app assigned")}
          </Text>
        </View>
        {selectedLocation ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {selectedLocation.id !== defaults.locationId && (
              <TouchableOpacity
                onPress={e => { e.stopPropagation?.(); saveDefault("locationId", selectedLocation.id); }}
                style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#FDE68A" }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#92400E" }}>★ Set Default</Text>
              </TouchableOpacity>
            )}
            {selectedLocation.id === defaults.locationId && (
              <View style={{ backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#A7F3D0" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#065F46" }}>★ Default</Text>
              </View>
            )}
            <View style={{ backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#A7F3D0" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#065F46" }}>
                {isAdmin ? "ACTIVE ›" : "ASSIGNED"}
              </Text>
            </View>
          </View>
        ) : isAdmin ? (
          <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.primary }}>›</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Today / Yesterday / Compare strip (TOP) ───────────────── */}
        <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 14, marginTop: 4, marginBottom: 0 }}>
          {/* Today */}
          <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1.5, borderColor: "#BFDBFE", padding: 10, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontSize: 13 }}>☀️</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#1D4ED8", letterSpacing: 0.5 }}>TODAY</Text>
              {todayCount !== null && (
                <View style={{ marginLeft: "auto", backgroundColor: "#DBEAFE", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#1D4ED8" }}>{todayCount} sales</Text>
                </View>
              )}
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#1E3A8A", marginTop: 1 }}>
              {todaySales !== null ? `₨${todaySales >= 1000 ? `${(todaySales / 1000).toFixed(1)}K` : todaySales.toFixed(0)}` : "—"}
            </Text>
          </View>

          {/* Yesterday */}
          <View style={{ flex: 1, backgroundColor: "#F5F3FF", borderRadius: 14, borderWidth: 1.5, borderColor: "#DDD6FE", padding: 10, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontSize: 13 }}>🌙</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#6D28D9", letterSpacing: 0.5 }}>YESTERDAY</Text>
              {yestCount !== null && (
                <View style={{ marginLeft: "auto", backgroundColor: "#EDE9FE", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#6D28D9" }}>{yestCount} sales</Text>
                </View>
              )}
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#4C1D95", marginTop: 1 }}>
              {yestSales !== null ? `₨${yestSales >= 1000 ? `${(yestSales / 1000).toFixed(1)}K` : yestSales.toFixed(0)}` : "—"}
            </Text>
          </View>

          {/* Compare */}
          {salesDiff !== null ? (
            <View style={{
              width: 68, backgroundColor: salesDiff >= 0 ? "#ECFDF5" : "#FEF2F2",
              borderRadius: 14, borderWidth: 1.5,
              borderColor: salesDiff >= 0 ? "#6EE7B7" : "#FECACA",
              padding: 8, alignItems: "center", justifyContent: "center", gap: 2,
            }}>
              <Text style={{ fontSize: 18 }}>{salesDiff >= 0 ? "📈" : "📉"}</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: salesDiff >= 0 ? "#065F46" : "#991B1B" }}>
                {salesDiff >= 0 ? "+" : ""}{salesDiff >= 1000 ? `${(salesDiff / 1000).toFixed(1)}K` : salesDiff.toFixed(0)}
              </Text>
              {salesDiffPct !== null && (
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: salesDiff >= 0 ? "#059669" : "#DC2626" }}>
                  {salesDiff >= 0 ? "▲" : "▼"}{Math.abs(salesDiffPct).toFixed(1)}%
                </Text>
              )}
            </View>
          ) : (
            <View style={{ width: 68, backgroundColor: colors.secondary, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 8, alignItems: "center", justifyContent: "center", gap: 3 }}>
              <Text style={{ fontSize: 16 }}>📊</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.mutedForeground, textAlign: "center" }}>vs prev</Text>
            </View>
          )}
        </View>

        {/* ── Grid divider line ──────────────────────────────────────── */}
        <View style={{ marginHorizontal: 14, marginVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <View style={{ flexDirection: "row", gap: 3 }}>
            {[0,1,2,3].map(i => (
              <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            ))}
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        {/* ── Balance tiles (BOTTOM) ─────────────────────────────────── */}
        <View style={[styles.balanceGrid, { marginTop: 0 }]}>
          <BalanceTile label="BANK" emoji="🏦" value={bankBal} color="#2563EB" accentBg="#EFF6FF" colors={colors} />
          <BalanceTile label="STOCK" emoji="📦" value={stockVal} color="#D97706" accentBg="#FFF7ED" colors={colors} />
          <BalanceTile label="CREDIT" emoji="📈" value={creditIn} color="#7C3AED" accentBg="#F3E8FF" colors={colors} />
          <BalanceTile label="TOTAL" emoji="💰" value={grandTotal} color="#059669" accentBg="#ECFDF5" colors={colors} isTotal />
        </View>

        {/* ── Product picker ───────────────────────────────────────────── */}
        {canSelectProduct ? (
          /* Admin / Manager — tap card to open full modal */
          <TouchableOpacity
            style={[styles.productCard, {
              backgroundColor: colors.card,
              borderColor: stockWarning === "out-of-stock" ? colors.danger
                : stockWarning === "exceeds-stock" ? "#F59E0B"
                : selectedProduct ? colors.primary : colors.border,
            }]}
            onPress={() => setShowProductModal(true)}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              {selectedProduct ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: (selectedProduct.stock ?? 0) > 0 ? colors.success : colors.danger }} />
                    <Text style={[styles.productName, { color: colors.text }]}>{selectedProduct.name}</Text>
                    <View style={[styles.stockBadge, { backgroundColor: (selectedProduct.stock ?? 0) > 0 ? colors.saleBg : colors.dangerBg }]}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: (selectedProduct.stock ?? 0) > 0 ? colors.success : colors.danger }}>
                        Stock: {selectedProduct.stock ?? 0} {selectedProduct.unit}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.primary }}>Retail {parseFloat(selectedProduct.unitPrice).toFixed(2)}</Text>
                    </View>
                    <View style={{ backgroundColor: colors.purchaseBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.purchase }}>WS {parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}</Text>
                    </View>
                  </View>
                  {stockWarning === "out-of-stock" && (
                    <View style={[styles.alertRow, { backgroundColor: colors.dangerBg }]}>
                      
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.danger }}>OUT OF STOCK — Cannot sell</Text>
                    </View>
                  )}
                  {stockWarning === "exceeds-stock" && (
                    <View style={[styles.alertRow, { backgroundColor: "#FEF3C7" }]}>
                      
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#D97706" }}>QTY {qty} exceeds stock of {selectedProduct.stock}</Text>
                    </View>
                  )}
                  {/* Set Default button for product */}
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                    {selectedProduct.id !== defaults.productId ? (
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation?.(); saveDefault("productId", selectedProduct.id); }}
                        style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#FDE68A", alignSelf: "flex-start" }}
                      >
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#92400E" }}>★ Set Default</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#BBF7D0", alignSelf: "flex-start" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#166534" }}>★ Default</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>🛍️</Text>
                  </View>
                  <View>
                    <Text style={[styles.productPlaceholder, { color: colors.primary }]}>Tap to select product</Text>
                    <Text style={[styles.productSub, { color: colors.mutedForeground }]}>Required to begin sale</Text>
                  </View>
                </View>
              )}
            </View>
            <View style={[styles.productChevron, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: 16, color: colors.primary, fontFamily: "Inter_700Bold" }}>›</Text>
            </View>
          </TouchableOpacity>
        ) : (
          /* Cashier — quick-tap product icon chips */
          <View style={[styles.productCard, {
            backgroundColor: colors.card,
            borderColor: stockWarning === "out-of-stock" ? colors.danger
              : stockWarning === "exceeds-stock" ? "#F59E0B"
              : selectedProduct ? colors.primary : colors.border,
            flexDirection: "column", gap: 10,
          }]}>
            {/* Selected product info row */}
            {selectedProduct ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: (selectedProduct.stock ?? 0) > 0 ? colors.success : colors.danger }} />
                <Text style={[styles.productName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{selectedProduct.name}</Text>
                <View style={[styles.stockBadge, { backgroundColor: (selectedProduct.stock ?? 0) > 0 ? colors.saleBg : colors.dangerBg }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: (selectedProduct.stock ?? 0) > 0 ? colors.success : colors.danger }}>
                    Stock: {selectedProduct.stock ?? 0} {selectedProduct.unit}
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.primary }}>
                    ₨{parseFloat(rateMode === "wholesale" ? (selectedProduct.wholesalePrice || selectedProduct.unitPrice) : selectedProduct.unitPrice).toFixed(0)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.productPlaceholder, { color: colors.mutedForeground }]}>Select a product below</Text>
            )}

            {/* Product chip grid */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: "row" }}>
              {activeProducts.map(p => {
                const isSelected = selectedProduct?.id === p.id;
                const inStock = (p.stock ?? 0) > 0;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={{
                      alignItems: "center", gap: 4,
                      paddingHorizontal: 12, paddingVertical: 9,
                      borderRadius: 14, borderWidth: 2,
                      backgroundColor: isSelected ? colors.primary : inStock ? colors.secondary : colors.dangerBg,
                      borderColor: isSelected ? colors.primary : inStock ? colors.border : colors.danger,
                      minWidth: 70,
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setSelectedProduct(p);
                      setRateMode("normal");
                    }}
                    activeOpacity={0.75}
                  >
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={{ width: 36, height: 36, borderRadius: 10 }} />
                    ) : (
                      <Text style={{ fontSize: 20, lineHeight: 24 }}>{inStock ? "📦" : "🚫"}</Text>
                    )}
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: isSelected ? "#FFF" : colors.text, textAlign: "center" }} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: isSelected ? "rgba(255,255,255,0.8)" : inStock ? colors.success : colors.danger }}>
                      {inStock ? `${p.stock} ${p.unit}` : "OUT"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Stock warnings */}
            {stockWarning === "out-of-stock" && (
              <View style={[styles.alertRow, { backgroundColor: colors.dangerBg }]}>
                
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.danger }}>OUT OF STOCK — Cannot sell</Text>
              </View>
            )}
            {stockWarning === "exceeds-stock" && (
              <View style={[styles.alertRow, { backgroundColor: "#FEF3C7" }]}>
                
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#D97706" }}>QTY {qty} exceeds stock of {selectedProduct?.stock}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Rate toggle ──────────────────────────────────────────────── */}
        {selectedProduct && (
          <View style={[styles.rateToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "normal" && { backgroundColor: colors.primary }]}
              onPress={() => { setRateMode("normal"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              
              <Text style={[styles.rateBtnText, { color: rateMode === "normal" ? "#FFF" : colors.mutedForeground }]}>
                Retail {parseFloat(selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "wholesale" && { backgroundColor: colors.purchase }]}
              onPress={() => { setRateMode("wholesale"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              
              <Text style={[styles.rateBtnText, { color: rateMode === "wholesale" ? "#FFF" : colors.mutedForeground }]}>
                Wholesale {parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Amount + QTY + Presets (unified card) ───────────────────── */}
        <View style={[styles.displayCard, { backgroundColor: colors.card, borderColor: colors.border, overflow: "hidden" }]}>

          {/* Single row: AMOUNT | divider | QTY + copy */}
          <View style={{ flexDirection: "row", alignItems: "stretch" }}>
            {/* Amount side — blue tinted, red if exceeds balance */}
            <View style={{ flex: 1.1, padding: 12, paddingRight: 10, backgroundColor: balanceShortfall > 0 ? "#FEF2F2" : "#EFF6FF" }}>
              <Text style={[styles.amountLabel, { color: balanceShortfall > 0 ? "#EF4444" : "#3B82F6", marginBottom: 2 }]}>
                {balanceShortfall > 0 ? "⚠️ AMOUNT" : "💵 AMOUNT"}
              </Text>
              <Text style={[styles.amountValue, { color: balanceShortfall > 0 ? "#DC2626" : "#1E40AF", fontSize: 24 }]} numberOfLines={1} adjustsFontSizeToFit>
                {typedPart}
                <Text style={{ color: "#93C5FD", opacity: 0.5 }}>{ghostPart}</Text>
              </Text>
              {balanceShortfall > 0 && (
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#EF4444", marginTop: 3 }}>
                  Short ₨{balanceShortfall.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              )}
            </View>

            {/* Vertical separator */}
            <View style={{ width: 1, backgroundColor: colors.border }} />

            {/* QTY side — emerald or red if exceeds stock */}
            <View style={{ flex: 1, padding: 12, paddingLeft: 10, backgroundColor: stockWarning ? "#FEF2F2" : "#ECFDF5" }}>
              <Text style={[styles.qtyLabel, { color: stockWarning ? "#EF4444" : "#059669", marginBottom: 2 }]}>
                {stockWarning ? "⚠️ QTY" : "📦 QTY"}{selectedProduct ? ` @ ${activePrice.toFixed(0)}` : ""}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <View>
                  <Text style={[{ fontFamily: "Inter_700Bold", fontSize: 30, lineHeight: 36 }, {
                    color: stockWarning ? "#DC2626" : qty > 0 ? "#065F46" : "#6EE7B7",
                  }]}>
                    {qty > 0 ? qty.toLocaleString() : "—"}
                  </Text>
                  {stockWarning === "exceeds-stock" && selectedProduct && (
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#EF4444" }}>
                      Max {selectedProduct.stock} {selectedProduct.unit}
                    </Text>
                  )}
                  {stockWarning === "out-of-stock" && (
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#EF4444" }}>
                      Out of stock
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
                    backgroundColor: copyError ? "#FEF2F2" : copiedQty ? "#F0FDF4" : "transparent",
                    borderColor: copyError ? "#FECACA" : copiedQty ? "#BBF7D0" : colors.border,
                    opacity: qty <= 0 ? 0.35 : 1,
                  }}
                  onPress={handleCopyQty} disabled={qty <= 0}
                  activeOpacity={0.5}
                >
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: copyError ? "#EF4444" : copiedQty ? "#16A34A" : colors.mutedForeground }}>
                    {copyError ? "Error" : copiedQty ? "✓ Copied" : "Copy QTY"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Preset buttons row */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 7, paddingHorizontal: 10, paddingVertical: 9 }}>
            {([
              { v: 100,  label: "100",  bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
              { v: 200,  label: "200",  bg: "#FCE7F3", border: "#EC4899", text: "#831843" },
              { v: 300,  label: "300",  bg: "#EDE9FE", border: "#8B5CF6", text: "#4C1D95" },
              { v: 500,  label: "500",  bg: "#DBEAFE", border: "#3B82F6", text: "#1E3A8A" },
              { v: 1000, label: "1K",   bg: "#E0E7FF", border: "#6366F1", text: "#312E81" },
              { v: 1500, label: "1.5K", bg: "#FEE2E2", border: "#EF4444", text: "#7F1D1D" },
              { v: 5000, label: "5K",   bg: "#D1FAE5", border: "#10B981", text: "#064E3B" },
            ] as const).map(({ v, label, bg, border, text }) => {
              const isSelected = parseFloat(amount) === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
                    backgroundColor: isSelected ? border : bg,
                    borderColor: border,
                    minWidth: 52, alignItems: "center",
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setAmount(String(v));
                  }}
                >
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: isSelected ? "#FFF" : text }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Customer + Location + Account pickers ───────────────────── */}
        <View style={[styles.optionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Customer — only shown if credit sale is allowed */}
          {canCreditSale && (
            <TouchableOpacity
              style={[styles.optionRow, { borderBottomColor: colors.border, alignItems: "flex-start", paddingVertical: selectedCustomer?.creditBalance ? 11 : 13 }]}
              onPress={() => setShowCustomerModal(true)}
            >
              <View style={[styles.optionIcon, { backgroundColor: selectedCustomer ? "#FEF3C7" : colors.secondary, marginTop: 2 }]}>
                <Text style={{ fontSize: 16 }}>{selectedCustomer ? "👤" : "👥"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 0.4 }}>CUSTOMER</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: selectedCustomer ? colors.text : colors.mutedForeground, marginTop: 1 }}>
                  {selectedCustomer?.name ?? "Walk-in"}
                </Text>
                {selectedCustomer?.creditBalance !== undefined && selectedCustomer.creditBalance !== null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.mutedForeground }}>Previous credit:</Text>
                    <View style={{
                      backgroundColor: parseFloat(selectedCustomer.creditBalance) > 0 ? "#FEF3C7" : "#ECFDF5",
                      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
                    }}>
                      <Text style={{
                        fontFamily: "Inter_700Bold", fontSize: 10,
                        color: parseFloat(selectedCustomer.creditBalance) > 0 ? "#92400E" : "#065F46",
                      }}>
                        ₨{parseFloat(selectedCustomer.creditBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {parseFloat(selectedCustomer.creditBalance) > 0 ? " ⚠️ owing" : " ✓ clear"}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 18, color: colors.mutedForeground }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Account */}
          <TouchableOpacity
            style={[styles.optionRow, { borderBottomColor: colors.border, borderBottomWidth: 0, alignItems: "flex-start" }]}
            onPress={() => {
              if (!canSelectAccount) {
                Alert.alert("Access Denied", "You don't have permission to change the payment account.");
                return;
              }
              setShowAccountModal(true);
            }}
          >
            {(() => {
              const ac = selectedAccount ? acctColor(selectedAccount.type) : null;
              return (
                <View style={[styles.optionIcon, {
                  backgroundColor: ac ? ac.bg : (canSelectAccount ? colors.dangerBg : colors.input),
                  borderWidth: ac ? 1 : 0,
                  borderColor: ac?.border,
                }]}>
                  <Text style={{ fontSize: 15 }}>
                    {selectedAccount ? acctEmoji(selectedAccount.type) : "🏧"}
                  </Text>
                </View>
              );
            })()}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, letterSpacing: 0.4 }}>ACCOUNT</Text>
              {selectedAccount ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>{selectedAccount.name}</Text>
                  {(() => {
                    const ac = acctColor(selectedAccount.type);
                    return (
                      <View style={{ backgroundColor: ac.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: ac.border }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: ac.text }}>
                          {selectedAccount.type.charAt(0).toUpperCase() + selectedAccount.type.slice(1)}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              ) : (
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: canSelectAccount ? colors.danger : colors.mutedForeground, marginTop: 1 }}>
                  {canSelectAccount ? "Required for cash sale" : "Locked by admin"}
                </Text>
              )}
              {selectedAccount && (
                <>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                    Balance: ₨{parseFloat(selectedAccount.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                  <View style={{ marginTop: 6 }}>
                    {selectedAccount.id !== defaults.accountId ? (
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation?.(); saveDefault("accountId", selectedAccount.id); }}
                        style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#FDE68A", alignSelf: "flex-start" }}
                      >
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#92400E" }}>★ Set Default</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#BBF7D0", alignSelf: "flex-start" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#166534" }}>★ Default</Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 18, color: colors.mutedForeground }}>›</Text>
            
          </TouchableOpacity>
        </View>

        {/* ── Numpad ──────────────────────────────────────────────────── */}
        <View style={[styles.numpadContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {NUMPAD_KEYS.map((row, ri) => (
            <View key={ri} style={styles.numpadRow}>
              {row.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.numpadKey, {
                    backgroundColor: key === "⌫" ? colors.numpadDelete : key === "." ? colors.secondary : colors.numpadKey,
                    borderColor: colors.border,
                  }]}
                  onPress={() => handleNumpad(key)}
                  activeOpacity={0.6}
                >
                  {key === "⌫"
                    ? null
                    : <Text style={[styles.numpadKeyText, { color: key === "." ? colors.primary : colors.numpadKeyText }]}>{key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: colors.numpadDelete }]}
            onPress={() => { setAmount("0"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}
          >
            
          </TouchableOpacity>

          {canCreditSale && (
            <TouchableOpacity
              style={[styles.creditBtn, {
                backgroundColor: validations.canSell && selectedCustomer ? colors.credit : colors.mutedForeground,
                opacity: createSaleMutation.isPending ? 0.7 : 1,
              }]}
              onPress={handleCreditSale}
              disabled={createSaleMutation.isPending}
            >
              
              <Text style={styles.actionBtnText}>Credit</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.completeBtn, {
              backgroundColor: cashValidations.canComplete ? colors.success : colors.mutedForeground,
              opacity: createSaleMutation.isPending ? 0.7 : 1,
              flex: canCreditSale ? 2 : 3,
            }]}
            onPress={handleCompleteSale}
            disabled={createSaleMutation.isPending}
          >
            {createSaleMutation.isPending
              ? <Text style={styles.actionBtnText}>Processing...</Text>
              : <><Text style={styles.actionBtnText}>Complete Sale</Text></>}
          </TouchableOpacity>
        </View>

        {/* ── Validation checklist ──────────────────────────────────────── */}
        {(cashValidations.errors.length > 0 || validations.warnings.length > 0) && (
          <View style={[styles.validationBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.validationTitle, { color: colors.mutedForeground }]}>CHECKLIST</Text>
            {cashValidations.errors.map((e, i) => (
              <View key={i} style={styles.validationRow}>
                
                <Text style={[styles.validationText, { color: colors.danger }]}>{e}</Text>
              </View>
            ))}
            {validations.warnings.map((w, i) => (
              <View key={i} style={styles.validationRow}>
                
                <Text style={[styles.validationText, { color: "#D97706" }]}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Privilege notice ────────────────────────────────────────── */}
        {(!canCreditSale || allowedProductIds !== null || allowedAccountIds !== null || allowedLocationIds !== null) && (
          <View style={[styles.privNotice, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
            
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#92400E", flex: 1 }}>
              {allowedProductIds !== null
                ? `Products: ${activeProducts.length} allowed. `
                : ""}
              {allowedLocationIds !== null
                ? `Locations: ${allowedLocations.length} allowed. `
                : ""}
              {allowedAccountIds !== null
                ? `Accounts: ${allowedAccounts.length} allowed. `
                : ""}
              {!canCreditSale ? "Credit sales disabled." : ""}
            </Text>
          </View>
        )}

      </ScrollView>

      <ProductPickerModal
        visible={showProductModal}
        products={activeProducts}
        onSelect={p => { setSelectedProduct(p); setRateMode("normal"); }}
        onClose={() => setShowProductModal(false)}
      />
      <PickerModal<Customer>
        visible={showCustomerModal} title="Select Customer" items={customers}
        onSelect={setSelectedCustomer} onClose={() => setShowCustomerModal(false)}
        renderSub={c => c.phone ?? ""}
      />
      <AccountPickerModal
        visible={showAccountModal} accounts={allowedAccounts}
        onSelect={setSelectedAccount} onClose={() => setShowAccountModal(false)}
      />
      <PickerModal<Location>
        visible={showLocationModal} title="Select App" items={allowedLocations}
        onSelect={setSelectedLocation} onClose={() => setShowLocationModal(false)}
        renderSub={l => l.address ?? ""}
      />
    </View>
  );
}

function BalanceTile({
  label, emoji, value, color, accentBg, colors, isTotal,
}: {
  label: string; emoji: string; value: number | null;
  color: string; accentBg: string; isTotal?: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[
      styles.balanceTile,
      {
        backgroundColor: colors.card,
        borderColor: isTotal ? color : colors.border,
        borderWidth: isTotal ? 1.5 : 1,
      }
    ]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <View style={[styles.balanceIconWrap, { backgroundColor: accentBg }]}>
          <Text style={{ fontSize: 14, lineHeight: 18 }}>{emoji}</Text>
        </View>
        <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text
        style={[styles.balanceValue, { color: value !== null ? color : colors.mutedForeground, fontSize: isTotal ? 15 : 14 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value !== null ? formatK(value) : "—"}
      </Text>
      {isTotal && (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: color, marginTop: 5, opacity: 0.5 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF", letterSpacing: 1 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  headerRight: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  logoCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.6)", shadowColor: "#1E3A8A", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#1E40AF", lineHeight: 30, marginTop: -1 },
  madeBy: { fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: 0.3 },
  dollarBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  dollarUsd: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#0891B2", lineHeight: 14 },
  dollarPkr: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#475569", lineHeight: 13 },
  userBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  // Location banner
  locationBanner: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  locationIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  locationBannerLabel: { fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8 },
  locationBannerName: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 1 },
  // Balance tiles
  balanceGrid: { marginHorizontal: 12, marginTop: 12, flexDirection: "row", gap: 7 },
  balanceTile: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 13, borderWidth: 1 },
  balanceTileFirst: {},
  balanceIconWrap: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  balanceLabel: { fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.5 },
  balanceValue: { fontFamily: "Inter_700Bold", fontSize: 13 },
  balSep: { width: 1, marginVertical: 12 },
  // Product
  productCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 2, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  productName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  productPlaceholder: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  productSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  productChevron: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, padding: 7, borderRadius: 8 },
  // Rate toggle
  rateToggle: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, flexDirection: "row", padding: 4, gap: 4 },
  rateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 11 },
  rateBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  // Display
  displayCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  amountSection: { padding: 16, paddingBottom: 12 },
  amountLabel: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  amountValue: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
  divider: { height: 1 },
  qtySection: { padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  qtyValue: { fontFamily: "Inter_700Bold", fontSize: 44, lineHeight: 52 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  // Quick presets
  presetRow: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  presetLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.8 },
  presetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5 },
  presetBtnText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  copyText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  // Options
  optionsCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  optionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 10, borderBottomWidth: 1 },
  optionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 72 },
  optionValue: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, textAlign: "right", marginRight: 4 },
  balBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  // Numpad
  numpadContainer: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 10, gap: 8 },
  numpadRow: { flexDirection: "row", gap: 8 },
  numpadKey: { flex: 1, borderRadius: 12, borderWidth: 1, height: 56, alignItems: "center", justifyContent: "center" },
  numpadKeyText: { fontFamily: "Inter_700Bold", fontSize: 20 },
  // Actions
  actionsRow: { marginHorizontal: 14, marginTop: 10, flexDirection: "row", gap: 8 },
  clearBtn: { width: 52, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  creditBtn: { flex: 1, height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completeBtn: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF" },
  // Validation
  validationBox: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  validationTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1, marginBottom: 2 },
  validationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  validationText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  // Priv notice
  privNotice: { marginHorizontal: 14, marginTop: 8, borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
});

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState, useMemo } from "react";
import {
  Alert, FlatList, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListProducts, useListCustomers, useListAccounts,
  useCreateSale, useGetDashboard, customFetch,
} from "@workspace/api-client-react";
import { useAuth, hasPrivilege, getAllowedProductIds, getAllowedAccountIds } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const NUMPAD_KEYS = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [".", "0", "⌫"]];

function formatK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Product = { id: number; name: string; unitPrice: string; wholesalePrice: string; unit: string; stock: number; isActive?: boolean };
type Customer = { id: number; name: string; phone?: string | null };
type Account = { id: number; name: string; type: string; balance: string; currency: string };
type RateMode = "normal" | "wholesale";

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
              <Feather name="x" size={18} color={colors.mutedForeground} />
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

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  // ── Privileges ─────────────────────────────────────────────────────────
  const canSelectProduct  = hasPrivilege(user, "pos_product");
  const canSelectAccount  = hasPrivilege(user, "pos_account");
  const canCreditSale     = hasPrivilege(user, "pos_credit_customer");
  const canSelectLocation = hasPrivilege(user, "pos_location");

  const [amount, setAmount] = useState("0");
  const [rateMode, setRateMode] = useState<RateMode>("normal");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [copiedQty, setCopiedQty] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [dollarBalance, setDollarBalance] = useState<{ usd: number; pkr: number; rate: number } | null>(null);

  const { data: productsRaw } = useListProducts();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const { data: dashboardRaw } = useGetDashboard();
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

  const products = (productsRaw ?? []) as unknown as Product[];
  const customers = (customersRaw ?? []) as unknown as Customer[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];

  // ── Entity-level filtering ─────────────────────────────────────────────
  const allowedProductIds = getAllowedProductIds(user);
  const allowedAccountIds = getAllowedAccountIds(user);

  const activeProducts = products
    .filter(p => p.isActive !== false)
    .filter(p => allowedProductIds === null || allowedProductIds.has(p.id));

  const allowedAccounts = accounts
    .filter(a => allowedAccountIds === null || allowedAccountIds.has(a.id));

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

  const cashValidations = useMemo(() => {
    const errors = [...validations.errors];
    if (!selectedAccount) errors.push("Select an account to receive payment");
    return { errors, canComplete: errors.length === 0 };
  }, [validations.errors, selectedAccount]);

  // ── Dashboard figures ──────────────────────────────────────────────────
  const dash = dashboardRaw as unknown as {
    totalAccountsBalance?: string; totalStockValue?: string;
    creditReceivable?: string; creditPayable?: string;
  } | undefined;
  const bankBal   = dash?.totalAccountsBalance ? parseFloat(dash.totalAccountsBalance) : null;
  const stockVal  = dash?.totalStockValue      ? parseFloat(dash.totalStockValue)       : null;
  const creditIn  = dash?.creditReceivable     ? parseFloat(dash.creditReceivable)      : null;
  const outstanding = dash?.creditPayable      ? parseFloat(dash.creditPayable)         : null;

  // ── Display helpers ────────────────────────────────────────────────────
  const { typedPart, ghostPart } = (() => {
    if (amount.includes(".")) {
      const [intPart, decPart = ""] = amount.split(".");
      return { typedPart: intPart + "." + decPart, ghostPart: "0".repeat(Math.max(0, 8 - decPart.length)) };
    }
    return { typedPart: amount + ".", ghostPart: "00000000" };
  })();

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
    } catch { Alert.alert("Copy QTY", `QTY: ${qty}`); }
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
          locationId: user.locationId ?? null,
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
          locationId: user.locationId ?? null,
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
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>COINS SALE</Text>
          <Text style={styles.headerSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerRight}>
          {dollarBalance !== null && dollarBalance.usd !== 0 && (
            <View style={styles.dollarBadge}>
              <Feather name="dollar-sign" size={13} color="#0891B2" />
              <View>
                <Text style={styles.dollarUsd}>{dollarBalance.usd.toFixed(2)} USD</Text>
                <Text style={styles.dollarPkr}>₨{dollarBalance.pkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
              </View>
            </View>
          )}
          <View style={styles.userBadge}>
            <Feather name="user" size={12} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.primary }}>{user?.name?.split(" ")[0] ?? "—"}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Balance tiles ──────────────────────────────────────────── */}
        <View style={[styles.balanceGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <BalanceTile label="BANK" icon="briefcase" value={bankBal} color={colors.primary} bg="#EFF6FF" colors={colors} />
          <View style={[styles.balSep, { backgroundColor: colors.border }]} />
          <BalanceTile label="STOCK" icon="package" value={stockVal} color="#D97706" bg="#FFF7ED" colors={colors} />
          <View style={[styles.balSep, { backgroundColor: colors.border }]} />
          <BalanceTile label="CREDIT IN" icon="trending-up" value={creditIn} color="#7C3AED" bg="#F3E8FF" colors={colors} />
          <View style={[styles.balSep, { backgroundColor: colors.border }]} />
          <BalanceTile
            label="OUTSTANDING"
            icon="alert-triangle"
            value={outstanding}
            color={outstanding !== null && outstanding > 0 ? colors.danger : colors.success}
            bg={outstanding !== null && outstanding > 0 ? "#FEF2F2" : "#ECFDF5"}
            colors={colors}
          />
        </View>

        {/* ── Product picker ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.productCard, {
            backgroundColor: colors.card,
            borderColor: stockWarning === "out-of-stock" ? colors.danger
              : stockWarning === "exceeds-stock" ? "#F59E0B"
              : selectedProduct ? colors.primary : colors.border,
          }]}
          onPress={() => {
            if (!canSelectProduct) {
              Alert.alert("Access Denied", "You don't have permission to change the product.");
              return;
            }
            setShowProductModal(true);
          }}
          activeOpacity={canSelectProduct ? 0.85 : 1}
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
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.purchase }}>Wholesale {parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}</Text>
                  </View>
                </View>
                {stockWarning === "out-of-stock" && (
                  <View style={[styles.alertRow, { backgroundColor: colors.dangerBg }]}>
                    <Feather name="alert-triangle" size={11} color={colors.danger} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.danger }}>OUT OF STOCK — Cannot sell</Text>
                  </View>
                )}
                {stockWarning === "exceeds-stock" && (
                  <View style={[styles.alertRow, { backgroundColor: "#FEF3C7" }]}>
                    <Feather name="alert-circle" size={11} color="#D97706" />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#D97706" }}>QTY {qty} exceeds stock of {selectedProduct.stock}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.productPlaceholder, { color: canSelectProduct ? colors.mutedForeground : colors.danger }]}>
                  {canSelectProduct ? "Tap to select product" : "No permission to select product"}
                </Text>
                <Text style={[styles.productSub, { color: colors.mutedForeground }]}>Required to begin sale</Text>
              </>
            )}
          </View>
          <View style={[styles.productChevron, { backgroundColor: canSelectProduct ? colors.secondary : colors.dangerBg }]}>
            <Feather name={canSelectProduct ? "chevron-down" : "lock"} size={18} color={canSelectProduct ? colors.primary : colors.danger} />
          </View>
        </TouchableOpacity>

        {/* ── Rate toggle ──────────────────────────────────────────────── */}
        {selectedProduct && (
          <View style={[styles.rateToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "normal" && { backgroundColor: colors.primary }]}
              onPress={() => { setRateMode("normal"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              <Feather name="tag" size={13} color={rateMode === "normal" ? "#FFF" : colors.mutedForeground} />
              <Text style={[styles.rateBtnText, { color: rateMode === "normal" ? "#FFF" : colors.mutedForeground }]}>
                Retail {parseFloat(selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "wholesale" && { backgroundColor: colors.purchase }]}
              onPress={() => { setRateMode("wholesale"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              <Feather name="layers" size={13} color={rateMode === "wholesale" ? "#FFF" : colors.mutedForeground} />
              <Text style={[styles.rateBtnText, { color: rateMode === "wholesale" ? "#FFF" : colors.mutedForeground }]}>
                Wholesale {parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Amount display ───────────────────────────────────────────── */}
        <View style={[styles.displayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.amountSection}>
            <Text style={[styles.amountLabel, { color: colors.mutedForeground }]}>AMOUNT (8 DECIMALS)</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              {typedPart}
              <Text style={{ color: colors.mutedForeground, opacity: 0.35 }}>{ghostPart}</Text>
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.qtySection}>
            <View>
              <Text style={[styles.qtyLabel, { color: colors.mutedForeground }]}>
                QTY{selectedProduct ? ` @ ${activePrice.toFixed(2)}/${selectedProduct.unit}` : ""}
              </Text>
              <Text style={[styles.qtyValue, {
                color: stockWarning ? colors.danger : qty > 0 ? colors.success : colors.mutedForeground,
              }]}>
                {qty > 0 ? qty.toLocaleString() : "—"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, {
                backgroundColor: copiedQty ? colors.saleBg : colors.secondary,
                borderColor: copiedQty ? colors.success : colors.border,
              }]}
              onPress={handleCopyQty} disabled={qty <= 0}
            >
              <Feather name={copiedQty ? "check" : "copy"} size={15} color={copiedQty ? colors.success : colors.primary} />
              <Text style={[styles.copyText, { color: copiedQty ? colors.success : colors.primary }]}>{copiedQty ? "Copied!" : "Copy QTY"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Customer + Account pickers ───────────────────────────────── */}
        <View style={[styles.optionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Customer — only shown if credit sale is allowed */}
          {canCreditSale && (
            <TouchableOpacity
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => setShowCustomerModal(true)}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="user" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Customer</Text>
              <Text style={[styles.optionValue, { color: selectedCustomer ? colors.text : colors.mutedForeground }]}>
                {selectedCustomer?.name ?? "Walk-in"}
              </Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {/* Account */}
          <TouchableOpacity
            style={[styles.optionRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}
            onPress={() => {
              if (!canSelectAccount) {
                Alert.alert("Access Denied", "You don't have permission to change the payment account.");
                return;
              }
              setShowAccountModal(true);
            }}
          >
            <View style={[styles.optionIcon, { backgroundColor: selectedAccount ? colors.secondary : (canSelectAccount ? colors.dangerBg : colors.input) }]}>
              <Feather
                name={canSelectAccount ? "credit-card" : "lock"}
                size={14}
                color={selectedAccount ? colors.primary : (canSelectAccount ? colors.danger : colors.mutedForeground)}
              />
            </View>
            <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Account</Text>
            {selectedAccount ? (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginRight: 4 }}>
                <Text style={[styles.optionValue, { color: colors.text, flex: 0 }]}>{selectedAccount.name}</Text>
                <View style={[styles.balBadge, { backgroundColor: colors.saleBg }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: colors.success }}>
                    ₨{parseFloat(selectedAccount.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.optionValue, { color: canSelectAccount ? colors.danger : colors.mutedForeground }]}>
                {canSelectAccount ? "Required for cash sale" : "Locked by admin"}
              </Text>
            )}
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
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
                    ? <Feather name="delete" size={20} color={colors.numpadDeleteText} />
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
            <Feather name="rotate-ccw" size={16} color={colors.danger} />
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
              <Feather name="clock" size={18} color="#FFF" />
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
              : <><Feather name="check-circle" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Complete Sale</Text></>}
          </TouchableOpacity>
        </View>

        {/* ── Validation checklist ──────────────────────────────────────── */}
        {(cashValidations.errors.length > 0 || validations.warnings.length > 0) && (
          <View style={[styles.validationBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.validationTitle, { color: colors.mutedForeground }]}>CHECKLIST</Text>
            {cashValidations.errors.map((e, i) => (
              <View key={i} style={styles.validationRow}>
                <Feather name="x-circle" size={13} color={colors.danger} />
                <Text style={[styles.validationText, { color: colors.danger }]}>{e}</Text>
              </View>
            ))}
            {validations.warnings.map((w, i) => (
              <View key={i} style={styles.validationRow}>
                <Feather name="alert-triangle" size={13} color="#D97706" />
                <Text style={[styles.validationText, { color: "#D97706" }]}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Privilege notice ────────────────────────────────────────── */}
        {(!canSelectProduct || !canSelectAccount || !canCreditSale || allowedProductIds !== null || allowedAccountIds !== null) && (
          <View style={[styles.privNotice, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
            <Feather name="shield" size={13} color="#D97706" />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#92400E", flex: 1 }}>
              {allowedProductIds !== null
                ? `Products: ${activeProducts.length} allowed. `
                : ""}
              {allowedAccountIds !== null
                ? `Accounts: ${allowedAccounts.length} allowed. `
                : ""}
              {!canCreditSale ? "Credit sales disabled." : ""}
            </Text>
          </View>
        )}

      </ScrollView>

      <PickerModal<Product>
        visible={showProductModal} title="Select Product" items={activeProducts}
        onSelect={p => { setSelectedProduct(p); setRateMode("normal"); }} onClose={() => setShowProductModal(false)}
        renderSub={p => `Stock: ${p.stock} ${p.unit}  ·  Retail ${parseFloat(p.unitPrice).toFixed(2)}  ·  WS ${parseFloat(p.wholesalePrice || p.unitPrice).toFixed(2)}`}
      />
      <PickerModal<Customer>
        visible={showCustomerModal} title="Select Customer" items={customers}
        onSelect={setSelectedCustomer} onClose={() => setShowCustomerModal(false)}
        renderSub={c => c.phone ?? ""}
      />
      <PickerModal<Account>
        visible={showAccountModal} title="Select Payment Account" items={allowedAccounts}
        onSelect={setSelectedAccount} onClose={() => setShowAccountModal(false)}
        renderSub={a => `${a.type}  ·  Balance: ₨${parseFloat(a.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
      />
    </View>
  );
}

function BalanceTile({
  label, icon, value, color, bg, colors,
}: {
  label: string; icon: string; value: number | null;
  color: string; bg: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[styles.balanceTile]}>
      <View style={[styles.balanceIconWrap, { backgroundColor: bg }]}>
        <Feather name={icon as "briefcase"} size={14} color={color} />
      </View>
      <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.balanceValue, { color: value !== null ? color : colors.mutedForeground }]} numberOfLines={1}>
        {value !== null ? formatK(value) : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF", letterSpacing: 1 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollarBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  dollarUsd: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#0891B2", lineHeight: 14 },
  dollarPkr: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#475569", lineHeight: 13 },
  userBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  // Balance tiles
  balanceGrid: { marginHorizontal: 14, marginTop: 12, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "stretch" },
  balanceTile: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 4 },
  balanceTileFirst: { borderLeftWidth: 0 },
  balanceIconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  balanceLabel: { fontFamily: "Inter_500Medium", fontSize: 8, letterSpacing: 0.5, textAlign: "center", marginBottom: 3 },
  balanceValue: { fontFamily: "Inter_700Bold", fontSize: 12, textAlign: "center" },
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

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListProducts,
  useListCustomers,
  useListAccounts,
  useCreateSale,
  useGetDashboard,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const NUMPAD_KEYS = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [".", "0", "⌫"]];

function formatK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "75%" }}>
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

  const [amount, setAmount] = useState("0");
  const [rateMode, setRateMode] = useState<RateMode>("normal");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [copiedQty, setCopiedQty] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const { data: productsRaw } = useListProducts();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const { data: dashboardRaw } = useGetDashboard();
  const createSaleMutation = useCreateSale();

  const products = (productsRaw ?? []) as unknown as Product[];
  const customers = (customersRaw ?? []) as unknown as Customer[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];
  const activeProducts = products.filter(p => p.isActive !== false);

  const parsedAmount = parseFloat(amount) || 0;
  const activePrice = selectedProduct
    ? parseFloat(rateMode === "wholesale" ? (selectedProduct.wholesalePrice || selectedProduct.unitPrice) : selectedProduct.unitPrice)
    : 0;
  const qty = selectedProduct && parsedAmount > 0 && activePrice > 0 ? Math.round(parsedAmount / activePrice) : 0;

  const dash = dashboardRaw as unknown as { totalAccountsBalance?: string; totalStockValue?: string; creditReceivable?: string; creditPayable?: string } | undefined;
  const totalBank = dash?.totalAccountsBalance ? parseFloat(dash.totalAccountsBalance) : null;
  const totalStock = dash?.totalStockValue ? parseFloat(dash.totalStockValue) : null;
  const totalCredit = dash?.creditReceivable ? parseFloat(dash.creditReceivable) : null;
  const totalPayable = dash?.creditPayable ? parseFloat(dash.creditPayable) : null;
  const leftBalance = (totalBank !== null && totalStock !== null && totalCredit !== null && totalPayable !== null)
    ? totalBank + totalStock + totalCredit - totalPayable
    : null;

  const { typedPart, ghostPart } = (() => {
    if (amount.includes(".")) {
      const [intPart, decPart = ""] = amount.split(".");
      const ghost = "0".repeat(Math.max(0, 8 - decPart.length));
      return { typedPart: intPart + "." + decPart, ghostPart: ghost };
    }
    return { typedPart: amount + ".", ghostPart: "00000000" };
  })();

  const handleNumpad = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (key === "C") { setAmount("0"); return; }
    if (key === "⌫") { setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : "0"); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(prev => prev + "."); return; }
    if (amount === "0") setAmount(key);
    else setAmount(prev => {
      if (prev.includes(".")) {
        const decPart = prev.split(".")[1] ?? "";
        if (decPart.length >= 8) return prev;
      }
      if (prev.length >= 16) return prev;
      return prev + key;
    });
  };

  const handleCopyQty = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const qtyStr = String(qty);
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        await navigator.clipboard.writeText(qtyStr);
      } else {
        const Clip = await import("expo-clipboard");
        await Clip.setStringAsync(qtyStr);
      }
      setCopiedQty(true);
      setTimeout(() => setCopiedQty(false), 2000);
    } catch {
      Alert.alert("Copy QTY", `QTY: ${qtyStr}`);
    }
  };

  const handleCompleteSale = async () => {
    if (!selectedProduct) { Alert.alert("Select Product", "Please select a product first."); return; }
    if (qty <= 0 || parsedAmount <= 0) { Alert.alert("Enter Amount", "Please enter a valid amount."); return; }
    if (!user) return;
    try {
      await (createSaleMutation as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id,
          customerId: selectedCustomer?.id ?? null,
          accountId: selectedAccount?.id ?? null,
          locationId: user.locationId ?? null,
          items: [{ productId: selectedProduct.id, qty, unitPrice: activePrice.toFixed(8) }],
          discount: "0.00000000", tax: "0.00000000",
          amountPaid: parsedAmount.toFixed(8),
          paymentMethod: "cash", notes: rateMode === "wholesale" ? "Wholesale rate" : null,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries();
      setAmount("0");
      Alert.alert(
        "✓ Sale Complete",
        `${selectedProduct.name}\nQTY: ${qty} ${selectedProduct.unit}\nRate: ${rateMode === "wholesale" ? "Wholesale" : "Retail"} @ $${activePrice.toFixed(2)}\nAmount: $${parsedAmount.toFixed(2)}`,
        [{ text: "New Sale", onPress: () => { setSelectedProduct(null); setSelectedCustomer(null); } }, { text: "OK" }]
      );
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Sale failed");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>COINS SALE</Text>
          <Text style={styles.headerSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.userBadge}>
            <Feather name="user" size={12} color={colors.primary} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.primary }}>{user?.name?.split(" ")[0] ?? "—"}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <TouchableOpacity
          style={[styles.productCard, { backgroundColor: colors.card, borderColor: selectedProduct ? colors.primary : colors.border }]}
          onPress={() => setShowProductModal(true)}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            {selectedProduct ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedProduct.stock > 0 ? colors.success : colors.danger }} />
                  <Text style={[styles.productName, { color: colors.text }]}>{selectedProduct.name}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.primary }}>Retail ${parseFloat(selectedProduct.unitPrice).toFixed(2)}</Text>
                  </View>
                  <View style={{ backgroundColor: colors.purchaseBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.purchase }}>Wholesale ${parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: selectedProduct.stock > 0 ? colors.success : colors.danger }}>
                    {selectedProduct.stock} {selectedProduct.unit}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.productPlaceholder, { color: colors.mutedForeground }]}>Tap to select product</Text>
                <Text style={[styles.productSub, { color: colors.mutedForeground }]}>Choose a product to begin sale</Text>
              </>
            )}
          </View>
          <View style={[styles.productChevron, { backgroundColor: colors.secondary }]}>
            <Feather name="chevron-down" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {selectedProduct && (
          <View style={[styles.rateToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "normal" && { backgroundColor: colors.primary }]}
              onPress={() => { setRateMode("normal"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              <Feather name="tag" size={13} color={rateMode === "normal" ? "#FFF" : colors.mutedForeground} />
              <Text style={[styles.rateBtnText, { color: rateMode === "normal" ? "#FFF" : colors.mutedForeground }]}>
                Retail ${parseFloat(selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rateBtn, rateMode === "wholesale" && { backgroundColor: colors.purchase }]}
              onPress={() => { setRateMode("wholesale"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            >
              <Feather name="layers" size={13} color={rateMode === "wholesale" ? "#FFF" : colors.mutedForeground} />
              <Text style={[styles.rateBtnText, { color: rateMode === "wholesale" ? "#FFF" : colors.mutedForeground }]}>
                Wholesale ${parseFloat(selectedProduct.wholesalePrice || selectedProduct.unitPrice).toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.displayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.amountSection}>
            <Text style={[styles.amountLabel, { color: colors.mutedForeground }]}>AMOUNT (8 DECIMALS)</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              <Text style={{ color: colors.primary, fontSize: 24 }}>$ </Text>
              {typedPart}
              <Text style={{ color: colors.mutedForeground, opacity: 0.35 }}>{ghostPart}</Text>
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.qtySection}>
            <View>
              <Text style={[styles.qtyLabel, { color: colors.mutedForeground }]}>
                QTY{selectedProduct ? ` @ $${activePrice.toFixed(2)}/${selectedProduct.unit}` : ""}
              </Text>
              <Text style={[styles.qtyValue, { color: qty > 0 ? colors.success : colors.mutedForeground }]}>
                {qty > 0 ? qty.toLocaleString() : "—"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: copiedQty ? colors.saleBg : colors.secondary, borderColor: copiedQty ? colors.success : colors.border }]}
              onPress={handleCopyQty}
              disabled={qty <= 0}
            >
              <Feather name={copiedQty ? "check" : "copy"} size={15} color={copiedQty ? colors.success : colors.primary} />
              <Text style={[styles.copyText, { color: copiedQty ? colors.success : colors.primary }]}>{copiedQty ? "Copied!" : "Copy QTY"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.optionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.optionRow, { borderBottomColor: colors.border }]} onPress={() => setShowCustomerModal(true)}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="user" size={14} color={colors.primary} /></View>
            <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Customer</Text>
            <Text style={[styles.optionValue, { color: selectedCustomer ? colors.text : colors.mutedForeground }]}>{selectedCustomer?.name ?? "Walk-in"}</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionRow} onPress={() => setShowAccountModal(true)}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="credit-card" size={14} color={colors.primary} /></View>
            <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Account</Text>
            <Text style={[styles.optionValue, { color: selectedAccount ? colors.text : colors.mutedForeground }]}>{selectedAccount?.name ?? "None"}</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoCell}>
            <Feather name="briefcase" size={11} color={colors.primary} style={{ marginBottom: 3 }} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>BANK</Text>
            <Text style={[styles.infoValue, { color: totalBank !== null ? colors.primary : colors.mutedForeground }]} numberOfLines={1}>
              {totalBank !== null ? formatK(totalBank) : "—"}
            </Text>
          </View>
          <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
          <View style={styles.infoCell}>
            <Feather name="package" size={11} color={colors.purchase} style={{ marginBottom: 3 }} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>STOCK</Text>
            <Text style={[styles.infoValue, { color: totalStock !== null ? colors.purchase : colors.mutedForeground }]} numberOfLines={1}>
              {totalStock !== null ? formatK(totalStock) : "—"}
            </Text>
          </View>
          <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
          <View style={styles.infoCell}>
            <Feather name="trending-up" size={11} color={colors.credit} style={{ marginBottom: 3 }} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>CREDIT</Text>
            <Text style={[styles.infoValue, { color: totalCredit !== null ? colors.credit : colors.mutedForeground }]} numberOfLines={1}>
              {totalCredit !== null ? formatK(totalCredit) : "—"}
            </Text>
          </View>
          <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
          <View style={styles.infoCell}>
            <Feather name="activity" size={11} color={leftBalance !== null && leftBalance >= 0 ? colors.success : colors.danger} style={{ marginBottom: 3 }} />
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>NET WORTH</Text>
            <Text style={[styles.infoValue, { color: leftBalance === null ? colors.mutedForeground : leftBalance >= 0 ? colors.success : colors.danger }]} numberOfLines={1}>
              {leftBalance !== null ? formatK(leftBalance) : "—"}
            </Text>
          </View>
        </View>

        <View style={[styles.numpadContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {NUMPAD_KEYS.map((row, ri) => (
            <View key={ri} style={styles.numpadRow}>
              {row.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.numpadKey, { backgroundColor: key === "⌫" ? colors.numpadDelete : key === "." ? colors.secondary : colors.numpadKey, borderColor: colors.border }]}
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

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: colors.numpadDelete }]}
            onPress={() => { setAmount("0"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}
          >
            <Feather name="rotate-ccw" size={16} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: qty > 0 && selectedProduct ? colors.success : colors.mutedForeground, opacity: createSaleMutation.isPending ? 0.7 : 1 }]}
            onPress={handleCompleteSale}
            disabled={createSaleMutation.isPending || qty <= 0 || !selectedProduct}
          >
            {createSaleMutation.isPending
              ? <Text style={styles.completeBtnText}>Processing...</Text>
              : <><Feather name="check-circle" size={20} color="#FFF" /><Text style={styles.completeBtnText}>Complete Sale</Text></>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PickerModal<Product> visible={showProductModal} title="Select Product" items={activeProducts} onSelect={p => { setSelectedProduct(p); setRateMode("normal"); }} onClose={() => setShowProductModal(false)} renderSub={p => `Retail $${parseFloat(p.unitPrice).toFixed(2)}  ·  Wholesale $${parseFloat(p.wholesalePrice || p.unitPrice).toFixed(2)}  ·  Stock: ${p.stock}`} />
      <PickerModal<Customer> visible={showCustomerModal} title="Select Customer" items={customers} onSelect={setSelectedCustomer} onClose={() => setShowCustomerModal(false)} renderSub={c => c.phone ?? ""} />
      <PickerModal<Account> visible={showAccountModal} title="Select Account" items={accounts} onSelect={setSelectedAccount} onClose={() => setShowAccountModal(false)} renderSub={a => `${a.type}  ·  Balance: $${parseFloat(a.balance).toFixed(2)}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF", letterSpacing: 1 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  userBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  productCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 16, borderWidth: 2, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  productName: { fontFamily: "Inter_700Bold", fontSize: 16 },
  productPlaceholder: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  productSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  productChevron: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rateToggle: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, flexDirection: "row", padding: 4, gap: 4 },
  rateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 11 },
  rateBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
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
  optionsCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  optionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 10, borderBottomWidth: 1 },
  optionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 76 },
  optionValue: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "right" },
  infoCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  infoCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  infoLabel: { fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.8, marginBottom: 4, textAlign: "center" },
  infoValue: { fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "center" },
  infoSep: { width: 1 },
  numpadContainer: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 8, gap: 6 },
  numpadRow: { flexDirection: "row", gap: 6 },
  numpadKey: { flex: 1, height: 58, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  numpadKeyText: { fontFamily: "Inter_600SemiBold", fontSize: 22 },
  actionsRow: { flexDirection: "row", marginHorizontal: 14, marginTop: 10, gap: 10 },
  clearBtn: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  completeBtn: { flex: 1, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  completeBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
});

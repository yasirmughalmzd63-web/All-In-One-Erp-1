import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const NUMPAD_KEYS = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [".", "0", "⌫"]];
const PAYMENT_METHODS = ["cash", "card", "transfer", "other"];

type Product = { id: number; name: string; unitPrice: string; unit: string; stock: number; isActive?: boolean };
type Customer = { id: number; name: string; phone?: string | null };
type Account = { id: number; name: string; type: string };

function PickerModal<T extends { id: number; name: string }>({
  visible, title, items, onSelect, onClose, renderSub,
}: { visible: boolean; title: string; items: T[]; onSelect: (item: T | null) => void; onClose: () => void; renderSub?: (item: T) => string }) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "75%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [copiedQty, setCopiedQty] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const { data: productsRaw } = useListProducts();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const createSaleMutation = useCreateSale();

  const products = (productsRaw ?? []) as unknown as Product[];
  const customers = (customersRaw ?? []) as unknown as Customer[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];
  const activeProducts = products.filter(p => p.isActive !== false);

  const parsedAmount = parseFloat(amount) || 0;
  const unitPriceNum = selectedProduct ? parseFloat(selectedProduct.unitPrice) : 0;
  const qty = selectedProduct && parsedAmount > 0 && unitPriceNum > 0 ? Math.round(parsedAmount / unitPriceNum) : 0;

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
    else setAmount(prev => prev.length < 16 ? prev + key : prev);
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
      Alert.alert("Copy QTY", `QTY: ${qtyStr}\n\nPlease note this value.`);
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
          items: [{ productId: selectedProduct.id, qty, unitPrice: selectedProduct.unitPrice }],
          discount: "0.00000000", tax: "0.00000000",
          amountPaid: parsedAmount.toFixed(8),
          paymentMethod, notes: null,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries();
      setAmount("0");

      Alert.alert(
        "✓ Sale Complete",
        `${selectedProduct.name}\nQTY: ${qty} ${selectedProduct.unit}\nAmount: $${parsedAmount.toFixed(2)}\nMethod: ${paymentMethod.toUpperCase()}`,
        [{ text: "New Sale", onPress: () => { setSelectedProduct(null); setSelectedCustomer(null); } }, { text: "OK" }]
      );
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Sale failed");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <View>
          <Text style={styles.headerTitle}>ERP PRO</Text>
          <Text style={styles.headerSub}>Point of Sale</Text>
        </View>
        <View style={styles.headerRight}>
          <Feather name="user" size={14} color="rgba(255,255,255,0.8)" />
          <Text style={styles.headerUser}>{user?.name ?? "—"}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <TouchableOpacity
          style={[styles.productCard, { backgroundColor: colors.card, borderColor: selectedProduct ? colors.primary : colors.border }]}
          onPress={() => setShowProductModal(true)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            {selectedProduct ? (
              <>
                <Text style={[styles.productName, { color: colors.text }]}>{selectedProduct.name}</Text>
                <Text style={[styles.productPrice, { color: colors.primary }]}>
                  ${parseFloat(selectedProduct.unitPrice).toFixed(8)} / {selectedProduct.unit}
                  {"  "}
                  <Text style={{ color: selectedProduct.stock > 0 ? colors.success : colors.danger }}>
                    Stock: {selectedProduct.stock}
                  </Text>
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.productPlaceholder, { color: colors.mutedForeground }]}>Tap to select product</Text>
                <Text style={[styles.productSub, { color: colors.mutedForeground }]}>Required to calculate QTY</Text>
              </>
            )}
          </View>
          <View style={[styles.productChevron, { backgroundColor: colors.secondary }]}>
            <Feather name="chevron-down" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>

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
                QTY (ROUNDED){selectedProduct ? ` × $${parseFloat(selectedProduct.unitPrice).toFixed(2)}` : ""}
              </Text>
              <Text style={[styles.qtyValue, { color: qty > 0 ? colors.success : colors.mutedForeground }]}>
                {qty > 0 ? qty.toLocaleString() : "—"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: copiedQty ? colors.successBg : colors.secondary, borderColor: copiedQty ? colors.success : colors.border }]}
              onPress={handleCopyQty}
              disabled={qty <= 0}
            >
              <Feather name={copiedQty ? "check" : "copy"} size={16} color={copiedQty ? colors.success : colors.primary} />
              <Text style={[styles.copyText, { color: copiedQty ? colors.success : colors.primary }]}>{copiedQty ? "Copied!" : "Copy QTY"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.optionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.optionRow, { borderBottomColor: colors.border }]} onPress={() => setShowCustomerModal(true)}>
            <Feather name="user" size={16} color={colors.mutedForeground} />
            <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Customer</Text>
            <Text style={[styles.optionValue, { color: selectedCustomer ? colors.text : colors.mutedForeground }]}>{selectedCustomer?.name ?? "Walk-in"}</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionRow} onPress={() => setShowAccountModal(true)}>
            <Feather name="credit-card" size={16} color={colors.mutedForeground} />
            <Text style={[styles.optionLabel, { color: colors.mutedForeground }]}>Account</Text>
            <Text style={[styles.optionValue, { color: selectedAccount ? colors.text : colors.mutedForeground }]}>{selectedAccount?.name ?? "None"}</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map(pm => (
            <TouchableOpacity key={pm} style={[styles.payBtn, { backgroundColor: paymentMethod === pm ? colors.primary : colors.card, borderColor: paymentMethod === pm ? colors.primary : colors.border }]} onPress={() => setPaymentMethod(pm)}>
              <Text style={[styles.payBtnText, { color: paymentMethod === pm ? "#FFF" : colors.mutedForeground }]}>{pm.charAt(0).toUpperCase() + pm.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.numpadContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {NUMPAD_KEYS.map((row, ri) => (
            <View key={ri} style={styles.numpadRow}>
              {row.map(key => (
                <TouchableOpacity key={key} style={[styles.numpadKey, { backgroundColor: key === "⌫" ? colors.numpadDelete : colors.numpadKey, borderColor: colors.border }]} onPress={() => handleNumpad(key)} activeOpacity={0.6}>
                  {key === "⌫" ? <Feather name="delete" size={20} color={colors.numpadDeleteText} /> : <Text style={[styles.numpadKeyText, { color: key === "." ? colors.primary : colors.numpadKeyText }]}>{key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.clearBtn, { backgroundColor: colors.numpadDelete }]} onPress={() => { setAmount("0"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}>
            <Text style={[styles.clearBtnText, { color: colors.danger }]}>Clear</Text>
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

      <PickerModal<Product> visible={showProductModal} title="Select Product" items={activeProducts} onSelect={setSelectedProduct} onClose={() => setShowProductModal(false)} renderSub={p => `$${parseFloat(p.unitPrice).toFixed(2)} / ${p.unit}  ·  Stock: ${p.stock}`} />
      <PickerModal<Customer> visible={showCustomerModal} title="Select Customer" items={customers} onSelect={setSelectedCustomer} onClose={() => setShowCustomerModal(false)} renderSub={c => c.phone ?? ""} />
      <PickerModal<Account> visible={showAccountModal} title="Select Account" items={accounts} onSelect={setSelectedAccount} onClose={() => setShowAccountModal(false)} renderSub={a => a.type} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF", letterSpacing: 1 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerUser: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.9)" },
  productCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 2, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  productName: { fontFamily: "Inter_700Bold", fontSize: 16 },
  productPrice: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 2 },
  productPlaceholder: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  productSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  productChevron: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  displayCard: { marginHorizontal: 16, marginTop: 10, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  amountSection: { padding: 16, paddingBottom: 12 },
  amountLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  amountValue: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
  divider: { height: 1, marginHorizontal: 16 },
  qtySection: { padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  qtyValue: { fontFamily: "Inter_700Bold", fontSize: 44, lineHeight: 52 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  copyText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  optionsCard: { marginHorizontal: 16, marginTop: 10, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  optionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 10, borderBottomWidth: 1 },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 76 },
  optionValue: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "right" },
  paymentRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 10 },
  payBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  payBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  numpadContainer: { marginHorizontal: 16, marginTop: 10, borderRadius: 14, borderWidth: 1, padding: 8, gap: 6 },
  numpadRow: { flexDirection: "row", gap: 6 },
  numpadKey: { flex: 1, height: 58, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  numpadKeyText: { fontFamily: "Inter_600SemiBold", fontSize: 22 },
  actionsRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 10, gap: 10 },
  clearBtn: { width: 80, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  clearBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  completeBtn: { flex: 1, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  completeBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
});

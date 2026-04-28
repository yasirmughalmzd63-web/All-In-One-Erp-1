import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListSales, useListPurchases, useListExpenses, useListCredits,
  useListProducts, useListSuppliers, useListCustomers, useListAccounts, useListCategories,
  useCreatePurchase, useCreateExpense, useCreateCredit, usePayCredit, useDeleteExpense,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Sale = { id: number; userId: number; invoiceNo: string; customerName?: string | null; total: string; paymentMethod: string; status: string; createdAt: string; items?: Array<{ productName: string; qty: number; unitPrice: string }> };
type Purchase = { id: number; userId: number; invoiceNo: string; supplierName?: string | null; total: string; status: string; createdAt: string };
type Expense = { id: number; userId: number; title: string; amount: string; categoryName?: string | null; date: string; createdAt: string };
type Credit = { id: number; userId: number; type: string; partyName: string; partyType: string; amount: string; remainingAmount: string; status: string; dueDate?: string | null; createdAt: string };
type Product = { id: number; name: string; unitPrice: string; unit: string };
type Supplier = { id: number; name: string };
type Customer = { id: number; name: string };
type Account = { id: number; name: string };
type Category = { id: number; name: string };

const TABS = ["Sales", "Purchases", "Expenses", "Credits"] as const;
type TabType = typeof TABS[number];

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color }}>{label}</Text>
    </View>
  );
}

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [activeTab, setActiveTab] = useState<TabType>("Sales");
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");

  const { data: salesRaw, isLoading: loadingSales, refetch: refetchSales } = useListSales();
  const { data: purchasesRaw, isLoading: loadingPurchases, refetch: refetchPurchases } = useListPurchases();
  const { data: expensesRaw, isLoading: loadingExpenses, refetch: refetchExpenses } = useListExpenses();
  const { data: creditsRaw, isLoading: loadingCredits, refetch: refetchCredits } = useListCredits();
  const { data: productsRaw } = useListProducts();
  const { data: suppliersRaw } = useListSuppliers();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const { data: categoriesRaw } = useListCategories();

  const sales = (salesRaw ?? []) as unknown as Sale[];
  const purchases = (purchasesRaw ?? []) as unknown as Purchase[];
  const expenses = (expensesRaw ?? []) as unknown as Expense[];
  const credits = (creditsRaw ?? []) as unknown as Credit[];
  const products = (productsRaw ?? []) as unknown as Product[];
  const suppliers = (suppliersRaw ?? []) as unknown as Supplier[];
  const customers = (customersRaw ?? []) as unknown as Customer[];
  const accounts = (accountsRaw ?? []) as unknown as Account[];
  const categories = (categoriesRaw ?? []) as unknown as Category[];

  const isAdmin = user?.role === "admin";
  const canDelete = (entryUserId: number) => isAdmin || entryUserId === user?.id;

  // Non-admin users see only their own transactions
  const visibleSales     = isAdmin ? sales     : sales.filter(s => s.userId === user?.id);
  const visiblePurchases = isAdmin ? purchases : purchases.filter(p => p.userId === user?.id);
  const visibleExpenses  = isAdmin ? expenses  : expenses.filter(e => e.userId === user?.id);
  const visibleCredits   = isAdmin ? credits   : credits.filter(c => c.userId === user?.id);

  const createPurchase = useCreatePurchase();
  const createExpense = useCreateExpense();
  const createCredit = useCreateCredit();
  const payCreditMutation = usePayCredit();
  const deleteExpenseMutation = useDeleteExpense();

  const handleDeleteSale = (item: Sale) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Sale", `Delete sale ${item.invoiceNo}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await customFetch<void>(`/api/sales/${item.id}`, { method: "DELETE" });
          queryClient.invalidateQueries();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete"); }
      }},
    ]);
  };

  const handleDeletePurchase = (item: Purchase) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Purchase", `Delete purchase ${item.invoiceNo}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await customFetch<void>(`/api/purchases/${item.id}`, { method: "DELETE" });
          queryClient.invalidateQueries();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete"); }
      }},
    ]);
  };

  const handleDeleteExpense = (item: Expense) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Expense", `Delete "${item.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteExpenseMutation.mutateAsync({ id: item.id });
          queryClient.invalidateQueries();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete"); }
      }},
    ]);
  };

  const handleDeleteCredit = (item: Credit) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Credit", `Delete credit for ${item.partyName}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await customFetch<void>(`/api/credits/${item.id}`, { method: "DELETE" });
          queryClient.invalidateQueries();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete"); }
      }},
    ]);
  };

  const [purForm, setPurForm] = useState({ supplierId: "", accountId: "", productId: "", qty: "", unitCost: "", discount: "0", notes: "" });
  const [expForm, setExpForm] = useState({ title: "", amount: "", categoryId: "", accountId: "", date: new Date().toISOString().split("T")[0]!, notes: "" });
  const [credForm, setCredForm] = useState({ type: "receivable", partyType: "customer", partyId: "", amount: "", dueDate: "", notes: "" });

  const refetch = () => {
    if (activeTab === "Sales") refetchSales();
    if (activeTab === "Purchases") refetchPurchases();
    if (activeTab === "Expenses") refetchExpenses();
    if (activeTab === "Credits") refetchCredits();
  };

  const isLoading = activeTab === "Sales" ? loadingSales : activeTab === "Purchases" ? loadingPurchases : activeTab === "Expenses" ? loadingExpenses : loadingCredits;

  const statusColor = (s: string) => {
    if (s === "completed" || s === "paid") return { color: colors.sale, bg: colors.saleBg };
    if (s === "partial") return { color: colors.expense, bg: colors.expenseBg };
    return { color: colors.credit, bg: colors.creditBg };
  };

  const handleSubmitPurchase = async () => {
    if (!purForm.productId || !purForm.qty || !purForm.unitCost || !user) { Alert.alert("Error", "Product, qty, unit cost required"); return; }
    try {
      await (createPurchase as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id,
          supplierId: purForm.supplierId ? parseInt(purForm.supplierId) : null,
          accountId: purForm.accountId ? parseInt(purForm.accountId) : null,
          locationId: user.locationId ?? null,
          items: [{ productId: parseInt(purForm.productId), qty: parseInt(purForm.qty), unitCost: parseFloat(purForm.unitCost).toFixed(8) }],
          discount: parseFloat(purForm.discount || "0").toFixed(8),
          amountPaid: "0.00000000", notes: purForm.notes || null,
        },
      });
      queryClient.invalidateQueries();
      setShowModal(false);
      setPurForm({ supplierId: "", accountId: "", productId: "", qty: "", unitCost: "", discount: "0", notes: "" });
      Alert.alert("Success", "Purchase recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleSubmitExpense = async () => {
    if (!expForm.title || !expForm.amount || !user) { Alert.alert("Error", "Title and amount required"); return; }
    try {
      await (createExpense as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id, title: expForm.title,
          amount: parseFloat(expForm.amount).toFixed(8),
          categoryId: expForm.categoryId ? parseInt(expForm.categoryId) : null,
          accountId: expForm.accountId ? parseInt(expForm.accountId) : null,
          date: expForm.date, notes: expForm.notes || null,
        },
      });
      queryClient.invalidateQueries();
      setShowModal(false);
      setExpForm({ title: "", amount: "", categoryId: "", accountId: "", date: new Date().toISOString().split("T")[0]!, notes: "" });
      Alert.alert("Success", "Expense recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleSubmitCredit = async () => {
    if (!credForm.partyId || !credForm.amount || !user) { Alert.alert("Error", "Party and amount required"); return; }
    try {
      await (createCredit as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id, type: credForm.type,
          partyId: parseInt(credForm.partyId), partyType: credForm.partyType,
          amount: parseFloat(credForm.amount).toFixed(8),
          dueDate: credForm.dueDate || null, notes: credForm.notes || null,
        },
      });
      queryClient.invalidateQueries();
      setShowModal(false);
      setCredForm({ type: "receivable", partyType: "customer", partyId: "", amount: "", dueDate: "", notes: "" });
      Alert.alert("Success", "Credit recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handlePayCredit = async () => {
    if (!selectedCredit || !payAmount) { Alert.alert("Error", "Enter pay amount"); return; }
    try {
      await (payCreditMutation as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({
        id: selectedCredit.id,
        data: {
          payAmount: parseFloat(payAmount).toFixed(8),
          accountId: payAccountId ? parseInt(payAccountId) : null,
        },
      });
      queryClient.invalidateQueries();
      setShowPayModal(false);
      setPayAmount("");
      setPayAccountId("");
      Alert.alert("Success", "Payment recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const DeleteBtn = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity style={{ paddingHorizontal: 10, height: 30, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: "center", justifyContent: "center" }} onPress={onPress}>
      <Text style={{ color: colors.danger, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Del</Text>
    </TouchableOpacity>
  );

  const renderSale = ({ item }: { item: Sale }) => {
    const sc = statusColor(item.status);
    return (
      <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.saleBg }]}></View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.invoiceNo}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.customerName ?? "Walk-in"} • {item.paymentMethod}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.sale }]}>${parseFloat(item.total).toFixed(2)}</Text>
              {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeleteSale(item)} />}
            </View>
            <Badge label={item.status} color={sc.color} bg={sc.bg} />
          </View>
        </View>
        <Text style={[listStyles.cardDate, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
      </View>
    );
  };

  const renderPurchase = ({ item }: { item: Purchase }) => {
    const sc = statusColor(item.status);
    return (
      <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.purchaseBg }]}></View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.invoiceNo}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.supplierName ?? "No supplier"}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.purchase }]}>${parseFloat(item.total).toFixed(2)}</Text>
              {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeletePurchase(item)} />}
            </View>
            <Badge label={item.status} color={sc.color} bg={sc.bg} />
          </View>
        </View>
        <Text style={[listStyles.cardDate, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
    );
  };

  const renderExpense = ({ item }: { item: Expense }) => (
    <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={listStyles.cardHeader}>
        <View style={listStyles.cardLeft}>
          <View style={[listStyles.iconBox, { backgroundColor: colors.expenseBg }]}></View>
          <View style={{ flex: 1 }}>
            <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.categoryName ?? "Uncategorized"} • {item.date}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[listStyles.cardAmount, { color: colors.expense }]}>${parseFloat(item.amount).toFixed(2)}</Text>
            {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeleteExpense(item)} />}
          </View>
        </View>
      </View>
    </View>
  );

  const renderCredit = ({ item }: { item: Credit }) => {
    const sc = statusColor(item.status);
    return (
      <TouchableOpacity style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { setSelectedCredit(item); setShowPayModal(true); }}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.creditBg }]}></View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.partyName}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.type === "receivable" ? "To receive" : "To pay"} • {item.partyType}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.credit }]}>${parseFloat(item.remainingAmount).toFixed(2)}</Text>
              {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeleteCredit(item)} />}
            </View>
            <Badge label={item.status} color={sc.color} bg={sc.bg} />
          </View>
        </View>
        {item.dueDate && <Text style={[listStyles.cardDate, { color: colors.mutedForeground }]}>Due: {item.dueDate}</Text>}
      </TouchableOpacity>
    );
  };

  const InputField = ({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: "default" | "numeric" | "decimal-pad" }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[fStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput style={[fStyles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={keyboardType ?? "default"} />
    </View>
  );

  const SelectField = ({ label, value, items, onSelect }: { label: string; value: string; items: Array<{ id: number; name: string }>; onSelect: (v: string) => void }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[fStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
        <TouchableOpacity style={[fStyles.chip, { backgroundColor: !value ? colors.primary : colors.input, borderColor: colors.border }]} onPress={() => onSelect("")}>
          <Text style={[fStyles.chipText, { color: !value ? "#FFF" : colors.mutedForeground }]}>None</Text>
        </TouchableOpacity>
        {items.map(item => (
          <TouchableOpacity key={item.id} style={[fStyles.chip, { backgroundColor: value === String(item.id) ? colors.primary : colors.input, borderColor: colors.border }]} onPress={() => onSelect(String(item.id))}>
            <Text style={[fStyles.chipText, { color: value === String(item.id) ? "#FFF" : colors.text }]}>{item.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Transactions</Text>
        {!isAdmin && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFFFFF" }}>My Records</Text>
          </View>
        )}
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, { borderBottomColor: activeTab === tab ? colors.primary : "transparent", borderBottomWidth: 2.5 }]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {activeTab === "Sales" && <FlatList data={visibleSales} renderItem={renderSale} keyExtractor={i => String(i.id)} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }} refreshControl={<RefreshControl refreshing={loadingSales} onRefresh={refetchSales} />} ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No sales yet</Text></View>} />}
          {activeTab === "Purchases" && <FlatList data={visiblePurchases} renderItem={renderPurchase} keyExtractor={i => String(i.id)} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }} refreshControl={<RefreshControl refreshing={loadingPurchases} onRefresh={refetchPurchases} />} ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No purchases yet</Text></View>} />}
          {activeTab === "Expenses" && <FlatList data={visibleExpenses} renderItem={renderExpense} keyExtractor={i => String(i.id)} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }} refreshControl={<RefreshControl refreshing={loadingExpenses} onRefresh={refetchExpenses} />} ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No expenses yet</Text></View>} />}
          {activeTab === "Credits" && <FlatList data={visibleCredits} renderItem={renderCredit} keyExtractor={i => String(i.id)} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }} refreshControl={<RefreshControl refreshing={loadingCredits} onRefresh={refetchCredits} />} ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No credits yet</Text></View>} />}
        </>
      )}

      {activeTab !== "Sales" && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowModal(true)}>
          
        </TouchableOpacity>
      )}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New {activeTab.slice(0, -1)}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Text style={{ color: "#6B7280", fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {activeTab === "Purchases" && (
                <>
                  <SelectField label="Supplier (optional)" value={purForm.supplierId} items={suppliers} onSelect={v => setPurForm(f => ({ ...f, supplierId: v }))} />
                  <SelectField label="Product" value={purForm.productId} items={products} onSelect={v => setPurForm(f => ({ ...f, productId: v }))} />
                  <InputField label="Quantity" value={purForm.qty} onChangeText={v => setPurForm(f => ({ ...f, qty: v }))} keyboardType="numeric" />
                  <InputField label="Unit Cost" value={purForm.unitCost} onChangeText={v => setPurForm(f => ({ ...f, unitCost: v }))} keyboardType="decimal-pad" />
                  <InputField label="Discount" value={purForm.discount} onChangeText={v => setPurForm(f => ({ ...f, discount: v }))} keyboardType="decimal-pad" />
                  <SelectField label="Account (optional)" value={purForm.accountId} items={accounts} onSelect={v => setPurForm(f => ({ ...f, accountId: v }))} />
                  <InputField label="Notes" value={purForm.notes} onChangeText={v => setPurForm(f => ({ ...f, notes: v }))} />
                  <TouchableOpacity style={[fStyles.submitBtn, { backgroundColor: colors.purchase }]} onPress={handleSubmitPurchase}>
                    <Text style={fStyles.submitText}>Record Purchase</Text>
                  </TouchableOpacity>
                </>
              )}
              {activeTab === "Expenses" && (
                <>
                  <InputField label="Title" value={expForm.title} onChangeText={v => setExpForm(f => ({ ...f, title: v }))} />
                  <InputField label="Amount" value={expForm.amount} onChangeText={v => setExpForm(f => ({ ...f, amount: v }))} keyboardType="decimal-pad" />
                  <InputField label="Date (YYYY-MM-DD)" value={expForm.date} onChangeText={v => setExpForm(f => ({ ...f, date: v }))} />
                  <SelectField label="Category (optional)" value={expForm.categoryId} items={categories} onSelect={v => setExpForm(f => ({ ...f, categoryId: v }))} />
                  <SelectField label="Account (optional)" value={expForm.accountId} items={accounts} onSelect={v => setExpForm(f => ({ ...f, accountId: v }))} />
                  <InputField label="Notes" value={expForm.notes} onChangeText={v => setExpForm(f => ({ ...f, notes: v }))} />
                  <TouchableOpacity style={[fStyles.submitBtn, { backgroundColor: colors.expense }]} onPress={handleSubmitExpense}>
                    <Text style={fStyles.submitText}>Record Expense</Text>
                  </TouchableOpacity>
                </>
              )}
              {activeTab === "Credits" && (
                <>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[fStyles.label, { color: colors.mutedForeground }]}>Type</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {["receivable", "payable"].map(t => (
                        <TouchableOpacity key={t} style={[fStyles.chip, { flex: 1, backgroundColor: credForm.type === t ? colors.credit : colors.input, borderColor: colors.border }]} onPress={() => setCredForm(f => ({ ...f, type: t }))}>
                          <Text style={[fStyles.chipText, { color: credForm.type === t ? "#FFF" : colors.text }]}>{t === "receivable" ? "To Receive" : "To Pay"}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[fStyles.label, { color: colors.mutedForeground }]}>Party Type</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {["customer", "supplier"].map(pt => (
                        <TouchableOpacity key={pt} style={[fStyles.chip, { flex: 1, backgroundColor: credForm.partyType === pt ? colors.primary : colors.input, borderColor: colors.border }]} onPress={() => setCredForm(f => ({ ...f, partyType: pt, partyId: "" }))}>
                          <Text style={[fStyles.chipText, { color: credForm.partyType === pt ? "#FFF" : colors.text }]}>{pt.charAt(0).toUpperCase() + pt.slice(1)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <SelectField label="Party" value={credForm.partyId} items={credForm.partyType === "customer" ? customers : suppliers} onSelect={v => setCredForm(f => ({ ...f, partyId: v }))} />
                  <InputField label="Amount" value={credForm.amount} onChangeText={v => setCredForm(f => ({ ...f, amount: v }))} keyboardType="decimal-pad" />
                  <InputField label="Due Date (YYYY-MM-DD, optional)" value={credForm.dueDate} onChangeText={v => setCredForm(f => ({ ...f, dueDate: v }))} />
                  <InputField label="Notes" value={credForm.notes} onChangeText={v => setCredForm(f => ({ ...f, notes: v }))} />
                  <TouchableOpacity style={[fStyles.submitBtn, { backgroundColor: colors.credit }]} onPress={handleSubmitCredit}>
                    <Text style={fStyles.submitText}>Record Credit</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={() => setShowPayModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 8 }}>Record Payment</Text>
            {selectedCredit && (
              <>
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 16 }}>
                  Party: {selectedCredit.partyName}{"\n"}Remaining: ${parseFloat(selectedCredit.remainingAmount).toFixed(2)}
                </Text>
                <TextInput
                  style={[fStyles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pay Amount"
                  placeholderTextColor={colors.mutedForeground}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  keyboardType="decimal-pad"
                />
                <Text style={[fStyles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Account (optional — updates balance)</Text>
                <SelectField label="" value={payAccountId} items={accounts} onSelect={setPayAccountId} />
                <TouchableOpacity style={[fStyles.submitBtn, { backgroundColor: colors.credit, marginTop: 8 }]} onPress={handlePayCredit}>
                  <Text style={fStyles.submitText}>Record Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 12, alignItems: "center" }} onPress={() => { setShowPayModal(false); setPayAmount(""); setPayAccountId(""); }}>
                  <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 12 },
  fab: { position: "absolute", bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

const listStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  cardAmount: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 11 },
});

const fStyles = StyleSheet.create({
  label: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginRight: 8, alignItems: "center" },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
});

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

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

type SortOrder = "newest" | "oldest" | "highest" | "lowest";
type QuickDate = "all" | "today" | "week" | "month" | "lastMonth";

const PKR = (n: number) => `₨${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color }}>{label}</Text>
    </View>
  );
}

function dateRange(quick: QuickDate): { from: Date | null; to: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (quick === "today") return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
  if (quick === "week") {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    return { from: mon, to: now };
  }
  if (quick === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (quick === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: first, to: last };
  }
  return { from: null, to: null };
}

function parseDate(s: string): Date { return new Date(s); }

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [activeTab, setActiveTab] = useState<TabType>("Sales");
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");

  /* ── Filter state ── */
  const [searchText, setSearchText] = useState("");
  const [quickDate, setQuickDate]   = useState<QuickDate>("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder]   = useState<SortOrder>("newest");
  const [minAmount, setMinAmount]   = useState("");
  const [maxAmount, setMaxAmount]   = useState("");

  const activeFilterCount = [
    searchText.trim() !== "",
    quickDate !== "all" || dateFrom !== "" || dateTo !== "",
    statusFilter !== "all",
    minAmount !== "" || maxAmount !== "",
    sortOrder !== "newest",
  ].filter(Boolean).length;

  const { data: salesRaw, isLoading: loadingSales, refetch: refetchSales } = useListSales();
  const { data: purchasesRaw, isLoading: loadingPurchases, refetch: refetchPurchases } = useListPurchases();
  const { data: expensesRaw, isLoading: loadingExpenses, refetch: refetchExpenses } = useListExpenses();
  const { data: creditsRaw, isLoading: loadingCredits, refetch: refetchCredits } = useListCredits();
  const { data: productsRaw } = useListProducts();
  const { data: suppliersRaw } = useListSuppliers();
  const { data: customersRaw } = useListCustomers();
  const { data: accountsRaw } = useListAccounts();
  const { data: categoriesRaw } = useListCategories();

  const sales      = (salesRaw      ?? []) as unknown as Sale[];
  const purchases  = (purchasesRaw  ?? []) as unknown as Purchase[];
  const expenses   = (expensesRaw   ?? []) as unknown as Expense[];
  const credits    = (creditsRaw    ?? []) as unknown as Credit[];
  const products   = (productsRaw   ?? []) as unknown as Product[];
  const suppliers  = (suppliersRaw  ?? []) as unknown as Supplier[];
  const customers  = (customersRaw  ?? []) as unknown as Customer[];
  const accounts   = (accountsRaw   ?? []) as unknown as Account[];
  const categories = (categoriesRaw ?? []) as unknown as Category[];

  const isAdmin    = user?.role === "admin";
  const canDelete  = (entryUserId: number) => isAdmin || entryUserId === user?.id;

  const visibleSales     = isAdmin ? sales     : sales.filter(s => s.userId === user?.id);
  const visiblePurchases = isAdmin ? purchases : purchases.filter(p => p.userId === user?.id);
  const visibleExpenses  = isAdmin ? expenses  : expenses.filter(e => e.userId === user?.id);
  const visibleCredits   = isAdmin ? credits   : credits.filter(c => c.userId === user?.id);

  /* ─── Apply filters ─── */
  function applyFilters<T extends { createdAt: string }>(
    items: T[],
    amountKey: keyof T,
    searchKeys: (keyof T)[],
  ): T[] {
    let result = [...items];
    const q = searchText.trim().toLowerCase();
    if (q) {
      result = result.filter(item =>
        searchKeys.some(k => String(item[k] ?? "").toLowerCase().includes(q))
      );
    }

    const { from: qFrom, to: qTo } = dateRange(quickDate);
    const effFrom = qFrom ?? (dateFrom ? new Date(dateFrom) : null);
    const effTo   = qTo   ?? (dateTo   ? new Date(dateTo + "T23:59:59") : null);

    if (effFrom || effTo) {
      result = result.filter(item => {
        const d = parseDate(item.createdAt);
        if (effFrom && d < effFrom) return false;
        if (effTo   && d > effTo)   return false;
        return true;
      });
    }

    if (statusFilter !== "all") {
      result = result.filter(item => (item as Record<string, unknown>)["status"] === statusFilter);
    }

    const minAmt = minAmount ? parseFloat(minAmount) : null;
    const maxAmt = maxAmount ? parseFloat(maxAmount) : null;
    if (minAmt !== null || maxAmt !== null) {
      result = result.filter(item => {
        const amt = parseFloat(String(item[amountKey] ?? "0"));
        if (minAmt !== null && amt < minAmt) return false;
        if (maxAmt !== null && amt > maxAmt) return false;
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortOrder === "newest") return parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime();
      if (sortOrder === "oldest") return parseDate(a.createdAt).getTime() - parseDate(b.createdAt).getTime();
      const aAmt = parseFloat(String(a[amountKey] ?? "0"));
      const bAmt = parseFloat(String(b[amountKey] ?? "0"));
      return sortOrder === "highest" ? bAmt - aAmt : aAmt - bAmt;
    });
    return result;
  }

  const filteredSales = useMemo(() =>
    applyFilters(visibleSales, "total", ["invoiceNo", "customerName", "paymentMethod", "status"]),
    [visibleSales, searchText, quickDate, dateFrom, dateTo, statusFilter, sortOrder, minAmount, maxAmount]);

  const filteredPurchases = useMemo(() =>
    applyFilters(visiblePurchases, "total", ["invoiceNo", "supplierName", "status"]),
    [visiblePurchases, searchText, quickDate, dateFrom, dateTo, statusFilter, sortOrder, minAmount, maxAmount]);

  const filteredExpenses = useMemo(() => {
    let result = [...visibleExpenses];
    const q = searchText.trim().toLowerCase();
    if (q) result = result.filter(e => [e.title, e.categoryName, e.date].some(v => String(v ?? "").toLowerCase().includes(q)));
    const { from: qFrom, to: qTo } = dateRange(quickDate);
    const effFrom = qFrom ?? (dateFrom ? new Date(dateFrom) : null);
    const effTo   = qTo   ?? (dateTo   ? new Date(dateTo + "T23:59:59") : null);
    if (effFrom || effTo) result = result.filter(e => {
      const d = new Date(e.date);
      if (effFrom && d < effFrom) return false;
      if (effTo   && d > effTo)   return false;
      return true;
    });
    const minAmt = minAmount ? parseFloat(minAmount) : null;
    const maxAmt = maxAmount ? parseFloat(maxAmount) : null;
    if (minAmt !== null || maxAmt !== null) result = result.filter(e => {
      const a = parseFloat(e.amount);
      return (minAmt === null || a >= minAmt) && (maxAmt === null || a <= maxAmt);
    });
    result.sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      const aa = parseFloat(a.amount), ba = parseFloat(b.amount);
      return sortOrder === "highest" ? ba - aa : aa - ba;
    });
    return result;
  }, [visibleExpenses, searchText, quickDate, dateFrom, dateTo, sortOrder, minAmount, maxAmount]);

  const filteredCredits = useMemo(() =>
    applyFilters(visibleCredits, "remainingAmount", ["partyName", "type", "partyType", "status"]),
    [visibleCredits, searchText, quickDate, dateFrom, dateTo, statusFilter, sortOrder, minAmount, maxAmount]);

  /* ─── Summary totals ─── */
  const summaryData = useMemo(() => {
    if (activeTab === "Sales")     return { count: filteredSales.length,     total: filteredSales.reduce((s, i) => s + parseFloat(i.total), 0) };
    if (activeTab === "Purchases") return { count: filteredPurchases.length, total: filteredPurchases.reduce((s, i) => s + parseFloat(i.total), 0) };
    if (activeTab === "Expenses")  return { count: filteredExpenses.length,  total: filteredExpenses.reduce((s, i) => s + parseFloat(i.amount), 0) };
    return { count: filteredCredits.length, total: filteredCredits.reduce((s, i) => s + parseFloat(i.remainingAmount), 0) };
  }, [activeTab, filteredSales, filteredPurchases, filteredExpenses, filteredCredits]);

  /* ── status options per tab ── */
  const statusOptions = useMemo(() => {
    if (activeTab === "Sales")     return ["all", "completed", "partial", "pending"];
    if (activeTab === "Purchases") return ["all", "completed", "partial", "pending"];
    if (activeTab === "Credits")   return ["all", "paid", "partial", "pending"];
    return ["all"];
  }, [activeTab]);

  const createPurchase       = useCreatePurchase();
  const createExpense        = useCreateExpense();
  const createCredit         = useCreateCredit();
  const payCreditMutation    = usePayCredit();
  const deleteExpenseMutation = useDeleteExpense();

  const handleDeleteSale = (item: Sale) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Sale", `Delete sale ${item.invoiceNo}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch<void>(`/api/sales/${item.id}`, { method: "DELETE" }); queryClient.invalidateQueries(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const handleDeletePurchase = (item: Purchase) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Purchase", `Delete purchase ${item.invoiceNo}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch<void>(`/api/purchases/${item.id}`, { method: "DELETE" }); queryClient.invalidateQueries(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const handleDeleteExpense = (item: Expense) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Expense", `Delete "${item.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteExpenseMutation.mutateAsync({ id: item.id }); queryClient.invalidateQueries(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const handleDeleteCredit = (item: Credit) => {
    if (!canDelete(item.userId)) return;
    Alert.alert("Delete Credit", `Delete credit for ${item.partyName}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await customFetch<void>(`/api/credits/${item.id}`, { method: "DELETE" }); queryClient.invalidateQueries(); }
        catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  const [purForm, setPurForm] = useState({ supplierId: "", accountId: "", productId: "", qty: "", unitCost: "", discount: "0", notes: "" });
  const [expForm, setExpForm] = useState({ title: "", amount: "", categoryId: "", accountId: "", date: new Date().toISOString().split("T")[0]!, notes: "" });
  const [credForm, setCredForm] = useState({ type: "receivable", partyType: "customer", partyId: "", amount: "", dueDate: "", notes: "" });

  const refetch = () => {
    if (activeTab === "Sales")     refetchSales();
    if (activeTab === "Purchases") refetchPurchases();
    if (activeTab === "Expenses")  refetchExpenses();
    if (activeTab === "Credits")   refetchCredits();
  };

  const isLoading = activeTab === "Sales" ? loadingSales : activeTab === "Purchases" ? loadingPurchases : activeTab === "Expenses" ? loadingExpenses : loadingCredits;

  const statusColor = (s: string) => {
    if (s === "completed" || s === "paid") return { color: colors.sale, bg: colors.saleBg };
    if (s === "partial")  return { color: colors.expense, bg: colors.expenseBg };
    return { color: colors.credit, bg: colors.creditBg };
  };

  const handleSubmitPurchase = async () => {
    if (!purForm.productId || !purForm.qty || !purForm.unitCost || !user) { Alert.alert("Error", "Product, qty, unit cost required"); return; }
    try {
      await (createPurchase as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
        data: {
          userId: user.id,
          supplierId: purForm.supplierId ? parseInt(purForm.supplierId) : null,
          accountId:  purForm.accountId  ? parseInt(purForm.accountId)  : null,
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
          accountId:  expForm.accountId  ? parseInt(expForm.accountId)  : null,
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
        data: { payAmount: parseFloat(payAmount).toFixed(8), accountId: payAccountId ? parseInt(payAccountId) : null },
      });
      queryClient.invalidateQueries();
      setShowPayModal(false); setPayAmount(""); setPayAccountId("");
      Alert.alert("Success", "Payment recorded");
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const clearFilters = () => {
    setSearchText(""); setQuickDate("all"); setDateFrom(""); setDateTo("");
    setStatusFilter("all"); setSortOrder("newest"); setMinAmount(""); setMaxAmount("");
  };

  const DeleteBtn = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity style={{ paddingHorizontal: 10, height: 30, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: "center", justifyContent: "center" }} onPress={onPress}>
      <Text style={{ color: colors.danger, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Del</Text>
    </TouchableOpacity>
  );

  /* ─── Card renderers ─── */
  const renderSale = ({ item }: { item: Sale }) => {
    const sc = statusColor(item.status);
    return (
      <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.sale, borderLeftWidth: 4 }]}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.saleBg }]}>
              <Feather name="shopping-cart" size={16} color={colors.sale} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.invoiceNo}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.customerName ?? "Walk-in"} • {item.paymentMethod}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.sale }]}>{PKR(parseFloat(item.total))}</Text>
              {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeleteSale(item)} />}
            </View>
            <Badge label={item.status} color={sc.color} bg={sc.bg} />
          </View>
        </View>
        <Text style={[listStyles.cardDate, { color: colors.mutedForeground }]}>
          {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    );
  };

  const renderPurchase = ({ item }: { item: Purchase }) => {
    const sc = statusColor(item.status);
    return (
      <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.purchase, borderLeftWidth: 4 }]}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.purchaseBg }]}>
              <Feather name="package" size={16} color={colors.purchase} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.invoiceNo}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.supplierName ?? "No supplier"}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.purchase }]}>{PKR(parseFloat(item.total))}</Text>
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
    <View style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.expense, borderLeftWidth: 4 }]}>
      <View style={listStyles.cardHeader}>
        <View style={listStyles.cardLeft}>
          <View style={[listStyles.iconBox, { backgroundColor: colors.expenseBg }]}>
            <Feather name="credit-card" size={16} color={colors.expense} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.categoryName ?? "Uncategorized"} • {item.date}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[listStyles.cardAmount, { color: colors.expense }]}>{PKR(parseFloat(item.amount))}</Text>
            {canDelete(item.userId) && <DeleteBtn onPress={() => handleDeleteExpense(item)} />}
          </View>
        </View>
      </View>
    </View>
  );

  const renderCredit = ({ item }: { item: Credit }) => {
    const sc = statusColor(item.status);
    return (
      <TouchableOpacity style={[listStyles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.credit, borderLeftWidth: 4 }]} onPress={() => { setSelectedCredit(item); setShowPayModal(true); }}>
        <View style={listStyles.cardHeader}>
          <View style={listStyles.cardLeft}>
            <View style={[listStyles.iconBox, { backgroundColor: colors.creditBg }]}>
              <Feather name="clock" size={16} color={colors.credit} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[listStyles.cardTitle, { color: colors.text }]}>{item.partyName}</Text>
              <Text style={[listStyles.cardSub, { color: colors.mutedForeground }]}>{item.type === "receivable" ? "To receive" : "To pay"} • {item.partyType}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[listStyles.cardAmount, { color: colors.credit }]}>{PKR(parseFloat(item.remainingAmount))}</Text>
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
      {label ? <Text style={[fStyles.label, { color: colors.mutedForeground }]}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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

  /* ─── Tab accent color ─── */
  const tabColor = activeTab === "Sales" ? colors.sale : activeTab === "Purchases" ? colors.purchase : activeTab === "Expenses" ? colors.expense : colors.credit;

  /* ─── Filter panel ─── */
  const renderFilterPanel = () => (
    <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>

      {/* Quick date */}
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Date Range</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {([["all", "All Time"], ["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["lastMonth", "Last Month"]] as [QuickDate, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: quickDate === k ? tabColor : colors.input, borderWidth: 1, borderColor: quickDate === k ? tabColor : colors.border, marginRight: 8 }} onPress={() => { setQuickDate(k); if (k !== "all") { setDateFrom(""); setDateTo(""); } }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: quickDate === k ? "#fff" : colors.mutedForeground }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Custom date range */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>From</Text>
          <TextInput
            style={[fStyles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 9 }]}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
            value={dateFrom} onChangeText={v => { setDateFrom(v); setQuickDate("all"); }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>To</Text>
          <TextInput
            style={[fStyles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 9 }]}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
            value={dateTo} onChangeText={v => { setDateTo(v); setQuickDate("all"); }}
          />
        </View>
      </View>

      {/* Amount range */}
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Amount Range (₨)</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TextInput style={[fStyles.input, { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 9 }]} placeholder="Min" placeholderTextColor={colors.mutedForeground} value={minAmount} onChangeText={setMinAmount} keyboardType="decimal-pad" />
        <TextInput style={[fStyles.input, { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.text, paddingVertical: 9 }]} placeholder="Max" placeholderTextColor={colors.mutedForeground} value={maxAmount} onChangeText={setMaxAmount} keyboardType="decimal-pad" />
      </View>

      {/* Status filter */}
      {statusOptions.length > 1 && (
        <>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {statusOptions.map(s => (
              <TouchableOpacity key={s} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: statusFilter === s ? tabColor : colors.input, borderWidth: 1, borderColor: statusFilter === s ? tabColor : colors.border }} onPress={() => setStatusFilter(s)}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: statusFilter === s ? "#fff" : colors.mutedForeground }}>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Sort */}
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Sort By</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        {([["newest", "Newest First"], ["oldest", "Oldest First"], ["highest", "Highest Amount"], ["lowest", "Lowest Amount"]] as [SortOrder, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: sortOrder === k ? tabColor : colors.input, borderWidth: 1, borderColor: sortOrder === k ? tabColor : colors.border }} onPress={() => setSortOrder(k)}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: sortOrder === k ? "#fff" : colors.mutedForeground }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  /* ─── Main data for the active tab ─── */
  const activeData   = activeTab === "Sales" ? filteredSales : activeTab === "Purchases" ? filteredPurchases : activeTab === "Expenses" ? filteredExpenses : filteredCredits;
  const activeRender = activeTab === "Sales" ? renderSale   : activeTab === "Purchases" ? renderPurchase   : activeTab === "Expenses" ? renderExpense   : renderCredit;
  const emptyMsg     = activeTab === "Sales" ? "No sales found" : activeTab === "Purchases" ? "No purchases found" : activeTab === "Expenses" ? "No expenses found" : "No credits found";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Transactions</Text>
        {!isAdmin && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Feather name="user" size={12} color="#fff" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFFFFF" }}>My Records</Text>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, { borderBottomColor: activeTab === tab ? colors.primary : "transparent", borderBottomWidth: 2.5 }]} onPress={() => { setActiveTab(tab); setStatusFilter("all"); }}>
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar + filter button */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.input, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 10, gap: 8 }}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, paddingVertical: 9 }}
            placeholder={`Search ${activeTab.toLowerCase()}…`}
            placeholderTextColor={colors.mutedForeground}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: showFilters ? tabColor : colors.input, borderWidth: 1.5, borderColor: showFilters ? tabColor : colors.border }}
          onPress={() => setShowFilters(f => !f)}
        >
          <Feather name="sliders" size={16} color={showFilters ? "#fff" : colors.mutedForeground} />
          {activeFilterCount > 0 && (
            <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        {activeFilterCount > 0 && (
          <TouchableOpacity style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerBg, borderWidth: 1.5, borderColor: colors.danger }} onPress={clearFilters}>
            <Feather name="x-circle" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {/* Advanced filter panel */}
      {showFilters && renderFilterPanel()}

      {/* Summary strip */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tabColor }} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.mutedForeground }}>
            {summaryData.count} {summaryData.count === 1 ? "record" : "records"}
          </Text>
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: tabColor }}>
          {PKR(summaryData.total)}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={activeData as unknown[]}
          renderItem={activeRender as ({ item }: { item: unknown }) => React.ReactElement}
          keyExtractor={(i: unknown) => String((i as { id: number }).id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyMsg}</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={clearFilters} style={{ marginTop: 4 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: tabColor }}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {activeTab !== "Sales" && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowModal(true)}>
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* New record modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>New {activeTab.slice(0, -1)}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {activeTab === "Purchases" && (
                <>
                  <SelectField label="Supplier (optional)" value={purForm.supplierId} items={suppliers} onSelect={v => setPurForm(f => ({ ...f, supplierId: v }))} />
                  <SelectField label="Product" value={purForm.productId} items={products} onSelect={v => setPurForm(f => ({ ...f, productId: v }))} />
                  <InputField label="Quantity" value={purForm.qty} onChangeText={v => setPurForm(f => ({ ...f, qty: v }))} keyboardType="numeric" />
                  <InputField label="Unit Cost (₨)" value={purForm.unitCost} onChangeText={v => setPurForm(f => ({ ...f, unitCost: v }))} keyboardType="decimal-pad" />
                  <InputField label="Discount (₨)" value={purForm.discount} onChangeText={v => setPurForm(f => ({ ...f, discount: v }))} keyboardType="decimal-pad" />
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
                  <InputField label="Amount (₨)" value={expForm.amount} onChangeText={v => setExpForm(f => ({ ...f, amount: v }))} keyboardType="decimal-pad" />
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
                  <InputField label="Amount (₨)" value={credForm.amount} onChangeText={v => setCredForm(f => ({ ...f, amount: v }))} keyboardType="decimal-pad" />
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

      {/* Pay credit modal */}
      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={() => setShowPayModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 8 }}>Record Payment</Text>
            {selectedCredit && (
              <>
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 16 }}>
                  Party: {selectedCredit.partyName}{"\n"}Remaining: {PKR(parseFloat(selectedCredit.remainingAmount))}
                </Text>
                <TextInput
                  style={[fStyles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pay Amount (₨)" placeholderTextColor={colors.mutedForeground}
                  value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad"
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
  container:   { flex: 1 },
  header:      { paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  tabBar:      { flexDirection: "row", borderBottomWidth: 1 },
  tab:         { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText:     { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  emptyText:   { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4 },
  fab:         { position: "absolute", bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

const listStyles = StyleSheet.create({
  card:       { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardLeft:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle:  { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cardSub:    { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  cardAmount: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cardDate:   { fontFamily: "Inter_400Regular", fontSize: 11 },
});

const fStyles = StyleSheet.create({
  label:     { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6 },
  input:     { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14 },
  chip:      { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginRight: 8, alignItems: "center" },
  chipText:  { fontFamily: "Inter_500Medium", fontSize: 13 },
  submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  submitText:{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
});

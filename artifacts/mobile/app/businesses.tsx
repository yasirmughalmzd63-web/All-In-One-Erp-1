import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { ALL_MODULES, type AppModule } from "@/context/AuthContext";

// ── Types ────────────────────────────────────────────────────────────────────
type Business = {
  id: number; businessName: string; businessType: string; ownerName: string;
  email: string | null; phone: string | null; address: string | null;
  package: string; adminUsername: string; status: string; createdAt: string;
  adminUser: { id: number; username: string; isActive: boolean; privileges: string | null } | null;
  modules: string[] | null;
};

// ── Module metadata ──────────────────────────────────────────────────────────
type ModMeta = { label: string; emoji: string; group: string; desc: string };
const MODULE_META: Record<AppModule, ModMeta> = {
  dashboard:           { label: "Reports & Dashboard", emoji: "📊", group: "Analytics",    desc: "Profit/Loss, Balance Sheet, Reporting" },
  pos:                 { label: "POS / Sales",          emoji: "🛒", group: "Sales",        desc: "Point of Sale screen" },
  sales:               { label: "Sales History",        emoji: "🧾", group: "Sales",        desc: "View & manage sales records" },
  purchases:           { label: "Purchases",            emoji: "🛍", group: "Operations",   desc: "Stock purchasing & receiving" },
  expenses:            { label: "Expenses",             emoji: "💸", group: "Operations",   desc: "Business expense tracking" },
  credits:             { label: "Credits",              emoji: "⏳", group: "Finance",      desc: "Receivables & payables" },
  inventory:           { label: "Stock Management",     emoji: "📦", group: "Operations",   desc: "Inventory levels & ledger" },
  customers:           { label: "Customers",            emoji: "👥", group: "CRM",          desc: "Customer records & management" },
  suppliers:           { label: "Suppliers",            emoji: "🚛", group: "CRM",          desc: "Supplier records" },
  accounts:            { label: "Accounts",             emoji: "💳", group: "Finance",      desc: "Payment accounts & cash" },
  locations:           { label: "Apps / Branches",      emoji: "🏪", group: "Management",   desc: "Store apps & locations" },
  categories:          { label: "Categories",           emoji: "🏷", group: "Management",   desc: "Product categories" },
  users:               { label: "User Management",      emoji: "👤", group: "Management",   desc: "Users, Roles & Permissions" },
  audit:               { label: "Audit Log",            emoji: "🛡", group: "Management",   desc: "System activity history" },
  currency:            { label: "Currency / Dollar",    emoji: "💱", group: "Finance",      desc: "Forex & dollar wallet" },
  cash_count:          { label: "Cash Count",           emoji: "🗃", group: "Finance",      desc: "Daily balance sheet" },
  reconciliation:      { label: "Reconciliation",       emoji: "✅", group: "Analytics",    desc: "Daily reconciliation" },
  pos_product:         { label: "All Products (POS)",   emoji: "🔓", group: "POS Access",   desc: "Can select any product" },
  pos_location:        { label: "All Apps (POS)",       emoji: "📍", group: "POS Access",   desc: "Can use any app" },
  pos_account:         { label: "All Accounts (POS)",   emoji: "💰", group: "POS Access",   desc: "Can use any payment method" },
  pos_credit_customer: { label: "Credit Sales (POS)",   emoji: "📝", group: "POS Access",   desc: "Can create credit sales" },
};

const MODULE_GROUPS = ["Sales", "Operations", "Finance", "CRM", "Analytics", "Management", "POS Access"];

const PKG_EMOJI: Record<string, string> = { free: "🆓", basic: "🟢", professional: "🔵", enterprise: "🟣" };
const PKG_LABEL: Record<string, string> = { free: "Free", basic: "Basic", professional: "Professional", enterprise: "Enterprise" };
const PKG_PRICE: Record<string, string> = { free: "Free", basic: "₨999/mo", professional: "₨2,499/mo", enterprise: "₨4,999/mo" };
const PKG_IS_PAID: Record<string, boolean> = { free: false, basic: true, professional: true, enterprise: true };
const PACKAGE_DEFAULTS: Record<string, string[]> = {
  free: ["pos", "sales", "pos_product", "pos_location", "pos_account"],
  basic: ["pos", "sales", "inventory", "accounts", "locations", "categories", "pos_product", "pos_location", "pos_account", "pos_credit_customer"],
  professional: ["dashboard", "pos", "sales", "purchases", "expenses", "credits", "inventory", "customers", "suppliers", "accounts", "locations", "categories", "cash_count", "currency", "pos_product", "pos_location", "pos_account", "pos_credit_customer"],
  enterprise: [...ALL_MODULES],
};
const BUSINESS_TYPES = ["Retail", "Wholesale", "Services", "Manufacturing", "Import/Export", "Other"];
const PACKAGES = ["free", "basic", "professional", "enterprise"] as const;

// ── Main component ────────────────────────────────────────────────────────────
export default function BusinessesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // Module editor state
  const [editingBiz, setEditingBiz] = useState<Business | null>(null);
  const [editModules, setEditModules] = useState<Set<string>>(new Set());
  const [allAccess, setAllAccess] = useState(false);
  const [savingModules, setSavingModules] = useState(false);

  // Create business state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBiz, setNewBiz] = useState({
    businessName: "", businessType: "", ownerName: "",
    email: "", phone: "", package: "professional" as typeof PACKAGES[number],
    adminUsername: "", adminPassword: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await customFetch<Business[]>("/api/businesses");
      setBusinesses(data);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Module editor ──────────────────────────────────────────────────────────
  const openModuleEditor = (biz: Business) => {
    setEditingBiz(biz);
    if (!biz.modules) {
      setAllAccess(true);
      setEditModules(new Set([...ALL_MODULES]));
    } else {
      setAllAccess(false);
      setEditModules(new Set(biz.modules));
    }
  };

  const toggleModule = (m: string) => {
    if (allAccess) return;
    setEditModules(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  };

  const toggleGroup = (group: string) => {
    if (allAccess) return;
    const mods = (ALL_MODULES as unknown as AppModule[]).filter(m => MODULE_META[m].group === group);
    const allOn = mods.every(m => editModules.has(m));
    setEditModules(prev => {
      const n = new Set(prev);
      mods.forEach(m => allOn ? n.delete(m) : n.add(m));
      return n;
    });
  };

  const applyPackageDefault = (pkg: string) => {
    setAllAccess(false);
    setEditModules(new Set(PACKAGE_DEFAULTS[pkg] ?? PACKAGE_DEFAULTS.basic!));
  };

  const saveModules = async () => {
    if (!editingBiz) return;
    setSavingModules(true);
    try {
      await customFetch(`/api/businesses/${editingBiz.id}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: allAccess ? null : Array.from(editModules) }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditingBiz(null);
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally { setSavingModules(false); }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const toggleActive = async (biz: Business) => {
    const newState = !(biz.adminUser?.isActive ?? false);
    try {
      await customFetch(`/api/businesses/${biz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newState }),
      });
      await load();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  // ── Delete business ────────────────────────────────────────────────────────
  const handleDelete = (biz: Business) => {
    Alert.alert(
      "Delete Business",
      `Delete "${biz.businessName}" and its admin account @${biz.adminUsername}?\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await customFetch(`/api/businesses/${biz.id}`, { method: "DELETE" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              await load();
            } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
          },
        },
      ],
    );
  };

  // ── Create business ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const { businessName, businessType, ownerName, adminUsername, adminPassword, package: pkg } = newBiz;
    if (!businessName || !businessType || !ownerName || !adminUsername || !adminPassword) {
      Alert.alert("Required", "All fields marked with * are required."); return;
    }
    if (!/^[a-z0-9_]+$/.test(adminUsername) || adminUsername.length < 3) {
      Alert.alert("Invalid", "Username: lowercase, letters, numbers, underscores only (min 3 chars)"); return;
    }
    if (adminPassword.length < 6) { Alert.alert("Required", "Password must be at least 6 characters."); return; }

    setCreating(true);
    try {
      await customFetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName, businessType, ownerName,
          email: newBiz.email || undefined, phone: newBiz.phone || undefined,
          package: pkg, adminUsername: adminUsername.toLowerCase(), adminPassword,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowCreate(false);
      setNewBiz({ businessName: "", businessType: "", ownerName: "", email: "", phone: "", package: "professional", adminUsername: "", adminPassword: "" });
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create");
    } finally { setCreating(false); }
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  const filtered = businesses.filter(b =>
    !search ||
    b.businessName.toLowerCase().includes(search.toLowerCase()) ||
    b.ownerName.toLowerCase().includes(search.toLowerCase()) ||
    b.adminUsername.toLowerCase().includes(search.toLowerCase()),
  );

  const totalFree = businesses.filter(b => !PKG_IS_PAID[b.package]).length;
  const totalPaid = businesses.filter(b => PKG_IS_PAID[b.package]).length;
  const totalActive = businesses.filter(b => b.adminUser?.isActive).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <LinearGradient colors={["#4C1D95", "#6D28D9", "#7C3AED"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 }}>
          <Text style={{ fontSize: 18, color: "rgba(255,255,255,0.8)" }}>‹</Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Back</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" }}>Business Manager</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Super Admin · Manage all businesses
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCreate(true)}
            style={{ backgroundColor: "#FCD34D", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#78350F" }}>+ Create</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          {[
            { label: "Total", value: businesses.length, color: "#FFF" },
            { label: "🆓 Free", value: totalFree, color: "#6EE7B7" },
            { label: "💳 Paid", value: totalPaid, color: "#FCD34D" },
            { label: "✅ Active", value: totalActive, color: "#A5F3FC" },
          ].map(s => (
            <View key={s.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, padding: 8, alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: s.color }}>{s.value}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "rgba(255,255,255,0.75)" }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search businesses..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: "#FFF" }}
          />
        </View>
      </LinearGradient>

      {/* ── LIST ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={["#7C3AED"]} />}
        >
          {filtered.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>🏢</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 16, color: colors.mutedForeground, marginTop: 12 }}>
                {search ? "No businesses found" : "No businesses yet"}
              </Text>
              {!search && (
                <TouchableOpacity onPress={() => setShowCreate(true)} style={{ marginTop: 16, backgroundColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" }}>+ Create First Business</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {filtered.map(biz => {
            const isActive = biz.adminUser?.isActive ?? false;
            const modCount = biz.modules ? biz.modules.filter(m => ALL_MODULES.includes(m as AppModule)).length : ALL_MODULES.length;
            const isPaid = PKG_IS_PAID[biz.package];
            return (
              <View key={biz.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Top row */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>{biz.businessName}</Text>
                      {/* Active/Inactive */}
                      <View style={{ backgroundColor: isActive ? "#ECFDF5" : "#FEF2F2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isActive ? "#6EE7B7" : "#FCA5A5" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: isActive ? "#065F46" : "#991B1B" }}>
                          {isActive ? "● ACTIVE" : "● INACTIVE"}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{biz.businessType} · {biz.ownerName}</Text>
                  </View>
                  {/* Active toggle */}
                  <Switch
                    value={isActive}
                    onValueChange={() => toggleActive(biz)}
                    trackColor={{ true: "#7C3AED" }}
                    thumbColor="#FFF"
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                  />
                </View>

                {/* Package & plan type */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <View style={[styles.pkgBadge, { backgroundColor: colors.input, borderColor: colors.border }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.text }}>
                      {PKG_EMOJI[biz.package]} {PKG_LABEL[biz.package] ?? biz.package}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, backgroundColor: isPaid ? "#FEF3C7" : "#D1FAE5", borderColor: isPaid ? "#FCD34D" : "#6EE7B7" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: isPaid ? "#92400E" : "#065F46" }}>
                      {isPaid ? `💳 ${PKG_PRICE[biz.package]}` : "🆓 Free"}
                    </Text>
                  </View>
                  <View style={{ marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#EDE9FE" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#4C1D95" }}>
                      🧩 {modCount} modules
                    </Text>
                  </View>
                </View>

                {/* Admin info */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8, backgroundColor: colors.input, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12 }}>👤</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Admin:</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: colors.text }}>@{biz.adminUsername}</Text>
                  {biz.phone && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginLeft: "auto" }}>📞 {biz.phone}</Text>}
                </View>

                {/* Module preview chips */}
                {biz.modules && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                    {biz.modules.filter(m => ALL_MODULES.includes(m as AppModule)).slice(0, 8).map(m => {
                      const meta = MODULE_META[m as AppModule];
                      return (
                        <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.input, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10 }}>{meta?.emoji ?? "•"}</Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.mutedForeground }}>{meta?.label.split(" / ")[0] ?? m}</Text>
                        </View>
                      );
                    })}
                    {biz.modules.filter(m => ALL_MODULES.includes(m as AppModule)).length > 8 && (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#EDE9FE", borderRadius: 8 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#4C1D95" }}>
                          +{biz.modules.filter(m => ALL_MODULES.includes(m as AppModule)).length - 8} more
                        </Text>
                      </View>
                    )}
                    {!biz.modules && (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#DCFCE7", borderRadius: 8 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#16A34A" }}>All modules</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Actions */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 2, backgroundColor: "#EDE9FE", borderColor: "#C4B5FD" }]}
                    onPress={() => openModuleEditor(biz)}
                  >
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#4C1D95" }}>🧩 Select Modules</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}
                    onPress={() => handleDelete(biz)}
                  >
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#991B1B" }}>🗑 Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── MODULE EDITOR MODAL ───────────────────────────────────────────── */}
      <Modal visible={!!editingBiz} animationType="slide" transparent onRequestClose={() => setEditingBiz(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "95%" }}>
            {/* Modal header */}
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Select Modules</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                    {editingBiz?.businessName} · @{editingBiz?.adminUsername}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditingBiz(null)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 20, color: colors.mutedForeground }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Package quick-apply */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: colors.mutedForeground, letterSpacing: 1, marginBottom: 8 }}>APPLY PACKAGE DEFAULTS</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {PACKAGES.map(pkg => (
                    <TouchableOpacity
                      key={pkg}
                      onPress={() => applyPackageDefault(pkg)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: PKG_IS_PAID[pkg] ? "#EFF6FF" : "#ECFDF5", borderWidth: 1, borderColor: PKG_IS_PAID[pkg] ? "#BFDBFE" : "#6EE7B7" }}
                    >
                      <Text style={{ fontSize: 14 }}>{PKG_EMOJI[pkg]}</Text>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: PKG_IS_PAID[pkg] ? "#1E3A8A" : "#065F46", marginTop: 2 }}>
                        {PKG_LABEL[pkg]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Full access toggle */}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: 12, backgroundColor: allAccess ? "#DCFCE7" : colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: allAccess ? "#16A34A" : colors.border }}
                onPress={() => {
                  const newVal = !allAccess;
                  setAllAccess(newVal);
                  if (newVal) setEditModules(new Set([...ALL_MODULES]));
                  else setEditModules(new Set());
                }}
              >
                <View>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>Full Access (All Modules)</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Enable every module for this business</Text>
                </View>
                <Switch value={allAccess} onValueChange={v => { setAllAccess(v); v ? setEditModules(new Set([...ALL_MODULES])) : setEditModules(new Set()); }} trackColor={{ true: "#16A34A" }} />
              </TouchableOpacity>
            </View>

            {/* Scrollable module list */}
            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {MODULE_GROUPS.map(group => {
                const mods = (ALL_MODULES as unknown as AppModule[]).filter(m => MODULE_META[m].group === group);
                const enabledCount = mods.filter(m => editModules.has(m)).length;
                const allOn = enabledCount === mods.length;
                return (
                  <View key={group} style={{ marginBottom: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.card, gap: 8 }}
                      onPress={() => toggleGroup(group)}
                      disabled={allAccess}
                    >
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#7C3AED", flex: 1 }}>{group}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{enabledCount}/{mods.length}</Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: allOn ? "#7C3AED" : colors.input }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: allOn ? "#FFF" : colors.mutedForeground }}>
                          {allOn ? "ALL ON" : "TAP TO ENABLE ALL"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {mods.map((m, idx) => {
                      const on = allAccess || editModules.has(m);
                      const meta = MODULE_META[m];
                      return (
                        <TouchableOpacity
                          key={m}
                          style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 12, backgroundColor: on ? "rgba(124,58,237,0.05)" : colors.background, borderTopWidth: 1, borderTopColor: colors.border }}
                          onPress={() => toggleModule(m)}
                          disabled={allAccess}
                          activeOpacity={0.7}
                        >
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: on ? "#EDE9FE" : colors.input, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: on ? colors.text : colors.mutedForeground }}>{meta.label}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{meta.desc}</Text>
                          </View>
                          <View style={[styles.checkBox, { backgroundColor: on ? "#7C3AED" : "transparent", borderColor: on ? "#7C3AED" : colors.border }]}>
                            {on && <Text style={{ color: "#FFF", fontSize: 10, fontFamily: "Inter_700Bold" }}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
              <View style={{ height: 120 }} />
            </ScrollView>

            {/* Save button */}
            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setEditingBiz(null)}
                  style={[styles.actionBtn, { flex: 1, backgroundColor: colors.input, borderColor: colors.border }]}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveModules}
                  disabled={savingModules}
                  style={[styles.actionBtn, { flex: 2, backgroundColor: "#7C3AED", borderColor: "#7C3AED" }]}
                >
                  {savingModules
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" }}>
                        Save · {allAccess ? "All" : editModules.size} modules enabled
                      </Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CREATE BUSINESS MODAL ────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>🏢 Create Business</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={{ fontSize: 20, color: colors.mutedForeground }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <CField label="Business Name *" value={newBiz.businessName} onChangeText={v => setNewBiz(p => ({ ...p, businessName: v }))} placeholder="e.g. Coins Dynasty Ltd" colors={colors} />
              <CField label="Owner Name *" value={newBiz.ownerName} onChangeText={v => setNewBiz(p => ({ ...p, ownerName: v }))} placeholder="Full owner name" colors={colors} />
              <CField label="Phone" value={newBiz.phone} onChangeText={v => setNewBiz(p => ({ ...p, phone: v }))} placeholder="+92 300 0000000" keyboardType="phone-pad" colors={colors} />

              {/* Business Type */}
              <Text style={[styles.cFieldLabel, { color: colors.mutedForeground }]}>Business Type *</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {BUSINESS_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setNewBiz(p => ({ ...p, businessType: t }))}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: newBiz.businessType === t ? "#7C3AED" : colors.border, backgroundColor: newBiz.businessType === t ? "#7C3AED" : colors.input }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: newBiz.businessType === t ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Package */}
              <Text style={[styles.cFieldLabel, { color: colors.mutedForeground }]}>Package *</Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
                {PACKAGES.map(pkg => (
                  <TouchableOpacity key={pkg} onPress={() => setNewBiz(p => ({ ...p, package: pkg }))}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: newBiz.package === pkg ? "#7C3AED" : colors.border, backgroundColor: newBiz.package === pkg ? "#EDE9FE" : colors.input }}>
                    <Text style={{ fontSize: 16 }}>{PKG_EMOJI[pkg]}</Text>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: newBiz.package === pkg ? "#4C1D95" : colors.mutedForeground, marginTop: 2 }}>{PKG_LABEL[pkg]}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: colors.mutedForeground }}>{PKG_PRICE[pkg]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Admin credentials */}
              <View style={{ padding: 14, backgroundColor: colors.input, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: colors.text, marginBottom: 12 }}>👤 Admin Login Credentials</Text>
                <CField label="Username *" value={newBiz.adminUsername} onChangeText={v => setNewBiz(p => ({ ...p, adminUsername: v.toLowerCase() }))} placeholder="e.g. shop_admin" autoCapitalize="none" colors={colors} />
                <CField label="Password *" value={newBiz.adminPassword} onChangeText={v => setNewBiz(p => ({ ...p, adminPassword: v }))} placeholder="Min 6 characters" secureTextEntry colors={colors} />
              </View>

              <TouchableOpacity
                onPress={handleCreate}
                disabled={creating}
                style={{ backgroundColor: creating ? "#64748B" : "#7C3AED", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 40 }}
              >
                {creating ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" }}>Create Business</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CField({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize, colors }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  keyboardType?: "default" | "phone-pad"; secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences"; colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.cFieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? "words"}
        autoCorrect={false}
        style={{ backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  pkgBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  actionBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  cFieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
});

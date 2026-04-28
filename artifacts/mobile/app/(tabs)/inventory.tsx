import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useListCategories, useListLocations,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Product = {
  id: number; name: string; sku?: string | null; categoryName?: string | null;
  unitPrice: string; wholesalePrice: string; costPrice: string;
  stock: number; unit: string; isActive: boolean; locationId?: number | null;
};
type Category = { id: number; name: string };
type Location = { id: number; name: string };

const emptyForm = {
  name: "", sku: "", categoryId: "", locationId: "",
  unitPrice: "", wholesalePrice: "", costPrice: "", stock: "0", unit: "pcs",
};

function fmtPKR(n: number): string {
  if (!isFinite(n)) return "₨0";
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
}

function PriceChip({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[chipStyles.wrap, { backgroundColor: bg }]}>
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
    </View>
  );
}
const chipStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: "center", minWidth: 72 },
  label: { fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.6 },
  value: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 2 },
});

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: productsRaw, isLoading, refetch } = useListProducts();
  const { data: categoriesRaw } = useListCategories();
  const { data: locationsRaw } = useListLocations();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const products = (productsRaw ?? []) as unknown as Product[];
  const categories = (categoriesRaw ?? []) as unknown as Category[];
  const locations = (locationsRaw ?? []) as unknown as Location[];

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditProduct(null);
    setForm({ ...emptyForm, locationId: user?.locationId ? String(user.locationId) : "" });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku ?? "", stock: String(p.stock), unit: p.unit,
      unitPrice: parseFloat(p.unitPrice).toString(),
      wholesalePrice: parseFloat(p.wholesalePrice).toString(),
      costPrice: parseFloat(p.costPrice).toString(),
      categoryId: p.categoryName ? String((categories.find(c => c.name === p.categoryName) ?? { id: "" }).id) : "",
      locationId: p.locationId ? String(p.locationId) : "",
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.unitPrice || !form.costPrice || !form.unit) {
      Alert.alert("Error", "Name, retail price, cost, unit required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      sku: form.sku || null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      locationId: form.locationId ? parseInt(form.locationId) : null,
      unitPrice: parseFloat(form.unitPrice).toFixed(8),
      wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice).toFixed(8) : parseFloat(form.unitPrice).toFixed(8),
      costPrice: parseFloat(form.costPrice).toFixed(8),
      stock: parseInt(form.stock) || 0,
      unit: form.unit,
    };
    try {
      if (editProduct) {
        await (updateProduct as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editProduct.id, data: payload });
      } else {
        await (createProduct as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (p: Product) => {
    Alert.alert("Delete Product", `Remove "${p.name}" from inventory?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await (deleteProduct as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: p.id });
            queryClient.invalidateQueries();
          } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
        }
      },
    ]);
  };

  const totalStockValueRetail = products.reduce((sum, p) => sum + p.stock * parseFloat(p.unitPrice || "0"), 0);
  const totalStockValueCost   = products.reduce((sum, p) => sum + p.stock * parseFloat(p.costPrice || "0"), 0);

  const stockColor = (s: number) => s > 10 ? colors.success : s > 0 ? colors.expense : colors.danger;
  const stockBg = (s: number) => s > 10 ? colors.saleBg : s > 0 ? colors.expenseBg : colors.dangerBg;

  const locationName = (id?: number | null) => locations.find(l => l.id === id)?.name;

  const InputField = ({ label, fkey, kb }: { label: string; fkey: keyof typeof form; kb?: "default" | "decimal-pad" | "numeric" }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={fStyles.label}>{label}</Text>
      <TextInput
        style={[fStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.input }]}
        value={form[fkey]}
        onChangeText={v => setForm(prev => ({ ...prev, [fkey]: v }))}
        keyboardType={kb ?? "default"}
        placeholderTextColor={colors.mutedForeground}
        placeholder={label.replace(" *", "").replace(" (optional)", "")}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>Inventory</Text>
          <Text style={styles.headerSub}>
            {products.length} products · {fmtPKR(totalStockValueRetail)} retail · {fmtPKR(totalStockValueCost)} cost
          </Text>
        </View>
        {isAdmin && <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Feather name="plus" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>}
      </LinearGradient>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or SKU..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 100, gap: 10 }}
          ListHeaderComponent={filtered.length > 0 ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>{filtered.length} product{filtered.length !== 1 ? "s" : ""}</Text> : null}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 50 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Feather name="package" size={32} color={colors.primary} />
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.text, fontSize: 17 }}>No products yet</Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 6, fontSize: 13, textAlign: "center" }}>Tap "Add" to create your first product</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardAccent, { backgroundColor: stockColor(p.stock) }]} />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{p.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {p.sku && (
                        <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: colors.primary }}>{p.sku}</Text>
                        </View>
                      )}
                      {p.categoryName && (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>#{p.categoryName}</Text>
                      )}
                      {locationName(p.locationId) && (
                        <View style={{ backgroundColor: "#EFF6FF", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Feather name="map-pin" size={9} color="#2563EB" />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#2563EB" }}>{locationName(p.locationId)}</Text>
                        </View>
                      )}
                      <View style={[styles.stockBadge, { backgroundColor: stockBg(p.stock) }]}>
                        <Feather name="layers" size={10} color={stockColor(p.stock)} />
                        <Text style={[styles.stockText, { color: stockColor(p.stock) }]}>{p.stock} {p.unit}</Text>
                      </View>
                      <View style={[styles.stockBadge, { backgroundColor: colors.saleBg }]}>
                        <Feather name="tag" size={10} color={colors.success} />
                        <Text style={[styles.stockText, { color: colors.success }]}>
                          Value {fmtPKR(p.stock * parseFloat(p.unitPrice || "0"))}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {isAdmin && <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(p)}>
                      <Feather name="edit-2" size={13} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(p)}>
                      <Feather name="trash-2" size={13} color={colors.danger} />
                    </TouchableOpacity>
                  </View>}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <PriceChip label="COST" value={`₨${parseFloat(p.costPrice).toFixed(2)}`} color={colors.mutedForeground} bg={colors.input} />
                  <PriceChip label="RETAIL" value={`₨${parseFloat(p.unitPrice).toFixed(2)}`} color={colors.primary} bg={colors.secondary} />
                  <PriceChip label="WHOLESALE" value={`₨${parseFloat(p.wholesalePrice).toFixed(2)}`} color={colors.purchase} bg={colors.purchaseBg} />
                </View>
              </View>
            </View>
          )}
        />
      )}

      {isAdmin && <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAdd}>
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editProduct ? "Edit Product" : "New Product"}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  {editProduct ? "Update product details" : "Add to your inventory"}
                </Text>
              </View>
              <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }} onPress={() => setShowModal(false)}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <InputField label="Product Name *" fkey="name" />
              <InputField label="SKU (optional)" fkey="sku" />

              <View style={[fStyles.groupCard, { backgroundColor: colors.secondary, borderColor: colors.primary + "33" }]}>
                <Text style={[fStyles.groupTitle, { color: colors.primary }]}>Pricing</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fStyles.label}>Cost Price *</Text>
                    <TextInput style={[fStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]} value={form.costPrice} onChangeText={v => setForm(p => ({ ...p, costPrice: v }))} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} placeholder="0.00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fStyles.label}>Retail Price *</Text>
                    <TextInput style={[fStyles.input, { borderColor: colors.primary, color: colors.text, backgroundColor: colors.card }]} value={form.unitPrice} onChangeText={v => setForm(p => ({ ...p, unitPrice: v }))} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} placeholder="0.00" />
                  </View>
                </View>
                <View style={{ marginTop: 10 }}>
                  <Text style={fStyles.label}>Wholesale Price (leave blank to match Retail)</Text>
                  <TextInput
                    style={[fStyles.input, { borderColor: colors.purchase, color: colors.text, backgroundColor: colors.card }]}
                    value={form.wholesalePrice}
                    onChangeText={v => setForm(p => ({ ...p, wholesalePrice: v }))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.mutedForeground}
                    placeholder={form.unitPrice ? `Default: ${form.unitPrice}` : "0.00"}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <InputField label="Stock Qty" fkey="stock" kb="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField label="Unit (pcs/kg/ltr)" fkey="unit" />
                </View>
              </View>

              {/* Category */}
              <View style={{ marginBottom: 14 }}>
                <Text style={fStyles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[{ id: 0, name: "None" }, ...categories].map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[fStyles.catChip, {
                          backgroundColor: form.categoryId === (c.id ? String(c.id) : "") ? colors.primary : colors.input,
                          borderColor: form.categoryId === (c.id ? String(c.id) : "") ? colors.primary : colors.border,
                        }]}
                        onPress={() => setForm(prev => ({ ...prev, categoryId: c.id ? String(c.id) : "" }))}
                      >
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.categoryId === (c.id ? String(c.id) : "") ? "#FFF" : colors.text }}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* App */}
              {locations.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Feather name="map-pin" size={12} color={colors.primary} />
                    <Text style={[fStyles.label, { marginBottom: 0 }]}>App</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={[fStyles.catChip, {
                          backgroundColor: form.locationId === "" ? colors.input : colors.input,
                          borderColor: form.locationId === "" ? colors.border : colors.border,
                          opacity: form.locationId === "" ? 0.6 : 1,
                        }]}
                        onPress={() => setForm(prev => ({ ...prev, locationId: "" }))}
                      >
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.locationId === "" ? colors.mutedForeground : colors.text }}>No App</Text>
                      </TouchableOpacity>
                      {locations.map(l => (
                        <TouchableOpacity
                          key={l.id}
                          style={[fStyles.catChip, {
                            backgroundColor: form.locationId === String(l.id) ? colors.primary : colors.input,
                            borderColor: form.locationId === String(l.id) ? colors.primary : colors.border,
                          }]}
                          onPress={() => setForm(prev => ({ ...prev, locationId: String(l.id) }))}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="map-pin" size={11} color={form.locationId === String(l.id) ? "#FFF" : colors.primary} />
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.locationId === String(l.id) ? "#FFF" : colors.text }}>{l.name}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity style={[fStyles.submitBtn, { backgroundColor: colors.primary, marginTop: 6 }]} onPress={handleSubmit}>
                <Feather name={editProduct ? "check" : "plus"} size={18} color="#FFF" />
                <Text style={fStyles.submitText}>{editProduct ? "Update Product" : "Create Product"}</Text>
              </TouchableOpacity>
              <View style={{ height: 50 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const fStyles = StyleSheet.create({
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#64748B", marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14 },
  groupCard: { borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  groupTitle: { fontFamily: "Inter_700Bold", fontSize: 13, marginBottom: 10 },
  catChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)" },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFFFFF" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginTop: 12, marginBottom: 4, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, height: 46, gap: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", overflow: "hidden" },
  cardAccent: { width: 4, borderRadius: 4, alignSelf: "stretch" },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  stockBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stockText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  actionBtn: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useListCategories,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Product = { id: number; name: string; sku?: string | null; categoryName?: string | null; unitPrice: string; costPrice: string; stock: number; unit: string; isActive: boolean };
type Category = { id: number; name: string };

const emptyForm = { name: "", sku: "", categoryId: "", unitPrice: "", costPrice: "", stock: "0", unit: "pcs" };

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: productsRaw, isLoading, refetch } = useListProducts();
  const { data: categoriesRaw } = useListCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const products = (productsRaw ?? []) as unknown as Product[];
  const categories = (categoriesRaw ?? []) as unknown as Category[];

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditProduct(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({ name: p.name, sku: p.sku ?? "", categoryId: p.categoryName ? String((categories.find(c => c.name === p.categoryName) ?? {id:""}).id) : "", unitPrice: p.unitPrice, costPrice: p.costPrice, stock: String(p.stock), unit: p.unit });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.unitPrice || !form.costPrice || !form.unit) { Alert.alert("Error", "Name, prices, unit required"); return; }
    try {
      if (editProduct) {
        await (updateProduct as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({
          id: editProduct.id,
          data: { name: form.name, sku: form.sku || null, categoryId: form.categoryId ? parseInt(form.categoryId) : null, unitPrice: parseFloat(form.unitPrice).toFixed(8), costPrice: parseFloat(form.costPrice).toFixed(8), stock: parseInt(form.stock) || 0, unit: form.unit },
        });
        Alert.alert("Success", "Product updated");
      } else {
        await (createProduct as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({
          data: { name: form.name, sku: form.sku || null, categoryId: form.categoryId ? parseInt(form.categoryId) : null, unitPrice: parseFloat(form.unitPrice).toFixed(8), costPrice: parseFloat(form.costPrice).toFixed(8), stock: parseInt(form.stock) || 0, unit: form.unit },
        });
        Alert.alert("Success", "Product created");
      }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (p: Product) => {
    Alert.alert("Delete Product", `Delete "${p.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await (deleteProduct as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: p.id });
          queryClient.invalidateQueries();
        } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
      }},
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Inventory</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]} onPress={openAdd}>
          <Feather name="plus" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput style={[styles.searchInput, { color: colors.text }]} placeholder="Search products..." placeholderTextColor={colors.mutedForeground} value={search} onChangeText={setSearch} />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      <Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length} product{filtered.length !== 1 ? "s" : ""}</Text>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Feather name="package" size={48} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 12, fontSize: 16 }}>No products</Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4, fontSize: 13, textAlign: "center" }}>Tap "Add" to create your first product</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardMain}>
                <View style={styles.cardInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{p.name}</Text>
                    {p.sku && <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.primary }}>{p.sku}</Text></View>}
                    {p.categoryName && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>• {p.categoryName}</Text>}
                  </View>
                  <View style={styles.cardStats}>
                    <Text style={[styles.statItem, { color: colors.sale }]}>${parseFloat(p.unitPrice).toFixed(2)}/{p.unit}</Text>
                    <Text style={[styles.statItem, { color: colors.mutedForeground }]}>Cost: ${parseFloat(p.costPrice).toFixed(2)}</Text>
                    <View style={[styles.stockBadge, { backgroundColor: p.stock > 10 ? colors.saleBg : p.stock > 0 ? colors.expenseBg : colors.dangerBg }]}>
                      <Text style={[styles.stockText, { color: p.stock > 10 ? colors.sale : p.stock > 0 ? colors.expense : colors.danger }]}>Stock: {p.stock}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(p)}>
                    <Feather name="edit-2" size={14} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(p)}>
                    <Feather name="trash-2" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editProduct ? "Edit Product" : "New Product"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {[
                { label: "Product Name *", key: "name", kb: "default" as const },
                { label: "SKU (optional)", key: "sku", kb: "default" as const },
                { label: "Unit Price *", key: "unitPrice", kb: "decimal-pad" as const },
                { label: "Cost Price *", key: "costPrice", kb: "decimal-pad" as const },
                { label: "Stock", key: "stock", kb: "numeric" as const },
                { label: "Unit (e.g. pcs, kg, ltr)", key: "unit", kb: "default" as const },
              ].map(f => (
                <View key={f.key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                    value={form[f.key as keyof typeof form]}
                    onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                    keyboardType={f.kb}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[{ id: 0, name: "None" }, ...categories].map(c => (
                    <TouchableOpacity key={c.id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginRight: 8, backgroundColor: form.categoryId === (c.id ? String(c.id) : "") ? colors.primary : colors.input, borderColor: colors.border }} onPress={() => setForm(prev => ({ ...prev, categoryId: c.id ? String(c.id) : "" }))}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: form.categoryId === (c.id ? String(c.id) : "") ? "#FFF" : colors.text }}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editProduct ? "Update Product" : "Create Product"}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFFFFF" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, height: 44, gap: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  count: { fontFamily: "Inter_400Regular", fontSize: 12, marginHorizontal: 20, marginTop: 8, marginBottom: 0 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardMain: { flexDirection: "row", gap: 12 },
  cardInfo: { flex: 1, gap: 6 },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cardStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  statItem: { fontFamily: "Inter_500Medium", fontSize: 13 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stockText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  cardActions: { gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

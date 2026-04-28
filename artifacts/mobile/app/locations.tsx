import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useListLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, useListProducts, useListAccounts, customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Location = { id: number; name: string; address?: string | null; phone?: string | null; isActive: boolean };
type Product = { id: number; name: string; locationId?: number | null; stock: number; unit: string; unitPrice: string; isActive?: boolean };
type Account = { id: number; name: string; balance: string; locationId?: number | null };
type Transfer = {
  id: number; qty: number; notes?: string | null; userId: number; createdAt: string;
  fromLocationId: number; toLocationId: number; fromProductId: number; toProductId: number;
  fromLocationName?: string; toLocationName?: string; fromProductName?: string; toProductName?: string;
};

const emptyForm = { name: "", address: "", phone: "" };
const emptyTransfer = { fromLocationId: "", toLocationId: "", fromProductId: "", toProductId: "", qty: "", notes: "" };

function fmt2(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function LocationsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editItem, setEditItem] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [tf, setTf] = useState(emptyTransfer);
  const [submitting, setSubmitting] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  const { data: raw, isLoading, refetch } = useListLocations();
  const { data: productsRaw } = useListProducts();
  const { data: accountsRaw } = useListAccounts();
  const createMut = useCreateLocation();
  const updateMut = useUpdateLocation();
  const deleteMut = useDeleteLocation();

  const allLocations = (raw ?? []) as unknown as Location[];
  const allProducts = (productsRaw ?? []) as unknown as Product[];
  const allAccounts = (accountsRaw ?? []) as unknown as Account[];

  // For non-admin: show only their assigned location
  const items = isAdmin
    ? allLocations
    : allLocations.filter(l => l.id === user?.locationId);

  // Per-location helpers
  const locationProducts = (locId: number) => allProducts.filter(p => p.locationId === locId && p.isActive !== false);
  const locationStockValue = (locId: number) => locationProducts(locId).reduce((s, p) => s + (p.stock ?? 0) * parseFloat(p.unitPrice ?? "0"), 0);
  const locationStockQty = (locId: number) => locationProducts(locId).reduce((s, p) => s + (p.stock ?? 0), 0);
  const locationAccountBalance = (locId: number) => allAccounts.filter(a => a.locationId === locId).reduce((s, a) => s + parseFloat(a.balance ?? "0"), 0);
  const locationProductCount = (locId: number) => allProducts.filter(p => p.locationId === locId).length;

  // All-locations totals
  const totalStockValue = allProducts.filter(p => p.isActive !== false).reduce((s, p) => s + (p.stock ?? 0) * parseFloat(p.unitPrice ?? "0"), 0);
  const totalAccountBalance = allAccounts.reduce((s, a) => s + parseFloat(a.balance ?? "0"), 0);

  // Transfer products by selected location
  const fromProducts = allProducts.filter(p => tf.fromLocationId ? p.locationId === parseInt(tf.fromLocationId) : true);
  const toProducts = allProducts.filter(p => tf.toLocationId ? p.locationId === parseInt(tf.toLocationId) : true);

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (l: Location) => { setEditItem(l); setForm({ name: l.name, address: l.address ?? "", phone: l.phone ?? "" }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Error", "Name required"); return; }
    const data = { name: form.name.trim(), address: form.address || null, phone: form.phone || null };
    try {
      if (editItem) { await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data }); }
      else { await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data }); }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (l: Location) => {
    Alert.alert("Delete", `Delete "${l.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: l.id }); queryClient.invalidateQueries(); } catch {} } },
    ]);
  };

  const loadTransfers = async () => {
    setLoadingTransfers(true);
    try { const rows = await customFetch<Transfer[]>("/api/locations/stock-transfers"); setTransfers(rows); } catch {}
    setLoadingTransfers(false);
  };

  const openHistory = () => { loadTransfers(); setShowHistoryModal(true); };

  const handleTransfer = async () => {
    if (!tf.fromLocationId || !tf.toLocationId || !tf.fromProductId || !tf.toProductId || !tf.qty) {
      Alert.alert("Error", "All fields are required"); return;
    }
    if (tf.fromProductId === tf.toProductId) { Alert.alert("Error", "Source and destination product must be different"); return; }
    const qty = parseInt(tf.qty);
    if (isNaN(qty) || qty <= 0) { Alert.alert("Error", "Enter a valid quantity"); return; }
    setSubmitting(true);
    try {
      await customFetch("/api/locations/stock-transfer", {
        method: "POST",
        body: JSON.stringify({
          fromLocationId: parseInt(tf.fromLocationId), toLocationId: parseInt(tf.toLocationId),
          fromProductId: parseInt(tf.fromProductId), toProductId: parseInt(tf.toProductId),
          qty, notes: tf.notes || null,
        }),
      });
      queryClient.invalidateQueries();
      setShowTransferModal(false);
      setTf(emptyTransfer);
      Alert.alert("Success", `${qty} units transferred successfully`);
    } catch (e) { Alert.alert("Transfer Failed", e instanceof Error ? e.message : "Failed"); }
    setSubmitting(false);
  };

  const ChipRow = ({ label, items: chips, value, onSelect }: {
    label: string; items: { id: number; name: string; sub?: string }[];
    value: string; onSelect: (v: string) => void;
  }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[S.fLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
        <TouchableOpacity style={[S.chip, { backgroundColor: !value ? colors.primary : colors.input, borderColor: colors.border }]} onPress={() => onSelect("")}>
          <Text style={[S.chipTxt, { color: !value ? "#FFF" : colors.mutedForeground }]}>None</Text>
        </TouchableOpacity>
        {chips.map(c => (
          <TouchableOpacity key={c.id} style={[S.chip, { backgroundColor: value === String(c.id) ? colors.primary : colors.input, borderColor: colors.border }]} onPress={() => onSelect(String(c.id))}>
            <Text style={[S.chipTxt, { color: value === String(c.id) ? "#FFF" : colors.text }]}>{c.name}</Text>
            {c.sub && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: value === String(c.id) ? "rgba(255,255,255,0.7)" : colors.mutedForeground }}>{c.sub}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // Summary tile
  const SummaryTile = ({ label, value, icon, iconBg, iconColor }: { label: string; value: string; icon: string; iconBg: string; iconColor: string }) => (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: "center", gap: 6 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon as never} size={14} color={iconColor} />
      </View>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{value}</Text>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.5, textAlign: "center" }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}
          ListHeaderComponent={
            <View>
              {/* ── All-Locations Summary ─────────────────────────────── */}
              {isAdmin && (
                <View style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.75)", letterSpacing: 0.6, marginBottom: 8 }}>ALL LOCATIONS SUMMARY</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      <Feather name="briefcase" size={14} color="rgba(255,255,255,0.9)" />
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF", marginTop: 4 }}>{fmt2(totalAccountBalance)}</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, marginTop: 2 }}>TOTAL BANK</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      <Feather name="package" size={14} color="rgba(255,255,255,0.9)" />
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF", marginTop: 4 }}>{fmt2(totalStockValue)}</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, marginTop: 2 }}>TOTAL STOCK</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      <Feather name="map-pin" size={14} color="rgba(255,255,255,0.9)" />
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF", marginTop: 4 }}>{allLocations.length}</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, marginTop: 2 }}>BRANCHES</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Transfer buttons for admin/manager ─────────────── */}
              {isAdminOrManager && (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                  <TouchableOpacity style={[S.headerBtn, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", flex: 1 }]} onPress={openHistory}>
                    <Feather name="list" size={14} color="#2563EB" />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#2563EB" }}>Transfer History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.headerBtn, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA", flex: 1 }]} onPress={() => { setTf(emptyTransfer); setShowTransferModal(true); }}>
                    <Feather name="repeat" size={14} color="#D97706" />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#D97706" }}>Transfer Stock</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="map-pin" size={40} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No locations</Text></View>}
          renderItem={({ item: l }) => {
            const prodCount = locationProductCount(l.id);
            const stockQty = locationStockQty(l.id);
            const stockVal = locationStockValue(l.id);
            const accBal = locationAccountBalance(l.id);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5" }}>
                    <Feather name="map-pin" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text, marginBottom: 2 }}>{l.name}</Text>
                    {l.address && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{l.address}</Text>}
                    {l.phone && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{l.phone}</Text>}

                    {/* Stats row */}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <View style={[S.statBadge, { backgroundColor: "#EFF6FF" }]}>
                        <Feather name="briefcase" size={10} color="#2563EB" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#2563EB" }}>{fmt2(accBal)}</Text>
                      </View>
                      <View style={[S.statBadge, { backgroundColor: "#ECFDF5" }]}>
                        <Feather name="package" size={10} color="#059669" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#059669" }}>{fmt2(stockVal)}</Text>
                      </View>
                      <View style={[S.statBadge, { backgroundColor: "#FFF7ED" }]}>
                        <Feather name="layers" size={10} color="#D97706" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#D97706" }}>{stockQty} units · {prodCount} products</Text>
                      </View>
                    </View>
                  </View>
                  {isAdmin && (
                    <View style={{ gap: 8 }}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(l)}>
                        <Feather name="edit-2" size={14} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(l)}>
                        <Feather name="trash-2" size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: "#059669" }]} onPress={openAdd}>
          <Feather name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ── Create/Edit Location Modal ────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Location" : "New Location"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              {[["Name *", "name"], ["Address", "address"], ["Phone", "phone"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                    value={form[key as keyof typeof form]}
                    onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}
              <TouchableOpacity style={{ backgroundColor: "#059669", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8, marginBottom: 40 }} onPress={handleSubmit}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update" : "Create"} Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Stock Transfer Modal ──────────────────────────────────────────── */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => setShowTransferModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="repeat" size={18} color="#D97706" />
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Transfer Stock</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <ChipRow label="FROM LOCATION" items={allLocations.map(l => ({ id: l.id, name: l.name }))} value={tf.fromLocationId} onSelect={v => setTf(f => ({ ...f, fromLocationId: v, fromProductId: "" }))} />
              <ChipRow label="FROM PRODUCT" items={fromProducts.map(p => ({ id: p.id, name: p.name, sub: `Stock: ${p.stock}` }))} value={tf.fromProductId} onSelect={v => setTf(f => ({ ...f, fromProductId: v }))} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="arrow-down" size={14} color="#D97706" />
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </View>
              <ChipRow label="TO LOCATION" items={allLocations.map(l => ({ id: l.id, name: l.name }))} value={tf.toLocationId} onSelect={v => setTf(f => ({ ...f, toLocationId: v, toProductId: "" }))} />
              <ChipRow label="TO PRODUCT" items={toProducts.map(p => ({ id: p.id, name: p.name, sub: `Stock: ${p.stock}` }))} value={tf.toProductId} onSelect={v => setTf(f => ({ ...f, toProductId: v }))} />
              <View style={{ marginBottom: 14 }}>
                <Text style={[S.fLabel, { color: colors.mutedForeground }]}>QUANTITY</Text>
                <TextInput style={[S.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} value={tf.qty} onChangeText={v => setTf(f => ({ ...f, qty: v }))} placeholder="Enter quantity" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />
              </View>
              <View style={{ marginBottom: 20 }}>
                <Text style={[S.fLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
                <TextInput style={[S.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} value={tf.notes} onChangeText={v => setTf(f => ({ ...f, notes: v }))} placeholder="Transfer notes" placeholderTextColor={colors.mutedForeground} />
              </View>
              <TouchableOpacity style={{ backgroundColor: "#D97706", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 60, opacity: submitting ? 0.6 : 1 }} onPress={handleTransfer} disabled={submitting}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{submitting ? "Transferring…" : "Confirm Transfer"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Transfer History Modal ────────────────────────────────────────── */}
      <Modal visible={showHistoryModal} animationType="slide" transparent onRequestClose={() => setShowHistoryModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Transfer History</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {loadingTransfers ? (
              <ActivityIndicator style={{ margin: 40 }} color={colors.primary} />
            ) : (
              <FlatList
                data={transfers}
                keyExtractor={t => String(t.id)}
                contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
                ListEmptyComponent={<View style={{ alignItems: "center", padding: 40 }}><Feather name="repeat" size={36} color={colors.mutedForeground} /><Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No transfers yet</Text></View>}
                renderItem={({ item: t }) => (
                  <View style={[S.histCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }}>
                        <Feather name="repeat" size={14} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{t.fromProductName ?? `#${t.fromProductId}`} → {t.toProductName ?? `#${t.toProductId}`}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{new Date(t.createdAt).toLocaleDateString()} {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                      </View>
                      <View style={{ backgroundColor: "#FFF7ED", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#D97706" }}>{t.qty} units</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={[S.histBadge, { backgroundColor: "#FEF2F2" }]}><Feather name="map-pin" size={10} color={colors.danger} /><Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.danger }}>{t.fromLocationName ?? `Loc #${t.fromLocationId}`}</Text></View>
                      <Feather name="arrow-right" size={12} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                      <View style={[S.histBadge, { backgroundColor: "#ECFDF5" }]}><Feather name="map-pin" size={10} color="#059669" /><Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#059669" }}>{t.toLocationName ?? `Loc #${t.toLocationId}`}</Text></View>
                    </View>
                    {t.notes && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 6 }}>"{t.notes}"</Text>}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

const S = StyleSheet.create({
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  fLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.5, marginBottom: 2 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 6 },
  chip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  statBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  histCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  histBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});

import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useListLocations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth, isAdminOrAbove } from "@/context/AuthContext";

type Supplier = { id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; balance: string; locationId?: number | null };
type Location = { id: number; name: string };
const emptyForm = { name: "", phone: "", email: "", address: "", locationId: "" };

export default function SuppliersScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const canAdmin = isAdminOrAbove(user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<number | "all" | "none">("all");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListSuppliers();
  const { data: locationsRaw } = useListLocations();
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const items = (raw ?? []) as unknown as Supplier[];
  const locations = (locationsRaw ?? []) as unknown as Location[];

  const filtered = items.filter(i => {
    if (locationFilter === "none" && i.locationId != null) return false;
    if (typeof locationFilter === "number" && i.locationId !== locationFilter) return false;
    return i.name.toLowerCase().includes(search.toLowerCase()) || (i.phone ?? "").includes(search);
  });

  const locationName = (id?: number | null) => locations.find(l => l.id === id)?.name;

  const openAdd = () => {
    setEditItem(null);
    const preselect = typeof locationFilter === "number" ? String(locationFilter)
      : user?.locationId ? String(user.locationId) : "";
    setForm({ ...emptyForm, locationId: preselect });
    setShowModal(true);
  };
  const openEdit = (s: Supplier) => {
    setEditItem(s);
    setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", locationId: s.locationId ? String(s.locationId) : "" });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Required", "Supplier name is required."); return; }
    if (canAdmin && locations.length > 0 && !form.locationId) {
      Alert.alert("Required", "Please select an App (location) to link this supplier."); return;
    }
    const data = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      locationId: form.locationId ? parseInt(form.locationId) : null,
    };
    try {
      if (editItem) {
        await (updateMut as unknown as { mutateAsync: (a: { id: number; data: unknown }) => Promise<unknown> }).mutateAsync({ id: editItem.id, data });
      } else {
        await (createMut as unknown as { mutateAsync: (a: { data: unknown }) => Promise<unknown> }).mutateAsync({ data });
      }
      queryClient.invalidateQueries();
      setShowModal(false);
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  const handleDelete = (s: Supplier) => {
    Alert.alert("Delete Supplier", `Delete "${s.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: s.id });
            queryClient.invalidateQueries();
          } catch (e) { Alert.alert("Error", String(e)); }
        },
      },
    ]);
  };

  const countForLocation = (locId: number | "all" | "none") => {
    if (locId === "all") return items.length;
    if (locId === "none") return items.filter(i => i.locationId == null).length;
    return items.filter(i => i.locationId === locId).length;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[colors.purchaseBg.replace("bg", ""), colors.purchase]} style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.purchase }]}>
        <LinearGradient colors={["#0369A1", "#0284C7"]} style={{ borderRadius: 0, paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={styles.headerTitle}>Suppliers</Text>
          <Text style={styles.headerSub}>
            {filtered.length} supplier{filtered.length !== 1 ? "s" : ""}
            {typeof locationFilter === "number" ? ` · ${locationName(locationFilter) ?? ""}` : ""}
          </Text>
        </LinearGradient>
      </LinearGradient>

      {/* Location filter tabs */}
      {canAdmin && locations.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
            <LocationTab label="All" count={countForLocation("all")} active={locationFilter === "all"} color={colors.purchase} onPress={() => setLocationFilter("all")} colors={colors} />
            {locations.map(l => (
              <LocationTab key={l.id} label={l.name} count={countForLocation(l.id)} active={locationFilter === l.id} color={colors.purchase} onPress={() => setLocationFilter(l.id)} colors={colors} />
            ))}
            {countForLocation("none") > 0 && (
              <LocationTab label="No App" count={countForLocation("none")} active={locationFilter === "none"} color="#94A3B8" onPress={() => setLocationFilter("none")} colors={colors} />
            )}
          </ScrollView>
        </View>
      )}

      {/* Search bar */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: 14 }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search suppliers..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Text style={{ color: colors.mutedForeground, fontSize: 18 }}>×</Text></TouchableOpacity> : null}
      </View>

      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.purchase} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>🚛</Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>
                {search ? "No suppliers match your search" : "No suppliers in this location"}
              </Text>
              {canAdmin && !search && (
                <TouchableOpacity onPress={openAdd} style={{ marginTop: 16, backgroundColor: colors.purchase, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" }}>+ Add Supplier</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: s }) => {
            const locName = locationName(s.locationId);
            const bal = parseFloat(s.balance);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardMain}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: colors.purchaseBg }]}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.purchase }}>{s.name.charAt(0).toUpperCase()}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{s.name}</Text>

                    {/* Location badge — prominent */}
                    {locName ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginBottom: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E0F2FE", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#BAE6FD" }}>
                          <Text style={{ fontSize: 10 }}>📍</Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#0369A1" }}>{locName}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginBottom: 2 }}>
                        <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#94A3B8" }}>No App linked</Text>
                        </View>
                      </View>
                    )}

                    {/* Contact info */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                      {s.phone && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>📞 {s.phone}</Text>}
                      {s.email && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>✉️ {s.email}</Text>}
                    </View>

                    {/* Balance */}
                    {bal > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#C2410C" }}>💰 Balance: ₨{bal.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  {canAdmin && (
                    <View style={{ gap: 8 }}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(s)}>
                        <Text style={{ fontSize: 14 }}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(s)}>
                        <Text style={{ fontSize: 14 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {canAdmin && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.purchase }]} onPress={openAdd}>
          <Text style={{ color: "#FFF", fontSize: 32, fontFamily: "Inter_500Medium", lineHeight: 36 }}>+</Text>
        </TouchableOpacity>
      )}

      {/* ── CREATE / EDIT MODAL ───────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Supplier" : "New Supplier"}</Text>
                {form.locationId && (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#0369A1", marginTop: 2 }}>
                    📍 {locationName(parseInt(form.locationId)) ?? "Selected app"}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={{ color: colors.mutedForeground, fontSize: 22, fontFamily: "Inter_500Medium", lineHeight: 24 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {/* App / Location selector — shown first, prominently */}
              {locations.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <Text style={{ fontSize: 16 }}>📍</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>App / Location</Text>
                    <View style={{ backgroundColor: "#FEF2F2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#DC2626" }}>REQUIRED</Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {locations.map(l => (
                        <TouchableOpacity
                          key={l.id}
                          style={[styles.locChip, {
                            backgroundColor: form.locationId === String(l.id) ? colors.purchase : colors.input,
                            borderColor: form.locationId === String(l.id) ? colors.purchase : colors.border,
                            borderWidth: form.locationId === String(l.id) ? 2 : 1.5,
                          }]}
                          onPress={() => setForm(f => ({ ...f, locationId: String(l.id) }))}
                        >
                          <Text style={{ fontSize: 12 }}>🏪</Text>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.locationId === String(l.id) ? "#FFF" : colors.text }}>{l.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {!editItem && (
                        <TouchableOpacity
                          style={[styles.locChip, { borderColor: "#E2E8F0", opacity: 0.6 }]}
                          onPress={() => setForm(f => ({ ...f, locationId: "" }))}
                        >
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>No App</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </ScrollView>
                  {!form.locationId && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#DC2626", marginTop: 6 }}>
                      ⚠️ Linking to an app is required so data is filtered correctly.
                    </Text>
                  )}
                </View>
              )}

              {[["Name *", "name"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                    value={form[key as keyof typeof form]}
                    onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholderTextColor={colors.mutedForeground}
                    placeholder={label.replace(" *", "")}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={{ backgroundColor: colors.purchase, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8, marginBottom: 40 }}
                onPress={handleSubmit}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>{editItem ? "Update Supplier" : "Create Supplier"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LocationTab({ label, count, active, color, onPress, colors }: {
  label: string; count: number; active: boolean; color: string;
  onPress: () => void; colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
        backgroundColor: active ? color : colors.input,
        borderColor: active ? color : colors.border,
      }}
    >
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: active ? "#FFF" : colors.mutedForeground }}>{label}</Text>
      <View style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.border, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: active ? "#FFF" : colors.mutedForeground }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 0 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  searchRow: { flexDirection: "row", alignItems: "center", margin: 14, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, height: 44, gap: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  locChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
});

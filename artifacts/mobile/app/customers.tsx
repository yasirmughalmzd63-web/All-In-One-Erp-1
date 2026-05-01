import React, { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useListLocations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth, isAdminOrAbove } from "@/context/AuthContext";

type Customer = { id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; creditBalance: string; locationId?: number | null };
type Location = { id: number; name: string };
const emptyForm = { name: "", phone: "", email: "", address: "", locationId: "", openingCreditBalance: "", openingCreditType: "receivable" as "receivable" | "payable" };

export default function CustomersScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const router  = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const canAdmin = isAdminOrAbove(user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<number | "all" | "none">("all");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: raw, isLoading, refetch } = useListCustomers();
  const { data: locationsRaw } = useListLocations();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const items = (raw ?? []) as unknown as Customer[];
  const locations = (locationsRaw ?? []) as unknown as Location[];

  // Filter by location tab first, then by search
  const filtered = items.filter(i => {
    if (locationFilter === "none" && i.locationId != null) return false;
    if (typeof locationFilter === "number" && i.locationId !== locationFilter) return false;
    return i.name.toLowerCase().includes(search.toLowerCase()) || (i.phone ?? "").includes(search);
  });

  const locationName = (id?: number | null) => locations.find(l => l.id === id)?.name;

  const openAdd = () => {
    setEditItem(null);
    // Pre-select current location filter if one is selected
    const preselect = typeof locationFilter === "number" ? String(locationFilter)
      : user?.locationId ? String(user.locationId) : "";
    setForm({ ...emptyForm, locationId: preselect });
    setShowModal(true);
  };
  const openEdit = (c: Customer) => {
    setEditItem(c);
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", locationId: c.locationId ? String(c.locationId) : "", openingCreditBalance: "", openingCreditType: "receivable" });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert("Required", "Customer name is required."); return; }
    if (canAdmin && locations.length > 0 && !form.locationId) {
      Alert.alert("Required", "Please select an App (location) to link this customer."); return;
    }
    const data: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      locationId: form.locationId ? parseInt(form.locationId) : null,
    };
    if (!editItem && form.openingCreditBalance) {
      const bal = parseFloat(form.openingCreditBalance);
      if (!isNaN(bal) && bal > 0) {
        data.openingCreditBalance = bal.toFixed(8);
        data.openingCreditType = form.openingCreditType;
      }
    }
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

  const handleDelete = (c: Customer) => {
    Alert.alert("Delete Customer", `Delete "${c.name}"?\n\nAll related credits will remain in records.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await (deleteMut as unknown as { mutateAsync: (a: { id: number }) => Promise<unknown> }).mutateAsync({ id: c.id });
            queryClient.invalidateQueries();
          } catch (e) { Alert.alert("Error", String(e)); }
        },
      },
    ]);
  };

  // Location counts for tab labels
  const countForLocation = (locId: number | "all" | "none") => {
    if (locId === "all") return items.length;
    if (locId === "none") return items.filter(i => i.locationId == null).length;
    return items.filter(i => i.locationId === locId).length;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with gradient */}
      <LinearGradient colors={[colors.headerBg, colors.primary]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.headerTitle}>Customers</Text>
        <Text style={styles.headerSub}>
          {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          {typeof locationFilter === "number" ? ` · ${locationName(locationFilter) ?? ""}` : ""}
        </Text>
      </LinearGradient>

      {/* Location filter tabs — show for admins when multiple locations exist */}
      {canAdmin && locations.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
            <LocationTab label="All" count={countForLocation("all")} active={locationFilter === "all"} color={colors.primary} onPress={() => setLocationFilter("all")} colors={colors} />
            {locations.map(l => (
              <LocationTab key={l.id} label={l.name} count={countForLocation(l.id)} active={locationFilter === l.id} color={colors.primary} onPress={() => setLocationFilter(l.id)} colors={colors} />
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
          placeholder="Search customers..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Text style={{ color: colors.mutedForeground, fontSize: 18 }}>×</Text></TouchableOpacity> : null}
      </View>

      {isLoading ? <ActivityIndicator style={{ margin: 40 }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40 }}>👥</Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>
                {search ? "No customers match your search" : "No customers in this location"}
              </Text>
              {canAdmin && !search && (
                <TouchableOpacity onPress={openAdd} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFF" }}>+ Add Customer</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: c }) => {
            const locName = locationName(c.locationId);
            const creditAmt = parseFloat(c.creditBalance);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardMain}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{c.name}</Text>

                    {/* Location badge — prominent */}
                    {locName ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginBottom: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#BFDBFE" }}>
                          <Text style={{ fontSize: 10 }}>📍</Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#2563EB" }}>{locName}</Text>
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
                      {c.phone && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>📞 {c.phone}</Text>}
                      {c.email && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>✉️ {c.email}</Text>}
                    </View>

                    {/* Credit balance */}
                    {creditAmt > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#92400E" }}>⏳ Credit: ₨{creditAmt.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#EFF6FF" }]}
                      onPress={() => router.push({ pathname: "/customer-profile", params: { id: String(c.id) } })}
                    >
                      <Text style={{ fontSize: 14 }}>📋</Text>
                    </TouchableOpacity>
                    {canAdmin && (
                      <>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => openEdit(c)}>
                          <Text style={{ fontSize: 14 }}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDelete(c)}>
                          <Text style={{ fontSize: 14 }}>🗑</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {canAdmin && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Text style={{ color: "#FFF", fontSize: 32, fontFamily: "Inter_500Medium", lineHeight: 36 }}>+</Text>
        </TouchableOpacity>
      )}

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{editItem ? "Edit Customer" : "New Customer"}</Text>
                {form.locationId && (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#2563EB", marginTop: 2 }}>
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
                            backgroundColor: form.locationId === String(l.id) ? colors.primary : colors.input,
                            borderColor: form.locationId === String(l.id) ? colors.primary : colors.border,
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
                          style={[styles.locChip, { backgroundColor: form.locationId === "" ? colors.input : colors.input, borderColor: form.locationId === "" ? "#94A3B8" : colors.border, opacity: 0.6 }]}
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

              {/* Customer fields */}
              {[["Name *", "name"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"]].map(([label, key]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>{label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input }}
                    value={form[key as keyof typeof form] as string}
                    onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholderTextColor={colors.mutedForeground}
                    placeholder={label.replace(" *", "")}
                  />
                </View>
              ))}

              {/* Opening credit balance — only on create */}
              {!editItem && (
                <View style={[styles.creditSection, { borderColor: colors.credit + "55", backgroundColor: colors.creditBg }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 16 }}>⏳</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.credit }}>Opening Credit Balance</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>(optional)</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }}>Amount</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, backgroundColor: colors.input, marginBottom: 12 }}
                    value={form.openingCreditBalance}
                    onChangeText={v => setForm(f => ({ ...f, openingCreditBalance: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Credit Type</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {(["receivable", "payable"] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeBtn, {
                          backgroundColor: form.openingCreditType === t ? (t === "receivable" ? colors.success : colors.credit) : colors.input,
                          borderColor: form.openingCreditType === t ? (t === "receivable" ? colors.success : colors.credit) : colors.border,
                          flex: 1,
                        }]}
                        onPress={() => setForm(f => ({ ...f, openingCreditType: t }))}
                      >
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: form.openingCreditType === t ? "#FFF" : colors.mutedForeground }}>
                          {t === "receivable" ? "✓ Receivable" : "✓ Payable"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 16, marginBottom: 40 }}
                onPress={handleSubmit}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" }}>
                  {editItem ? "Update Customer" : "Create Customer"}
                </Text>
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
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: active ? "#FFF" : colors.mutedForeground }}>
        {label}
      </Text>
      <View style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.border, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: active ? "#FFF" : colors.mutedForeground }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  searchRow: { flexDirection: "row", alignItems: "center", margin: 14, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, height: 44, gap: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  creditSection: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5 },
  locChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
});

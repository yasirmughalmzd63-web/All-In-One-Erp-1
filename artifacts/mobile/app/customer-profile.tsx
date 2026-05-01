import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Customer {
  id: number; name: string; phone?: string | null; email?: string | null;
  address?: string | null; creditBalance: string; locationId?: number | null;
  createdAt: string;
}
interface Summary {
  totalSales: string; totalCreditIssued: string;
  totalCreditPaid: string; totalCreditOutstanding: string;
  salesCount: number; creditCount: number; paymentCount: number;
}
interface StatementEntry {
  id: string; kind: string; date: string; label: string;
  amount: number; sign: "+" | "-"; status?: string; notes?: string;
}
interface CreditRow {
  id: number; type: string; amount: string; paidAmount: string;
  remainingAmount: string; status: string; notes?: string | null;
  dueDate?: string | null; createdAt: string;
}
interface PaymentRow {
  id: number; creditId: number; amount: string; paymentMethod: string;
  notes?: string | null; createdAt: string;
}
interface SaleRow {
  id: number; invoiceNo: string; total: string; amountPaid: string;
  paymentMethod: string; status: string; notes?: string | null;
  createdAt: string;
}
interface ProfileData {
  customer: Customer;
  summary: Summary;
  statement: StatementEntry[];
  credits: CreditRow[];
  payments: PaymentRow[];
  sales: SaleRow[];
}

type Tab = "statement" | "credits" | "payments" | "sales";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "#FFF7ED", text: "#92400E" },
  partial:   { bg: "#EFF6FF", text: "#1D4ED8" },
  paid:      { bg: "#ECFDF5", text: "#065F46" },
  completed: { bg: "#ECFDF5", text: "#065F46" },
};
const KIND_ICON: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; bg: string; color: string }> = {
  credit:  { icon: "minus-circle", bg: "#FEF2F2", color: "#DC2626" },
  payment: { icon: "plus-circle",  bg: "#ECFDF5", color: "#059669" },
  sale:    { icon: "shopping-bag", bg: "#EFF6FF", color: "#2563EB" },
};

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { token } = useAuth();
  const colors  = useColors();

  const [data,      setData]      = useState<ProfileData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,       setTab]       = useState<Tab>("statement");

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const r = await fetch(getApiUrl(`/api/customers/${id}/statement`), { headers });
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const shareStatement = async () => {
    if (!data) return;
    const { customer, summary, statement } = data;
    const lines = [
      `Customer Statement — ${customer.name} (ID #${customer.id})`,
      customer.phone ? `Phone: ${customer.phone}` : "",
      "",
      `Total Sales:         ${PKR(parseFloat(summary.totalSales))}`,
      `Credit Issued:       ${PKR(parseFloat(summary.totalCreditIssued))}`,
      `Credit Paid:         ${PKR(parseFloat(summary.totalCreditPaid))}`,
      `Outstanding Credit:  ${PKR(parseFloat(summary.totalCreditOutstanding))}`,
      "",
      "── Transactions ──",
      ...statement.map(e =>
        `${fmtDate(e.date)}  ${e.sign}${PKR(e.amount).replace("₨", "₨ ")}  ${e.label}${e.status ? ` [${e.status}]` : ""}`
      ),
    ].filter(Boolean).join("\n");
    await Share.share({ message: lines, title: `Statement — ${customer.name}` });
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular" }}>
          Loading profile…
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Failed to load customer</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: "#2563EB", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { customer, summary, statement, credits, payments, sales } = data;
  const initials = customer.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const outstanding = parseFloat(summary.totalCreditOutstanding);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFF" />
        </TouchableOpacity>

        {/* Avatar + name block */}
        <View style={s.headerMid}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.custName}>{customer.name}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
              <View style={s.idBadge}>
                <Text style={s.idBadgeText}>ID #{customer.id}</Text>
              </View>
              {customer.phone && (
                <View style={s.idBadge}>
                  <Feather name="phone" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={s.idBadgeText}>{customer.phone}</Text>
                </View>
              )}
              {customer.email && (
                <View style={s.idBadge}>
                  <Feather name="mail" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={s.idBadgeText}>{customer.email}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={shareStatement} style={s.shareBtn}>
          <Feather name="share-2" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* ── Summary cards ── */}
      <View style={s.summaryRow}>
        <SummaryCard label="Total Sales" value={PKR(parseFloat(summary.totalSales))} sub={`${summary.salesCount} invoices`} color="#2563EB" icon="shopping-bag" />
        <SummaryCard label="Credit Issued" value={PKR(parseFloat(summary.totalCreditIssued))} sub={`${summary.creditCount} entries`} color="#DC2626" icon="minus-circle" />
        <SummaryCard label="Credit Paid" value={PKR(parseFloat(summary.totalCreditPaid))} sub={`${summary.paymentCount} payments`} color="#059669" icon="plus-circle" />
        <SummaryCard label="Outstanding" value={PKR(outstanding)} sub={outstanding > 0 ? "Due" : "Clear"} color={outstanding > 0 ? "#D97706" : "#059669"} icon="alert-circle" />
      </View>

      {/* ── Tab bar ── */}
      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        {([
          ["statement", "Statement", statement.length],
          ["credits",   "Credits",   credits.length],
          ["payments",  "Payments",  payments.length],
          ["sales",     "Sales",     sales.length],
        ] as [Tab, string, number][]).map(([k, label, count]) => (
          <TouchableOpacity key={k} style={[s.tabItem, tab === k && s.tabItemActive]} onPress={() => setTab(k)}>
            <Text style={[s.tabLabel, tab === k && s.tabLabelActive]}>{label}</Text>
            {count > 0 && (
              <View style={[s.tabBadge, tab === k && { backgroundColor: "#2563EB" }]}>
                <Text style={[s.tabBadgeText, tab === k && { color: "#FFF" }]}>{count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ── */}
      {tab === "statement" && (
        <FlatList
          data={statement}
          keyExtractor={e => e.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={<EmptyState icon="file-text" label="No transactions yet" />}
          renderItem={({ item: e }) => {
            const kStyle = KIND_ICON[e.kind] ?? KIND_ICON["sale"]!;
            const sStyle = e.status ? (STATUS_STYLE[e.status] ?? STATUS_STYLE["pending"]!) : null;
            return (
              <View style={s.entryCard}>
                {/* Left accent */}
                <View style={{ width: 3, borderRadius: 2, backgroundColor: e.sign === "+" ? "#059669" : e.kind === "sale" ? "#2563EB" : "#DC2626", marginRight: 10, alignSelf: "stretch" }} />

                {/* Icon */}
                <View style={[s.entryIcon, { backgroundColor: kStyle.bg }]}>
                  <Feather name={kStyle.icon} size={16} color={kStyle.color} />
                </View>

                {/* Content */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={s.entryLabel}>{e.label}</Text>
                    <Text style={[s.entryAmount, { color: e.sign === "+" ? "#059669" : e.kind === "sale" ? "#2563EB" : "#DC2626" }]}>
                      {e.sign}{PKR(e.amount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                    <Text style={s.entryDate}>{fmtDate(e.date)} · {fmtTime(e.date)}</Text>
                    {sStyle && (
                      <View style={[s.statusBadge, { backgroundColor: sStyle.bg }]}>
                        <Text style={[s.statusText, { color: sStyle.text }]}>{e.status}</Text>
                      </View>
                    )}
                  </View>
                  {e.notes ? <Text style={s.entryNotes} numberOfLines={1}>{e.notes}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}

      {tab === "credits" && (
        <FlatList
          data={credits}
          keyExtractor={c => String(c.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={<EmptyState icon="credit-card" label="No credit entries" />}
          renderItem={({ item: c }) => {
            const sStyle = STATUS_STYLE[c.status] ?? STATUS_STYLE["pending"]!;
            const pct = parseFloat(c.amount) > 0 ? (parseFloat(c.paidAmount) / parseFloat(c.amount)) * 100 : 0;
            return (
              <View style={s.creditCard}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="minus-circle" size={15} color="#DC2626" />
                    </View>
                    <View>
                      <Text style={s.creditLabel}>{c.type === "receivable" ? "Credit Issued" : "Payable"}</Text>
                      <Text style={s.entryDate}>{fmtDate(c.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: sStyle.bg }]}>
                    <Text style={[s.statusText, { color: sStyle.text }]}>{c.status}</Text>
                  </View>
                </View>

                {/* Amounts row */}
                <View style={{ flexDirection: "row", gap: 0, marginBottom: 8 }}>
                  <AmtCell label="Total" value={PKR(parseFloat(c.amount))} />
                  <AmtCell label="Paid" value={PKR(parseFloat(c.paidAmount))} color="#059669" />
                  <AmtCell label="Remaining" value={PKR(parseFloat(c.remainingAmount))} color={parseFloat(c.remainingAmount) > 0 ? "#DC2626" : "#059669"} />
                </View>

                {/* Progress bar */}
                <View style={{ height: 5, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(pct, 100)}%`, height: "100%", backgroundColor: pct >= 100 ? "#059669" : "#2563EB", borderRadius: 3 }} />
                </View>
                <Text style={[s.entryDate, { marginTop: 4, textAlign: "right" }]}>{pct.toFixed(0)}% paid</Text>

                {c.notes ? <Text style={s.entryNotes}>{c.notes}</Text> : null}
                {c.dueDate ? <Text style={[s.entryNotes, { color: "#D97706" }]}>Due: {c.dueDate}</Text> : null}
              </View>
            );
          }}
        />
      )}

      {tab === "payments" && (
        <FlatList
          data={payments}
          keyExtractor={p => String(p.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={<EmptyState icon="check-circle" label="No payments recorded" />}
          renderItem={({ item: p }) => (
            <View style={s.entryCard}>
              <View style={{ width: 3, borderRadius: 2, backgroundColor: "#059669", marginRight: 10, alignSelf: "stretch" }} />
              <View style={[s.entryIcon, { backgroundColor: "#ECFDF5" }]}>
                <Feather name="plus-circle" size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.entryLabel}>Credit Payment</Text>
                  <Text style={[s.entryAmount, { color: "#059669" }]}>+{PKR(parseFloat(p.amount))}</Text>
                </View>
                <Text style={s.entryDate}>{fmtDate(p.createdAt)} · {fmtTime(p.createdAt)}</Text>
                <Text style={[s.entryNotes, { color: "#6B7280" }]}>
                  via {p.paymentMethod.replace("_", " ")}  ·  Credit #{p.creditId}
                </Text>
                {p.notes ? <Text style={s.entryNotes} numberOfLines={1}>{p.notes}</Text> : null}
              </View>
            </View>
          )}
        />
      )}

      {tab === "sales" && (
        <FlatList
          data={sales}
          keyExtractor={s => String(s.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={<EmptyState icon="shopping-bag" label="No sales for this customer" />}
          renderItem={({ item: sale }) => {
            const sStyle = STATUS_STYLE[sale.status] ?? STATUS_STYLE["completed"]!;
            return (
              <View style={s.entryCard}>
                <View style={{ width: 3, borderRadius: 2, backgroundColor: "#2563EB", marginRight: 10, alignSelf: "stretch" }} />
                <View style={[s.entryIcon, { backgroundColor: "#EFF6FF" }]}>
                  <Feather name="shopping-bag" size={15} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={s.entryLabel}>Sale #{sale.invoiceNo}</Text>
                    <Text style={[s.entryAmount, { color: "#2563EB" }]}>{PKR(parseFloat(sale.total))}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
                    <Text style={s.entryDate}>{fmtDate(sale.createdAt)} · {fmtTime(sale.createdAt)}</Text>
                    <View style={[s.statusBadge, { backgroundColor: sStyle.bg }]}>
                      <Text style={[s.statusText, { color: sStyle.text }]}>{sale.status}</Text>
                    </View>
                  </View>
                  <Text style={s.entryNotes}>
                    Paid: {PKR(parseFloat(sale.amountPaid))} · {sale.paymentMethod}
                  </Text>
                  {sale.notes ? <Text style={s.entryNotes} numberOfLines={1}>{sale.notes}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function SummaryCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <View style={[ss.sumCard, { borderTopColor: color }]}>
      <Feather name={icon} size={14} color={color} style={{ marginBottom: 4 }} />
      <Text style={[ss.sumValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={ss.sumLabel}>{label}</Text>
      <Text style={ss.sumSub}>{sub}</Text>
    </View>
  );
}

function AmtCell({ label, value, color = "#1F2937" }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "700", color, fontFamily: "Inter_700Bold" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function EmptyState({ icon, label }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string }) {
  return (
    <View style={{ alignItems: "center", marginTop: 60, gap: 10 }}>
      <Feather name={icon} size={40} color="#D1D5DB" />
      <Text style={{ color: "#9CA3AF", fontSize: 15, fontFamily: "Inter_400Regular" }}>{label}</Text>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:      { flex: 1 },
  center:    { flex: 1, alignItems: "center", justifyContent: "center" },
  header:    { backgroundColor: "#1E40AF", paddingHorizontal: 16, paddingBottom: 16, flexDirection: "column", gap: 12 },
  backBtn:   { alignSelf: "flex-start", padding: 4 },
  headerMid: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:    { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontWeight: "700", color: "#FFF", fontFamily: "Inter_700Bold" },
  custName:  { fontSize: 18, fontWeight: "700", color: "#FFF", fontFamily: "Inter_700Bold" },
  idBadge:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  idBadgeText: { fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium" },
  shareBtn:  { position: "absolute", right: 16, top: 48, padding: 6 },

  summaryRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 10, gap: 6 },

  tabBar:     { flexDirection: "row", borderBottomWidth: 1, backgroundColor: "#FFF" },
  tabItem:    { flex: 1, alignItems: "center", paddingVertical: 10, flexDirection: "row", justifyContent: "center", gap: 4 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: "#2563EB" },
  tabLabel:   { fontSize: 12, color: "#6B7280", fontFamily: "Inter_500Medium" },
  tabLabelActive: { color: "#2563EB", fontFamily: "Inter_700Bold" },
  tabBadge:   { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { fontSize: 10, color: "#6B7280", fontFamily: "Inter_700Bold" },

  entryCard:  { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#F3F4F6", padding: 12, flexDirection: "row", alignItems: "flex-start", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  entryIcon:  { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  entryLabel: { fontSize: 13, fontWeight: "600", color: "#1F2937", fontFamily: "Inter_600SemiBold" },
  entryAmount: { fontSize: 14, fontWeight: "800", fontFamily: "Inter_700Bold" },
  entryDate:  { fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
  entryNotes: { fontSize: 11, color: "#6B7280", fontFamily: "Inter_400Regular", marginTop: 2 },

  creditCard: { backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#F3F4F6", padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  creditLabel: { fontSize: 13, fontWeight: "700", color: "#1F2937", fontFamily: "Inter_700Bold" },

  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText:  { fontSize: 10, fontWeight: "700", fontFamily: "Inter_700Bold" },
});

const ss = StyleSheet.create({
  sumCard:  { flex: 1, backgroundColor: "#FFF", borderRadius: 12, padding: 10, alignItems: "center", borderTopWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  sumValue: { fontSize: 14, fontWeight: "800", fontFamily: "Inter_700Bold", textAlign: "center" },
  sumLabel: { fontSize: 9, color: "#6B7280", fontFamily: "Inter_600SemiBold", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 },
  sumSub:   { fontSize: 9, color: "#9CA3AF", fontFamily: "Inter_400Regular", textAlign: "center" },
});

import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type Period = "today" | "yesterday" | "week" | "month" | "all";
type Tab = "orders" | "transfers" | "flow";

type SaleEntry = {
  id: number; time: string; customerName: string;
  total: number; amountPaid: number; paymentMethod: string;
  status: string; locationName: string | null;
};
type UserGroup = { userId: number; userName: string; orders: number; amount: number; sales: SaleEntry[] };
type DayOrders = { date: string; totalAmount: number; totalOrders: number; byUser: UserGroup[] };
type Transfer  = { id: number; createdAt: string; details: string; amount: number; userId: number; userName: string; day: string };
type DayFlow   = { date: string; salesIn: number; purchasesOut: number; expensesOut: number; transfersOut: number; totalIn: number; totalOut: number; net: number };
type CfUser    = { id: number; name: string };

type Resp = {
  period: { start: string; end: string };
  users: CfUser[];
  orders: DayOrders[];
  transfers: Transfer[];
  flow: { byDay: DayFlow[]; totals: { totalIn: number; totalOut: number; net: number } };
};

const fmt = (n: number, short = true) => {
  if (short) {
    if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  }
  return `₨${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const PM_ICON: Record<string, string> = {
  cash: "💵", card: "💳", bank: "🏦", mobile_wallet: "📱", dollar: "$", credit: "📝",
};

function periodToRange(p: Period): { start: string | null; end: string | null; label: string } {
  if (p === "all") return { start: null, end: null, label: "All time" };
  const today = new Date();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "today")     return { start: f(today),  end: f(today),  label: "Today" };
  if (p === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: f(y), end: f(y), label: "Yesterday" }; }
  if (p === "week")      { const s = new Date(today); s.setDate(s.getDate() - 6); return { start: f(s), end: f(today), label: "Last 7 days" }; }
  const s = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: f(s), end: f(today), label: "This month" };
}

export default function CashFlowScreen() {
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const router  = useRouter();
  const { user } = useAuth();

  const [period,      setPeriod]      = useState<Period>("week");
  const [tab,         setTab]         = useState<Tab>("orders");
  const [filterUser,  setFilterUser]  = useState<number | null>(null);
  const [data,        setData]        = useState<Resp | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [userPicker,  setUserPicker]  = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null); // "day|userId"

  const range = useMemo(() => periodToRange(period), [period]);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.start) params.set("startDate", range.start);
      if (range.end)   params.set("endDate",   range.end);
      if (filterUser)  params.set("userId",    String(filterUser));
      const r = await customFetch<Resp>(`/api/reports/cash-flow-v2?${params.toString()}`);
      setData(r as Resp);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [range, filterUser]);

  useEffect(() => { void load(true); }, [load]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const totals = data?.flow.totals ?? { totalIn: 0, totalOut: 0, net: 0 };
  const orderCount = data?.orders.reduce((s, d) => s + d.totalOrders, 0) ?? 0;
  const orderTotal = data?.orders.reduce((s, d) => s + d.totalAmount, 0) ?? 0;
  const selectedUserName = data?.users.find(u => u.id === filterUser)?.name ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <LinearGradient colors={["#0369A1", "#075985"]} style={{ paddingTop: topPad + 8, paddingBottom: 18, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontSize: 22 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF" }}>Cash Flow</Text>
          <TouchableOpacity onPress={() => load(true)} style={{ width: 40, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontSize: 18 }}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* Hero totals */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <HeroBox label="Money In" value={fmt(tab === "orders" ? orderTotal : totals.totalIn)} color="#A7F3D0" />
          <HeroBox label="Money Out" value={fmt(totals.totalOut)} color="#FECACA" />
          <HeroBox label="Net" value={fmt(totals.net)} color={totals.net >= 0 ? "#A7F3D0" : "#FECACA"} />
        </View>

        {/* Tab selector */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {([
            ["orders",    `📋 Orders (${orderCount})`],
            ["transfers", `🔄 Transfers`],
            ["flow",      `📊 Flow`],
          ] as [Tab, string][]).map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)}
              style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: "center",
                backgroundColor: tab === k ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                borderWidth: 1, borderColor: tab === k ? "rgba(255,255,255,0.5)" : "transparent" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFF" }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10, gap: 6, flexDirection: "row" }}>
          {(["today","yesterday","week","month","all"] as Period[]).map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
                backgroundColor: period === p ? "#0369A1" : colors.background,
                borderWidth: 1, borderColor: period === p ? "#0369A1" : colors.border }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: period === p ? "#FFF" : colors.text }}>
                {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "week" ? "7 Days" : p === "month" ? "Month" : "All"}
              </Text>
            </TouchableOpacity>
          ))}
          {/* User filter */}
          <TouchableOpacity onPress={() => setUserPicker(true)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
              backgroundColor: filterUser ? "#0369A1" : colors.background,
              borderWidth: 1, borderColor: filterUser ? "#0369A1" : colors.border, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: filterUser ? "#FFF" : colors.text }}>
              👤 {selectedUserName ?? "All Users"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#0369A1" size="large" />
        </View>
      ) : (
        <>
          {tab === "orders"    && <OrdersTab    data={data}      colors={colors} expandedDay={expandedDay} setExpandedDay={setExpandedDay} expandedUser={expandedUser} setExpandedUser={setExpandedUser} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} />}
          {tab === "transfers" && <TransfersTab data={data}      colors={colors} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} />}
          {tab === "flow"      && <FlowTab      data={data}      colors={colors} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} />}
        </>
      )}

      {/* ── User picker modal ───────────────────────────────────────────── */}
      <Modal visible={userPicker} animationType="slide" transparent onRequestClose={() => setUserPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>Filter by User</Text>
              <TouchableOpacity onPress={() => setUserPicker(false)}><Text style={{ color: colors.mutedForeground, fontSize: 20 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity onPress={() => { setFilterUser(null); setUserPicker(false); }}
                style={{ padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: !filterUser ? "#EFF6FF" : colors.card, borderWidth: 1, borderColor: !filterUser ? "#0369A1" : colors.border }}>
                <Text style={{ fontFamily: "Inter_700Bold", color: !filterUser ? "#0369A1" : colors.text }}>👥 All Users</Text>
              </TouchableOpacity>
              {(data?.users ?? []).map(u => (
                <TouchableOpacity key={u.id} onPress={() => { setFilterUser(u.id); setUserPicker(false); }}
                  style={{ padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: filterUser === u.id ? "#EFF6FF" : colors.card, borderWidth: 1, borderColor: filterUser === u.id ? "#0369A1" : colors.border }}>
                  <Text style={{ fontFamily: "Inter_700Bold", color: filterUser === u.id ? "#0369A1" : colors.text }}>👤 {u.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Orders Tab ─────────────────────────────────────────────────────────── */
function OrdersTab({ data, colors, expandedDay, setExpandedDay, expandedUser, setExpandedUser, refreshing, onRefresh }: {
  data: Resp | null; colors: ReturnType<typeof useColors>;
  expandedDay: string | null; setExpandedDay: (d: string | null) => void;
  expandedUser: string | null; setExpandedUser: (k: string | null) => void;
  refreshing: boolean; onRefresh: () => void;
}) {
  if (!data?.orders.length) {
    return <EmptyState label="No orders in this period" colors={colors} refreshing={refreshing} onRefresh={onRefresh} />;
  }
  return (
    <FlatList
      data={data.orders}
      keyExtractor={d => d.date}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0369A1" />}
      renderItem={({ item: day }) => {
        const open = expandedDay === day.date;
        return (
          <View style={{ marginBottom: 12 }}>
            {/* Day header */}
            <TouchableOpacity onPress={() => setExpandedDay(open ? null : day.date)}
              style={{ backgroundColor: "#0369A1", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF" }}>{formatDate(day.date)}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                  {day.totalOrders} order{day.totalOrders !== 1 ? "s" : ""} · {day.byUser.length} user{day.byUser.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#A7F3D0" }}>{fmt(day.totalAmount)}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.65)" }}>{open ? "▲ hide" : "▼ show"}</Text>
              </View>
            </TouchableOpacity>

            {open && day.byUser.map(userGroup => {
              const userKey = `${day.date}|${userGroup.userId}`;
              const userOpen = expandedUser === userKey;
              return (
                <View key={userGroup.userId} style={{ marginTop: 4, marginLeft: 12 }}>
                  {/* User row */}
                  <TouchableOpacity onPress={() => setExpandedUser(userOpen ? null : userKey)}
                    style={{ backgroundColor: colors.card, borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: "#0369A1" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#0369A1" }}>{userGroup.userName[0]?.toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>{userGroup.userName}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{userGroup.orders} order{userGroup.orders !== 1 ? "s" : ""}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#059669" }}>{fmt(userGroup.amount)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>{userOpen ? "▲" : "▼"}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Individual orders */}
                  {userOpen && userGroup.sales.map(sale => (
                    <View key={sale.id}
                      style={{ backgroundColor: colors.background, marginTop: 2, marginLeft: 12, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }} numberOfLines={1}>
                          {PM_ICON[sale.paymentMethod] ?? "💰"} {sale.customerName}
                          {sale.locationName ? ` · ${sale.locationName}` : ""}
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>
                          #{sale.id} · {formatTime(sale.time)} · {sale.paymentMethod}
                          {sale.status !== "completed" ? ` · ${sale.status}` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#059669" }}>{fmt(sale.amountPaid)}</Text>
                        {sale.total !== sale.amountPaid && (
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>total {fmt(sale.total)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      }}
    />
  );
}

/* ─── Transfers Tab ──────────────────────────────────────────────────────── */
function TransfersTab({ data, colors, refreshing, onRefresh }: { data: Resp | null; colors: ReturnType<typeof useColors>; refreshing: boolean; onRefresh: () => void }) {
  if (!data?.transfers.length) {
    return <EmptyState label="No transfers in this period" colors={colors} refreshing={refreshing} onRefresh={onRefresh} />;
  }

  // Group by day
  const byDay = new Map<string, Transfer[]>();
  for (const t of data.transfers) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day)!.push(t);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => b.localeCompare(a));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0369A1" />}>
      {days.map(([date, transfers]) => {
        const dayTotal = transfers.reduce((s, t) => s + t.amount, 0);
        return (
          <View key={date} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>{formatDate(date)}</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#DC2626" }}>−{fmt(dayTotal)}</Text>
            </View>
            {transfers.map(t => (
              <View key={t.id} style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: "#DC2626" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }} numberOfLines={2}>🔄 {t.details}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 3 }}>
                      👤 {t.userName} · {formatTime(t.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#DC2626", marginLeft: 8 }}>{fmt(t.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ─── Flow Tab ───────────────────────────────────────────────────────────── */
function FlowTab({ data, colors, refreshing, onRefresh }: { data: Resp | null; colors: ReturnType<typeof useColors>; refreshing: boolean; onRefresh: () => void }) {
  if (!data?.flow.byDay.length) {
    return <EmptyState label="No data in this period" colors={colors} refreshing={refreshing} onRefresh={onRefresh} />;
  }
  const { totals } = data.flow;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0369A1" />}>

      {/* Period totals */}
      <View style={{ backgroundColor: "#1E1B4B", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, marginBottom: 12 }}>PERIOD SUMMARY</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SummaryBox label="Total IN" value={fmt(totals.totalIn)} color="#A7F3D0" darkBg />
          <SummaryBox label="Total OUT" value={fmt(totals.totalOut)} color="#FECACA" darkBg />
          <SummaryBox label="Net" value={fmt(totals.net)} color={totals.net >= 0 ? "#A7F3D0" : "#FECACA"} darkBg />
        </View>
        {/* IN/OUT bar */}
        {(totals.totalIn + totals.totalOut) > 0 && (() => {
          const inPct = (totals.totalIn / (totals.totalIn + totals.totalOut)) * 100;
          return (
            <View style={{ marginTop: 12 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden", flexDirection: "row" }}>
                <View style={{ width: `${inPct}%` as unknown as number, backgroundColor: "#10B981", borderRadius: 4 }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#A7F3D0" }}>IN {inPct.toFixed(0)}%</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#FECACA" }}>OUT {(100 - inPct).toFixed(0)}%</Text>
              </View>
            </View>
          );
        })()}
      </View>

      {/* Day-by-day */}
      {data.flow.byDay.map(day => (
        <View key={day.date} style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{formatDate(day.date)}</Text>
            <View style={{ backgroundColor: day.net >= 0 ? "#DCFCE7" : "#FEE2E2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: day.net >= 0 ? "#059669" : "#DC2626" }}>
                {day.net >= 0 ? "+" : ""}{fmt(day.net)}
              </Text>
            </View>
          </View>

          {/* IN section */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14 }}>↓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>Money IN — Sales</Text>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 4 }}>
                {day.totalIn > 0 && <View style={{ height: 4, borderRadius: 2, backgroundColor: "#10B981", width: "100%" as unknown as number }} />}
              </View>
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#059669" }}>{fmt(day.salesIn)}</Text>
          </View>

          {/* OUT section */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground, marginBottom: 2 }}>Money OUT</Text>
            {day.purchasesOut > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text }}>🛒 Purchases</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#DC2626" }}>−{fmt(day.purchasesOut)}</Text>
              </View>
            )}
            {day.expensesOut > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text }}>📋 Expenses</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#DC2626" }}>−{fmt(day.expensesOut)}</Text>
              </View>
            )}
            {day.transfersOut > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text }}>🔄 Transfers</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#DC2626" }}>−{fmt(day.transfersOut)}</Text>
              </View>
            )}
            {(day.purchasesOut + day.expensesOut + day.transfersOut) === 0 && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>No outflows</Text>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function HeroBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, alignItems: "center" }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color }}>{value}</Text>
    </View>
  );
}

function SummaryBox({ label, value, color, darkBg }: { label: string; value: string; color: string; darkBg?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, alignItems: "center" }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: darkBg ? "rgba(255,255,255,0.6)" : "#6B7280", marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color }}>{value}</Text>
    </View>
  );
}

function EmptyState({ label, colors, refreshing, onRefresh }: { label: string; colors: ReturnType<typeof useColors>; refreshing: boolean; onRefresh: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0369A1" />}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>{label}</Text>
    </ScrollView>
  );
}

function formatDate(d: string): string {
  const today = new Date();
  const f = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const todayStr = f(today);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  if (d === todayStr) return "Today";
  if (d === f(yest))  return "Yesterday";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const _StyleSheet = StyleSheet.create({});
export { _StyleSheet as styles };

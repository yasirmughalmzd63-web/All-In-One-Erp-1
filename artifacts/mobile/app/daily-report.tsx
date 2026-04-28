import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const EXCHANGE_RATE = 285;

type LocationData = {
  id: number; name: string; address?: string | null;
  bankPKR: number; stockPKR: number; totalPKR: number;
  bankUSD: number; stockUSD: number; totalUSD: number;
  stockUnits: number; productCount: number;
};
type UserDay = { salesCount: number; salesTotal: number; cashCollected: number; creditAmount: number };
type UserData = {
  id: number; name: string; username: string; role: string; locationId: number | null;
  today: UserDay; allTime: UserDay;
};
type Totals = {
  bankPKR: number; stockPKR: number; creditPKR: number; grandPKR: number;
  bankUSD: number; stockUSD: number; creditUSD: number; grandUSD: number;
  unlinkedBankPKR: number; unlinkedStockPKR: number; unlinkedStockUnits: number;
};
type Report = {
  generatedAt: string; date: string; exchangeRate: number;
  totals: Totals; locations: LocationData[]; users: UserData[];
};

type ViewMode = "today" | "alltime";
type Section  = "summary" | "locations" | "users";

function fmtPKR(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
}
function fmtUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DailyReportScreen() {
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const router  = useRouter();
  const { user } = useAuth();
  const topPad  = Platform.OS === "web" ? 20 : insets.top;

  const [report, setReport]       = useState<Report | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [viewMode, setViewMode]   = useState<ViewMode>("today");
  const [section, setSection]     = useState<Section>("summary");

  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true); else setLoading(true);
    try {
      const data = await customFetch<Report>("/api/reports/daily-snapshot");
      setReport(data);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LinearGradient colors={["#0F172A", "#1E293B"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Topup</Text>
        </LinearGradient>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      </View>
    );
  }

  if (!report) return null;
  const { totals, locations, users } = report;

  // Filter users by location if non-admin
  const visibleUsers = isAdmin ? users : users.filter(u => u.id === user?.id);

  const todaySales  = users.reduce((s, u) => s + u.today.salesTotal,    0);
  const todayCash   = users.reduce((s, u) => s + u.today.cashCollected, 0);
  const todayCredit = users.reduce((s, u) => s + u.today.creditAmount,  0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <LinearGradient colors={["#0F172A", "#1E293B"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Topup</Text>
            <Text style={styles.headerSub}>{fmtDate(report.date)}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => load(true)}>
            <Feather name="refresh-cw" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Generated at */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" }} />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            Auto-generated at {fmtTime(report.generatedAt)} · Rate: ₨1 = ${(1 / EXCHANGE_RATE).toFixed(4)}
          </Text>
        </View>

        {/* Grand Total hero */}
        <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginBottom: 16 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 0.6, marginBottom: 6 }}>GRAND TOTAL (Bank + Stock + Credit)</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF" }}>{fmtPKR(totals.grandPKR)}</Text>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#22C55E", marginTop: 4 }}>{fmtUSD(totals.grandUSD)} USD</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>at ₨{EXCHANGE_RATE} / $1 exchange rate</Text>
        </View>

        {/* 3-col breakdown */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: "BANK", pkr: totals.bankPKR,   usd: totals.bankUSD,   icon: "briefcase", color: "#60A5FA" },
            { label: "STOCK", pkr: totals.stockPKR,  usd: totals.stockUSD,  icon: "package",   color: "#34D399" },
            { label: "CREDIT", pkr: totals.creditPKR, usd: totals.creditUSD, icon: "clock",     color: "#F59E0B" },
          ].map(col => (
            <View key={col.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12, padding: 10, alignItems: "center", gap: 3 }}>
              <Feather name={col.icon as never} size={13} color={col.color} />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>{col.label}</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#FFF" }}>{fmtPKR(col.pkr)}</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: col.color }}>{fmtUSD(col.usd)}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── Section tabs ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: "row", backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {([
          { key: "summary",   label: "Summary",   icon: "bar-chart-2" },
          { key: "locations", label: "Apps",       icon: "map-pin"     },
          { key: "users",     label: "Users",      icon: "users"       },
        ] as { key: Section; label: string; icon: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: section === tab.key ? colors.primary : "transparent" }}
            onPress={() => setSection(tab.key)}
          >
            <Feather name={tab.icon as never} size={13} color={section === tab.key ? colors.primary : colors.mutedForeground} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: section === tab.key ? colors.primary : colors.mutedForeground }}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >

        {/* ── SUMMARY section ─────────────────────────────────────────────── */}
        {section === "summary" && (
          <>
            {/* Today's Sales */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TODAY'S SALES ACTIVITY</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 16 }}>
              {[
                { label: "Total Sales",    pkr: todaySales,  icon: "shopping-bag",   color: colors.primary },
                { label: "Cash Collected", pkr: todayCash,   icon: "check-circle",   color: colors.success },
                { label: "Credit Given",   pkr: todayCredit, icon: "clock",          color: "#D97706"      },
              ].map((row, i) => (
                <View key={row.label} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: row.color + "18", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={row.icon as never} size={14} color={row.color} />
                    </View>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text }}>{row.label}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: row.color }}>{fmtPKR(row.pkr)}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{fmtUSD(row.pkr / EXCHANGE_RATE)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Balance sheet in dollar */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BALANCE SHEET IN USD (₨{EXCHANGE_RATE} = $1)</Text>
            <View style={{ gap: 10, marginBottom: 16 }}>
              {[
                { label: "Bank Balance",      pkr: totals.bankPKR,   usd: totals.bankUSD,   icon: "briefcase", color: "#2563EB", bg: "#EFF6FF" },
                { label: "Stock Value",        pkr: totals.stockPKR,  usd: totals.stockUSD,  icon: "package",   color: "#059669", bg: "#ECFDF5" },
                { label: "Credit Receivable",  pkr: totals.creditPKR, usd: totals.creditUSD, icon: "clock",     color: "#D97706", bg: "#FFF7ED" },
              ].map(row => (
                <View key={row.label} style={{ backgroundColor: row.bg, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: row.color + "22", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={row.icon as never} size={18} color={row.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: row.color + "CC", letterSpacing: 0.3 }}>{row.label}</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: row.color, marginTop: 1 }}>{fmtPKR(row.pkr)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: row.color + "88" }}>IN DOLLAR</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: row.color }}>{fmtUSD(row.usd)}</Text>
                  </View>
                </View>
              ))}

              {/* Grand total tile */}
              <View style={{ backgroundColor: "#0F172A", borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="layers" size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 0.4 }}>GRAND TOTAL</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF", marginTop: 1 }}>{fmtPKR(totals.grandPKR)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>IN DOLLAR</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#22C55E" }}>{fmtUSD(totals.grandUSD)}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── LOCATIONS section ──────────────────────────────────────────── */}
        {section === "locations" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{locations.length} ACTIVE APP{locations.length !== 1 ? "S" : ""}</Text>
            {locations.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="map-pin" size={36} color={colors.mutedForeground} />
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 }}>No apps found</Text>
              </View>
            ) : (
              locations.map((loc, i) => (
                <View key={loc.id} style={[styles.locCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* App header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="map-pin" size={16} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{loc.name}</Text>
                      {loc.address && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>{loc.address}</Text>}
                    </View>
                    <View style={{ backgroundColor: "#EFF6FF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#2563EB" }}>#{i + 1}</Text>
                    </View>
                  </View>

                  {/* Stats rows */}
                  <View style={{ gap: 8 }}>
                    {[
                      { label: "Bank Balance", pkr: loc.bankPKR, usd: loc.bankUSD, icon: "briefcase", color: "#2563EB", bg: "#EFF6FF" },
                      { label: `Stock Value (${loc.stockUnits} units, ${loc.productCount} products)`, pkr: loc.stockPKR, usd: loc.stockUSD, icon: "package", color: "#059669", bg: "#ECFDF5" },
                    ].map(row => (
                      <View key={row.label} style={{ backgroundColor: row.bg, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Feather name={row.icon as never} size={14} color={row.color} />
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: row.color, flex: 1 }}>{row.label}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: row.color }}>{fmtPKR(row.pkr)}</Text>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: row.color + "99" }}>{fmtUSD(row.usd)}</Text>
                        </View>
                      </View>
                    ))}

                    {/* Total row */}
                    <View style={{ backgroundColor: "#0F172A", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="layers" size={14} color="#FFF" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF" }}>App Total</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFF" }}>{fmtPKR(loc.totalPKR)}</Text>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#22C55E" }}>{fmtUSD(loc.totalUSD)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Unlinked / no location */}
            {(totals.unlinkedBankPKR > 0 || totals.unlinkedStockPKR > 0) && (
              <View style={[styles.locCard, { backgroundColor: colors.card, borderColor: "#D97706" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="alert-circle" size={16} color="#D97706" />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>No App Assigned</Text>
                </View>
                {totals.unlinkedBankPKR > 0 && (
                  <View style={{ backgroundColor: "#FFF7ED", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#D97706" }}>Bank</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#D97706" }}>{fmtPKR(totals.unlinkedBankPKR)}</Text>
                  </View>
                )}
                {totals.unlinkedStockPKR > 0 && (
                  <View style={{ backgroundColor: "#FFF7ED", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#D97706" }}>
                      Stock ({totals.unlinkedStockUnits} units)
                    </Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#D97706" }}>{fmtPKR(totals.unlinkedStockPKR)}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* ── USERS section ──────────────────────────────────────────────── */}
        {section === "users" && (
          <>
            {/* Toggle today / all-time */}
            <View style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              {(["today", "alltime"] as ViewMode[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: viewMode === m ? colors.primary : "transparent", alignItems: "center" }}
                  onPress={() => setViewMode(m)}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: viewMode === m ? "#FFF" : colors.mutedForeground }}>
                    {m === "today" ? "Today" : "All Time"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{visibleUsers.length} USER{visibleUsers.length !== 1 ? "S" : ""} · {viewMode === "today" ? "TODAY" : "ALL TIME"}</Text>

            {visibleUsers.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="users" size={36} color={colors.mutedForeground} />
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 }}>No users found</Text>
              </View>
            ) : (
              visibleUsers.map(u => {
                const d = viewMode === "today" ? u.today : u.allTime;
                const roleColor = u.role === "admin" ? "#7C3AED" : u.role === "manager" ? "#0369A1" : "#2563EB";
                const roleBg    = u.role === "admin" ? "#F3E8FF" : u.role === "manager" ? "#E0F2FE" : "#EFF6FF";
                return (
                  <View key={u.id} style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* User header */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: roleBg, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: roleColor }}>{u.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{u.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>@{u.username}</Text>
                      </View>
                      <View style={{ backgroundColor: roleBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: roleColor }}>{u.role.toUpperCase()}</Text>
                      </View>
                    </View>

                    {/* Stats grid */}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        { label: "SALES", value: d.salesTotal, sub: `${d.salesCount} order${d.salesCount !== 1 ? "s" : ""}`, color: colors.primary,  bg: colors.secondary },
                        { label: "CASH",  value: d.cashCollected, sub: "collected",  color: colors.success, bg: colors.saleBg  },
                        { label: "CREDIT", value: d.creditAmount,  sub: "on credit",  color: "#D97706",      bg: "#FFF7ED"      },
                      ].map(cell => (
                        <View key={cell.label} style={{ flex: 1, backgroundColor: cell.bg, borderRadius: 10, padding: 10, alignItems: "center", gap: 2 }}>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: cell.color, letterSpacing: 0.5 }}>{cell.label}</Text>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: cell.color }}>{fmtPKR(cell.value)}</Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: cell.color + "99" }}>{fmtUSD(cell.value / EXCHANGE_RATE)}</Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: cell.color + "77" }}>{cell.sub}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" },
  headerSub:   { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  refreshBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  locCard:  { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  userCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  empty:    { alignItems: "center", paddingVertical: 50 },
});

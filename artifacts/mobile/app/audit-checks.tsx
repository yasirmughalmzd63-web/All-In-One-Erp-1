import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type SummaryRow = {
  id: number;
  name: string;
  app: string;
  short: number;
  shortValue: string;
  excess: number;
  excessValue: string;
  remarks: string;
};

type Resp = {
  generatedAt: string;
  scope: { isAdmin: boolean; locationId: number | null };
  summary: SummaryRow[];
  summaryCount: number;
  negativeStock: { count: number };
  zeroStock: { count: number };
  unpaidSales: {
    count: number;
    items: { id: number; invoiceNo: string; total: string; amountPaid: string; createdAt: string; pending: string }[];
  };
  receivables: { total: string; count: number };
  payables: { total: string; count: number };
  recentDeletions: {
    id: number; userId: number | null; action: string; entityType: string;
    entityId: number | null; details: string | null; createdAt: string;
  }[];
};

const fmt = (s: string) => {
  const n = parseFloat(s);
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
};

const fmtQty = (n: number) => n.toLocaleString();

export default function AuditChecksScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const resp = await customFetch<Resp>("/api/reports/audit-checks");
      if (resp) setData(resp);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const styles = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const allClear = !!data && (data.summaryCount ?? 0) === 0 && (data.unpaidSales?.count ?? 0) === 0;

  const totalShort = data?.summary?.reduce((s, r) => s + r.short, 0) ?? 0;
  const totalShortValue = data?.summary?.reduce((s, r) => s + parseFloat(r.shortValue), 0) ?? 0;
  const totalExcess = data?.summary?.reduce((s, r) => s + r.excess, 0) ?? 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#DC2626", "#991B1B"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Audit & Control</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.iconBtn}>
            <Feather name="refresh-cw" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{data ? new Date(data.generatedAt).toLocaleString() : "—"}</Text>
        <View style={styles.heroBox}>
          <Feather name={allClear ? "check-circle" : "alert-triangle"} size={20} color="#FFFFFF" />
          <Text style={styles.heroValue}>{allClear ? "All clear" : "Issues detected"}</Text>
        </View>
      </LinearGradient>

      {loading && !refreshing ? (
        <View style={styles.loader}><ActivityIndicator color={colors.tint} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(false); }}
              tintColor={colors.tint}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          {data && (<>
            {/* Quick stat strip */}
            <View style={styles.statRow}>
              <Stat icon="alert-triangle" label="Items Short" value={String(data.negativeStock.count)} color="#DC2626" colors={colors} />
              <Stat icon="package"        label="Out of Stock"   value={String(data.zeroStock.count)}     color="#F59E0B" colors={colors} />
            </View>
            <View style={styles.statRow}>
              <Stat icon="clock"          label="Unpaid Sales"   value={String(data.unpaidSales.count)} color="#7C3AED" colors={colors} />
              <Stat icon="trash-2"        label="Recent Deletes" value={String(data.recentDeletions.length)} color="#475569" colors={colors} />
            </View>

            {/* ─── Complete Summary Table ───────────────────────────── */}
            <View style={[styles.tableCard, { backgroundColor: colors.card }]}>
              <View style={styles.tableHeader}>
                <Feather name="clipboard" size={16} color={colors.text} />
                <Text style={[styles.tableTitle, { color: colors.text }]}>Complete Summary</Text>
                <View style={[styles.countPill, { backgroundColor: "#DC262615" }]}>
                  <Text style={{ color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 11 }}>
                    {data.summaryCount}
                  </Text>
                </View>
              </View>

              {data.summary.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Feather name="check-circle" size={32} color="#10B981" />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    No shortages or excess detected
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    {/* Column headers */}
                    <View style={[styles.tRow, styles.tHeadRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.tCellId, styles.tHead, { color: colors.mutedForeground }]}>ID</Text>
                      <Text style={[styles.tCellName, styles.tHead, { color: colors.mutedForeground }]}>Name</Text>
                      <Text style={[styles.tCellApp, styles.tHead, { color: colors.mutedForeground }]}>App</Text>
                      <Text style={[styles.tCellNum, styles.tHead, { color: colors.mutedForeground }]}>Short</Text>
                      <Text style={[styles.tCellNum, styles.tHead, { color: colors.mutedForeground }]}>Excess</Text>
                      <Text style={[styles.tCellRemarks, styles.tHead, { color: colors.mutedForeground }]}>Remarks</Text>
                    </View>
                    {/* Body rows */}
                    {data.summary.map((row, idx) => (
                      <View
                        key={`${row.id}-${idx}`}
                        style={[
                          styles.tRow,
                          { borderBottomColor: colors.border, backgroundColor: idx % 2 === 0 ? "transparent" : colors.background },
                        ]}
                      >
                        <Text style={[styles.tCellId, { color: colors.mutedForeground }]}>#{row.id}</Text>
                        <Text style={[styles.tCellName, { color: colors.text }]} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={[styles.tCellApp, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {row.app}
                        </Text>
                        <View style={styles.tCellNum}>
                          {row.short > 0 ? (
                            <>
                              <Text style={{ color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 13 }}>
                                {fmtQty(row.short)}
                              </Text>
                              <Text style={{ color: "#DC2626", fontSize: 10, opacity: 0.8 }}>
                                {fmt(row.shortValue)}
                              </Text>
                            </>
                          ) : (
                            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
                          )}
                        </View>
                        <View style={styles.tCellNum}>
                          {row.excess > 0 ? (
                            <>
                              <Text style={{ color: "#059669", fontFamily: "Inter_700Bold", fontSize: 13 }}>
                                {fmtQty(row.excess)}
                              </Text>
                              <Text style={{ color: "#059669", fontSize: 10, opacity: 0.8 }}>
                                {fmt(row.excessValue)}
                              </Text>
                            </>
                          ) : (
                            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
                          )}
                        </View>
                        <Text style={[styles.tCellRemarks, { color: colors.text }]} numberOfLines={2}>
                          {row.remarks}
                        </Text>
                      </View>
                    ))}
                    {/* Totals row */}
                    <View style={[styles.tRow, styles.tFootRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                      <Text style={[styles.tCellId, styles.tFoot, { color: colors.text }]}>Σ</Text>
                      <Text style={[styles.tCellName, styles.tFoot, { color: colors.text }]}>
                        Totals ({data.summary.length})
                      </Text>
                      <Text style={[styles.tCellApp, styles.tFoot, { color: colors.mutedForeground }]}>—</Text>
                      <View style={styles.tCellNum}>
                        <Text style={{ color: "#DC2626", fontFamily: "Inter_800ExtraBold", fontSize: 13 }}>
                          {fmtQty(totalShort)}
                        </Text>
                        <Text style={{ color: "#DC2626", fontSize: 10 }}>
                          {fmt(totalShortValue.toFixed(2))}
                        </Text>
                      </View>
                      <View style={styles.tCellNum}>
                        <Text style={{ color: "#059669", fontFamily: "Inter_800ExtraBold", fontSize: 13 }}>
                          {fmtQty(totalExcess)}
                        </Text>
                      </View>
                      <Text style={[styles.tCellRemarks, styles.tFoot, { color: colors.mutedForeground, fontSize: 11 }]}>
                        Grand totals
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              )}
            </View>

            {/* ─── Outstanding balances ───────────────────────────── */}
            <Section title="Outstanding Balances" colors={colors}>
              <BalRow label="Receivables (money owed to us)" value={fmt(data.receivables.total)} sub={`${data.receivables.count} customers`} colors={colors} positive />
              <BalRow label="Payables (money we owe)"        value={fmt(data.payables.total)}    sub={`${data.payables.count} suppliers`} colors={colors} negative />
            </Section>

            {/* ─── Unpaid sales ───────────────────────────── */}
            {data.unpaidSales.count > 0 && (
              <Section title={`Unpaid Sales (${data.unpaidSales.count})`} colors={colors} severity="warn">
                {data.unpaidSales.items.slice(0, 20).map(s => (
                  <View key={s.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>{s.invoiceNo}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: "#7C3AED", fontWeight: "700" }}>{fmt(s.pending)}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>of {fmt(s.total)}</Text>
                    </View>
                  </View>
                ))}
              </Section>
            )}

            {/* ─── Recent deletions ───────────────────────────── */}
            {data.recentDeletions.length > 0 && (
              <Section title="Recent Deletions" colors={colors}>
                {data.recentDeletions.map(d => (
                  <View key={d.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>
                        {d.action} · {d.entityType}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                        User #{d.userId ?? "?"} · {new Date(d.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </Section>
            )}
          </>)}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ icon, label, value, color, colors }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[ms(colors).statBox, { backgroundColor: colors.card }]}>
      <View style={[ms(colors).statIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      </View>
    </View>
  );
}

function Section({ title, children, colors, severity }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors>; severity?: "danger" | "warn" }) {
  const accent = severity === "danger" ? "#DC2626" : severity === "warn" ? "#F59E0B" : colors.text;
  return (
    <View style={[ms(colors).card, { backgroundColor: colors.card }]}>
      <Text style={{ color: accent, fontSize: 13, fontWeight: "800", marginBottom: 8, letterSpacing: 0.5 }}>{title}</Text>
      {children}
    </View>
  );
}

function BalRow({ label, value, sub, positive, negative, colors }: { label: string; value: string; sub?: string; positive?: boolean; negative?: boolean; colors: ReturnType<typeof useColors> }) {
  const c = positive ? "#059669" : negative ? "#DC2626" : colors.text;
  return (
    <View style={{ flexDirection: "row", paddingVertical: 8, alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{label}</Text>
        {sub && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{sub}</Text>}
      </View>
      <Text style={{ color: c, fontSize: 16, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

const ms = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  statBox: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    title: { color: "#fff", fontSize: 18, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, textAlign: "center", marginBottom: 12 },
    heroBox: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
    heroValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    listRow: { flexDirection: "row", paddingVertical: 8, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Summary table
    tableCard: {
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      paddingBottom: 4,
    },
    tableTitle: {
      flex: 1,
      fontFamily: "Inter_700Bold",
      fontSize: 14,
    },
    countPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      minWidth: 28,
      alignItems: "center",
    },
    tRow: {
      flexDirection: "row",
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tHeadRow: {
      borderBottomWidth: 1,
      paddingBottom: 8,
    },
    tFootRow: {
      borderTopWidth: 1,
      borderBottomWidth: 0,
      paddingTop: 10,
      paddingBottom: 6,
    },
    tHead: {
      fontFamily: "Inter_700Bold",
      fontSize: 10.5,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    tFoot: {
      fontFamily: "Inter_700Bold",
      fontSize: 12,
    },
    tCellId:      { width: 50,  fontFamily: "Inter_500Medium", fontSize: 12 },
    tCellName:    { width: 140, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    tCellApp:     { width: 100, fontFamily: "Inter_500Medium", fontSize: 12 },
    tCellNum:     { width: 80, alignItems: "flex-end", paddingRight: 6 },
    tCellRemarks: { width: 200, fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 14, paddingLeft: 6 },

    emptyBox: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 30,
      gap: 10,
    },
    emptyText: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
    },
  });
}

import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, RefreshControl, ScrollView,
  Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Wallet = {
  id: number;
  name: string;
  type: string;
  currency: string;
  balance: string;
};

type Tx = {
  id: number;
  entryType: string;
  amountUsd: string;
  rate: string;
  totalPkr: string;
  partyName: string | null;
  partyType: string | null;
  partyId: number | null;
  walletId: number | null;
  productId: number | null;
  notes: string | null;
  date: string;
  createdAt: string;
  paymentProofUrl: string | null;
  proofVerifiedAt: string | null;
};

type ByEntryType = {
  entryType: string;
  label: string;
  direction: "in" | "out" | "neutral";
  count: number;
  totalUsd: string;
  totalPkr: string;
};

type Monthly = {
  month: string;
  in: number;
  out: number;
  inPkr: number;
  outPkr: number;
  count: number;
};

type SummaryResponse = {
  wallet: Wallet;
  summary: {
    currentBalance: string;
    totalIn: string;
    totalOut: string;
    totalInPkr: string;
    totalOutPkr: string;
    netUsd: string;
    txCount: number;
  };
  byEntryType: ByEntryType[];
  monthly: Monthly[];
  transactions: Tx[];
};

const IN_TYPES = new Set(["received", "purchase", "transfer_in"]);
const OUT_TYPES = new Set(["product", "topup", "transfer_out"]);

export default function WalletDetailScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const idRaw = Array.isArray(params.id) ? params.id[0] : params.id;
  const walletId = idRaw ? parseInt(idRaw, 10) : NaN;

  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isNaN(walletId)) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await customFetch<SummaryResponse>(`/api/dollar-wallet/wallets/${walletId}/summary`);
      setData(result);
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, [walletId]);

  useEffect(() => { load(); }, [load]);

  const wallet = data?.wallet;
  const summary = data?.summary;

  const filteredTxs = (data?.transactions ?? []).filter(t => {
    if (filter === "in") return IN_TYPES.has(t.entryType);
    if (filter === "out") return OUT_TYPES.has(t.entryType);
    return true;
  });

  const inCount = (data?.transactions ?? []).filter(t => IN_TYPES.has(t.entryType)).length;
  const outCount = (data?.transactions ?? []).filter(t => OUT_TYPES.has(t.entryType)).length;

  if (isNaN(walletId)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, marginBottom: 12 }}>Invalid wallet</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: "#FFF", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient colors={["#0369A1", "#0891B2"]} style={{ paddingTop: topPad + 8, paddingBottom: 18, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, marginLeft: -6 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }}>{"‹"}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" }} numberOfLines={1}>
              {wallet?.name ?? "Wallet"}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginTop: 2 }}>
              {wallet ? `${wallet.type} wallet · ${wallet.currency}` : "Loading…"}
            </Text>
          </View>
          {wallet && (
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#4ADE80" }}>
              ${parseFloat(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          )}
        </View>

        {summary && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: "rgba(74,222,128,0.2)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(74,222,128,0.4)" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TOTAL IN</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#4ADE80" }}>${parseFloat(summary.totalIn).toFixed(2)}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                ₨{parseFloat(summary.totalInPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "rgba(248,113,113,0.2)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.4)" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TOTAL OUT</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#F87171" }}>${parseFloat(summary.totalOut).toFixed(2)}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                ₨{parseFloat(summary.totalOutPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>TXN COUNT</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFF" }}>{summary.txCount}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>transactions</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, marginTop: 12 }}>
            Loading wallet…
          </Text>
        </View>
      ) : !data ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground, marginTop: 8 }}>
            Could not load this wallet
          </Text>
          <TouchableOpacity onPress={() => load(true)} style={{ marginTop: 14, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}>
            <Text style={{ color: "#FFF", fontFamily: "Inter_600SemiBold" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {/* Filter tabs */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
            {([
              { key: "all", label: "All", count: summary?.txCount ?? 0 },
              { key: "in",  label: "Money In",  count: inCount },
              { key: "out", label: "Money Out", count: outCount },
            ] as const).map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setFilter(tab.key)}
                style={{
                  flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center",
                  backgroundColor: filter === tab.key ? colors.primary : colors.input,
                  borderColor: filter === tab.key ? colors.primary : colors.border,
                }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: filter === tab.key ? "#FFF" : colors.mutedForeground }}>{tab.label}</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: filter === tab.key ? "#FFF" : colors.text }}>{tab.count}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Breakdown by entry type */}
          {data.byEntryType.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>
                Breakdown by Type
              </Text>
              {data.byEntryType.map(b => {
                const isIn = b.direction === "in";
                const isOut = b.direction === "out";
                return (
                  <View key={b.entryType} style={{
                    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                    padding: 12, marginBottom: 8,
                    borderLeftWidth: 4, borderLeftColor: isIn ? "#16A34A" : isOut ? "#DC2626" : colors.primary,
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>{b.label}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                        {b.count} {b.count === 1 ? "transaction" : "transactions"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: isIn ? "#16A34A" : isOut ? "#DC2626" : colors.text }}>
                        {isIn ? "+" : isOut ? "-" : ""}${parseFloat(b.totalUsd).toFixed(2)}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>
                        ₨{parseFloat(b.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Monthly breakdown */}
          {data.monthly.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>
                Monthly Breakdown
              </Text>
              {data.monthly.map(m => (
                <View key={m.month} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>
                      {new Date(m.month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.mutedForeground }}>{m.count} txns</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: "#DCFCE7", borderRadius: 8, padding: 8 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#16A34A", letterSpacing: 0.5 }}>IN</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#15803D" }}>${m.in.toFixed(2)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#166534" }}>
                        ₨{m.inPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, padding: 8 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#DC2626", letterSpacing: 0.5 }}>OUT</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#B91C1C" }}>${m.out.toFixed(2)}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#991B1B" }}>
                        ₨{m.outPkr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: colors.input, borderRadius: 8, padding: 8 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.mutedForeground, letterSpacing: 0.5 }}>NET</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: m.in - m.out >= 0 ? colors.success : colors.danger }}>
                        {m.in - m.out >= 0 ? "+" : ""}{(m.in - m.out).toFixed(2)}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>USD</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Transaction history */}
          <View style={{ marginHorizontal: 16 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>
              Transaction History
            </Text>
            {filteredTxs.map(t => {
              const isIn = IN_TYPES.has(t.entryType);
              const isOut = OUT_TYPES.has(t.entryType);
              const label = data.byEntryType.find(b => b.entryType === t.entryType)?.label ?? t.entryType;
              return (
                <View key={t.id} style={{
                  backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                  padding: 14, marginBottom: 10,
                  borderLeftWidth: 4, borderLeftColor: isIn ? "#16A34A" : isOut ? "#DC2626" : colors.primary,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: isIn ? "#DCFCE7" : isOut ? "#FEE2E2" : colors.input }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: isIn ? "#15803D" : isOut ? "#B91C1C" : colors.text }}>
                            {isIn ? "IN" : isOut ? "OUT" : label}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground }}>{t.date}</Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{label}</Text>
                      {t.partyName ? (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>{t.partyName}</Text>
                      ) : null}
                      {t.notes ? (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.mutedForeground, fontStyle: "italic" }} numberOfLines={2}>{t.notes}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: isIn ? "#16A34A" : isOut ? "#DC2626" : colors.text }}>
                        {isIn ? "+" : isOut ? "-" : ""}{parseFloat(t.amountUsd).toFixed(2)} USD
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                        ₨{parseFloat(t.totalPkr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.mutedForeground }}>
                        @{parseFloat(t.rate).toFixed(0)}/USD
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {filteredTxs.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.mutedForeground, marginTop: 8 }}>
                  No {filter === "all" ? "" : filter === "in" ? "inflow" : "outflow"} transactions yet
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

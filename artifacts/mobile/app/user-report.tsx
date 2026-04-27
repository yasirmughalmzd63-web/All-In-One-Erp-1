import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type UserReport = {
  userId: number; name: string; username: string; role: string;
  totalSales: number; cashCollected: number; creditPending: number; outstanding: number;
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function UserReportScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [data, setData] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const rows = await customFetch<UserReport[]>("/api/sales/user-report");
      setData(rows);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  React.useEffect(() => { load(); }, []);

  const totals = data.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.totalSales,
    cashCollected: acc.cashCollected + r.cashCollected,
    creditPending: acc.creditPending + r.creditPending,
    outstanding: acc.outstanding + r.outstanding,
  }), { totalSales: 0, cashCollected: 0, creditPending: 0, outstanding: 0 });

  const renderItem = ({ item }: { item: UserReport }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: item.role === "admin" ? "#EFF6FF" : "#F3E8FF" }]}>
          <Text style={[styles.avatarText, { color: item.role === "admin" ? colors.primary : "#7C3AED" }]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.userSub, { color: colors.mutedForeground }]}>
            @{item.username} • {item.role.toUpperCase()}
          </Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: item.role === "admin" ? "#EFF6FF" : "#F3E8FF" }]}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: item.role === "admin" ? colors.primary : "#7C3AED" }}>
            {item.role.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={[styles.statsGrid, { borderTopColor: colors.border }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOTAL SALES</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{fmt(item.totalSales)}</Text>
        </View>
        <View style={[styles.statCell, { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>CASH COLLECTED</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{fmt(item.cashCollected)}</Text>
        </View>
        <View style={[styles.statCell, { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>CREDIT PENDING</Text>
          <Text style={[styles.statValue, { color: item.creditPending > 0 ? colors.danger : colors.mutedForeground }]}>
            {fmt(item.creditPending)}
          </Text>
        </View>
        <View style={[styles.statCell, { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>OUTSTANDING</Text>
          <Text style={[styles.statValue, { color: item.outstanding > 0 ? "#D97706" : colors.success }]}>
            {fmt(item.outstanding)}
          </Text>
        </View>
      </View>

      {item.outstanding > 0 && (
        <View style={[styles.alertRow, { backgroundColor: "#FEF3C7" }]}>
          <Feather name="alert-circle" size={12} color="#D97706" />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#D97706" }}>
            {fmt(item.outstanding)} uncollected from this user
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#475569", "#334155"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>User Report</Text>
          <Text style={styles.headerSub}>Stock issued · Cash collected · Balances</Text>
        </View>
      </LinearGradient>

      {/* Summary totals */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "TOTAL SALES", value: totals.totalSales, color: colors.text },
          { label: "CASH IN", value: totals.cashCollected, color: colors.success },
          { label: "CREDIT", value: totals.creditPending, color: colors.danger },
          { label: "OUTSTANDING", value: totals.outstanding, color: "#D97706" },
        ].map((cell, i) => (
          <View key={cell.label} style={[styles.summaryCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{cell.label}</Text>
            <Text style={[styles.statValue, { color: cell.color }]}>{fmt(cell.value)}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={r => String(r.userId)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 60 }}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 12 }}>No user data yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  summaryRow: { flexDirection: "row", borderBottomWidth: 1 },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  userName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  userSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statsGrid: { flexDirection: "row", borderTopWidth: 1 },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 14 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
});

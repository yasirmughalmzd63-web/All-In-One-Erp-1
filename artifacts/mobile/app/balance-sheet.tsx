import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Account = { id: number; name: string; type: string; balance: string; currency: string; locationId: number | null };
type BSResp = {
  asOfDate: string;
  scope: { isAdmin: boolean; locationId: number | null };
  assets: { cash: string; bank: string; mobileWallet: string; otherAccounts: string; inventory: string; inventoryAtPrice: string; inventoryUnits: number; receivables: string; receivablesCount: number; total: string };
  liabilities: { payables: string; payablesCount: number; loans: string; total: string };
  equity: { ownerCapitalAndProfit: string; total: string };
  accounts: Account[];
};
type Location = { id: number; name: string };

const fmt = (s: string) => {
  const n = parseFloat(s);
  if (Math.abs(n) >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toFixed(2)}`;
};

export default function BalanceSheetScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [data, setData] = useState<BSResp | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locId) params.set("locationId", String(locId));
      const r = await customFetch(`/api/reports/balance-sheet?${params.toString()}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [locId]);

  useEffect(() => {
    if (isAdmin) {
      customFetch("/api/locations").then((r: Response) => r.ok ? r.json() : []).then((arr: Location[]) => setLocations(Array.isArray(arr) ? arr : []));
    }
  }, [isAdmin]);
  useEffect(() => { void load(true); }, [load]);

  const styles = makeStyles(colors);
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const selectedLocName = locId ? locations.find(l => l.id === locId)?.name : "All apps";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#1E40AF", "#1E3A8A"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}></TouchableOpacity>
          <Text style={styles.title}>Balance Sheet</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.iconBtn}></TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>As of {data ? new Date(data.asOfDate).toLocaleString() : "—"} • {selectedLocName}</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Total Assets</Text><Text style={styles.heroValue}>{data ? fmt(data.assets.total) : "—"}</Text></View>
          <View style={styles.heroBox}><Text style={styles.heroLabel}>Equity</Text><Text style={styles.heroValue}>{data ? fmt(data.equity.total) : "—"}</Text></View>
        </View>
      </LinearGradient>

      {isAdmin && (
        <TouchableOpacity style={styles.locBtn} onPress={() => setPickerOpen(true)}>
          
          <Text style={[styles.locText, { color: colors.text }]}>App: {selectedLocName}</Text>
          
        </TouchableOpacity>
      )}

      {loading && !refreshing ? (
        <View style={styles.loader}><ActivityIndicator color={colors.tint} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.tint} />} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {data && (<>
            <Section title="ASSETS" colors={colors}>
              <Row label="Cash in Hand"  value={fmt(data.assets.cash)}        colors={colors} />
              <Row label="Bank"          value={fmt(data.assets.bank)}        colors={colors} />
              <Row label="Mobile Wallet" value={fmt(data.assets.mobileWallet)} colors={colors} />
              <Row label="Other Accounts" value={fmt(data.assets.otherAccounts)} colors={colors} />
              <Row label="Inventory (cost)" value={fmt(data.assets.inventory)} sub={`${data.assets.inventoryUnits.toLocaleString()} units`} colors={colors} />
              <Row label="Receivables"   value={fmt(data.assets.receivables)} sub={`${data.assets.receivablesCount} entries`} colors={colors} />
              <View style={styles.divider} />
              <Row label="TOTAL ASSETS"  value={fmt(data.assets.total)} bold colors={colors} />
            </Section>

            <Section title="LIABILITIES" colors={colors}>
              <Row label="Accounts Payable" value={fmt(data.liabilities.payables)} sub={`${data.liabilities.payablesCount} entries`} colors={colors} />
              <Row label="Loans"            value={fmt(data.liabilities.loans)} colors={colors} />
              <View style={styles.divider} />
              <Row label="TOTAL LIABILITIES" value={fmt(data.liabilities.total)} bold colors={colors} />
            </Section>

            <Section title="EQUITY" colors={colors}>
              <Row label="Owner Capital + Retained Profit" value={fmt(data.equity.ownerCapitalAndProfit)} colors={colors} />
              <View style={styles.divider} />
              <Row label="TOTAL EQUITY" value={fmt(data.equity.total)} bold colors={colors} />
            </Section>

            <View style={[styles.balanceCheckBox, { backgroundColor: colors.card }]}>
              <Text style={[styles.balanceCheckLabel, { color: colors.mutedForeground }]}>Liabilities + Equity</Text>
              <Text style={[styles.balanceCheckValue, { color: colors.text }]}>{fmt(String(parseFloat(data.liabilities.total) + parseFloat(data.equity.total)))}</Text>
              <Text style={[styles.balanceCheckLabel, { color: colors.mutedForeground, marginTop: 4 }]}>= Total Assets</Text>
            </View>

            {data.accounts.length > 0 && (
              <Section title="ACCOUNTS BREAKDOWN" colors={colors}>
                {data.accounts.map(a => (
                  <View key={a.id} style={styles.accRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{a.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{a.type} · {a.currency.toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{fmt(a.balance)}</Text>
                  </View>
                ))}
              </Section>
            )}
          </>)}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filter by App</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={styles.modalItem} onPress={() => { setLocId(null); setPickerOpen(false); }}>
                <Text style={[styles.modalText, { color: colors.text }]}>All apps</Text>
                {null}
              </TouchableOpacity>
              {locations.map(l => (
                <TouchableOpacity key={l.id} style={styles.modalItem} onPress={() => { setLocId(l.id); setPickerOpen(false); }}>
                  <Text style={[styles.modalText, { color: colors.text }]}>{l.name}</Text>
                  {null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[ms(colors).card, { backgroundColor: colors.card }]}>
      <Text style={[ms(colors).sectionH, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, value, sub, bold, colors }: { label: string; value: string; sub?: string; bold?: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 8, alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: bold ? "800" : "500", fontSize: 14 }}>{label}</Text>
        {sub && <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>{sub}</Text>}
      </View>
      <Text style={{ color: colors.text, fontWeight: bold ? "800" : "600", fontSize: bold ? 16 : 14 }}>{value}</Text>
    </View>
  );
}
const ms = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  sectionH: { fontSize: 13, fontWeight: "800", marginBottom: 6, letterSpacing: 0.6 },
});

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    title: { color: "#fff", fontSize: 18, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, textAlign: "center", marginBottom: 14 },
    heroRow: { flexDirection: "row", gap: 10 },
    heroBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12, alignItems: "center" },
    heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginBottom: 4 },
    heroValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
    locBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
    locText: { fontSize: 13, fontWeight: "600" },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },
    accRow: { flexDirection: "row", paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
    balanceCheckBox: { borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    balanceCheckLabel: { fontSize: 12 },
    balanceCheckValue: { fontSize: 22, fontWeight: "900", marginTop: 2 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
    modal: { borderRadius: 16, padding: 16, maxHeight: 480 },
    modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
    modalItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
    modalText: { fontSize: 15 },
  });
}

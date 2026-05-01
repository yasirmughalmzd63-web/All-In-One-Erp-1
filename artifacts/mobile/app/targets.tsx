import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

type TargetType  = "daily" | "weekly" | "monthly";
type TargetScope = "user" | "app";
type TargetStatus = "active" | "achieved" | "missed" | "done";
type CommType = "flat" | "percentage";

interface Target {
  id: number;
  title: string;
  type: TargetType;
  scope: TargetScope;
  employeeId: number | null;
  userId: number | null;
  targetAmount: string;
  commissionType: CommType;
  commissionValue: string;
  startDate: string;
  endDate: string;
  status: TargetStatus;
  achievedAmount: string;
  bonusId: number | null;
  locationId: number | null;
  notes: string | null;
  isChallenge: boolean;
  verifiedAt: string | null;
  verifiedBy: number | null;
  createdAt: string;
}

// Bigger bonus on Challenge targets — keep in sync with server CHALLENGE_MULTIPLIER
const CHALLENGE_MULTIPLIER = 1.5;

interface Employee {
  id: number;
  name: string;
  status: string;
}

interface User {
  id: number;
  name: string;
  username: string;
  role: string;
}

const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const NOW = new Date();
const todayStr = () => NOW.toISOString().slice(0, 10);
const nextWeekStr = () => {
  const d = new Date(NOW); d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
};
// Last day of the month for the supplied YYYY-MM-DD anchor (defaults to today)
const monthEndStr = (anchor?: string) => {
  const a = anchor ? new Date(`${anchor}T00:00:00Z`) : new Date(NOW);
  const end = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
};
const monthStartStr = (anchor?: string) => {
  const a = anchor ? new Date(`${anchor}T00:00:00Z`) : new Date(NOW);
  const start = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
};

const STATUS_COLOR: Record<TargetStatus, string> = {
  active: "#2563EB",
  achieved: "#059669",
  missed: "#DC2626",
  done: "#7C3AED",
};
const STATUS_ICON: Record<TargetStatus, string> = {
  active: "clock",
  achieved: "check-circle",
  missed: "x-circle",
  done: "award",
};
const STATUS_LABEL: Record<TargetStatus, string> = {
  active: "Active",
  achieved: "Achieved!",
  missed: "Missed",
  done: "Done ✓",
};

const blankForm = () => ({
  title: "",
  type: "daily" as TargetType,
  scope: "app" as TargetScope,
  employeeId: null as number | null,
  userId: null as number | null,
  targetAmount: "",
  commissionType: "flat" as CommType,
  commissionValue: "",
  startDate: todayStr(),
  endDate: todayStr(),
  notes: "",
  isChallenge: false,
});

export default function TargetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const colors = useColors();

  const [targets, setTargets] = useState<Target[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [applying, setApplying] = useState<number | null>(null);

  const [filterType, setFilterType]   = useState<TargetType | "all">("all");
  const [filterScope, setFilterScope] = useState<TargetScope | "all">("all");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Target | null>(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, e, u] = await Promise.all([
        fetch(getApiUrl("/api/targets"), { headers }).then(r => r.json()),
        fetch(getApiUrl("/api/hrm/employees"), { headers }).then(r => r.json()),
        fetch(getApiUrl("/api/users"), { headers }).then(r => r.json()),
      ]);
      setTargets(Array.isArray(t) ? t : []);
      setEmployees(Array.isArray(e) ? e.filter((x: Employee) => x.status === "active") : []);
      setUsers(Array.isArray(u) ? u : []);
    } catch (_) {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let list = targets;
    if (filterType  !== "all") list = list.filter(t => t.type  === filterType);
    if (filterScope !== "all") list = list.filter(t => t.scope === filterScope);
    return list;
  }, [targets, filterType, filterScope]);

  const empMap = useMemo(() => {
    const m: Record<number, string> = {};
    employees.forEach(e => { m[e.id] = e.name; });
    return m;
  }, [employees]);

  const userMap = useMemo(() => {
    const m: Record<number, string> = {};
    users.forEach(u => { m[u.id] = u.name || u.username; });
    return m;
  }, [users]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(blankForm());
    setShowModal(true);
  };

  const openEdit = (t: Target) => {
    setEditTarget(t);
    setForm({
      title: t.title,
      type: t.type,
      scope: t.scope,
      employeeId: t.employeeId,
      userId: t.userId,
      targetAmount: t.targetAmount,
      commissionType: t.commissionType,
      commissionValue: t.commissionValue,
      startDate: t.startDate,
      endDate: t.endDate,
      notes: t.notes ?? "",
      isChallenge: t.isChallenge ?? false,
    });
    setShowModal(true);
  };

  const saveTarget = async () => {
    if (!form.title.trim()) { Alert.alert("Error", "Title is required"); return; }
    if (!form.targetAmount) { Alert.alert("Error", "Target amount is required"); return; }
    setSaving(true);
    try {
      const body = { ...form, notes: form.notes || null };
      const url = editTarget
        ? getApiUrl(`/api/targets/${editTarget.id}`)
        : getApiUrl("/api/targets");
      const r = await fetch(url, { method: editTarget ? "PATCH" : "POST", headers, body: JSON.stringify(body) });
      if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
      setShowModal(false);
      fetchAll();
    } finally { setSaving(false); }
  };

  const deleteTarget = (t: Target) => {
    Alert.alert("Delete Target", `Delete "${t.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(getApiUrl(`/api/targets/${t.id}`), { method: "DELETE", headers });
        fetchAll();
      }},
    ]);
  };

  const checkProgress = async (t: Target) => {
    setChecking(t.id);
    try {
      const r = await fetch(getApiUrl(`/api/targets/${t.id}/check`), { method: "POST", headers });
      const data = await r.json();
      fetchAll();
      const achieved = parseFloat(data.achievedAmount ?? t.achievedAmount);
      const pct = Math.min(100, Math.round((achieved / parseFloat(t.targetAmount)) * 100));

      if (data.achieved && data.pendingVerify) {
        // Goal hit, awaiting admin verification before bonus is released.
        Alert.alert(
          "🎉 Target Achieved!",
          `Sales: ${PKR(achieved)}\nTarget: ${PKR(parseFloat(t.targetAmount))}\nProgress: ${pct}%\n\n⏳ Awaiting admin verification — tap "Verify & Pay" to release the bonus into HRM/payroll.`,
        );
      } else if (data.status === "done") {
        Alert.alert(
          "Target Verified ✓",
          `Bonus already paid for "${t.title}".`,
        );
      } else {
        Alert.alert(
          "Progress Updated",
          `Sales so far: ${PKR(achieved)}\nTarget: ${PKR(parseFloat(t.targetAmount))}\nProgress: ${pct}%\nStatus: ${data.status}`,
        );
      }
    } catch (_) { Alert.alert("Error", "Could not check progress"); }
    setChecking(null);
  };

  // Admin verification gate: explicitly releases the bonus into HRM/payroll.
  // Server applies the 1.5× multiplier for Challenge targets automatically.
  const verifyTarget = async (t: Target) => {
    if (!t.employeeId) {
      Alert.alert("No Employee", "Link an employee to this target to verify.");
      return;
    }
    const empId: number = t.employeeId;
    const baseAmt = t.commissionType === "percentage"
      ? (parseFloat(t.achievedAmount) * parseFloat(t.commissionValue)) / 100
      : parseFloat(t.commissionValue);
    const finalAmt = t.isChallenge ? baseAmt * CHALLENGE_MULTIPLIER : baseAmt;
    const breakdown = t.isChallenge
      ? `${PKR(baseAmt)} × ${CHALLENGE_MULTIPLIER}× challenge boost = ${PKR(finalAmt)}`
      : `${PKR(finalAmt)}`;

    Alert.alert(
      "Verify & Pay Bonus",
      `Release ${breakdown} bonus to ${empMap[empId] ?? "employee"} for target "${t.title}"?\n\nThis adds the bonus to HRM and the next payroll cycle.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Verify & Pay", onPress: async () => {
          setApplying(t.id);
          try {
            const r = await fetch(getApiUrl(`/api/targets/${t.id}/verify`), { method: "POST", headers });
            if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
            fetchAll();
            Alert.alert("Done!", `${PKR(finalAmt)} bonus added for ${empMap[empId] ?? "employee"}. It will appear on the next monthly payroll.`);
          } catch (_) { Alert.alert("Error", "Failed to verify"); }
          setApplying(null);
        }},
      ],
    );
  };

  const progressPct = (t: Target) =>
    Math.min(1, parseFloat(t.achievedAmount) / Math.max(parseFloat(t.targetAmount), 1));

  const commissionDisplay = (t: Target) => {
    if (t.commissionType === "percentage") return `${t.commissionValue}% commission`;
    return `${PKR(parseFloat(t.commissionValue))} flat bonus`;
  };

  const s = styles(colors);

  const renderItem = ({ item: t }: { item: Target }) => {
    const pct = progressPct(t);
    const pctNum = Math.round(pct * 100);
    const statusColor = STATUS_COLOR[t.status];
    const isAchieved = t.status === "achieved";
    const isDone     = t.status === "done";

    return (
      <View style={s.card}>
        <View style={[s.cardAccent, { backgroundColor: statusColor }]} />
        <View style={{ flex: 1 }}>
          {/* Title row */}
          <View style={s.cardRow}>
            <Text style={s.cardTitle} numberOfLines={1}>{t.title}</Text>
            <View style={[s.badge, { backgroundColor: statusColor + "20" }]}>
              <Feather name={STATUS_ICON[t.status] as any} size={11} color={statusColor} style={{ marginRight: 3 }} />
              <Text style={[s.badgeTxt, { color: statusColor }]}>{STATUS_LABEL[t.status]}</Text>
            </View>
          </View>

          {/* Meta */}
          <View style={s.metaRow}>
            <View style={[s.chip2, { backgroundColor: colors.primary + "15" }]}>
              <Text style={[s.chip2Txt, { color: colors.primary }]}>
                {t.type === "daily" ? "Daily" : t.type === "weekly" ? "Weekly" : "Monthly"}
              </Text>
            </View>
            <View style={[s.chip2, { backgroundColor: "#8B5CF6" + "15" }]}>
              <Text style={[s.chip2Txt, { color: "#8B5CF6" }]}>
                {t.scope === "app" ? "App Wise" : "User Wise"}
              </Text>
            </View>
            {t.isChallenge && (
              <View style={[s.chip2, { backgroundColor: "#F59E0B" + "20", flexDirection: "row", alignItems: "center", gap: 3 }]}>
                <Feather name="zap" size={11} color="#D97706" />
                <Text style={[s.chip2Txt, { color: "#D97706" }]}>Challenge {CHALLENGE_MULTIPLIER}×</Text>
              </View>
            )}
            <Text style={s.cardSub}>{t.startDate} → {t.endDate}</Text>
          </View>

          {/* Target + achieved */}
          <View style={s.amtRow}>
            <View>
              <Text style={s.amtLabel}>Target</Text>
              <Text style={s.amtValue}>{PKR(parseFloat(t.targetAmount))}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={[s.pctTxt, { color: statusColor }]}>{pctNum}%</Text>
              <Text style={s.amtLabel}>achieved</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.amtLabel}>Sales</Text>
              <Text style={[s.amtValue, { color: pct >= 1 ? "#059669" : colors.text }]}>
                {PKR(parseFloat(t.achievedAmount))}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={s.barBg}>
            <View style={[s.barFill, { width: `${Math.min(100, pctNum)}%` as any, backgroundColor: statusColor }]} />
          </View>

          {/* Commission info */}
          <View style={s.commRow}>
            <Feather name="award" size={12} color="#7C3AED" />
            <Text style={s.commTxt}>{commissionDisplay(t)}</Text>
            {t.employeeId && (
              <Text style={[s.commTxt, { color: colors.primary }]}>
                → {empMap[t.employeeId] ?? `Emp #${t.employeeId}`}
              </Text>
            )}
            {t.scope === "user" && t.userId && (
              <Text style={[s.commTxt, { color: colors.textSecondary }]}>
                User: {userMap[t.userId] ?? `#${t.userId}`}
              </Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={s.actionsRow}>
            {/* Check progress */}
            {(t.status === "active" || t.status === "achieved") && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}
                onPress={() => checkProgress(t)}
                disabled={checking === t.id}
              >
                {checking === t.id
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Feather name="refresh-cw" size={13} color={colors.primary} />
                }
                <Text style={[s.actionBtnTxt, { color: colors.primary }]}>
                  {checking === t.id ? "Checking…" : "Check Progress"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Verify & Pay (admin gate — releases bonus into HRM/payroll) */}
            {isAchieved && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#059669" + "15", borderColor: "#059669" + "40" }]}
                onPress={() => verifyTarget(t)}
                disabled={applying === t.id}
              >
                {applying === t.id
                  ? <ActivityIndicator size="small" color="#059669" />
                  : <Feather name="check-circle" size={13} color="#059669" />
                }
                <Text style={[s.actionBtnTxt, { color: "#059669" }]}>
                  {applying === t.id ? "Verifying…" : "Verify & Pay"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Done tick */}
            {isDone && (
              <View style={[s.actionBtn, { backgroundColor: "#7C3AED" + "15", borderColor: "#7C3AED" + "40" }]}>
                <Feather name="check-circle" size={13} color="#7C3AED" />
                <Text style={[s.actionBtnTxt, { color: "#7C3AED" }]}>
                  Bonus Released ✓
                </Text>
              </View>
            )}

            {/* Edit */}
            {t.status !== "done" && (
              <TouchableOpacity style={s.iconBtn} onPress={() => openEdit(t)}>
                <Feather name="edit-2" size={15} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.iconBtn} onPress={() => deleteTarget(t)}>
              <Feather name="trash-2" size={15} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Sales Targets</Text>
          <Text style={s.headerSub}>Track & reward performance</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      <View style={s.filterBar}>
        {/* Type filter */}
        <View style={s.filterSection}>
          <Text style={s.filterLabel}>Period</Text>
          <View style={s.segRow}>
            {(["all", "daily", "weekly", "monthly"] as const).map(v => (
              <TouchableOpacity key={v} style={[s.seg, filterType === v && s.segActive]} onPress={() => setFilterType(v)}>
                <Text style={[s.segTxt, filterType === v && s.segTxtActive]}>
                  {v === "all" ? "All" : v === "daily" ? "Daily" : v === "weekly" ? "Weekly" : "Monthly"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* Scope filter */}
        <View style={s.filterSection}>
          <Text style={s.filterLabel}>View</Text>
          <View style={s.segRow}>
            {(["all", "app", "user"] as const).map(v => (
              <TouchableOpacity key={v} style={[s.seg, filterScope === v && s.segActive]} onPress={() => setFilterScope(v)}>
                <Text style={[s.segTxt, filterScope === v && s.segTxtActive]}>
                  {v === "all" ? "All" : v === "app" ? "App Wise" : "User Wise"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Summary bar */}
      <View style={s.summaryBar}>
        {(["active","achieved","missed","done"] as TargetStatus[]).map(st => {
          const cnt = targets.filter(t => t.status === st).length;
          return (
            <View key={st} style={s.summaryCell}>
              <Text style={[s.summaryCnt, { color: STATUS_COLOR[st] }]}>{cnt}</Text>
              <Text style={s.summaryLbl}>{STATUS_LABEL[st]}</Text>
            </View>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={s.empty}>{loading ? "Loading targets…" : "No targets yet. Tap + to create one."}</Text>
        }
        renderItem={renderItem}
      />

      {/* ─── Create / Edit Modal ─── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{editTarget ? "Edit Target" : "New Target"}</Text>
            <ScrollView style={{ maxHeight: 520 }}>

              {/* Title */}
              <Text style={s.fieldLabel}>Title *</Text>
              <TextInput style={s.fieldInput} value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))}
                placeholder="e.g. Daily Sales Goal" placeholderTextColor={colors.textSecondary} />

              {/* Type */}
              <Text style={s.fieldLabel}>Period</Text>
              <View style={s.segRow}>
                {(["daily","weekly","monthly"] as TargetType[]).map(v => (
                  <TouchableOpacity key={v} style={[s.seg, form.type === v && s.segActive]} onPress={() => {
                    // Auto-fill the date window to match the chosen period
                    const start = v === "monthly" ? monthStartStr(form.startDate) : form.startDate || todayStr();
                    const end =
                      v === "daily"   ? start :
                      v === "weekly"  ? nextWeekStr() :
                                        monthEndStr(start);
                    setForm(p => ({ ...p, type: v, startDate: start, endDate: end }));
                  }}>
                    <Text style={[s.segTxt, form.type === v && s.segTxtActive]}>
                      {v === "daily" ? "Daily" : v === "weekly" ? "Weekly" : "Monthly"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Scope */}
              <Text style={s.fieldLabel}>Scope</Text>
              <View style={s.segRow}>
                {(["app","user"] as TargetScope[]).map(v => (
                  <TouchableOpacity key={v} style={[s.seg, form.scope === v && s.segActive]} onPress={() => setForm(p => ({ ...p, scope: v }))}>
                    <Text style={[s.segTxt, form.scope === v && s.segTxtActive]}>
                      {v === "app" ? "App Wise" : "User Wise"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Employee (for commission) */}
              <Text style={s.fieldLabel}>Employee (for commission)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <TouchableOpacity style={[s.pill, form.employeeId === null && s.pillActive]} onPress={() => setForm(p => ({ ...p, employeeId: null }))}>
                  <Text style={[s.pillTxt, form.employeeId === null && s.pillTxtActive]}>None</Text>
                </TouchableOpacity>
                {employees.map(e => (
                  <TouchableOpacity key={e.id} style={[s.pill, form.employeeId === e.id && s.pillActive]} onPress={() => setForm(p => ({ ...p, employeeId: e.id }))}>
                    <Text style={[s.pillTxt, form.employeeId === e.id && s.pillTxtActive]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* User (for user-wise scope) */}
              {form.scope === "user" && (
                <>
                  <Text style={s.fieldLabel}>Salesperson (User)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <TouchableOpacity style={[s.pill, form.userId === null && s.pillActive]} onPress={() => setForm(p => ({ ...p, userId: null }))}>
                      <Text style={[s.pillTxt, form.userId === null && s.pillTxtActive]}>Any</Text>
                    </TouchableOpacity>
                    {users.map(u => (
                      <TouchableOpacity key={u.id} style={[s.pill, form.userId === u.id && s.pillActive]} onPress={() => setForm(p => ({ ...p, userId: u.id }))}>
                        <Text style={[s.pillTxt, form.userId === u.id && s.pillTxtActive]}>{u.name || u.username}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Target Amount */}
              <Text style={s.fieldLabel}>Target Amount (₨) *</Text>
              <TextInput style={s.fieldInput} value={form.targetAmount} keyboardType="numeric"
                onChangeText={v => setForm(p => ({ ...p, targetAmount: v }))}
                placeholder="e.g. 50000" placeholderTextColor={colors.textSecondary} />

              {/* Commission */}
              <Text style={s.fieldLabel}>Commission Type</Text>
              <View style={s.segRow}>
                {(["flat","percentage"] as CommType[]).map(v => (
                  <TouchableOpacity key={v} style={[s.seg, form.commissionType === v && s.segActive]} onPress={() => setForm(p => ({ ...p, commissionType: v }))}>
                    <Text style={[s.segTxt, form.commissionType === v && s.segTxtActive]}>
                      {v === "flat" ? "Flat Amount" : "Percentage %"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={s.fieldInput} value={form.commissionValue} keyboardType="numeric"
                onChangeText={v => setForm(p => ({ ...p, commissionValue: v }))}
                placeholder={form.commissionType === "percentage" ? "e.g. 5 (= 5%)" : "e.g. 2000 (₨)"}
                placeholderTextColor={colors.textSecondary} />

              {/* Challenge toggle — bigger bonus on stretch goals */}
              <Text style={s.fieldLabel}>Challenge Target</Text>
              <TouchableOpacity
                onPress={() => setForm(p => ({ ...p, isChallenge: !p.isChallenge }))}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  borderWidth: 1, borderColor: form.isChallenge ? "#F59E0B" : colors.border,
                  borderRadius: 10, padding: 12, backgroundColor: form.isChallenge ? "#FEF3C7" : colors.background,
                }}
              >
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name="zap" size={18} color={form.isChallenge ? "#D97706" : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: form.isChallenge ? "#D97706" : colors.text }}>
                      {form.isChallenge ? `Challenge — ${CHALLENGE_MULTIPLIER}× bonus on success` : "Mark as Challenge / Stretch Goal"}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                      Harder goal · pays {CHALLENGE_MULTIPLIER}× the regular commission when verified
                    </Text>
                  </View>
                </View>
                <View style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  backgroundColor: form.isChallenge ? "#D97706" : colors.border,
                  alignItems: form.isChallenge ? "flex-end" : "flex-start",
                }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
                </View>
              </TouchableOpacity>

              {/* Dates */}
              <Text style={s.fieldLabel}>Start Date (YYYY-MM-DD)</Text>
              <TextInput style={s.fieldInput} value={form.startDate}
                onChangeText={v => setForm(p => ({ ...p, startDate: v }))} placeholderTextColor={colors.textSecondary} />
              <Text style={s.fieldLabel}>End Date (YYYY-MM-DD)</Text>
              <TextInput style={s.fieldInput} value={form.endDate}
                onChangeText={v => setForm(p => ({ ...p, endDate: v }))} placeholderTextColor={colors.textSecondary} />

              {/* Notes */}
              <Text style={s.fieldLabel}>Notes</Text>
              <TextInput style={[s.fieldInput, { height: 72, textAlignVertical: "top" }]}
                value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline placeholder="Optional notes…" placeholderTextColor={colors.textSecondary} />

            </ScrollView>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={saveTarget} disabled={saving}>
                <Text style={s.confirmTxt}>{saving ? "Saving…" : editTarget ? "Update" : "Create"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { backgroundColor: c.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)" },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  filterBar: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  filterSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: c.textSecondary, width: 44 },

  summaryBar: { flexDirection: "row", backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 10 },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryCnt: { fontFamily: "Inter_700Bold", fontSize: 20 },
  summaryLbl: { fontFamily: "Inter_400Regular", fontSize: 10, color: c.textSecondary, textAlign: "center" },

  card: { flexDirection: "row", backgroundColor: c.card, borderRadius: 14, marginTop: 12, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  cardAccent: { width: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingTop: 12, paddingHorizontal: 12 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: c.text, flex: 1, marginRight: 8 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: c.textSecondary },
  badge: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, marginBottom: 10, flexWrap: "wrap" },
  chip2: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chip2Txt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  amtRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  amtLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: c.textSecondary },
  amtValue: { fontFamily: "Inter_700Bold", fontSize: 15, color: c.text },
  pctTxt: { fontFamily: "Inter_700Bold", fontSize: 22 },

  barBg: { height: 8, backgroundColor: c.border, marginHorizontal: 12, borderRadius: 4, marginBottom: 10, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },

  commRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, marginBottom: 10, flexWrap: "wrap" },
  commTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#7C3AED" },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 12, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  actionBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },

  segRow: { flexDirection: "row", gap: 4 },
  seg: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
  segActive: { backgroundColor: c.primary, borderColor: c.primary },
  segTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.textSecondary },
  segTxtActive: { color: "#fff" },

  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, marginRight: 6 },
  pillActive: { backgroundColor: c.primary, borderColor: c.primary },
  pillTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.textSecondary },
  pillTxtActive: { color: "#fff" },

  empty: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14, color: c.textSecondary, marginTop: 48 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: c.text, marginBottom: 16 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: c.background, alignItems: "center", borderWidth: 1, borderColor: c.border },
  cancelTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.textSecondary },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: c.primary, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.textSecondary, marginBottom: 4, marginTop: 12 },
  fieldInput: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: c.text, backgroundColor: c.background },
});

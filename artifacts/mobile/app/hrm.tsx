import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable,
  RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, isAdminOrAbove } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

type Tab = "employees" | "attendance" | "payroll" | "fines" | "report" | "leaves";
type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "holiday";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveType  = "annual" | "sick" | "casual" | "unpaid" | "emergency";
type PayrollStatus = "pending" | "paid";
type EmpStatus = "active" | "inactive";

interface Employee {
  id: number; name: string; phone?: string; email?: string;
  position?: string; department?: string; baseSalary: string;
  joinDate?: string; status: EmpStatus; paymentMethod?: string;
  locationId?: number; createdAt: string;
}
interface Location { id: number; name: string; }
interface Attendance {
  id: number; employeeId: number; date: string;
  status: AttendanceStatus; checkIn?: string; checkOut?: string;
  notes?: string; createdAt: string;
}
interface Fine {
  id: number; employeeId: number; amount: string;
  reason: string; date: string; payrollId?: number; createdAt: string;
}
interface Bonus {
  id: number; employeeId: number; amount: string;
  reason: string; date: string; payrollId?: number; createdAt: string;
}
interface Payroll {
  id: number; employeeId: number; month: number; year: number;
  baseSalary: string; workingDays: number; presentDays: number; halfDays: number;
  overtimeHours: string; overtimeRate: string;
  grossSalary: string; bonusTotal: string; fineTotal: string;
  deductions: string; netSalary: string; status: PayrollStatus;
  paidAt?: string; notes?: string; createdAt: string;
}
interface LeaveRequest {
  id: number; employeeId: number; leaveType: LeaveType;
  startDate: string; endDate: string; totalDays: string;
  reason?: string | null; status: LeaveStatus;
  reviewedBy?: number | null; reviewNotes?: string | null;
  submittedBy: number; locationId?: number | null;
  createdAt: string;
}

interface HrmReport {
  summary: {
    totalEmployees: number; totalSalaryPaid: number; totalSalaryDue: number;
    totalFines: number; totalBonuses: number;
    presentCount: number; absentCount: number; lateCount: number;
  };
  employees: Employee[];
  payroll: Payroll[];
  fines: Fine[];
  bonuses: Bonus[];
}

const PKR = (n: number) =>
  "₨" + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const NOW = new Date();
const DEPARTMENTS = ["Sales","Operations","Finance","HR","IT","Management","Marketing","Customer Service","Logistics","Production","Admin"];
const POSITIONS = ["Director","Manager","Senior Manager","Supervisor","Team Lead","Senior Executive","Executive","Officer","Coordinator","Assistant","Intern"];
const PAYMENT_METHODS = ["Cash","Bank Transfer","Cheque","Online/Mobile"];

const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "casual", "unpaid", "emergency"];
const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: "Annual Leave", sick: "Sick Leave", casual: "Casual Leave",
  unpaid: "Unpaid Leave", emergency: "Emergency Leave",
};
const LEAVE_TYPE_COLOR: Record<LeaveType, string> = {
  annual: "#2563EB", sick: "#DC2626", casual: "#059669",
  unpaid: "#6B7280", emergency: "#D97706",
};
const LEAVE_STATUS_COLOR: Record<LeaveStatus, { bg: string; text: string }> = {
  pending:   { bg: "#FFF7ED", text: "#92400E" },
  approved:  { bg: "#ECFDF5", text: "#065F46" },
  rejected:  { bg: "#FEF2F2", text: "#991B1B" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ALL_MONTHS = MONTHS.map((m, i) => ({ label: m, value: i + 1 }));
const ATT_STATUS: AttendanceStatus[] = ["present","absent","late","half_day","holiday"];
const ATT_COLOR: Record<AttendanceStatus, string> = {
  present: "#059669", absent: "#DC2626", late: "#D97706",
  half_day: "#0891B2", holiday: "#7C3AED",
};
const ATT_LABEL: Record<AttendanceStatus, string> = {
  present: "Present", absent: "Absent", late: "Late",
  half_day: "Half Day", holiday: "Holiday",
};

export default function HrmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const colors = useColors();
  const isAdmin = isAdminOrAbove(user);

  const [activeTab, setActiveTab] = useState<Tab>("employees");

  // — Employees
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [empFilter, setEmpFilter] = useState<"all" | "active" | "inactive">("active");
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ name: "", phone: "", email: "", position: "", department: "", baseSalary: "", joinDate: "", status: "active" as EmpStatus, paymentMethod: "", locationId: null as number | null });
  const [locations, setLocations] = useState<Location[]>([]);

  // — Attendance
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attEmployee, setAttEmployee] = useState<number | null>(null);
  const [attDate, setAttDate] = useState(NOW.toISOString().slice(0, 10));
  const [showAttModal, setShowAttModal] = useState(false);
  const [attForm, setAttForm] = useState({ employeeId: 0, date: NOW.toISOString().slice(0, 10), status: "present" as AttendanceStatus, checkIn: "", checkOut: "", notes: "" });

  // — Fines & Bonuses
  const [fines, setFines] = useState<Fine[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbEmployee, setFbEmployee] = useState<number | null>(null);
  const [showFbModal, setShowFbModal] = useState(false);
  const [fbMode, setFbMode] = useState<"fine" | "bonus">("fine");
  const [fbForm, setFbForm] = useState({ amount: "", reason: "", date: NOW.toISOString().slice(0, 10) });

  // — Payroll
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payEmployee, setPayEmployee] = useState<number | null>(null);
  const [payMonth, setPayMonth] = useState(NOW.getMonth() + 1);
  const [payYear, setPayYear] = useState(NOW.getFullYear());
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ employeeId: 0, month: NOW.getMonth() + 1, year: NOW.getFullYear(), workingDays: "26", overtimeHours: "0", overtimeRate: "0", notes: "" });
  const [generating, setGenerating] = useState(false);

  // — Leaves
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leaveEmpFilter, setLeaveEmpFilter] = useState<number | null>(null);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<LeaveStatus | "all">("all");
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employeeId: 0, leaveType: "annual" as LeaveType,
    startDate: NOW.toISOString().slice(0, 10),
    endDate: NOW.toISOString().slice(0, 10),
    totalDays: "1", reason: "",
  });
  const [reviewModal, setReviewModal] = useState<LeaveRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // — Targets achievement badges (pending = achieved-but-not-yet-verified)
  const [pendingAchievements, setPendingAchievements] = useState<Record<number, number>>({});

  // — Verified-Sale tier badges per employee (lifetime)
  type Tier = "none" | "bronze" | "silver" | "gold" | "platinum";
  type EmployeeBadge = {
    verifiedCount: number;
    pendingCount: number;
    challengeCount: number;
    totalBonusEarned: number;
    tier: Tier;
  };
  const [empBadges, setEmpBadges] = useState<Record<number, EmployeeBadge>>({});

  // Visual tier metadata — matches the server thresholds (1/5/15/30 verified targets)
  const TIER_META: Record<Tier, { label: string; color: string; bg: string; icon: "award" | "star" }> = {
    none:     { label: "—",        color: "#6B7280", bg: "#F3F4F6", icon: "award" },
    bronze:   { label: "Bronze",   color: "#B45309", bg: "#FEF3C7", icon: "award" },
    silver:   { label: "Silver",   color: "#475569", bg: "#E2E8F0", icon: "award" },
    gold:     { label: "Gold",     color: "#CA8A04", bg: "#FEF9C3", icon: "star"  },
    platinum: { label: "Platinum", color: "#7C3AED", bg: "#EDE9FE", icon: "star"  },
  };

  // — Sales Performance report (per-period)
  type SalesPerf = {
    period: "daily" | "weekly" | "monthly";
    startDate: string;
    endDate: string;
    totals: { salesCount: number; salesTotal: number; targetsAchieved: number; targetsMissed: number; targetsActive: number; pendingVerify: number };
    byUser: { userId: number; name: string; username: string; salesCount: number; salesTotal: number }[];
    byApp:  { locationId: number; name: string; salesCount: number; salesTotal: number }[];
  };
  const [salesPerf, setSalesPerf] = useState<SalesPerf | null>(null);
  const [salesPerfLoading, setSalesPerfLoading] = useState(false);
  const [salesPerfPeriod, setSalesPerfPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [salesPerfDate, setSalesPerfDate] = useState<string>(NOW.toISOString().slice(0, 10));

  // — Report
  const [report, setReport] = useState<HrmReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(NOW.getMonth() + 1);
  const [reportYear, setReportYear] = useState(NOW.getFullYear());
  const [reportView, setReportView] = useState<"app" | "employee" | "performance" | "sales">("app");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  /* ─── Fetch helpers ─── */
  const fetchEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      const r = await fetch(getApiUrl("/api/hrm/employees"), { headers });
      if (r.ok) setEmployees(await r.json());
    } finally { setEmpLoading(false); }
  }, [token]);

  const fetchAttendance = useCallback(async () => {
    setAttLoading(true);
    try {
      const params = new URLSearchParams();
      if (attEmployee) params.set("employeeId", String(attEmployee));
      if (attDate) params.set("date", attDate);
      const r = await fetch(getApiUrl(`/api/hrm/attendance?${params}`), { headers });
      if (r.ok) setAttendance(await r.json());
    } finally { setAttLoading(false); }
  }, [token, attEmployee, attDate]);

  const fetchFinesAndBonuses = useCallback(async () => {
    setFbLoading(true);
    try {
      const params = fbEmployee ? `?employeeId=${fbEmployee}` : "";
      const [fr, br] = await Promise.all([
        fetch(getApiUrl(`/api/hrm/fines${params}`), { headers }),
        fetch(getApiUrl(`/api/hrm/bonuses${params}`), { headers }),
      ]);
      if (fr.ok) setFines(await fr.json());
      if (br.ok) setBonuses(await br.json());
    } finally { setFbLoading(false); }
  }, [token, fbEmployee]);

  const fetchPayroll = useCallback(async () => {
    setPayLoading(true);
    try {
      const params = new URLSearchParams();
      if (payEmployee) params.set("employeeId", String(payEmployee));
      params.set("month", String(payMonth));
      params.set("year", String(payYear));
      const r = await fetch(getApiUrl(`/api/hrm/payroll?${params}`), { headers });
      if (r.ok) setPayroll(await r.json());
    } finally { setPayLoading(false); }
  }, [token, payEmployee, payMonth, payYear]);

  const fetchLeaves = useCallback(async () => {
    setLeavesLoading(true);
    try {
      const params = new URLSearchParams();
      if (leaveEmpFilter) params.set("employeeId", String(leaveEmpFilter));
      if (leaveStatusFilter !== "all") params.set("status", leaveStatusFilter);
      const r = await fetch(getApiUrl(`/api/hrm/leave?${params}`), { headers });
      if (r.ok) setLeaves(await r.json());
    } finally { setLeavesLoading(false); }
  }, [token, leaveEmpFilter, leaveStatusFilter]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const r = await fetch(getApiUrl(`/api/hrm/report?month=${reportMonth}&year=${reportYear}`), { headers });
      if (r.ok) setReport(await r.json());
    } finally { setReportLoading(false); }
  }, [token, reportMonth, reportYear]);

  const fetchPendingAchievements = useCallback(async () => {
    try {
      const r = await fetch(getApiUrl("/api/targets/pending-achievements"), { headers });
      if (r.ok) setPendingAchievements(await r.json());
    } catch (_) {}
  }, [token]);

  const fetchEmployeeBadges = useCallback(async () => {
    try {
      const r = await fetch(getApiUrl("/api/hrm/employee-badges"), { headers });
      if (r.ok) setEmpBadges(await r.json());
    } catch (_) {}
  }, [token]);

  const fetchSalesPerformance = useCallback(async () => {
    setSalesPerfLoading(true);
    try {
      const r = await fetch(
        getApiUrl(`/api/hrm/sales-performance?period=${salesPerfPeriod}&date=${salesPerfDate}`),
        { headers },
      );
      if (r.ok) setSalesPerf(await r.json());
    } finally { setSalesPerfLoading(false); }
  }, [token, salesPerfPeriod, salesPerfDate]);

  useEffect(() => {
    fetchEmployees();
    fetchPendingAchievements();
    fetchEmployeeBadges();
    fetch(getApiUrl("/api/locations"), { headers }).then(r => r.ok ? r.json() : []).then(setLocations).catch(() => {});
  }, [fetchEmployees, fetchPendingAchievements, fetchEmployeeBadges]);
  useEffect(() => { if (activeTab === "attendance") fetchAttendance(); }, [activeTab, fetchAttendance]);
  useEffect(() => { if (activeTab === "payroll") { fetchPayroll(); fetchFinesAndBonuses(); } }, [activeTab, fetchPayroll, fetchFinesAndBonuses]);
  useEffect(() => { if (activeTab === "fines")    fetchFinesAndBonuses(); }, [activeTab, fetchFinesAndBonuses]);
  useEffect(() => { if (activeTab === "report") fetchReport(); }, [activeTab, fetchReport]);
  useEffect(() => { if (activeTab === "leaves") fetchLeaves(); }, [activeTab, fetchLeaves]);
  // Sales Performance loads when the user opens the report tab AND switches to the sales sub-view
  // (or when they change the period/date filters while on it).
  useEffect(() => {
    if (activeTab === "report" && reportView === "sales") fetchSalesPerformance();
  }, [activeTab, reportView, fetchSalesPerformance]);

  /* ─── Employees CRUD ─── */
  const openEmpModal = (emp?: Employee) => {
    if (emp) {
      setEditingEmp(emp);
      setEmpForm({ name: emp.name, phone: emp.phone ?? "", email: emp.email ?? "", position: emp.position ?? "", department: emp.department ?? "", baseSalary: emp.baseSalary, joinDate: emp.joinDate ?? "", status: emp.status, paymentMethod: emp.paymentMethod ?? "", locationId: emp.locationId ?? null });
    } else {
      setEditingEmp(null);
      setEmpForm({ name: "", phone: "", email: "", position: "", department: "", baseSalary: "", joinDate: "", status: "active", paymentMethod: "", locationId: null });
    }
    setShowEmpModal(true);
  };

  const saveEmployee = async () => {
    if (!empForm.name.trim()) { Alert.alert("Error", "Name is required"); return; }
    const method = editingEmp ? "PATCH" : "POST";
    const url = editingEmp ? getApiUrl(`/api/hrm/employees/${editingEmp.id}`) : getApiUrl("/api/hrm/employees");
    const r = await fetch(url, { method, headers, body: JSON.stringify(empForm) });
    if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
    setShowEmpModal(false);
    fetchEmployees();
  };

  const deleteEmployee = (emp: Employee) => {
    Alert.alert("Delete Employee", `Delete "${emp.name}"? All attendance, fines, bonuses and payroll for this employee will also be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(getApiUrl(`/api/hrm/employees/${emp.id}`), { method: "DELETE", headers });
        fetchEmployees();
      }},
    ]);
  };

  /* ─── Attendance ─── */
  const markAttendance = async () => {
    if (!attForm.employeeId) { Alert.alert("Select employee"); return; }
    const r = await fetch(getApiUrl("/api/hrm/attendance"), { method: "POST", headers, body: JSON.stringify(attForm) });
    if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
    setShowAttModal(false);
    fetchAttendance();
  };

  /* ─── Fines & Bonuses ─── */
  const saveFineOrBonus = async () => {
    if (!fbEmployee) { Alert.alert("Select an employee first"); return; }
    if (!fbForm.amount || !fbForm.reason) { Alert.alert("Fill all fields"); return; }
    const url = getApiUrl(fbMode === "fine" ? "/api/hrm/fines" : "/api/hrm/bonuses");
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...fbForm, employeeId: fbEmployee }) });
    if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
    setShowFbModal(false);
    fetchFinesAndBonuses();
  };

  const deleteFine = (id: number) => {
    Alert.alert("Delete Fine", "Remove this fine?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(getApiUrl(`/api/hrm/fines/${id}`), { method: "DELETE", headers });
        fetchFinesAndBonuses();
      }},
    ]);
  };
  const deleteBonus = (id: number) => {
    Alert.alert("Delete Bonus", "Remove this bonus?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(getApiUrl(`/api/hrm/bonuses/${id}`), { method: "DELETE", headers });
        fetchFinesAndBonuses();
      }},
    ]);
  };

  /* ─── Payroll ─── */
  const openPayModal = () => {
    setPayForm({ employeeId: payEmployee ?? 0, month: payMonth, year: payYear, workingDays: "26", overtimeHours: "0", overtimeRate: "0", notes: "" });
    setShowPayModal(true);
  };

  const generatePayroll = async () => {
    if (!payForm.employeeId) { Alert.alert("Select employee"); return; }
    setGenerating(true);
    try {
      const r = await fetch(getApiUrl("/api/hrm/payroll/generate"), {
        method: "POST", headers, body: JSON.stringify({ ...payForm, workingDays: parseInt(payForm.workingDays), month: payForm.month, year: payForm.year }),
      });
      if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
      const data = await r.json();
      setShowPayModal(false);
      fetchPayroll();
      Alert.alert("Payroll Generated", `Net Salary: ${PKR(parseFloat(data.netSalary))}`);
    } finally { setGenerating(false); }
  };

  const markPayrollPaid = (p: Payroll) => {
    const emp = employees.find(e => e.id === p.employeeId);
    Alert.alert("Mark as Paid", `Pay ${PKR(parseFloat(p.netSalary))} to ${emp?.name ?? "employee"}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark Paid", onPress: async () => {
        const r = await fetch(getApiUrl(`/api/hrm/payroll/${p.id}/pay`), { method: "PATCH", headers });
        if (r.ok) fetchPayroll();
      }},
    ]);
  };

  /* ─── Derived data ─── */
  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (empFilter !== "all") list = list.filter(e => e.status === empFilter);
    if (empSearch.trim()) list = list.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase().trim()));
    return list;
  }, [employees, empFilter, empSearch]);

  const empMap = useMemo(() => {
    const m: Record<number, string> = {};
    employees.forEach(e => { m[e.id] = e.name; });
    return m;
  }, [employees]);

  const filteredPayroll = useMemo(() =>
    payEmployee ? payroll.filter(p => p.employeeId === payEmployee) : payroll,
    [payroll, payEmployee]);

  const filteredFines = useMemo(() =>
    fbEmployee ? fines.filter(f => f.employeeId === fbEmployee) : fines,
    [fines, fbEmployee]);

  const filteredBonuses = useMemo(() =>
    fbEmployee ? bonuses.filter(b => b.employeeId === fbEmployee) : bonuses,
    [bonuses, fbEmployee]);

  // ── Per-employee aggregation for Employee Wise report view ──
  const empPayrollMap = useMemo(() => {
    const m: Record<number, Payroll> = {};
    report?.payroll.forEach(p => { m[p.employeeId] = p; });
    return m;
  }, [report]);
  const empFinesMap = useMemo(() => {
    const m: Record<number, number> = {};
    report?.fines.forEach(f => { m[f.employeeId] = (m[f.employeeId] ?? 0) + parseFloat(f.amount); });
    return m;
  }, [report]);
  const empBonusMap = useMemo(() => {
    const m: Record<number, number> = {};
    report?.bonuses.forEach(b => { m[b.employeeId] = (m[b.employeeId] ?? 0) + parseFloat(b.amount); });
    return m;
  }, [report]);
  const reportActiveEmployees = useMemo(() =>
    report?.employees.filter(e => e.status === "active") ?? [],
    [report]);

  // ── Behavior Score (1–100) per employee ──
  const empScores = useMemo(() => {
    const scores: Record<number, {
      score: number;
      attendancePts: number;
      finePts: number;
      bonusPts: number;
      label: string;
      color: string;
    }> = {};
    for (const emp of reportActiveEmployees) {
      const pay = empPayrollMap[emp.id];
      const fineAmt  = empFinesMap[emp.id]  ?? 0;
      const bonusAmt = empBonusMap[emp.id]  ?? 0;
      const baseSal  = parseFloat(emp.baseSalary) || 1;

      // Attendance: 0–60 pts
      const attPts = pay
        ? Math.round(((pay.presentDays + pay.halfDays * 0.5) / Math.max(pay.workingDays, 1)) * 60)
        : 0;
      // Fine deduction: 0–30 pts (deducted)
      const finePts  = Math.min(30, Math.round((fineAmt / baseSal) * 100));
      // Bonus reward: 0–10 pts
      const bonusPts = Math.min(10, Math.round((bonusAmt / baseSal) * 50));

      const raw   = attPts - finePts + bonusPts;
      const score = Math.max(1, Math.min(100, raw));

      const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Average" : "Needs Work";
      const color = score >= 85 ? "#059669"   : score >= 70 ? "#2563EB" : score >= 50 ? "#D97706" : "#DC2626";
      scores[emp.id] = { score, attendancePts: attPts, finePts, bonusPts, label, color };
    }
    return scores;
  }, [reportActiveEmployees, empPayrollMap, empFinesMap, empBonusMap]);

  /* ─── Leaves ─── */
  const submitLeave = async () => {
    if (!leaveForm.employeeId) { Alert.alert("Error", "Select an employee"); return; }
    if (!leaveForm.startDate || !leaveForm.endDate) { Alert.alert("Error", "Start and end dates are required"); return; }
    const r = await fetch(getApiUrl("/api/hrm/leave"), {
      method: "POST", headers,
      body: JSON.stringify(leaveForm),
    });
    if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed to submit leave"); return; }
    setShowLeaveModal(false);
    fetchLeaves();
  };

  const reviewLeave = async (lv: LeaveRequest, newStatus: "approved" | "rejected") => {
    const r = await fetch(getApiUrl(`/api/hrm/leave/${lv.id}`), {
      method: "PATCH", headers,
      body: JSON.stringify({ status: newStatus, reviewNotes }),
    });
    if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
    setReviewModal(null);
    setReviewNotes("");
    fetchLeaves();
  };

  const cancelLeave = (lv: LeaveRequest) => {
    Alert.alert("Cancel Leave", "Cancel this leave request?", [
      { text: "No", style: "cancel" },
      { text: "Yes", style: "destructive", onPress: async () => {
        const r = await fetch(getApiUrl(`/api/hrm/leave/${lv.id}`), { method: "DELETE", headers });
        if (!r.ok) { Alert.alert("Error", (await r.json()).error ?? "Failed"); return; }
        fetchLeaves();
      }},
    ]);
  };

  /* ─── Export Report CSV ─── */
  const exportReportCsv = async () => {
    if (!report) return;
    const { summary, payroll: pr, fines: fn, bonuses: bn } = report;
    const lines: string[] = [
      "HRM Report," + `${MONTHS[reportMonth - 1]} ${reportYear}`,
      "",
      "SUMMARY",
      "Metric,Value",
      `Total Employees,${summary.totalEmployees}`,
      `Total Salary Paid,${summary.totalSalaryPaid.toFixed(0)}`,
      `Total Salary Due,${summary.totalSalaryDue.toFixed(0)}`,
      `Total Fines,${summary.totalFines.toFixed(0)}`,
      `Total Bonuses,${summary.totalBonuses.toFixed(0)}`,
      `Present Days,${summary.presentCount}`,
      `Absent Days,${summary.absentCount}`,
      `Late Arrivals,${summary.lateCount}`,
      "",
      "PAYROLL",
      "Employee,Month,Year,Base Salary,Working Days,Present Days,Gross,Bonus,Fine,Net Salary,Status",
      ...pr.map(p => `${empMap[p.employeeId] ?? p.employeeId},${MONTHS[p.month - 1]},${p.year},${p.baseSalary},${p.workingDays},${p.presentDays},${p.grossSalary},${p.bonusTotal},${p.fineTotal},${p.netSalary},${p.status}`),
      "",
      "FINES",
      "Employee,Date,Amount,Reason",
      ...fn.map(f => `${empMap[f.employeeId] ?? f.employeeId},${f.date},${f.amount},${f.reason}`),
      "",
      "BONUSES",
      "Employee,Date,Amount,Reason",
      ...bn.map(b => `${empMap[b.employeeId] ?? b.employeeId},${b.date},${b.amount},${b.reason}`),
    ];
    await Share.share({ message: lines.join("\n"), title: "HRM Report" });
  };

  const s = styles(colors);

  /* ════════════════════════ RENDER ════════════════════════ */

  const renderEmployeesTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search + filter */}
      <View style={s.filterRow}>
        <View style={s.searchBox}>
          <Feather name="search" size={14} color={colors.textSecondary} />
          <TextInput style={s.searchInput} placeholder="Search employees…" placeholderTextColor={colors.textSecondary} value={empSearch} onChangeText={setEmpSearch} />
        </View>
        <View style={s.segRow}>
          {(["all","active","inactive"] as const).map(f => (
            <TouchableOpacity key={f} style={[s.seg, empFilter === f && s.segActive]} onPress={() => setEmpFilter(f)}>
              <Text style={[s.segTxt, empFilter === f && s.segTxtActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredEmployees}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={empLoading} onRefresh={fetchEmployees} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={s.empty}>{empLoading ? "Loading…" : "No employees"}</Text>}
        renderItem={({ item: e }) => (
          <View style={s.card}>
            <View style={[s.cardAccent, { backgroundColor: e.status === "active" ? "#059669" : "#6B7280" }]} />
            <View style={{ flex: 1 }}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{e.name}</Text>
                <View style={[s.badge, { backgroundColor: e.status === "active" ? "#DCFCE7" : "#F3F4F6" }]}>
                  <Text style={[s.badgeTxt, { color: e.status === "active" ? "#059669" : "#6B7280" }]}>{e.status}</Text>
                </View>
              </View>
              {e.position ? <Text style={s.cardSub}>{e.department ? `${e.position} · ${e.department}` : e.position}</Text> : null}
              {e.phone ? <Text style={s.cardSub}>📞 {e.phone}</Text> : null}
              <View style={s.cardRow}>
                <Text style={s.amount}>{PKR(parseFloat(e.baseSalary))}/mo</Text>
                {e.joinDate ? <Text style={s.cardSub}>Joined {e.joinDate}</Text> : null}
              </View>
            </View>
            <View style={s.cardActions}>
              {/* Behavior score badge */}
              {empScores[e.id] && (
                <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: empScores[e.id]!.color, alignItems: "center", justifyContent: "center", marginBottom: 4, backgroundColor: empScores[e.id]!.color + "12" }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: empScores[e.id]!.color, lineHeight: 14 }}>{empScores[e.id]!.score}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 7, color: empScores[e.id]!.color, lineHeight: 9 }}>/100</Text>
                </View>
              )}
              {/* Pending verification badge (achieved targets awaiting admin sign-off) */}
              {pendingAchievements[e.id] > 0 && (
                <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, alignItems: "center", marginBottom: 4 }}>
                  <Feather name="clock" size={14} color="#D97706" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#D97706" }}>
                    {pendingAchievements[e.id]}
                  </Text>
                </View>
              )}
              {/* Verified-Sale tier badge (lifetime) */}
              {empBadges[e.id] && empBadges[e.id]!.tier !== "none" && (() => {
                const b = empBadges[e.id]!;
                const t = TIER_META[b.tier];
                return (
                  <View style={{ backgroundColor: t.bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, alignItems: "center", marginBottom: 4, borderWidth: 1, borderColor: t.color + "40" }}>
                    <Feather name={t.icon} size={14} color={t.color} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 8, color: t.color, marginTop: 1 }}>{t.label}</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 8, color: t.color }}>×{b.verifiedCount}</Text>
                  </View>
                );
              })()}
              <TouchableOpacity onPress={() => openEmpModal(e)} style={s.iconBtn}>
                <Feather name="edit-2" size={16} color={colors.primary} />
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity onPress={() => deleteEmployee(e)} style={s.iconBtn}>
                  <Feather name="trash-2" size={16} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderAttendanceTab = () => (
    <View style={{ flex: 1 }}>
      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hScrollContent}>
        <TouchableOpacity style={[s.pill, !attEmployee && s.pillActive]} onPress={() => setAttEmployee(null)}>
          <Text style={[s.pillTxt, !attEmployee && s.pillTxtActive]}>All</Text>
        </TouchableOpacity>
        {employees.filter(e => e.status === "active").map(e => (
          <TouchableOpacity key={e.id} style={[s.pill, attEmployee === e.id && s.pillActive]} onPress={() => setAttEmployee(e.id)}>
            <Text style={[s.pillTxt, attEmployee === e.id && s.pillTxtActive]}>{e.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={[s.filterRow, { paddingHorizontal: 16 }]}>
        <Text style={s.label}>Date:</Text>
        <TextInput style={[s.input, { flex: 1 }]} value={attDate} onChangeText={setAttDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
        <TouchableOpacity style={s.refreshBtn} onPress={fetchAttendance}>
          <Feather name="refresh-cw" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Today's attendance quick-mark grid */}
      {employees.filter(e => e.status === "active").length > 0 && (
        <View style={s.quickMarkBox}>
          <Text style={s.sectionTitle}>Quick Mark — {attDate}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {employees.filter(e => e.status === "active").map(emp => {
              const rec = attendance.find(a => a.employeeId === emp.id && a.date === attDate);
              return (
                <View key={emp.id} style={s.quickRow}>
                  <Text style={[s.quickName]} numberOfLines={1}>{emp.name}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {ATT_STATUS.map(st => (
                      <TouchableOpacity key={st}
                        style={[s.quickBtn, rec?.status === st && { backgroundColor: ATT_COLOR[st] }]}
                        onPress={async () => {
                          await fetch(getApiUrl("/api/hrm/attendance"), {
                            method: "POST", headers,
                            body: JSON.stringify({ employeeId: emp.id, date: attDate, status: st }),
                          });
                          fetchAttendance();
                        }}>
                        <Text style={[s.quickBtnTxt, rec?.status === st && { color: "#fff" }]}>{ATT_LABEL[st].slice(0, 4)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={attendance}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={attLoading} onRefresh={fetchAttendance} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={s.empty}>{attLoading ? "Loading…" : "No records for this date/employee"}</Text>}
        renderItem={({ item: a }) => (
          <View style={s.card}>
            <View style={[s.cardAccent, { backgroundColor: ATT_COLOR[a.status] }]} />
            <View style={{ flex: 1 }}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{empMap[a.employeeId] ?? `Emp #${a.employeeId}`}</Text>
                <View style={[s.badge, { backgroundColor: ATT_COLOR[a.status] + "20" }]}>
                  <Text style={[s.badgeTxt, { color: ATT_COLOR[a.status] }]}>{ATT_LABEL[a.status]}</Text>
                </View>
              </View>
              <Text style={s.cardSub}>{a.date}{a.checkIn ? ` · In: ${a.checkIn}` : ""}{a.checkOut ? ` · Out: ${a.checkOut}` : ""}</Text>
              {a.notes ? <Text style={s.cardSub}>📝 {a.notes}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );

  /* ─── Fines tab — dedicated view ────────────────────────────────────── */
  const renderFinesTab = () => {
    const totalFines    = filteredFines.reduce((sum, f) => sum + parseFloat(f.amount), 0);
    const totalBonuses  = filteredBonuses.reduce((sum, b) => sum + parseFloat(b.amount), 0);

    return (
      <View style={{ flex: 1 }}>
        {/* Employee filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hScrollContent}>
          <TouchableOpacity style={[s.pill, !fbEmployee && s.pillActive]} onPress={() => setFbEmployee(null)}>
            <Text style={[s.pillTxt, !fbEmployee && s.pillTxtActive]}>All Employees</Text>
          </TouchableOpacity>
          {employees.filter(e => e.status === "active").map(e => (
            <TouchableOpacity key={e.id} style={[s.pill, fbEmployee === e.id && s.pillActive]} onPress={() => setFbEmployee(e.id)}>
              <Text style={[s.pillTxt, fbEmployee === e.id && s.pillTxtActive]}>{e.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Stat row */}
        <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 11, color: "#991B1B", fontFamily: "Inter_600SemiBold" }}>Total Fines</Text>
            <Text style={{ fontSize: 20, color: "#DC2626", fontFamily: "Inter_700Bold", marginTop: 2 }}>{PKR(totalFines)}</Text>
            <Text style={{ fontSize: 10, color: "#7F1D1D", marginTop: 2 }}>{filteredFines.length} record{filteredFines.length !== 1 ? "s" : ""}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#D1FAE5", borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 11, color: "#065F46", fontFamily: "Inter_600SemiBold" }}>Total Bonuses</Text>
            <Text style={{ fontSize: 20, color: "#059669", fontFamily: "Inter_700Bold", marginTop: 2 }}>{PKR(totalBonuses)}</Text>
            <Text style={{ fontSize: 10, color: "#064E3B", marginTop: 2 }}>{filteredBonuses.length} record{filteredBonuses.length !== 1 ? "s" : ""}</Text>
          </View>
        </View>

        {/* Add buttons */}
        <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 4 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#DC2626", borderRadius: 10, paddingVertical: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}
            onPress={() => { setFbMode("fine"); setFbForm({ amount: "", reason: "", date: NOW.toISOString().slice(0, 10) }); setShowFbModal(true); }}>
            <Feather name="alert-circle" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>Add Fine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#059669", borderRadius: 10, paddingVertical: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}
            onPress={() => { setFbMode("bonus"); setFbForm({ amount: "", reason: "", date: NOW.toISOString().slice(0, 10) }); setShowFbModal(true); }}>
            <Feather name="award" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>Add Bonus</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
          {filteredFines.length > 0 && (
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#DC2626", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>⚠️ Fines</Text>
          )}
          {filteredFines.map(f => (
            <View key={`f${f.id}`} style={{ backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: "#DC2626", flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>{empMap[f.employeeId] ?? `Emp #${f.employeeId}`}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{f.reason || "No reason"} · {f.date}</Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#DC2626", marginLeft: 8 }}>−{PKR(parseFloat(f.amount))}</Text>
              {!f.payrollId && (
                <TouchableOpacity onPress={() => deleteFine(f.id)} style={{ marginLeft: 8, padding: 4 }}>
                  <Feather name="trash-2" size={16} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {filteredBonuses.length > 0 && (
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#059669", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>🏆 Bonuses</Text>
          )}
          {filteredBonuses.map(b => (
            <View key={`b${b.id}`} style={{ backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: "#059669", flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>{empMap[b.employeeId] ?? `Emp #${b.employeeId}`}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{b.reason || "No reason"} · {b.date}</Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#059669", marginLeft: 8 }}>+{PKR(parseFloat(b.amount))}</Text>
              {!b.payrollId && (
                <TouchableOpacity onPress={() => deleteBonus(b.id)} style={{ marginLeft: 8, padding: 4 }}>
                  <Feather name="trash-2" size={16} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {filteredFines.length === 0 && filteredBonuses.length === 0 && (
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
                No fines or bonuses{fbEmployee ? " for this employee" : " yet"}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderPayrollTab = () => (
    <View style={{ flex: 1 }}>
      {/* Employee filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hScrollContent}>
        <TouchableOpacity style={[s.pill, !payEmployee && s.pillActive]} onPress={() => setPayEmployee(null)}>
          <Text style={[s.pillTxt, !payEmployee && s.pillTxtActive]}>All</Text>
        </TouchableOpacity>
        {employees.filter(e => e.status === "active").map(e => (
          <TouchableOpacity key={e.id} style={[s.pill, payEmployee === e.id && s.pillActive]} onPress={() => setPayEmployee(e.id)}>
            <Text style={[s.pillTxt, payEmployee === e.id && s.pillTxtActive]}>{e.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month / year filters */}
      <View style={[s.filterRow, { paddingHorizontal: 16 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {ALL_MONTHS.map(m => (
            <TouchableOpacity key={m.value} style={[s.pill, payMonth === m.value && s.pillActive]} onPress={() => setPayMonth(m.value)}>
              <Text style={[s.pillTxt, payMonth === m.value && s.pillTxtActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput style={[s.input, { width: 72 }]} value={String(payYear)} onChangeText={t => setPayYear(parseInt(t) || NOW.getFullYear())} keyboardType="number-pad" />
      </View>

      {/* Fines & Bonuses section */}
      <View style={s.fbBox}>
        <View style={s.cardRow}>
          <Text style={s.sectionTitle}>Fines & Bonuses</Text>
          <View style={s.rowGap}>
            <TouchableOpacity style={[s.miniBtn, { backgroundColor: "#FEF2F2" }]} onPress={() => { setFbMode("fine"); setFbForm({ amount: "", reason: "", date: NOW.toISOString().slice(0, 10) }); setShowFbModal(true); }}>
              <Text style={[s.miniBtnTxt, { color: "#DC2626" }]}>+ Fine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.miniBtn, { backgroundColor: "#ECFDF5" }]} onPress={() => { setFbMode("bonus"); setFbForm({ amount: "", reason: "", date: NOW.toISOString().slice(0, 10) }); setShowFbModal(true); }}>
              <Text style={[s.miniBtnTxt, { color: "#059669" }]}>+ Bonus</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={{ maxHeight: 180 }}>
          {filteredFines.map(f => (
            <View key={`f${f.id}`} style={s.fbRow}>
              <View style={[s.fbDot, { backgroundColor: "#DC2626" }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.fbName}>{empMap[f.employeeId] ?? `Emp #${f.employeeId}`}</Text>
                <Text style={s.fbSub}>{f.reason} · {f.date}</Text>
              </View>
              <Text style={[s.amount, { color: "#DC2626" }]}>-{PKR(parseFloat(f.amount))}</Text>
              {!f.payrollId && (
                <TouchableOpacity onPress={() => deleteFine(f.id)} style={{ marginLeft: 8 }}>
                  <Feather name="x" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {filteredBonuses.map(b => (
            <View key={`b${b.id}`} style={s.fbRow}>
              <View style={[s.fbDot, { backgroundColor: "#059669" }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.fbName}>{empMap[b.employeeId] ?? `Emp #${b.employeeId}`}</Text>
                <Text style={s.fbSub}>{b.reason} · {b.date}</Text>
              </View>
              <Text style={[s.amount, { color: "#059669" }]}>+{PKR(parseFloat(b.amount))}</Text>
              {!b.payrollId && (
                <TouchableOpacity onPress={() => deleteBonus(b.id)} style={{ marginLeft: 8 }}>
                  <Feather name="x" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {filteredFines.length === 0 && filteredBonuses.length === 0 && (
            <Text style={s.empty}>No fines or bonuses{payEmployee ? " for this employee" : ""}</Text>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={filteredPayroll}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={payLoading} onRefresh={fetchPayroll} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={s.empty}>{payLoading ? "Loading…" : "No payroll records"}</Text>}
        renderItem={({ item: p }) => (
          <View style={s.card}>
            <View style={[s.cardAccent, { backgroundColor: p.status === "paid" ? "#059669" : "#D97706" }]} />
            <View style={{ flex: 1 }}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{empMap[p.employeeId] ?? `Emp #${p.employeeId}`}</Text>
                <View style={[s.badge, { backgroundColor: p.status === "paid" ? "#DCFCE7" : "#FFF7ED" }]}>
                  <Text style={[s.badgeTxt, { color: p.status === "paid" ? "#059669" : "#D97706" }]}>{p.status}</Text>
                </View>
              </View>
              <Text style={s.cardSub}>{MONTHS[p.month - 1]} {p.year} · {p.presentDays}/{p.workingDays} days{p.halfDays > 0 ? ` + ${p.halfDays} half` : ""}</Text>
              <View style={s.payBreakdown}>
                <Text style={s.payItem}>Base: {PKR(parseFloat(p.baseSalary))}</Text>
                <Text style={[s.payItem, { color: "#059669" }]}>+Bonus: {PKR(parseFloat(p.bonusTotal))}</Text>
                <Text style={[s.payItem, { color: "#DC2626" }]}>-Fine: {PKR(parseFloat(p.fineTotal))}</Text>
              </View>
              <Text style={[s.amount, { fontSize: 17 }]}>Net: {PKR(parseFloat(p.netSalary))}</Text>
              {p.paidAt ? <Text style={s.cardSub}>Paid on {p.paidAt}</Text> : null}
            </View>
            {p.status === "pending" && (
              <TouchableOpacity style={s.payBtn} onPress={() => markPayrollPaid(p)}>
                <Text style={s.payBtnTxt}>Pay</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );

  const renderReportTab = () => {
    const s2 = report?.summary;

    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={reportLoading} onRefresh={fetchReport} />}>

        {/* ── Top Filter Toggle (3-way) ── */}
        <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 12, borderRadius: 14, overflow: "hidden", borderWidth: 1.5, borderColor: colors.border }}>
          {([
            { key: "app",         icon: "bar-chart-2", label: "App" },
            { key: "employee",    icon: "users",       label: "Employee" },
            { key: "performance", icon: "award",       label: "Scores" },
            { key: "sales",       icon: "trending-up", label: "Sales" },
          ] as const).map((item, idx) => (
            <React.Fragment key={item.key}>
              {idx > 0 && <View style={{ width: 1.5, backgroundColor: colors.border }} />}
              <TouchableOpacity
                onPress={() => setReportView(item.key)}
                style={{ flex: 1, paddingVertical: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4,
                  backgroundColor: reportView === item.key ? colors.primary : colors.card }}
              >
                <Feather name={item.icon} size={13} color={reportView === item.key ? "#FFF" : colors.textSecondary} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: reportView === item.key ? "#FFF" : colors.textSecondary }}>{item.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Month/Year picker */}
        <View style={[s.filterRow, { marginBottom: 12 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ALL_MONTHS.map(m => (
              <TouchableOpacity key={m.value} style={[s.pill, reportMonth === m.value && s.pillActive]} onPress={() => setReportMonth(m.value)}>
                <Text style={[s.pillTxt, reportMonth === m.value && s.pillTxtActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput style={[s.input, { width: 72 }]} value={String(reportYear)} onChangeText={t => setReportYear(parseInt(t) || NOW.getFullYear())} keyboardType="number-pad" />
        </View>

        {reportLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />}

        {/* ══════════════ APP WISE VIEW ══════════════ */}
        {reportView === "app" && s2 && (
          <>
            <Text style={s.sectionTitle}>Overview — {MONTHS[reportMonth - 1]} {reportYear}</Text>
            <View style={s.statsGrid}>
              <StatCard label="Employees" value={String(s2.totalEmployees)} color="#2563EB" icon="users" />
              <StatCard label="Salary Paid" value={PKR(s2.totalSalaryPaid)} color="#059669" icon="check-circle" />
              <StatCard label="Salary Due" value={PKR(s2.totalSalaryDue)} color="#D97706" icon="clock" />
              <StatCard label="Bonuses" value={PKR(s2.totalBonuses)} color="#7C3AED" icon="award" />
              <StatCard label="Fines" value={PKR(s2.totalFines)} color="#DC2626" icon="alert-circle" />
            </View>

            <Text style={s.sectionTitle}>Attendance Summary</Text>
            <View style={s.attSummaryRow}>
              <View style={[s.attSummaryCard, { backgroundColor: "#DCFCE7" }]}>
                <Text style={[s.attSummaryNum, { color: "#059669" }]}>{s2.presentCount}</Text>
                <Text style={s.attSummaryLbl}>Present</Text>
              </View>
              <View style={[s.attSummaryCard, { backgroundColor: "#FEE2E2" }]}>
                <Text style={[s.attSummaryNum, { color: "#DC2626" }]}>{s2.absentCount}</Text>
                <Text style={s.attSummaryLbl}>Absent</Text>
              </View>
              <View style={[s.attSummaryCard, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[s.attSummaryNum, { color: "#D97706" }]}>{s2.lateCount}</Text>
                <Text style={s.attSummaryLbl}>Late</Text>
              </View>
            </View>

            {report!.payroll.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Payroll Detail</Text>
                {report!.payroll.map(p => (
                  <View key={p.id} style={s.reportRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reportName}>{empMap[p.employeeId] ?? `Emp #${p.employeeId}`}</Text>
                      <Text style={s.cardSub}>{p.presentDays}/{p.workingDays} days · {MONTHS[p.month - 1]} {p.year}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.amount, { fontSize: 15 }]}>{PKR(parseFloat(p.netSalary))}</Text>
                      <View style={[s.badge, { backgroundColor: p.status === "paid" ? "#DCFCE7" : "#FFF7ED" }]}>
                        <Text style={[s.badgeTxt, { color: p.status === "paid" ? "#059669" : "#D97706" }]}>{p.status}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {report!.fines.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Fines Breakdown</Text>
                {report!.fines.map(f => (
                  <View key={f.id} style={s.reportRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reportName}>{empMap[f.employeeId] ?? `Emp #${f.employeeId}`}</Text>
                      <Text style={s.cardSub}>{f.reason} · {f.date}</Text>
                    </View>
                    <Text style={[s.amount, { color: "#DC2626", fontSize: 15 }]}>-{PKR(parseFloat(f.amount))}</Text>
                  </View>
                ))}
              </>
            )}

            {report!.bonuses.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Bonuses Breakdown</Text>
                {report!.bonuses.map(b => (
                  <View key={b.id} style={s.reportRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reportName}>{empMap[b.employeeId] ?? `Emp #${b.employeeId}`}</Text>
                      <Text style={s.cardSub}>{b.reason} · {b.date}</Text>
                    </View>
                    <Text style={[s.amount, { color: "#059669", fontSize: 15 }]}>+{PKR(parseFloat(b.amount))}</Text>
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity style={s.exportBtn} onPress={exportReportCsv}>
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={s.exportBtnTxt}>Export CSV</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ══════════════ EMPLOYEE WISE VIEW ══════════════ */}
        {reportView === "employee" && report && (
          <>
            <Text style={s.sectionTitle}>Employee Report — {MONTHS[reportMonth - 1]} {reportYear}</Text>
            {reportActiveEmployees.length === 0 && (
              <Text style={s.empty}>No active employees found</Text>
            )}
            {reportActiveEmployees.map(emp => {
              const pay = empPayrollMap[emp.id];
              const fineAmt = empFinesMap[emp.id] ?? 0;
              const bonusAmt = empBonusMap[emp.id] ?? 0;
              const netSalary = pay ? parseFloat(pay.netSalary) : null;
              const attendancePct = pay ? Math.round((pay.presentDays / Math.max(pay.workingDays, 1)) * 100) : null;
              return (
                <View key={emp.id} style={[s.card, { marginBottom: 12, padding: 0, overflow: "hidden" }]}>
                  {/* Employee header */}
                  <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10, backgroundColor: colors.primary + "10", borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" }}>
                        {emp.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[s.cardTitle, { fontSize: 15 }]}>{emp.name}</Text>
                        {(pendingAchievements[emp.id] ?? 0) > 0 && (
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, gap: 3 }}>
                            <Feather name="award" size={12} color="#D97706" />
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#D97706" }}>{pendingAchievements[emp.id]}</Text>
                          </View>
                        )}
                      </View>
                      {(emp.position || emp.department) ? (
                        <Text style={s.cardSub}>
                          {[emp.position, emp.department].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                        {emp.paymentMethod ? (
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, gap: 3 }}>
                            <Feather name={emp.paymentMethod === "Cash" ? "dollar-sign" : emp.paymentMethod === "Bank Transfer" ? "credit-card" : emp.paymentMethod === "Cheque" ? "file-text" : "smartphone"} size={9} color="#2563EB" />
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#2563EB" }}>{emp.paymentMethod}</Text>
                          </View>
                        ) : null}
                        {emp.locationId ? (
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDF4", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, gap: 3 }}>
                            <Feather name="map-pin" size={9} color="#059669" />
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#059669" }}>{locations.find(l => l.id === emp.locationId)?.name ?? `Loc #${emp.locationId}`}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[s.badge, { backgroundColor: emp.status === "active" ? "#DCFCE7" : "#F3F4F6" }]}>
                      <Text style={[s.badgeTxt, { color: emp.status === "active" ? "#059669" : "#6B7280" }]}>{emp.status}</Text>
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    {/* Attendance */}
                    <View style={{ flex: 1, padding: 12, alignItems: "center", borderRightWidth: 1, borderRightColor: colors.border }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: attendancePct !== null ? (attendancePct >= 80 ? "#059669" : attendancePct >= 60 ? "#D97706" : "#DC2626") : colors.textSecondary }}>
                        {attendancePct !== null ? `${attendancePct}%` : "—"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.textSecondary, textAlign: "center" }}>
                        {pay ? `${pay.presentDays}/${pay.workingDays} days` : "No payroll"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary }}>Attendance</Text>
                    </View>
                    {/* Salary */}
                    <View style={{ flex: 1.4, padding: 12, alignItems: "center", borderRightWidth: 1, borderRightColor: colors.border }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: netSalary !== null ? colors.primary : colors.textSecondary }}>
                        {netSalary !== null ? PKR(netSalary) : "—"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary }}>Base: {PKR(parseFloat(emp.baseSalary))}</Text>
                      {pay && (
                        <View style={[s.badge, { marginTop: 3, backgroundColor: pay.status === "paid" ? "#DCFCE7" : "#FFF7ED" }]}>
                          <Text style={[s.badgeTxt, { fontSize: 9, color: pay.status === "paid" ? "#059669" : "#D97706" }]}>{pay.status}</Text>
                        </View>
                      )}
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary, marginTop: 2 }}>Net Salary</Text>
                    </View>
                    {/* Fine / Bonus */}
                    <View style={{ flex: 1, padding: 12, alignItems: "center" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#DC2626" }}>
                        {fineAmt > 0 ? `-${PKR(fineAmt)}` : "—"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary }}>Fines</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#059669", marginTop: 4 }}>
                        {bonusAmt > 0 ? `+${PKR(bonusAmt)}` : "—"}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary }}>Bonuses</Text>
                    </View>
                  </View>

                  {/* Fines list */}
                  {report.fines.filter(f => f.employeeId === emp.id).map(f => (
                    <View key={`f${f.id}`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#DC2626" }} />
                      <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text }}>{f.reason}</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>{f.date}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#DC2626" }}>-{PKR(parseFloat(f.amount))}</Text>
                    </View>
                  ))}

                  {/* Bonuses list */}
                  {report.bonuses.filter(b => b.employeeId === emp.id).map(b => (
                    <View key={`b${b.id}`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#059669" }} />
                      <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text }}>{b.reason}</Text>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>{b.date}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#059669" }}>+{PKR(parseFloat(b.amount))}</Text>
                    </View>
                  ))}

                  {/* No payroll note */}
                  {!pay && (
                    <View style={{ padding: 12, alignItems: "center" }}>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary }}>No payroll generated for this month</Text>
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity style={s.exportBtn} onPress={exportReportCsv}>
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={s.exportBtnTxt}>Export CSV</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ══════════════ PERFORMANCE SCORECARD ══════════════ */}
        {reportView === "performance" && report && (() => {
          const ranked = [...reportActiveEmployees]
            .map(emp => ({ emp, ...( empScores[emp.id] ?? { score: 0, attendancePts: 0, finePts: 0, bonusPts: 0, label: "N/A", color: "#6B7280" }) }))
            .sort((a, b) => b.score - a.score);

          return (
            <>
              {/* Section header */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[s.sectionTitle, { fontSize: 17 }]}>
                  🏆 Performance Scorecard
                </Text>
                <Text style={s.cardSub}>
                  {MONTHS[reportMonth - 1]} {reportYear} · Behavior Score 1–100
                </Text>
              </View>

              {/* Score legend */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Excellent", color: "#059669", range: "85–100" },
                  { label: "Good",      color: "#2563EB", range: "70–84" },
                  { label: "Average",   color: "#D97706", range: "50–69" },
                  { label: "Needs Work",color: "#DC2626", range: "1–49"  },
                ].map(l => (
                  <View key={l.label} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: l.color + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: l.color }}>{l.label}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: l.color, opacity: 0.8 }}>{l.range}</Text>
                  </View>
                ))}
              </View>

              {/* Scoring formula card */}
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text, marginBottom: 10 }}>Score Formula</Text>
                <View style={{ gap: 6 }}>
                  {[
                    { icon: "calendar", label: "Attendance",     pts: "0–60 pts", color: "#2563EB",  desc: "Present + half days / working days × 60" },
                    { icon: "alert-circle", label: "Fine Deduction", pts: "–0 to –30", color: "#DC2626", desc: "Fines vs base salary (max –30 pts)" },
                    { icon: "award",    label: "Bonus Reward",   pts: "+0 to +10", color: "#059669", desc: "Bonuses vs base salary (max +10 pts)" },
                  ].map(row => (
                    <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: row.color + "20", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={row.icon as any} size={13} color={row.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>{row.label}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary }}>{row.desc}</Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: row.color }}>{row.pts}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Podium — top 3 */}
              {ranked.length >= 1 && (
                <>
                  <Text style={s.sectionTitle}>🥇 Leaderboard</Text>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                    {/* 2nd place */}
                    {ranked[1] && (
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#9CA3AF", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" }}>{ranked[1].emp.name.charAt(0)}</Text>
                        </View>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.text, textAlign: "center" }} numberOfLines={1}>{ranked[1].emp.name}</Text>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#9CA3AF" }}>{ranked[1].score}</Text>
                        <View style={{ width: "100%", height: 60, backgroundColor: "#9CA3AF" + "30", borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#9CA3AF" }}>2nd</Text>
                        </View>
                      </View>
                    )}
                    {/* 1st place */}
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 24, marginBottom: 2 }}>👑</Text>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginBottom: 4, borderWidth: 3, borderColor: "#FEF3C7" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff" }}>{ranked[0].emp.name.charAt(0)}</Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: colors.text, textAlign: "center" }} numberOfLines={1}>{ranked[0].emp.name}</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: "#F59E0B" }}>{ranked[0].score}</Text>
                      <View style={{ width: "100%", height: 80, backgroundColor: "#F59E0B" + "30", borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#F59E0B" }}>1st 🏆</Text>
                      </View>
                    </View>
                    {/* 3rd place */}
                    {ranked[2] && (
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#B45309", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>{ranked[2].emp.name.charAt(0)}</Text>
                        </View>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.text, textAlign: "center" }} numberOfLines={1}>{ranked[2].emp.name}</Text>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#B45309" }}>{ranked[2].score}</Text>
                        <View style={{ width: "100%", height: 44, backgroundColor: "#B45309" + "30", borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#B45309" }}>3rd</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Full ranking cards */}
              <Text style={s.sectionTitle}>All Employees</Text>
              {ranked.map((item, rank) => {
                const { emp, score, attendancePts, finePts, bonusPts, label, color } = item;
                const pay      = empPayrollMap[emp.id];
                const fineAmt  = empFinesMap[emp.id]  ?? 0;
                const bonusAmt = empBonusMap[emp.id]  ?? 0;
                const empFineList  = report.fines.filter(f => f.employeeId === emp.id);
                const empBonusList = report.bonuses.filter(b => b.employeeId === emp.id);
                const attPct   = pay ? Math.round(((pay.presentDays + pay.halfDays * 0.5) / Math.max(pay.workingDays, 1)) * 100) : 0;

                return (
                  <View key={emp.id} style={{ backgroundColor: colors.card, borderRadius: 16, marginBottom: 14, overflow: "hidden", borderWidth: 1.5, borderColor: color + "40" }}>
                    {/* Card header */}
                    <View style={{ backgroundColor: color + "12", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                      {/* Rank badge */}
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#fff" }}>#{rank + 1}</Text>
                      </View>
                      {/* Avatar */}
                      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color + "50" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>{emp.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      {/* Name + label */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>{emp.name}</Text>
                        {emp.position && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>{emp.position}</Text>}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                          <View style={{ backgroundColor: color + "25", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color }}>{label}</Text>
                          </View>
                          {(pendingAchievements[emp.id] ?? 0) > 0 && (
                            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="award" size={10} color="#D97706" />
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#D97706" }}>{pendingAchievements[emp.id]} target{pendingAchievements[emp.id] > 1 ? "s" : ""}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Big Score circle */}
                      <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: color, alignItems: "center", justifyContent: "center", backgroundColor: color + "10" }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color }}>{score}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color, marginTop: -2 }}>/100</Text>
                      </View>
                    </View>

                    {/* Score breakdown bars */}
                    <View style={{ padding: 14, gap: 10 }}>
                      {/* Attendance bar */}
                      <View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="calendar" size={12} color="#2563EB" />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Attendance</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>
                              {pay ? `${pay.presentDays}/${pay.workingDays} days` : "no payroll"}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#2563EB" }}>+{attendancePts} pts</Text>
                        </View>
                        <View style={{ height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                          <View style={{ height: "100%", width: `${Math.round(attendancePts / 60 * 100)}%` as any, backgroundColor: "#2563EB", borderRadius: 4 }} />
                        </View>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                          Attendance: {attPct}%
                        </Text>
                      </View>

                      {/* Fine deduction bar */}
                      <View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="alert-circle" size={12} color="#DC2626" />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Fine Deduction</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>
                              {fineAmt > 0 ? PKR(fineAmt) : "none"}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: finePts > 0 ? "#DC2626" : colors.textSecondary }}>
                            {finePts > 0 ? `–${finePts} pts` : "0 pts"}
                          </Text>
                        </View>
                        <View style={{ height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                          <View style={{ height: "100%", width: `${Math.round(finePts / 30 * 100)}%` as any, backgroundColor: "#DC2626", borderRadius: 4 }} />
                        </View>
                        {/* Fine list */}
                        {empFineList.length > 0 && (
                          <View style={{ marginTop: 6, gap: 3 }}>
                            {empFineList.map(f => (
                              <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 8 }}>
                                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#DC2626" }} />
                                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>{f.reason}</Text>
                                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#DC2626" }}>–{PKR(parseFloat(f.amount))}</Text>
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary }}>{f.date}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Bonus reward bar */}
                      <View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="gift" size={12} color="#059669" />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Bonus Reward</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>
                              {bonusAmt > 0 ? PKR(bonusAmt) : "none"}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: bonusPts > 0 ? "#059669" : colors.textSecondary }}>
                            {bonusPts > 0 ? `+${bonusPts} pts` : "0 pts"}
                          </Text>
                        </View>
                        <View style={{ height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                          <View style={{ height: "100%", width: `${Math.round(bonusPts / 10 * 100)}%` as any, backgroundColor: "#059669", borderRadius: 4 }} />
                        </View>
                        {/* Bonus list */}
                        {empBonusList.length > 0 && (
                          <View style={{ marginTop: 6, gap: 3 }}>
                            {empBonusList.map(b => (
                              <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 8 }}>
                                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#059669" }} />
                                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>{b.reason}</Text>
                                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#059669" }}>+{PKR(parseFloat(b.amount))}</Text>
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary }}>{b.date}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Footer: net salary */}
                    {pay && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                        borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
                        backgroundColor: color + "06" }}>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary }}>
                          Net Salary · {pay.status}
                        </Text>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: pay.status === "paid" ? "#059669" : colors.primary }}>
                          {PKR(parseFloat(pay.netSalary))}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {ranked.length === 0 && (
                <Text style={s.empty}>No payroll data for {MONTHS[reportMonth - 1]} {reportYear}. Generate payroll first.</Text>
              )}

              <TouchableOpacity style={s.exportBtn} onPress={exportReportCsv}>
                <Feather name="share-2" size={16} color="#fff" />
                <Text style={s.exportBtnTxt}>Export CSV</Text>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* ── Sales Performance sub-view ── */}
        {reportView === "sales" && (() => {
          const sp = salesPerf;
          const periods = [
            { key: "daily"   as const, label: "Daily"   },
            { key: "weekly"  as const, label: "Weekly"  },
            { key: "monthly" as const, label: "Monthly" },
          ];
          const maxUserSales = sp ? Math.max(1, ...sp.byUser.map(u => u.salesTotal)) : 1;
          const maxAppSales  = sp ? Math.max(1, ...sp.byApp.map(a => a.salesTotal))  : 1;

          return (
            <>
              {/* Header */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { fontSize: 17 }]}>📈 Sales Performance</Text>
                <Text style={s.cardSub}>
                  Live sales totals & target progress for the selected period
                </Text>
              </View>

              {/* Period toggle */}
              <View style={{ flexDirection: "row", marginBottom: 10, borderRadius: 12, overflow: "hidden", borderWidth: 1.5, borderColor: colors.border }}>
                {periods.map((p, idx) => (
                  <React.Fragment key={p.key}>
                    {idx > 0 && <View style={{ width: 1.5, backgroundColor: colors.border }} />}
                    <TouchableOpacity
                      onPress={() => setSalesPerfPeriod(p.key)}
                      style={{ flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: salesPerfPeriod === p.key ? colors.primary : colors.card }}
                    >
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: salesPerfPeriod === p.key ? "#fff" : colors.textSecondary }}>{p.label}</Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>

              {/* Date picker (text input, single anchor date) */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, backgroundColor: colors.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                <Feather name="calendar" size={14} color={colors.textSecondary} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary }}>Anchor:</Text>
                <TextInput
                  value={salesPerfDate}
                  onChangeText={setSalesPerfDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text }}
                />
                <TouchableOpacity onPress={() => setSalesPerfDate(NOW.toISOString().slice(0, 10))} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + "15" }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: colors.primary }}>Today</Text>
                </TouchableOpacity>
              </View>

              {salesPerfLoading && !sp && (
                <Text style={s.empty}>Loading sales performance…</Text>
              )}

              {sp && (
                <>
                  {/* Window summary */}
                  <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.textSecondary, marginBottom: 8 }}>
                      {sp.startDate} → {sp.endDate}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: colors.primary }}>
                          {PKR(sp.totals.salesTotal)}
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }}>
                          {sp.totals.salesCount} sale{sp.totals.salesCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>

                    {/* Targets row */}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Feather name="check-circle" size={12} color="#059669" />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#059669" }}>{sp.totals.targetsAchieved} achieved</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Feather name="clock" size={12} color="#D97706" />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#D97706" }}>{sp.totals.pendingVerify} pending verify</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Feather name="target" size={12} color="#2563EB" />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#2563EB" }}>{sp.totals.targetsActive} active</Text>
                      </View>
                      {sp.totals.targetsMissed > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Feather name="x-circle" size={12} color="#DC2626" />
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#DC2626" }}>{sp.totals.targetsMissed} missed</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* By Salesperson — horizontal bars sorted by revenue */}
                  <Text style={s.sectionTitle}>By Salesperson</Text>
                  {sp.byUser.length === 0 ? (
                    <Text style={s.empty}>No sales by users in this period</Text>
                  ) : (
                    <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
                      {sp.byUser.map(u => {
                        const pct = Math.round((u.salesTotal / maxUserSales) * 100);
                        return (
                          <View key={u.userId}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }} numberOfLines={1}>
                                {u.name || u.username}
                              </Text>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.primary }}>
                                {PKR(u.salesTotal)}
                              </Text>
                            </View>
                            <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                              <View style={{ height: "100%", width: `${pct}%` as any, backgroundColor: colors.primary, borderRadius: 4 }} />
                            </View>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                              {u.salesCount} sale{u.salesCount === 1 ? "" : "s"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* By App / Game */}
                  <Text style={s.sectionTitle}>By Game / App</Text>
                  {sp.byApp.length === 0 ? (
                    <Text style={s.empty}>No sales by app in this period</Text>
                  ) : (
                    <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
                      {sp.byApp.map(a => {
                        const pct = Math.round((a.salesTotal / maxAppSales) * 100);
                        return (
                          <View key={a.locationId}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }} numberOfLines={1}>
                                {a.name}
                              </Text>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#8B5CF6" }}>
                                {PKR(a.salesTotal)}
                              </Text>
                            </View>
                            <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                              <View style={{ height: "100%", width: `${pct}%` as any, backgroundColor: "#8B5CF6", borderRadius: 4 }} />
                            </View>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                              {a.salesCount} sale{a.salesCount === 1 ? "" : "s"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Footer hint */}
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, textAlign: "center", marginTop: 4 }}>
                    Tip: pending verifications need an admin to tap "Verify & Pay" on the Targets screen.
                  </Text>
                </>
              )}
            </>
          );
        })()}
      </ScrollView>
    );
  };

  const renderLeavesTab = () => {
    const empMap: Record<number, string> = {};
    employees.forEach(e => { empMap[e.id] = e.name; });

    const pendingCount  = leaves.filter(l => l.status === "pending").length;
    const approvedCount = leaves.filter(l => l.status === "approved").length;
    const rejectedCount = leaves.filter(l => l.status === "rejected").length;

    return (
      <View style={{ flex: 1 }}>
        {/* ── Summary pills ── */}
        <View style={[s.filterRow, { flexWrap: "wrap", gap: 8 }]}>
          {([["all", "All", "#6B7280"], ["pending", "Pending", "#D97706"], ["approved", "Approved", "#059669"], ["rejected", "Rejected", "#DC2626"]] as [LeaveStatus | "all", string, string][]).map(([k, lbl, col]) => (
            <TouchableOpacity key={k}
              style={[s.seg, leaveStatusFilter === k && { backgroundColor: col, borderColor: col }]}
              onPress={() => setLeaveStatusFilter(k)}>
              <Text style={[s.segTxt, leaveStatusFilter === k && { color: "#fff" }]}>{lbl}</Text>
              {k !== "all" && (
                <View style={{ backgroundColor: leaveStatusFilter === k ? "rgba(255,255,255,0.25)" : col + "20", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4 }}>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: leaveStatusFilter === k ? "#fff" : col }}>
                    {k === "pending" ? pendingCount : k === "approved" ? approvedCount : rejectedCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Employee filter ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 6 }}>
          <TouchableOpacity style={[s.seg, leaveEmpFilter === null && s.segActive]}
            onPress={() => setLeaveEmpFilter(null)}>
            <Text style={[s.segTxt, leaveEmpFilter === null && s.segTxtActive]}>All Staff</Text>
          </TouchableOpacity>
          {employees.filter(e => e.status === "active").map(e => (
            <TouchableOpacity key={e.id}
              style={[s.seg, leaveEmpFilter === e.id && s.segActive]}
              onPress={() => setLeaveEmpFilter(leaveEmpFilter === e.id ? null : e.id)}>
              <Text style={[s.segTxt, leaveEmpFilter === e.id && s.segTxtActive]} numberOfLines={1}>{e.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── List ── */}
        <FlatList
          data={leaves}
          keyExtractor={l => String(l.id)}
          refreshControl={<RefreshControl refreshing={leavesLoading} onRefresh={fetchLeaves} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 8, paddingTop: 4 }}
          ListEmptyComponent={<Text style={s.empty}>{leavesLoading ? "Loading…" : "No leave requests"}</Text>}
          renderItem={({ item: lv }) => {
            const empName = empMap[lv.employeeId] ?? `Employee #${lv.employeeId}`;
            const typeColor = LEAVE_TYPE_COLOR[lv.leaveType] ?? "#6B7280";
            const statusStyle = LEAVE_STATUS_COLOR[lv.status] ?? LEAVE_STATUS_COLOR["pending"]!;
            const canReview = isAdmin || (user?.role === "manager");
            return (
              <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: typeColor }]}>
                <View style={{ flex: 1 }}>
                  {/* Header row */}
                  <View style={[s.cardRow, { marginBottom: 4 }]}>
                    <Text style={s.cardTitle}>{empName}</Text>
                    <View style={[s.badge, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[s.badgeTxt, { color: statusStyle.text }]}>{lv.status}</Text>
                    </View>
                  </View>

                  {/* Leave type pill */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <View style={{ backgroundColor: typeColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: typeColor }}>
                        {LEAVE_TYPE_LABEL[lv.leaveType]}
                      </Text>
                    </View>
                    <Text style={s.cardSub}>
                      {lv.totalDays} day{parseFloat(lv.totalDays) !== 1 ? "s" : ""}
                    </Text>
                  </View>

                  {/* Dates */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Feather name="calendar" size={12} color={colors.textSecondary} />
                    <Text style={s.cardSub}>{lv.startDate} → {lv.endDate}</Text>
                  </View>

                  {/* Reason */}
                  {lv.reason ? (
                    <Text style={[s.cardSub, { fontStyle: "italic" }]} numberOfLines={2}>"{lv.reason}"</Text>
                  ) : null}

                  {/* Review notes */}
                  {lv.reviewNotes ? (
                    <Text style={[s.cardSub, { color: statusStyle.text }]} numberOfLines={2}>
                      {lv.status === "approved" ? "✓" : "✗"} {lv.reviewNotes}
                    </Text>
                  ) : null}

                  {/* Action buttons */}
                  {lv.status === "pending" && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      {canReview && (
                        <>
                          <TouchableOpacity
                            style={{ backgroundColor: "#ECFDF5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}
                            onPress={() => { setReviewModal(lv); setReviewNotes(""); }}>
                            <Feather name="check" size={13} color="#059669" />
                            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#059669" }}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}
                            onPress={() => { setReviewModal(lv); setReviewNotes(""); }}>
                            <Feather name="x" size={13} color="#DC2626" />
                            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#DC2626" }}>Reject</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity
                        style={{ backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}
                        onPress={() => cancelLeave(lv)}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>
    );
  };

  const tabs: { key: Tab; label: string; emoji: string; tint: string; bg: string }[] = [
    { key: "employees",  label: "Employees",  emoji: "👥",  tint: "#2563EB", bg: "#DBEAFE" },
    { key: "attendance", label: "Attendance", emoji: "🧑‍💼", tint: "#D97706", bg: "#FEF3C7" },
    { key: "payroll",    label: "Payroll",    emoji: "💰",  tint: "#CA8A04", bg: "#FEF9C3" },
    { key: "fines",      label: "Fines",      emoji: "⚠️",  tint: "#DC2626", bg: "#FEE2E2" },
    { key: "leaves",     label: "Leaves",     emoji: "🏖️", tint: "#0891B2", bg: "#CFFAFE" },
    { key: "report",     label: "Report",     emoji: "📊",  tint: "#0369A1", bg: "#E0F2FE" },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>HRM</Text>
          <Text style={s.headerSub}>Human Resource Management</Text>
        </View>
        {activeTab === "employees" && (
          <TouchableOpacity style={s.addBtn} onPress={() => openEmpModal()}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {activeTab === "leaves" && (
          <TouchableOpacity style={s.addBtn}
            onPress={() => {
              setLeaveForm({ employeeId: 0, leaveType: "annual", startDate: NOW.toISOString().slice(0, 10), endDate: NOW.toISOString().slice(0, 10), totalDays: "1", reason: "" });
              setShowLeaveModal(true);
            }}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {activeTab === "payroll" && (
          <TouchableOpacity style={s.addBtn} onPress={openPayModal}>
            <Feather name="file-text" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs — horizontal scrollable, colored icons on top, label below */}
      <View style={s.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabBarContent}
        >
          {tabs.map(t => {
            const isActive = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={s.tabItem}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
              >
                <View style={[s.tabIconWrap, { backgroundColor: t.bg, borderColor: isActive ? t.tint : "transparent" }]}>
                  <Text style={s.tabEmoji}>{t.emoji}</Text>
                </View>
                <Text style={[s.tabLabel, { color: isActive ? t.tint : colors.textSecondary, fontFamily: isActive ? "Inter_700Bold" : "Inter_500Medium" }]}>
                  {t.label}
                </Text>
                {isActive && <View style={[s.tabActiveBar, { backgroundColor: t.tint }]} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab content */}
      {activeTab === "employees"  && renderEmployeesTab()}
      {activeTab === "attendance" && renderAttendanceTab()}
      {activeTab === "payroll"    && renderPayrollTab()}
      {activeTab === "fines"      && renderFinesTab()}
      {activeTab === "leaves"     && renderLeavesTab()}
      {activeTab === "report"     && renderReportTab()}

      {/* ─── Add/Edit Employee Modal ─── */}
      <Modal visible={showEmpModal} animationType="slide" transparent onRequestClose={() => setShowEmpModal(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: "90%" }]}>
            <Text style={s.sheetTitle}>{editingEmp ? "Edit Employee" : "Add Employee"}</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Text fields */}
              {([
                { key: "name",       label: "Full Name *",         keyboard: "default"       as const },
                { key: "phone",      label: "Phone",                keyboard: "phone-pad"     as const },
                { key: "email",      label: "Email",                keyboard: "email-address" as const },
                { key: "baseSalary", label: "Base Salary (₨)",      keyboard: "numeric"       as const },
                { key: "joinDate",   label: "Join Date (YYYY-MM-DD)", keyboard: "default"     as const },
              ] as { key: string; label: string; keyboard: "default" | "phone-pad" | "email-address" | "numeric" }[]).map(f => (
                <View key={f.key} style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{f.label}</Text>
                  <TextInput style={s.fieldInput}
                    value={(empForm as unknown as Record<string, string>)[f.key]}
                    onChangeText={v => setEmpForm(p => ({ ...p, [f.key]: v }))}
                    keyboardType={f.keyboard}
                    placeholderTextColor={colors.textSecondary}
                    placeholder={f.label} />
                </View>
              ))}

              {/* Department chips */}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Department</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
                    {DEPARTMENTS.map(d => {
                      const sel = empForm.department === d;
                      return (
                        <TouchableOpacity key={d}
                          style={[s.pill, sel && s.pillActive]}
                          onPress={() => setEmpForm(p => ({ ...p, department: sel ? "" : d }))}>
                          <Text style={[s.pillTxt, sel && s.pillTxtActive]}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Position chips */}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Position</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
                    {POSITIONS.map(p => {
                      const sel = empForm.position === p;
                      return (
                        <TouchableOpacity key={p}
                          style={[s.pill, sel && s.pillActive]}
                          onPress={() => setEmpForm(prev => ({ ...prev, position: sel ? "" : p }))}>
                          <Text style={[s.pillTxt, sel && s.pillTxtActive]}>{p}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Payment Method chips */}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Payment Method</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {PAYMENT_METHODS.map(pm => {
                    const sel = empForm.paymentMethod === pm;
                    const icon = pm === "Cash" ? "dollar-sign" : pm === "Bank Transfer" ? "credit-card" : pm === "Cheque" ? "file-text" : "smartphone";
                    return (
                      <TouchableOpacity key={pm}
                        style={[s.pill, sel && { backgroundColor: colors.primary, borderColor: colors.primary }, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                        onPress={() => setEmpForm(prev => ({ ...prev, paymentMethod: sel ? "" : pm }))}>
                        <Feather name={icon as any} size={12} color={sel ? "#fff" : colors.textSecondary} />
                        <Text style={[s.pillTxt, sel && s.pillTxtActive]}>{pm}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Location chips (admin only, if locations exist) */}
              {isAdmin && locations.length > 0 && (
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Location</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
                      {/* "App-wide" option */}
                      <TouchableOpacity
                        style={[s.pill, empForm.locationId === null && s.pillActive, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                        onPress={() => setEmpForm(p => ({ ...p, locationId: null }))}>
                        <Feather name="globe" size={12} color={empForm.locationId === null ? "#fff" : colors.textSecondary} />
                        <Text style={[s.pillTxt, empForm.locationId === null && s.pillTxtActive]}>App-wide</Text>
                      </TouchableOpacity>
                      {locations.map(loc => {
                        const sel = empForm.locationId === loc.id;
                        return (
                          <TouchableOpacity key={loc.id}
                            style={[s.pill, sel && s.pillActive, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                            onPress={() => setEmpForm(p => ({ ...p, locationId: sel ? null : loc.id }))}>
                            <Feather name="map-pin" size={12} color={sel ? "#fff" : colors.textSecondary} />
                            <Text style={[s.pillTxt, sel && s.pillTxtActive]}>{loc.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Status */}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Status</Text>
                <View style={s.segRow}>
                  {(["active","inactive"] as EmpStatus[]).map(st => (
                    <TouchableOpacity key={st} style={[s.seg, empForm.status === st && s.segActive]} onPress={() => setEmpForm(p => ({ ...p, status: st }))}>
                      <Text style={[s.segTxt, empForm.status === st && s.segTxtActive]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

            </ScrollView>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEmpModal(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={saveEmployee}><Text style={s.confirmTxt}>{editingEmp ? "Update" : "Add"}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Fine / Bonus Modal ─── */}
      <Modal visible={showFbModal} animationType="slide" transparent onRequestClose={() => setShowFbModal(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.cardRow}>
              <Text style={s.sheetTitle}>{fbMode === "fine" ? "Add Fine" : "Add Bonus"}</Text>
              <View style={s.segRow}>
                <TouchableOpacity style={[s.seg, fbMode === "fine" && { backgroundColor: "#FEE2E2" }]} onPress={() => setFbMode("fine")}>
                  <Text style={[s.segTxt, fbMode === "fine" && { color: "#DC2626" }]}>Fine</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.seg, fbMode === "bonus" && { backgroundColor: "#DCFCE7" }]} onPress={() => setFbMode("bonus")}>
                  <Text style={[s.segTxt, fbMode === "bonus" && { color: "#059669" }]}>Bonus</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Employee picker */}
            <Text style={s.fieldLabel}>Employee</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {employees.filter(e => e.status === "active").map(e => (
                <TouchableOpacity key={e.id} style={[s.pill, fbEmployee === e.id && s.pillActive]} onPress={() => setFbEmployee(e.id)}>
                  <Text style={[s.pillTxt, fbEmployee === e.id && s.pillTxtActive]}>{e.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {[
              { key: "amount", label: "Amount (₨)", keyboard: "numeric" as const },
              { key: "reason", label: "Reason",     keyboard: "default" as const },
              { key: "date",   label: "Date (YYYY-MM-DD)", keyboard: "default" as const },
            ].map(f => (
              <View key={f.key} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput style={s.fieldInput} value={(fbForm as any)[f.key]}
                  onChangeText={v => setFbForm(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.keyboard} placeholderTextColor={colors.textSecondary} placeholder={f.label} />
              </View>
            ))}
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowFbModal(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: fbMode === "fine" ? "#DC2626" : "#059669" }]} onPress={saveFineOrBonus}>
                <Text style={s.confirmTxt}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Apply Leave Modal ─── */}
      <Modal visible={showLeaveModal} animationType="slide" transparent onRequestClose={() => setShowLeaveModal(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Apply Leave</Text>

            <Text style={s.fieldLabel}>Employee *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {employees.filter(e => e.status === "active").map(e => {
                  const sel = leaveForm.employeeId === e.id;
                  return (
                    <TouchableOpacity key={e.id} style={[s.pill, sel && s.pillActive]}
                      onPress={() => setLeaveForm(p => ({ ...p, employeeId: e.id }))}>
                      <Text style={[s.pillTxt, sel && s.pillTxtActive]}>{e.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Leave Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {LEAVE_TYPES.map(lt => {
                  const sel = leaveForm.leaveType === lt;
                  const col = LEAVE_TYPE_COLOR[lt];
                  return (
                    <TouchableOpacity key={lt}
                      style={[s.pill, sel && { backgroundColor: col, borderColor: col }]}
                      onPress={() => setLeaveForm(p => ({ ...p, leaveType: lt }))}>
                      <Text style={[s.pillTxt, sel && { color: "#fff" }]}>{LEAVE_TYPE_LABEL[lt]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {([
              { key: "startDate", label: "Start Date (YYYY-MM-DD) *" },
              { key: "endDate",   label: "End Date (YYYY-MM-DD) *" },
              { key: "totalDays", label: "Total Days" },
              { key: "reason",    label: "Reason (optional)" },
            ] as { key: string; label: string }[]).map(f => (
              <View key={f.key} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput style={s.fieldInput}
                  value={(leaveForm as unknown as Record<string, string>)[f.key]}
                  onChangeText={v => setLeaveForm(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.key === "totalDays" ? "numeric" : "default"}
                  placeholder={f.label}
                  placeholderTextColor={colors.textSecondary} />
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowLeaveModal(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={submitLeave}>
                <Text style={s.confirmTxt}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Review Leave Modal ─── */}
      <Modal visible={!!reviewModal} animationType="slide" transparent onRequestClose={() => setReviewModal(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Review Leave Request</Text>
            {reviewModal && (
              <>
                <Text style={[s.fieldLabel, { marginBottom: 4 }]}>
                  {employees.find(e => e.id === reviewModal.employeeId)?.name ?? `#${reviewModal.employeeId}`}
                </Text>
                <Text style={[s.cardSub, { marginBottom: 8 }]}>
                  {LEAVE_TYPE_LABEL[reviewModal.leaveType]} · {reviewModal.totalDays} day(s){"\n"}
                  {reviewModal.startDate} → {reviewModal.endDate}
                </Text>
                {reviewModal.reason ? (
                  <Text style={[s.cardSub, { marginBottom: 12, fontStyle: "italic" }]}>"{reviewModal.reason}"</Text>
                ) : null}

                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Review Notes (optional)</Text>
                  <TextInput style={[s.fieldInput, { height: 64 }]}
                    multiline value={reviewNotes}
                    onChangeText={setReviewNotes}
                    placeholder="Add notes..."
                    placeholderTextColor={colors.textSecondary} />
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[s.confirmBtn, { flex: 1, backgroundColor: "#DC2626" }]}
                    onPress={() => reviewLeave(reviewModal, "rejected")}>
                    <Text style={s.confirmTxt}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, { flex: 1, backgroundColor: "#059669" }]}
                    onPress={() => reviewLeave(reviewModal, "approved")}>
                    <Text style={s.confirmTxt}>Approve</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[s.cancelBtn, { marginTop: 8 }]}
                  onPress={() => setReviewModal(null)}>
                  <Text style={s.cancelTxt}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Generate Payroll Modal ─── */}
      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={() => setShowPayModal(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Generate Payroll</Text>
            <Text style={s.fieldLabel}>Select Employee</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {employees.filter(e => e.status === "active").map(e => (
                <TouchableOpacity key={e.id} style={[s.pill, payForm.employeeId === e.id && s.pillActive]} onPress={() => setPayForm(p => ({ ...p, employeeId: e.id }))}>
                  <Text style={[s.pillTxt, payForm.employeeId === e.id && s.pillTxtActive]}>{e.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.rowGap}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Month</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {ALL_MONTHS.map(m => (
                    <TouchableOpacity key={m.value} style={[s.pill, payForm.month === m.value && s.pillActive]} onPress={() => setPayForm(p => ({ ...p, month: m.value }))}>
                      <Text style={[s.pillTxt, payForm.month === m.value && s.pillTxtActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ width: 72 }}>
                <Text style={s.fieldLabel}>Year</Text>
                <TextInput style={s.fieldInput} value={String(payForm.year)} onChangeText={t => setPayForm(p => ({ ...p, year: parseInt(t) || NOW.getFullYear() }))} keyboardType="number-pad" />
              </View>
            </View>
            {[
              { key: "workingDays",    label: "Working Days (default 26)", keyboard: "numeric" as const },
              { key: "overtimeHours",  label: "Overtime Hours",            keyboard: "numeric" as const },
              { key: "overtimeRate",   label: "OT Rate per Hour (₨)",      keyboard: "numeric" as const },
              { key: "notes",          label: "Notes",                     keyboard: "default" as const },
            ].map(f => (
              <View key={f.key} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput style={s.fieldInput} value={(payForm as any)[f.key]}
                  onChangeText={v => setPayForm(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.keyboard} placeholderTextColor={colors.textSecondary} placeholder={f.label} />
              </View>
            ))}
            {payForm.employeeId > 0 && (
              <Text style={[s.cardSub, { marginBottom: 8 }]}>
                Base salary: {PKR(parseFloat(employees.find(e => e.id === payForm.employeeId)?.baseSalary ?? "0"))} · Attendance, fines & bonuses will be auto-applied
              </Text>
            )}
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPayModal(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, generating && { opacity: 0.6 }]} onPress={generatePayroll} disabled={generating}>
                {generating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.confirmTxt}>Generate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={{ backgroundColor: color + "12", borderRadius: 12, padding: 12, flex: 1, minWidth: "46%", margin: 4 }}>
      <Feather name={icon as any} size={18} color={color} />
      <Text style={{ color, fontSize: 16, fontWeight: "700", marginTop: 4 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  header:        { flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle:   { color: "#fff", fontSize: 20, fontWeight: "700" },
  headerSub:     { color: "#DDD6FE", fontSize: 12 },
  backBtn:       { marginRight: 12 },
  addBtn:        { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, padding: 8 },
  tabBar:        { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4, gap: 2, alignItems: "flex-end" },
  tabItem:       { alignItems: "center", paddingHorizontal: 10, paddingTop: 4, minWidth: 72, position: "relative" },
  tabIconWrap:   { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, marginBottom: 6 },
  tabEmoji:      { fontSize: 22 },
  tabLabel:      { fontSize: 11, marginBottom: 8 },
  tabActiveBar:  { position: "absolute", left: 12, right: 12, bottom: 0, height: 3, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  filterRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 8 },
  searchBox:     { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 6, borderWidth: 1, borderColor: colors.border },
  searchInput:   { flex: 1, fontSize: 14, color: colors.text },
  segRow:        { flexDirection: "row", backgroundColor: colors.background, borderRadius: 8, padding: 2, gap: 2 },
  seg:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  segActive:     { backgroundColor: colors.primary },
  segTxt:        { fontSize: 12, color: colors.textSecondary },
  segTxtActive:  { color: "#fff", fontWeight: "600" },
  hScroll:       { borderBottomWidth: 1, borderBottomColor: colors.border },
  hScrollContent:{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: "row", alignItems: "center" },
  pill:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  pillActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  pillTxt:       { fontSize: 12, color: colors.textSecondary },
  pillTxtActive: { color: "#fff", fontWeight: "600" },
  card:          { flexDirection: "row", backgroundColor: colors.card, borderRadius: 14, marginBottom: 10, marginTop: 2, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardAccent:    { width: 4 },
  cardRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  cardTitle:     { fontSize: 15, fontWeight: "700", color: colors.text, flex: 1, marginRight: 8 },
  cardSub:       { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  amount:        { fontSize: 15, fontWeight: "700", color: colors.primary },
  badge:         { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeTxt:      { fontSize: 11, fontWeight: "600" },
  cardActions:   { justifyContent: "center", gap: 8, paddingRight: 12 },
  iconBtn:       { padding: 6, borderRadius: 8, backgroundColor: colors.background },
  empty:         { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
  label:         { fontSize: 13, color: colors.textSecondary },
  input:         { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  refreshBtn:    { padding: 8, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  sectionTitle:  { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 12, marginBottom: 6 },
  statsGrid:     { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 8 },
  attSummaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  attSummaryCard:{ flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  attSummaryNum: { fontSize: 24, fontWeight: "800" },
  attSummaryLbl: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  quickMarkBox:  { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  quickRow:      { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  quickName:     { width: 80, fontSize: 12, color: colors.text, fontWeight: "600" },
  quickBtn:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.background, marginRight: 4, borderWidth: 1, borderColor: colors.border },
  quickBtnTxt:   { fontSize: 11, color: colors.textSecondary },
  fbBox:         { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  fbRow:         { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  fbDot:         { width: 8, height: 8, borderRadius: 4 },
  fbName:        { fontSize: 13, fontWeight: "600", color: colors.text },
  fbSub:         { fontSize: 11, color: colors.textSecondary },
  payBreakdown:  { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  payItem:       { fontSize: 11, color: colors.textSecondary },
  payBtn:        { alignSelf: "center", backgroundColor: "#059669", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 12 },
  payBtnTxt:     { color: "#fff", fontWeight: "700", fontSize: 13 },
  miniBtn:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  miniBtnTxt:    { fontSize: 12, fontWeight: "700" },
  rowGap:        { flexDirection: "row", gap: 8, alignItems: "center" },
  reportRow:     { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  reportName:    { fontSize: 14, fontWeight: "600", color: colors.text },
  exportBtn:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12, padding: 14, justifyContent: "center", marginTop: 16 },
  exportBtnTxt:  { color: "#fff", fontWeight: "700", fontSize: 15 },
  overlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:         { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetTitle:    { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 16 },
  sheetActions:  { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn:     { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelTxt:     { color: colors.textSecondary, fontWeight: "600" },
  confirmBtn:    { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmTxt:    { color: "#fff", fontWeight: "700", fontSize: 15 },
  fieldRow:      { marginBottom: 12 },
  fieldLabel:    { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  fieldInput:    { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
});

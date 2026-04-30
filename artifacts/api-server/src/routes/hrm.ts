import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db, employeesTable, attendanceTable, payrollTable,
  employeeFinesTable, employeeBonusesTable, leaveRequestsTable,
  salesTable, targetsTable, usersTable, locationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

/* ───────────────────────── EMPLOYEES ────────────────────────────────────── */

router.get("/hrm/employees", requireAuth, async (req, res): Promise<void> => {
  const rows = !isAdmin(req) && req.userLocationId != null
    ? await db.select().from(employeesTable).where(eq(employeesTable.locationId, req.userLocationId)).orderBy(employeesTable.name)
    : await db.select().from(employeesTable).orderBy(employeesTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/hrm/employees", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email, address, position, department, baseSalary, joinDate, locationId, paymentMethod } = req.body as {
    name?: string; phone?: string; email?: string; address?: string;
    position?: string; department?: string; baseSalary?: string;
    joinDate?: string; locationId?: number; paymentMethod?: string;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);
  const [row] = await db.insert(employeesTable).values({
    name, phone: phone ?? null, email: email ?? null, address: address ?? null,
    position: position ?? null, department: department ?? null,
    baseSalary: baseSalary ?? "0.00", joinDate: joinDate ?? null,
    paymentMethod: paymentMethod ?? null,
    locationId: effectiveLocationId,
  }).returning();
  await logAudit(req.userId, "create", "employee", row!.id, name);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/hrm/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const updates: Record<string, unknown> = {};
  const fields = ["name", "phone", "email", "address", "position", "department", "baseSalary", "joinDate", "status", "locationId", "paymentMethod"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f === "baseSalary" ? "baseSalary" : f] = req.body[f];
  if (req.body.baseSalary !== undefined) updates.baseSalary = String(req.body.baseSalary);
  const [row] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/hrm/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  await db.delete(attendanceTable).where(eq(attendanceTable.employeeId, id));
  await db.delete(employeeFinesTable).where(eq(employeeFinesTable.employeeId, id));
  await db.delete(employeeBonusesTable).where(eq(employeeBonusesTable.employeeId, id));
  await db.delete(payrollTable).where(eq(payrollTable.employeeId, id));
  const [row] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

/* ───────────────────────── ATTENDANCE ───────────────────────────────────── */

router.get("/hrm/attendance", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, date, month, year } = req.query as {
    employeeId?: string; date?: string; month?: string; year?: string;
  };
  let rows = !isAdmin(req) && req.userLocationId != null
    ? await db.select().from(attendanceTable).where(eq(attendanceTable.locationId, req.userLocationId)).orderBy(desc(attendanceTable.date))
    : await db.select().from(attendanceTable).orderBy(desc(attendanceTable.date));

  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  if (date) rows = rows.filter(r => r.date === date);
  if (month && year) rows = rows.filter(r => {
    const d = new Date(r.date);
    return d.getMonth() + 1 === parseInt(month) && d.getFullYear() === parseInt(year);
  });
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/hrm/attendance", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, date, status, checkIn, checkOut, notes, locationId } = req.body as {
    employeeId: number; date: string; status: string;
    checkIn?: string; checkOut?: string; notes?: string; locationId?: number;
  };
  if (!employeeId || !date || !status) { res.status(400).json({ error: "employeeId, date, status required" }); return; }

  // Upsert — update if same employee+date exists
  const existing = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), eq(attendanceTable.date, date)));

  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);

  if (existing.length > 0) {
    const [row] = await db.update(attendanceTable).set({
      status, checkIn: checkIn ?? null, checkOut: checkOut ?? null, notes: notes ?? null,
      markedBy: req.userId,
    }).where(eq(attendanceTable.id, existing[0]!.id)).returning();
    res.json({ ...row!, createdAt: row!.createdAt.toISOString() });
  } else {
    const [row] = await db.insert(attendanceTable).values({
      employeeId, date, status, checkIn: checkIn ?? null, checkOut: checkOut ?? null,
      notes: notes ?? null, markedBy: req.userId, locationId: effectiveLocationId,
    }).returning();
    res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
  }
});

/* ─────────────────────── FINES ──────────────────────────────────────────── */

router.get("/hrm/fines", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.query as { employeeId?: string };
  let rows = await db.select().from(employeeFinesTable).orderBy(desc(employeeFinesTable.createdAt));
  if (!isAdmin(req) && req.userLocationId != null) rows = rows.filter(r => r.locationId === req.userLocationId);
  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/hrm/fines", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, amount, reason, date, locationId } = req.body as {
    employeeId: number; amount: string; reason: string; date: string; locationId?: number;
  };
  if (!employeeId || !amount || !reason || !date) { res.status(400).json({ error: "employeeId, amount, reason, date required" }); return; }
  const fineAmt = parseFloat(amount);
  if (isNaN(fineAmt) || fineAmt <= 0) {
    res.status(422).json({ error: "Fine amount must be greater than zero." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    res.status(422).json({ error: `Invalid date "${date}". Use YYYY-MM-DD format.` });
    return;
  }
  const [empCheck] = await db.select({ id: employeesTable.id, name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!empCheck) { res.status(404).json({ error: "Employee not found." }); return; }
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);
  const [row] = await db.insert(employeeFinesTable).values({
    employeeId, amount: fineAmt.toFixed(2), reason, date, locationId: effectiveLocationId,
  }).returning();
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.delete("/hrm/fines/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  await db.delete(employeeFinesTable).where(eq(employeeFinesTable.id, id));
  res.sendStatus(204);
});

/* ─────────────────────── BONUSES ────────────────────────────────────────── */

router.get("/hrm/bonuses", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.query as { employeeId?: string };
  let rows = await db.select().from(employeeBonusesTable).orderBy(desc(employeeBonusesTable.createdAt));
  if (!isAdmin(req) && req.userLocationId != null) rows = rows.filter(r => r.locationId === req.userLocationId);
  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/hrm/bonuses", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, amount, reason, date, locationId } = req.body as {
    employeeId: number; amount: string; reason: string; date: string; locationId?: number;
  };
  if (!employeeId || !amount || !reason || !date) { res.status(400).json({ error: "employeeId, amount, reason, date required" }); return; }
  const bonusAmt = parseFloat(amount);
  if (isNaN(bonusAmt) || bonusAmt <= 0) {
    res.status(422).json({ error: "Bonus amount must be greater than zero." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    res.status(422).json({ error: `Invalid date "${date}". Use YYYY-MM-DD format.` });
    return;
  }
  const [empCheckB] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!empCheckB) { res.status(404).json({ error: "Employee not found." }); return; }
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);
  const [row] = await db.insert(employeeBonusesTable).values({
    employeeId, amount: bonusAmt.toFixed(2), reason, date, locationId: effectiveLocationId,
  }).returning();
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.delete("/hrm/bonuses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  await db.delete(employeeBonusesTable).where(eq(employeeBonusesTable.id, id));
  res.sendStatus(204);
});

/* ─────────────────────── PAYROLL ────────────────────────────────────────── */

router.get("/hrm/payroll", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, month, year } = req.query as { employeeId?: string; month?: string; year?: string };
  let rows = !isAdmin(req) && req.userLocationId != null
    ? await db.select().from(payrollTable).where(eq(payrollTable.locationId, req.userLocationId)).orderBy(desc(payrollTable.createdAt))
    : await db.select().from(payrollTable).orderBy(desc(payrollTable.createdAt));
  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  if (month) rows = rows.filter(r => r.month === parseInt(month));
  if (year) rows = rows.filter(r => r.year === parseInt(year));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/hrm/payroll/generate", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, month, year, workingDays, overtimeHours, overtimeRate, notes, locationId } = req.body as {
    employeeId: number; month: number; year: number; workingDays?: number;
    overtimeHours?: string; overtimeRate?: string; notes?: string; locationId?: number;
  };
  if (!employeeId || !month || !year) { res.status(400).json({ error: "employeeId, month, year required" }); return; }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(422).json({ error: `Month must be between 1 and 12 (got ${month}).` });
    return;
  }
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
    res.status(422).json({ error: `Year must be between 2000 and ${currentYear + 1} (got ${year}).` });
    return;
  }
  if (workingDays !== undefined && (workingDays <= 0 || workingDays > 31)) {
    res.status(422).json({ error: `Working days must be between 1 and 31 (got ${workingDays}).` });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employee not found." }); return; }

  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? emp.locationId ?? null);

  // Count attendance for the month
  const monthStr = String(month).padStart(2, "0");
  const allAttendance = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.employeeId, employeeId));
  const monthAttendance = allAttendance.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  const presentDays = monthAttendance.filter(a => a.status === "present").length;
  const halfDays    = monthAttendance.filter(a => a.status === "half_day").length;
  const wDays       = workingDays ?? 26;
  const base        = parseFloat(emp.baseSalary);
  const perDay      = base / wDays;
  const effectiveDays = presentDays + halfDays * 0.5;
  const grossSalary = perDay * effectiveDays;

  // Sum pending fines/bonuses
  const allFines = await db.select().from(employeeFinesTable).where(eq(employeeFinesTable.employeeId, employeeId));
  const pendingFines = allFines.filter(f => !f.payrollId && f.date.startsWith(`${year}-${monthStr}`));
  const fineTotal = pendingFines.reduce((s, f) => s + parseFloat(f.amount), 0);

  const allBonuses = await db.select().from(employeeBonusesTable).where(eq(employeeBonusesTable.employeeId, employeeId));
  const pendingBonuses = allBonuses.filter(b => !b.payrollId && b.date.startsWith(`${year}-${monthStr}`));
  const bonusTotal = pendingBonuses.reduce((s, b) => s + parseFloat(b.amount), 0);

  const otHours = parseFloat(overtimeHours ?? "0");
  const otRate  = parseFloat(overtimeRate ?? "0");
  const otPay   = otHours * otRate;
  const netSalary = Math.max(0, grossSalary + bonusTotal + otPay - fineTotal);

  // Check if payroll for this month/employee already exists
  const existing = await db.select().from(payrollTable)
    .where(and(eq(payrollTable.employeeId, employeeId), eq(payrollTable.month, month), eq(payrollTable.year, year)));

  let row;
  if (existing.length > 0) {
    [row] = await db.update(payrollTable).set({
      baseSalary: base.toFixed(2), workingDays: wDays, presentDays, halfDays,
      overtimeHours: otHours.toFixed(2), overtimeRate: otRate.toFixed(2),
      grossSalary: grossSalary.toFixed(2), bonusTotal: bonusTotal.toFixed(2),
      fineTotal: fineTotal.toFixed(2), netSalary: netSalary.toFixed(2),
      notes: notes ?? null,
    }).where(eq(payrollTable.id, existing[0]!.id)).returning();
  } else {
    [row] = await db.insert(payrollTable).values({
      employeeId, month, year, baseSalary: base.toFixed(2),
      workingDays: wDays, presentDays, halfDays,
      overtimeHours: otHours.toFixed(2), overtimeRate: otRate.toFixed(2),
      grossSalary: grossSalary.toFixed(2), bonusTotal: bonusTotal.toFixed(2),
      fineTotal: fineTotal.toFixed(2), deductions: "0.00",
      netSalary: netSalary.toFixed(2), status: "pending",
      locationId: effectiveLocationId, notes: notes ?? null,
    }).returning();
  }

  // Link fines and bonuses to this payroll
  for (const f of pendingFines) await db.update(employeeFinesTable).set({ payrollId: row!.id }).where(eq(employeeFinesTable.id, f.id));
  for (const b of pendingBonuses) await db.update(employeeBonusesTable).set({ payrollId: row!.id }).where(eq(employeeBonusesTable.id, b.id));

  res.status(201).json({ ...row!, employeeName: emp.name, createdAt: row!.createdAt.toISOString() });
});

router.patch("/hrm/payroll/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.update(payrollTable).set({ status: "paid", paidAt: today }).where(eq(payrollTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

/* ─────────────────────── HRM REPORT ─────────────────────────────────────── */

router.get("/hrm/report", requireAuth, async (req, res): Promise<void> => {
  const { month, year, locationId } = req.query as { month?: string; year?: string; locationId?: string };

  let employees = !isAdmin(req) && req.userLocationId != null
    ? await db.select().from(employeesTable).where(eq(employeesTable.locationId, req.userLocationId))
    : locationId
      ? await db.select().from(employeesTable).where(eq(employeesTable.locationId, parseInt(locationId)))
      : await db.select().from(employeesTable);

  const activeEmps = employees.filter(e => e.status === "active");
  const empIds = activeEmps.map(e => e.id);

  const allPayroll    = (await db.select().from(payrollTable).orderBy(desc(payrollTable.createdAt)));
  const allFines      = await db.select().from(employeeFinesTable);
  const allBonuses    = await db.select().from(employeeBonusesTable);
  const allAttendance = await db.select().from(attendanceTable).orderBy(desc(attendanceTable.date));

  const filteredPayroll  = allPayroll.filter(p => empIds.includes(p.employeeId) && (!month || p.month === parseInt(month)) && (!year || p.year === parseInt(year)));
  const filteredFines    = allFines.filter(f => empIds.includes(f.employeeId));
  const filteredBonuses  = allBonuses.filter(b => empIds.includes(b.employeeId));

  const totalSalaryPaid  = filteredPayroll.filter(p => p.status === "paid").reduce((s, p) => s + parseFloat(p.netSalary), 0);
  const totalSalaryDue   = filteredPayroll.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.netSalary), 0);
  const totalFines       = filteredFines.reduce((s, f) => s + parseFloat(f.amount), 0);
  const totalBonuses     = filteredBonuses.reduce((s, b) => s + parseFloat(b.amount), 0);

  const presentCount = allAttendance.filter(a => empIds.includes(a.employeeId) && a.status === "present").length;
  const absentCount  = allAttendance.filter(a => empIds.includes(a.employeeId) && a.status === "absent").length;
  const lateCount    = allAttendance.filter(a => empIds.includes(a.employeeId) && a.status === "late").length;

  res.json({
    summary: {
      totalEmployees: activeEmps.length,
      totalSalaryPaid,
      totalSalaryDue,
      totalFines,
      totalBonuses,
      presentCount,
      absentCount,
      lateCount,
    },
    employees: activeEmps.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })),
    payroll: filteredPayroll.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    fines: filteredFines.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })),
    bonuses: filteredBonuses.map(b => ({ ...b, createdAt: b.createdAt.toISOString() })),
  });
});

/* ─────────────── SALES PERFORMANCE  (per-employee + per-app) ─────────────
 * Returns a comprehensive sales view scoped to a date window. Used by the
 * HRM "Sales Performance" report tab.
 *
 * Query params:
 *   period = daily | weekly | monthly      (default: monthly)
 *   date   = YYYY-MM-DD                    (anchor date, default: today)
 *
 * Window resolution:
 *   daily   → that single date
 *   weekly  → Mon..Sun containing the anchor date
 *   monthly → 1st..last day of the anchor's month
 * ────────────────────────────────────────────────────────────────────────── */
router.get("/hrm/sales-performance", requireAuth, async (req, res): Promise<void> => {
  const period = (req.query["period"] as string) || "monthly";
  const dateStr = (req.query["date"] as string) || new Date().toISOString().slice(0, 10);

  const anchor = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(anchor.getTime())) { res.status(400).json({ error: "Invalid date" }); return; }

  let startDate: string;
  let endDate: string;
  if (period === "daily") {
    startDate = endDate = dateStr;
  } else if (period === "weekly") {
    // ISO week: Monday-start
    const d = new Date(anchor);
    const day = d.getUTCDay();           // 0=Sun..6=Sat
    const diffToMon = (day + 6) % 7;     // shift so Mon=0
    d.setUTCDate(d.getUTCDate() - diffToMon);
    startDate = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    endDate = d.toISOString().slice(0, 10);
  } else {
    // monthly
    const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth();
    startDate = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    endDate   = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  }

  // Sales in window (location-scoped for non-admin)
  const baseConditions = [
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') >= ${startDate}::date`,
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') <= ${endDate}::date`,
    eq(salesTable.status, "completed"),
  ];
  if (!isAdmin(req) && req.userLocationId != null) {
    baseConditions.push(eq(salesTable.locationId, req.userLocationId));
  }

  const sales = await db.select().from(salesTable).where(and(...baseConditions));

  // Resolve users → employee mapping (sales.userId -> users -> employee by name match)
  // The codebase keeps users (login accounts) and employees (HR records) as
  // separate tables — sales link to userId, so we group by userId here.
  const userIds = Array.from(new Set(sales.map(s => s.userId).filter((x): x is number => x != null)));
  const users = userIds.length
    ? await db.select().from(usersTable)
    : [];
  const userMap: Record<number, { id: number; name: string; username: string }> = {};
  for (const u of users) userMap[u.id] = { id: u.id, name: u.name ?? u.username, username: u.username };

  // Per-user (salesperson) totals
  const byUser: Record<number, { userId: number; name: string; username: string; salesCount: number; salesTotal: number }> = {};
  for (const s of sales) {
    if (s.userId == null) continue;
    const u = userMap[s.userId];
    if (!byUser[s.userId]) {
      byUser[s.userId] = {
        userId: s.userId,
        name: u?.name ?? `User #${s.userId}`,
        username: u?.username ?? "",
        salesCount: 0,
        salesTotal: 0,
      };
    }
    byUser[s.userId].salesCount += 1;
    byUser[s.userId].salesTotal += parseFloat(s.total);
  }

  // Per-location (app) totals
  const locations = await db.select().from(locationsTable);
  const locMap: Record<number, string> = {};
  for (const l of locations) locMap[l.id] = l.name;

  const byApp: Record<number, { locationId: number; name: string; salesCount: number; salesTotal: number }> = {};
  for (const s of sales) {
    if (s.locationId == null) continue;
    if (!byApp[s.locationId]) {
      byApp[s.locationId] = {
        locationId: s.locationId,
        name: locMap[s.locationId] ?? `App #${s.locationId}`,
        salesCount: 0,
        salesTotal: 0,
      };
    }
    byApp[s.locationId].salesCount += 1;
    byApp[s.locationId].salesTotal += parseFloat(s.total);
  }

  // Targets that fall in the window — used to count achievements & list pending verifications.
  // Non-admin users can only see targets at their own location (or location-less ones).
  const allTargets = await db.select().from(targetsTable);
  const scopeTargets = (!isAdmin(req) && req.userLocationId != null)
    ? allTargets.filter(t => t.locationId == null || t.locationId === req.userLocationId)
    : allTargets;
  const windowTargets = scopeTargets.filter(t =>
    // any overlap with window
    t.startDate <= endDate && t.endDate >= startDate
  );

  const totals = {
    salesCount: sales.length,
    salesTotal: sales.reduce((sum, s) => sum + parseFloat(s.total), 0),
    targetsAchieved: windowTargets.filter(t => t.status === "achieved" || t.status === "done").length,
    targetsMissed:   windowTargets.filter(t => t.status === "missed").length,
    targetsActive:   windowTargets.filter(t => t.status === "active").length,
    pendingVerify:   windowTargets.filter(t => t.status === "achieved" && !t.verifiedAt).length,
  };

  res.json({
    period,
    startDate,
    endDate,
    totals,
    byUser:   Object.values(byUser).sort((a, b) => b.salesTotal - a.salesTotal),
    byApp:    Object.values(byApp).sort((a, b) => b.salesTotal - a.salesTotal),
    targets:  windowTargets.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), verifiedAt: t.verifiedAt?.toISOString() ?? null })),
  });
});

/* ─────────────── EMPLOYEE BADGES — verified-sale tier per employee ───────
 * Returns per-employee aggregate stats used to render achievement badges
 * in HRM. Tiers are based on lifetime VERIFIED target achievements.
 *
 *   bronze   →  1+
 *   silver   →  5+
 *   gold     → 15+
 *   platinum → 30+
 * ────────────────────────────────────────────────────────────────────────── */
router.get("/hrm/employee-badges", requireAuth, async (req, res): Promise<void> => {
  // Restrict to the user's location for non-admin/manager — same scoping rule
  // used by /hrm/employees so the badges always agree with what they can see.
  const scopeByLocation = !isAdmin(req) && req.userLocationId != null;

  // Pre-fetch the visible employee set so we never expose IDs from other locations,
  // even via bonuses that happen to be tagged with another locationId.
  const visibleEmployees = scopeByLocation
    ? await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.locationId, req.userLocationId!))
    : await db.select({ id: employeesTable.id }).from(employeesTable);
  const visibleEmpIds = new Set(visibleEmployees.map(e => e.id));

  const allTargets = await db.select().from(targetsTable);
  const allBonuses = await db.select().from(employeeBonusesTable);

  const targets = scopeByLocation
    ? allTargets.filter(t => t.locationId == null || t.locationId === req.userLocationId)
    : allTargets;
  const bonuses = scopeByLocation
    ? allBonuses.filter(b => b.locationId == null || b.locationId === req.userLocationId)
    : allBonuses;

  const out: Record<number, {
    verifiedCount: number;
    pendingCount: number;
    challengeCount: number;
    totalBonusEarned: number;
    tier: "none" | "bronze" | "silver" | "gold" | "platinum";
  }> = {};

  const tierFor = (n: number): "none" | "bronze" | "silver" | "gold" | "platinum" => {
    if (n >= 30) return "platinum";
    if (n >= 15) return "gold";
    if (n >= 5)  return "silver";
    if (n >= 1)  return "bronze";
    return "none";
  };

  // Initialize from targets (skip employees we're not allowed to see)
  for (const t of targets) {
    if (!t.employeeId) continue;
    if (!visibleEmpIds.has(t.employeeId)) continue;
    if (!out[t.employeeId]) {
      out[t.employeeId] = { verifiedCount: 0, pendingCount: 0, challengeCount: 0, totalBonusEarned: 0, tier: "none" };
    }
    if (t.status === "done" && t.verifiedAt) {
      out[t.employeeId].verifiedCount += 1;
      if (t.isChallenge) out[t.employeeId].challengeCount += 1;
    } else if (t.status === "achieved" && !t.verifiedAt) {
      out[t.employeeId].pendingCount += 1;
    }
  }

  // Sum bonuses earned (any source — covers historical "auto-bonus" rows that
  // pre-date the verification gate, plus current verified rows).
  for (const b of bonuses) {
    if (!visibleEmpIds.has(b.employeeId)) continue;
    if (!out[b.employeeId]) {
      out[b.employeeId] = { verifiedCount: 0, pendingCount: 0, challengeCount: 0, totalBonusEarned: 0, tier: "none" };
    }
    out[b.employeeId].totalBonusEarned += parseFloat(b.amount);
  }

  // Compute final tier
  for (const empId of Object.keys(out)) {
    const e = out[parseInt(empId)]!;
    e.tier = tierFor(e.verifiedCount);
  }

  res.json(out);
});

/* ───────────────────────── LEAVE REQUESTS ───────────────────────────────── */

router.get("/hrm/leave", requireAuth, async (req, res): Promise<void> => {
  const empId = req.query["employeeId"] ? parseInt(String(req.query["employeeId"]), 10) : null;
  const status = req.query["status"] as string | undefined;

  let rows = await db.select().from(leaveRequestsTable).orderBy(desc(leaveRequestsTable.createdAt));

  if (!isAdmin(req) && req.userLocationId != null)
    rows = rows.filter(r => r.locationId === req.userLocationId);
  if (empId) rows = rows.filter(r => r.employeeId === empId);
  if (status && status !== "all") rows = rows.filter(r => r.status === status);

  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
});

router.post("/hrm/leave", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, leaveType, startDate, endDate, totalDays, reason, locationId } = req.body as {
    employeeId?: number; leaveType?: string; startDate?: string; endDate?: string;
    totalDays?: string; reason?: string; locationId?: number;
  };

  if (!employeeId || !startDate || !endDate) {
    res.status(400).json({ error: "employeeId, startDate, endDate are required" }); return;
  }

  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId : (locationId ?? null);

  const [row] = await db.insert(leaveRequestsTable).values({
    employeeId,
    leaveType: leaveType ?? "annual",
    startDate,
    endDate,
    totalDays: totalDays ?? "1",
    reason: reason ?? null,
    status: "pending",
    submittedBy: req.userId!,
    locationId: effectiveLocationId,
  }).returning();

  await logAudit(req.userId, "create", "leave_request", row!.id, `Leave for employee #${employeeId} from ${startDate} to ${endDate}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString(), updatedAt: row!.updatedAt.toISOString() });
});

router.patch("/hrm/leave/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const { status, reviewNotes, leaveType, startDate, endDate, totalDays, reason } = req.body as {
    status?: string; reviewNotes?: string;
    leaveType?: string; startDate?: string; endDate?: string; totalDays?: string; reason?: string;
  };

  const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Leave request not found" }); return; }

  const updates: Record<string, unknown> = {};
  const isReview = status === "approved" || status === "rejected";

  if (isReview && !isAdmin(req)) {
    const role = req.userRole ?? "";
    if (role !== "manager" && role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Only managers and admins can approve/reject leave" }); return;
    }
  }

  if (status)      updates.status = status;
  if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes;
  if (isReview)    updates.reviewedBy = req.userId;
  if (leaveType)   updates.leaveType = leaveType;
  if (startDate)   updates.startDate = startDate;
  if (endDate)     updates.endDate = endDate;
  if (totalDays)   updates.totalDays = totalDays;
  if (reason !== undefined) updates.reason = reason;

  const [row] = await db.update(leaveRequestsTable).set(updates).where(eq(leaveRequestsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  if (isReview) await logAudit(req.userId, "update", "leave_request", id, `${status} leave request #${id}`);
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.delete("/hrm/leave/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (!isAdmin(req) && existing.submittedBy !== req.userId) {
    res.status(403).json({ error: "Can only cancel your own leave requests" }); return;
  }

  if (existing.status === "approved" && !isAdmin(req)) {
    res.status(422).json({ error: "Cannot cancel an approved leave request" }); return;
  }

  await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;

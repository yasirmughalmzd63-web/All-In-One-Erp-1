import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db, employeesTable, attendanceTable, payrollTable,
  employeeFinesTable, employeeBonusesTable,
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
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);
  const [row] = await db.insert(employeeFinesTable).values({
    employeeId, amount: parseFloat(amount).toFixed(2), reason, date, locationId: effectiveLocationId,
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
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null ? req.userLocationId : (locationId ?? null);
  const [row] = await db.insert(employeeBonusesTable).values({
    employeeId, amount: parseFloat(amount).toFixed(2), reason, date, locationId: effectiveLocationId,
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

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

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

export default router;

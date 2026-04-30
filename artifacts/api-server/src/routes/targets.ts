import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, targetsTable, employeeBonusesTable, salesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══ PENDING ACHIEVEMENTS — must be before /:id ══════════════════════════ */
router.get("/targets/pending-achievements", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(targetsTable).where(eq(targetsTable.status, "achieved"));
  const byEmp: Record<number, number> = {};
  for (const r of rows) {
    if (r.employeeId) byEmp[r.employeeId] = (byEmp[r.employeeId] ?? 0) + 1;
  }
  res.json(byEmp);
});

/* ═══ LIST ════════════════════════════════════════════════════════════════ */
router.get("/targets", requireAuth, async (req, res): Promise<void> => {
  const { type, scope, status, employeeId } = req.query as Record<string, string>;
  let rows = await db.select().from(targetsTable).orderBy(targetsTable.createdAt);
  if (type)       rows = rows.filter(r => r.type === type);
  if (scope)      rows = rows.filter(r => r.scope === scope);
  if (status)     rows = rows.filter(r => r.status === status);
  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  res.json(rows);
});

/* ═══ CREATE ══════════════════════════════════════════════════════════════ */
router.post("/targets", requireAuth, async (req, res): Promise<void> => {
  const {
    title, type, scope, employeeId, userId,
    targetAmount, commissionType, commissionValue,
    startDate, endDate, locationId, notes,
  } = req.body as {
    title?: string; type?: string; scope?: string;
    employeeId?: number; userId?: number;
    targetAmount?: string; commissionType?: string; commissionValue?: string;
    startDate?: string; endDate?: string;
    locationId?: number; notes?: string;
  };
  if (!title?.trim())             { res.status(400).json({ error: "title required" }); return; }
  if (!targetAmount)              { res.status(400).json({ error: "targetAmount required" }); return; }
  if (!startDate || !endDate)     { res.status(400).json({ error: "startDate and endDate required" }); return; }

  const [row] = await db.insert(targetsTable).values({
    title: title.trim(),
    type: type ?? "daily",
    scope: scope ?? "app",
    employeeId: employeeId ?? null,
    userId: userId ?? null,
    targetAmount: String(targetAmount),
    commissionType: commissionType ?? "flat",
    commissionValue: String(commissionValue ?? "0"),
    startDate, endDate,
    status: "active",
    achievedAmount: "0.00",
    locationId: locationId ?? null,
    notes: notes ?? null,
  }).returning();

  await logAudit(req.userId, "create", "target", row!.id, title!);
  res.status(201).json(row!);
});

/* ═══ UPDATE ══════════════════════════════════════════════════════════════ */
router.patch("/targets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const allowed = ["title","type","scope","employeeId","userId","targetAmount","commissionType","commissionValue","startDate","endDate","status","locationId","notes"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const [row] = await db.update(targetsTable).set(updates).where(eq(targetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

/* ═══ DELETE ══════════════════════════════════════════════════════════════ */
router.delete("/targets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const [row] = await db.delete(targetsTable).where(eq(targetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(req.userId, "delete", "target", id, row.title);
  res.sendStatus(204);
});

/* ═══ CHECK PROGRESS ══════════════════════════════════════════════════════ */
router.post("/targets/:id/check", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const target = await db.select().from(targetsTable).where(eq(targetsTable.id, id)).then(r => r[0]);
  if (!target) { res.status(404).json({ error: "Not found" }); return; }

  const conditions = [
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') >= ${target.startDate}::date`,
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') <= ${target.endDate}::date`,
    eq(salesTable.status, "completed"),
  ];
  if (target.scope === "user" && target.userId) conditions.push(eq(salesTable.userId, target.userId));
  if (target.locationId) conditions.push(eq(salesTable.locationId, target.locationId));

  const [agg] = await db
    .select({ total: sql<string>`COALESCE(SUM(CAST(${salesTable.total} AS NUMERIC)), 0)` })
    .from(salesTable)
    .where(and(...conditions));

  const achievedAmount = parseFloat(agg?.total ?? "0");
  const achieved       = achievedAmount >= parseFloat(target.targetAmount);

  let newStatus = target.status;
  if (target.status === "active" || target.status === "achieved") {
    const isPast = target.endDate < today();
    newStatus = achieved ? "achieved" : isPast ? "missed" : "active";
  }

  const [updated] = await db
    .update(targetsTable)
    .set({ achievedAmount: achievedAmount.toFixed(2), status: newStatus })
    .where(eq(targetsTable.id, id))
    .returning();

  res.json({ ...updated, achievedAmount: achievedAmount.toFixed(2), achieved });
});

/* ═══ APPLY COMMISSION ════════════════════════════════════════════════════ */
router.post("/targets/:id/apply-commission", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id!, 10);
  const target = await db.select().from(targetsTable).where(eq(targetsTable.id, id)).then(r => r[0]);
  if (!target)            { res.status(404).json({ error: "Not found" }); return; }
  if (!target.employeeId) { res.status(400).json({ error: "No employee linked to this target" }); return; }
  if (target.status === "done")     { res.status(400).json({ error: "Commission already applied" }); return; }
  if (target.status !== "achieved") { res.status(400).json({ error: "Target not yet achieved" }); return; }

  const achievedAmt = parseFloat(target.achievedAmount);
  const commissionAmount = target.commissionType === "percentage"
    ? (achievedAmt * parseFloat(target.commissionValue)) / 100
    : parseFloat(target.commissionValue);

  const [bonus] = await db.insert(employeeBonusesTable).values({
    employeeId: target.employeeId,
    amount: commissionAmount.toFixed(2),
    reason: `Target: ${target.title} (${target.startDate} – ${target.endDate})`,
    date: today(),
    locationId: target.locationId ?? null,
  }).returning();

  const [updated] = await db
    .update(targetsTable)
    .set({ status: "done", bonusId: bonus!.id })
    .where(eq(targetsTable.id, id))
    .returning();

  await logAudit(req.userId, "update", "target", id, `Commission applied: ${target.title}`);
  res.json({ target: updated, bonus });
});

export default router;

import { Router } from "express";
import { eq, and, sql, isNull } from "drizzle-orm";
import { db, targetsTable, employeeBonusesTable, salesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdminOrManager } from "../lib/permissions.js";
import { logAudit } from "../lib/audit.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══ PENDING ACHIEVEMENTS — must be before /:id ══════════════════════════ */
// Returns count of "achieved" but NOT-yet-verified targets per employee.
// Admin sees these as "ready to verify" badges in HRM.
router.get("/targets/pending-achievements", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(targetsTable).where(and(eq(targetsTable.status, "achieved"), tenantWhere(req, targetsTable.businessId)));
  const byEmp: Record<number, number> = {};
  for (const r of rows) {
    if (r.employeeId && !r.verifiedAt) byEmp[r.employeeId] = (byEmp[r.employeeId] ?? 0) + 1;
  }
  res.json(byEmp);
});

/* ═══ MY TARGET PROGRESS (read-only, for current user) ════════════════════ */
router.get("/targets/my-progress", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const todayStr = today();

  // Find the user's active user-scoped target whose date window covers today.
  // If multiple, prefer the most recently created.
  const myTargets = await db
    .select()
    .from(targetsTable)
    .where(and(
      eq(targetsTable.scope, "user"),
      eq(targetsTable.userId, userId),
      eq(targetsTable.status, "active"),
      tenantWhere(req, targetsTable.businessId),
    ));

  const inWindow = myTargets
    .filter(t => t.startDate <= todayStr && t.endDate >= todayStr)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

  const target = inWindow[0] ?? null;
  if (!target) { res.json(null); return; }

  // Read-only achievement calc — does NOT mutate target row.
  const conditions = [
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') >= ${target.startDate}::date`,
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') <= ${target.endDate}::date`,
    eq(salesTable.status, "completed"),
    eq(salesTable.userId, userId),
  ];
  if (target.locationId) conditions.push(eq(salesTable.locationId, target.locationId));

  const [agg] = await db
    .select({ total: sql<string>`COALESCE(SUM(CAST(${salesTable.total} AS NUMERIC)), 0)` })
    .from(salesTable)
    .where(and(...conditions));

  const targetAmount    = parseFloat(target.targetAmount);
  const achievedAmount  = parseFloat(agg?.total ?? "0");
  const commissionValue = parseFloat(target.commissionValue);

  const maxBonus = target.commissionType === "percentage"
    ? (targetAmount * commissionValue) / 100
    : commissionValue;

  const progressFraction = targetAmount > 0 ? Math.min(1, achievedAmount / targetAmount) : 0;
  const earnedBonus = maxBonus * progressFraction;
  const leftBonus   = Math.max(0, maxBonus - earnedBonus);
  const achievedPct = targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;

  res.json({
    targetId:        target.id,
    title:           target.title,
    type:            target.type,
    startDate:       target.startDate,
    endDate:         target.endDate,
    targetAmount:    targetAmount.toFixed(2),
    achievedAmount:  achievedAmount.toFixed(2),
    achievedPct:     achievedPct.toFixed(1),
    commissionType:  target.commissionType,
    commissionValue: target.commissionValue,
    maxBonus:        maxBonus.toFixed(2),
    earnedBonus:     earnedBonus.toFixed(2),
    leftBonus:       leftBonus.toFixed(2),
  });
});

/* ═══ LIST ════════════════════════════════════════════════════════════════ */
router.get("/targets", requireAuth, async (req, res): Promise<void> => {
  const { type, scope, status, employeeId } = req.query as Record<string, string>;
  let rows = await db.select().from(targetsTable)
    .where(tenantWhere(req, targetsTable.businessId))
    .orderBy(targetsTable.createdAt);
  if (type)       rows = rows.filter(r => r.type === type);
  if (scope)      rows = rows.filter(r => r.scope === scope);
  if (status)     rows = rows.filter(r => r.status === status);
  if (employeeId) rows = rows.filter(r => r.employeeId === parseInt(employeeId));
  res.json(rows);
});

/* ═══ CREATE ══════════════════════════════════════════════════════════════ */
const ALLOWED_TYPES = new Set(["daily", "weekly", "monthly"]);

router.post("/targets", requireAuth, async (req, res): Promise<void> => {
  const {
    title, type, scope, employeeId, userId,
    targetAmount, commissionType, commissionValue,
    startDate, endDate, locationId, notes, isChallenge,
  } = req.body as {
    title?: string; type?: string; scope?: string;
    employeeId?: number; userId?: number;
    targetAmount?: string; commissionType?: string; commissionValue?: string;
    startDate?: string; endDate?: string;
    locationId?: number; notes?: string; isChallenge?: boolean;
  };
  if (!title?.trim())             { res.status(400).json({ error: "title required" }); return; }
  if (!targetAmount)              { res.status(400).json({ error: "targetAmount required" }); return; }
  if (!startDate || !endDate)     { res.status(400).json({ error: "startDate and endDate required" }); return; }
  if (type && !ALLOWED_TYPES.has(type)) {
    res.status(400).json({ error: "type must be one of: daily, weekly, monthly" }); return;
  }

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
    isChallenge: isChallenge === true,
    businessId: tenantStamp(req),
  }).returning();

  await logAudit(req.userId, "create", "target", row!.id, title!);
  res.status(201).json(row!);
});

/* ═══ UPDATE ══════════════════════════════════════════════════════════════ */
router.patch("/targets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  // NOTE: verifiedAt/verifiedBy are intentionally NOT patchable here — only the
  // verify endpoint (admin-gated) can flip those.
  const allowed = ["title","type","scope","employeeId","userId","targetAmount","commissionType","commissionValue","startDate","endDate","status","locationId","notes","isChallenge"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (updates["type"] && !ALLOWED_TYPES.has(updates["type"] as string)) {
    res.status(400).json({ error: "type must be one of: daily, weekly, monthly" }); return;
  }
  const [existing] = await db.select({ businessId: targetsTable.businessId }).from(targetsTable).where(eq(targetsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db.update(targetsTable).set(updates).where(eq(targetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

/* ═══ DELETE ══════════════════════════════════════════════════════════════ */
router.delete("/targets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [existing] = await db.select({ businessId: targetsTable.businessId, title: targetsTable.title }).from(targetsTable).where(eq(targetsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(targetsTable).where(eq(targetsTable.id, id));
  await logAudit(req.userId, "delete", "target", id, existing.title);
  res.sendStatus(204);
});

/* ═══ CHECK PROGRESS ══════════════════════════════════════════════════════
 * Recomputes achievement from sales. Updates status to one of:
 *   active    — still in window, not yet achieved
 *   achieved  — goal hit; PENDING admin verification (no bonus yet!)
 *   missed    — window closed, goal not hit
 *   done      — bonus already verified+paid (terminal)
 *
 * Bonus is NEVER auto-created here. Admin must call /verify to release it.
 * This is the "verification gate" the operator asked for.
 * ────────────────────────────────────────────────────────────────────────── */
router.post("/targets/:id/check", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const target = await db.select().from(targetsTable).where(eq(targetsTable.id, id)).then(r => r[0]);
  if (!target) { res.status(404).json({ error: "Not found" }); return; }

  // Skip if already finalised — but still recompute achievedAmount for display.
  if (target.status === "done" || target.status === "missed") {
    res.json({ ...target, achieved: target.status === "done", autoBonus: null });
    return;
  }

  const conditions = [
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') >= ${target.startDate}::date`,
    sql`DATE(${salesTable.createdAt} AT TIME ZONE 'UTC') <= ${target.endDate}::date`,
    eq(salesTable.status, "completed"),
  ];
  if (target.scope === "user" && target.userId) conditions.push(eq(salesTable.userId, target.userId));
  if (target.locationId) conditions.push(eq(salesTable.locationId, target.locationId));
  const tWhere = tenantWhere(req, salesTable.businessId);
  if (tWhere) conditions.push(tWhere);

  const [agg] = await db
    .select({ total: sql<string>`COALESCE(SUM(CAST(${salesTable.total} AS NUMERIC)), 0)` })
    .from(salesTable)
    .where(and(...conditions));

  const achievedAmount = parseFloat(agg?.total ?? "0");
  const achieved       = achievedAmount >= parseFloat(target.targetAmount);
  const isPast         = target.endDate < today();
  // achieved → stays "achieved" (pending verify); window closed without hit → missed
  const newStatus      = achieved ? "achieved" : isPast ? "missed" : "active";

  const [updated] = await db
    .update(targetsTable)
    .set({ achievedAmount: achievedAmount.toFixed(2), status: newStatus })
    .where(eq(targetsTable.id, id))
    .returning();

  res.json({
    ...updated,
    achievedAmount: achievedAmount.toFixed(2),
    achieved,
    pendingVerify: achieved && !updated!.verifiedAt,
    autoBonus: null,
  });
});

/* ═══ VERIFY (admin gate) — releases bonus into HRM/payroll ═══════════════
 * Only callable when a target is "achieved". Creates the bonus row, links
 * it to the target, sets verifiedAt/verifiedBy, marks the target "done".
 *
 * Challenge targets (isChallenge=true) get a 1.5× multiplier on the
 * commission value — the "stretch goal pays better" mechanic.
 * ────────────────────────────────────────────────────────────────────────── */
const CHALLENGE_MULTIPLIER = 1.5;

/**
 * Idempotent verify-and-pay.
 *
 * Race protection: we first attempt a CONDITIONAL update that only succeeds
 * when the target is still in `status='achieved' AND verifiedAt IS NULL`.
 * Postgres serializes per-row updates, so two concurrent verify calls race
 * here — exactly one wins and gets a row back; the other gets nothing and
 * bails out without inserting a bonus. This prevents double-payment.
 *
 * If the conditional update fails we DO NOT insert the bonus. We then read
 * the current row so the caller sees the already-verified state.
 */
async function verifyAndApply(target: typeof targetsTable.$inferSelect, verifierUserId: number | undefined) {
  const achievedAmt = parseFloat(target.achievedAmount);
  const commValue   = parseFloat(target.commissionValue);
  const baseAmount  = target.commissionType === "percentage"
    ? (achievedAmt * commValue) / 100
    : commValue;
  const finalAmount = target.isChallenge ? baseAmount * CHALLENGE_MULTIPLIER : baseAmount;

  const tag = target.isChallenge ? "🏆 Challenge Target" : "Target";
  const reason = `${tag}: ${target.title} (${target.startDate} – ${target.endDate})`;

  return await db.transaction(async (tx) => {
    // Step 1: claim the verification slot via conditional update.
    // Only one concurrent caller will get a row back.
    const claimed = await tx
      .update(targetsTable)
      .set({
        verifiedAt: new Date(),
        verifiedBy: verifierUserId ?? null,
      })
      .where(and(
        eq(targetsTable.id, target.id),
        eq(targetsTable.status, "achieved"),
        isNull(targetsTable.verifiedAt),
      ))
      .returning();

    if (claimed.length === 0) {
      // Lost the race or already verified — don't pay the bonus twice.
      const [current] = await tx.select().from(targetsTable).where(eq(targetsTable.id, target.id));
      return { target: current, bonus: null, alreadyVerified: true };
    }

    // Step 2: now safe to insert the bonus and link it back to the target.
    const [bonus] = await tx.insert(employeeBonusesTable).values({
      employeeId: target.employeeId!,
      amount: finalAmount.toFixed(2),
      reason,
      date: today(),
      locationId: target.locationId ?? null,
    }).returning();

    const [updated] = await tx
      .update(targetsTable)
      .set({ status: "done", bonusId: bonus!.id })
      .where(eq(targetsTable.id, target.id))
      .returning();

    return { target: updated, bonus, alreadyVerified: false };
  });
}

router.post("/targets/:id/verify", requireAuth, async (req, res): Promise<void> => {
  // Admin/manager only — releasing a bonus directly affects payroll.
  if (!isAdminOrManager(req)) {
    res.status(403).json({ error: "Only admins or managers can verify and release bonuses" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  const target = await db.select().from(targetsTable).where(eq(targetsTable.id, id)).then(r => r[0]);
  if (!target)                      { res.status(404).json({ error: "Not found" }); return; }
  if (!target.employeeId)           { res.status(400).json({ error: "No employee linked to this target" }); return; }
  if (target.status === "done")     { res.status(400).json({ error: "Already verified" }); return; }
  if (target.status !== "achieved") { res.status(400).json({ error: "Target not yet achieved" }); return; }

  const result = await verifyAndApply(target, req.userId);
  await logAudit(req.userId, "update", "target", id, `Verified & bonus released: ${target.title}`);
  res.json(result);
});

// Back-compat alias — older clients call /apply-commission. Same admin gate + idempotency.
router.post("/targets/:id/apply-commission", requireAuth, async (req, res): Promise<void> => {
  if (!isAdminOrManager(req)) {
    res.status(403).json({ error: "Only admins or managers can verify and release bonuses" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  const target = await db.select().from(targetsTable).where(eq(targetsTable.id, id)).then(r => r[0]);
  if (!target)                      { res.status(404).json({ error: "Not found" }); return; }
  if (!target.employeeId)           { res.status(400).json({ error: "No employee linked to this target" }); return; }
  if (target.status === "done")     { res.status(400).json({ error: "Commission already applied" }); return; }
  if (target.status !== "achieved") { res.status(400).json({ error: "Target not yet achieved" }); return; }

  const result = await verifyAndApply(target, req.userId);
  await logAudit(req.userId, "update", "target", id, `Commission applied: ${target.title}`);
  res.json(result);
});

export default router;

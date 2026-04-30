import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { tenantWhere } from "../lib/tenant.js";

const router = Router();

router.get("/audit", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(req.query.limit as string ?? "100", 10) || 100, 500);
  // Audit logs aren't directly business-tagged, but they reference users — scope by the
  // acting user's business. super_admin sees everything.
  const tenant = tenantWhere(req, usersTable.businessId);
  const rows = await db.select({
    id: auditLogsTable.id,
    userId: auditLogsTable.userId,
    userName: usersTable.name,
    action: auditLogsTable.action,
    entityType: auditLogsTable.entityType,
    entityId: auditLogsTable.entityId,
    details: auditLogsTable.details,
    createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(and(tenant))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(rows.map(r => ({ ...r, userName: r.userName ?? null, createdAt: r.createdAt.toISOString() })));
});

export default router;

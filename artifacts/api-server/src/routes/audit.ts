import { Router } from "express";
import { desc } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/audit", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(req.query.limit as string ?? "100", 10) || 100, 500);
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
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(rows.map(r => ({ ...r, userName: r.userName ?? null, createdAt: r.createdAt.toISOString() })));
});

export default router;

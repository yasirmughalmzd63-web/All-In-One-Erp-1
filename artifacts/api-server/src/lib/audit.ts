import { db, auditLogsTable } from "@workspace/db";

export async function logAudit(
  userId: number | undefined,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    userId: userId ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    details: details ?? null,
  });
}

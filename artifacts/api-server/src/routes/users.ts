import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    name: usersTable.name,
    role: usersTable.role,
    locationId: usersTable.locationId,
    isActive: usersTable.isActive,
    privileges: usersTable.privileges,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.name);
  res.json(users.map(u => ({ ...u, privileges: u.privileges ? JSON.parse(u.privileges) : null, createdAt: u.createdAt.toISOString() })));
});

router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const { username, name, password, role, locationId } = req.body as {
    username?: string; name?: string; password?: string; role?: string; locationId?: number | null;
  };
  if (!username || !name || !password || !role) {
    res.status(400).json({ error: "username, name, password, role required" });
    return;
  }
  const passwordHash = hashPassword(password);
  const [user] = await db.insert(usersTable).values({ username, name, passwordHash, role, locationId: locationId ?? null }).returning();
  await logAudit(req.userId, "create", "user", user!.id, `Created user ${name}`);
  res.status(201).json({ ...user!, createdAt: user!.createdAt.toISOString() });
});

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw!, 10);
  const { name, role, locationId, isActive, password, privileges } = req.body as {
    name?: string; role?: string; locationId?: number | null; isActive?: boolean; password?: string;
    privileges?: string[] | null;
  };
  const updateData: Record<string, unknown> = {};
  if (name != null) updateData.name = name;
  if (role != null) updateData.role = role;
  if (locationId !== undefined) updateData.locationId = locationId;
  if (isActive != null) updateData.isActive = isActive;
  if (password) updateData.passwordHash = hashPassword(password);
  if (privileges !== undefined) updateData.privileges = privileges == null ? null : JSON.stringify(privileges);

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await logAudit(req.userId, "update", "user", id);
  res.json({ ...user, privileges: user.privileges ? JSON.parse(user.privileges) : null, createdAt: user.createdAt.toISOString() });
});

router.get("/users/:id/privileges", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw!, 10);
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role, privileges: usersTable.privileges }).from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ userId: id, role: user.role, privileges: user.privileges ? JSON.parse(user.privileges) : null });
});

router.delete("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw!, 10);
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await logAudit(req.userId, "delete", "user", id);
  res.sendStatus(204);
});

export default router;

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, businessRegistrationsTable, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ── Package privilege templates ───────────────────────────────────────────
const PACKAGE_PRIVILEGES: Record<string, string[]> = {
  free: [
    "pos", "sales",
    "pos_product", "pos_location", "pos_account",
  ],
  basic: [
    "pos", "sales", "inventory", "accounts", "locations", "categories",
    "pos_product", "pos_location", "pos_account", "pos_credit_customer",
  ],
  professional: [
    "dashboard", "pos", "sales", "purchases", "expenses", "credits",
    "inventory", "customers", "suppliers", "accounts", "locations", "categories",
    "cash_count", "currency",
    "pos_product", "pos_location", "pos_account", "pos_credit_customer",
  ],
  enterprise: [
    "dashboard", "pos", "sales", "purchases", "expenses", "credits",
    "inventory", "customers", "suppliers", "accounts", "locations", "categories",
    "users", "audit", "currency", "cash_count", "reconciliation",
    "pos_product", "pos_location", "pos_account", "pos_credit_customer",
  ],
};

// POST /api/registrations — public, anyone can register a business
router.post("/registrations", async (req, res): Promise<void> => {
  const {
    businessName, businessType, ownerName, email, phone, address, purpose,
    package: pkg, adminUsername, adminPassword,
  } = req.body as {
    businessName?: string; businessType?: string; ownerName?: string;
    email?: string; phone?: string; address?: string; purpose?: string;
    package?: string; adminUsername?: string; adminPassword?: string;
  };

  if (!businessName || !businessType || !ownerName || !adminUsername || !adminPassword || !pkg) {
    res.status(400).json({ error: "businessName, businessType, ownerName, adminUsername, adminPassword, package required" });
    return;
  }

  if (!["free", "basic", "professional", "enterprise"].includes(pkg)) {
    res.status(400).json({ error: "Invalid package. Choose: free, basic, professional, enterprise" });
    return;
  }

  // Check username not already taken
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, adminUsername));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const adminPasswordHash = hashPassword(adminPassword);
  const [reg] = await db.insert(businessRegistrationsTable).values({
    businessName, businessType, ownerName,
    email: email ?? null, phone: phone ?? null,
    address: address ?? null, purpose: purpose ?? null,
    package: pkg, adminUsername, adminPasswordHash,
    status: "pending",
  }).returning();

  res.status(201).json({
    id: reg!.id,
    businessName: reg!.businessName,
    status: reg!.status,
    message: "Registration submitted. Awaiting admin approval.",
  });
});

// GET /api/registrations — admin only
router.get("/registrations", requireAuth, async (req, res): Promise<void> => {
  const regs = await db.select().from(businessRegistrationsTable).orderBy(businessRegistrationsTable.createdAt);
  res.json(regs.map(r => ({
    ...r,
    adminPasswordHash: undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// PATCH /api/registrations/:id — admin only, approve or reject
router.patch("/registrations/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw!, 10);
  const { action, rejectionReason } = req.body as { action?: string; rejectionReason?: string };

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const [reg] = await db.select().from(businessRegistrationsTable).where(eq(businessRegistrationsTable.id, id));
  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }
  if (reg.status !== "pending") { res.status(409).json({ error: "Registration already processed" }); return; }

  if (action === "reject") {
    const [updated] = await db.update(businessRegistrationsTable)
      .set({ status: "rejected", rejectionReason: rejectionReason ?? null })
      .where(eq(businessRegistrationsTable.id, id))
      .returning();
    await logAudit(req.userId, "update", "business_registration", id, `Rejected: ${reg.businessName}`);
    res.json({ ...updated, adminPasswordHash: undefined, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() });
    return;
  }

  // Approve: create the admin user with package-based privileges
  const privileges = PACKAGE_PRIVILEGES[reg.package] ?? PACKAGE_PRIVILEGES.basic!;
  const [newUser] = await db.insert(usersTable).values({
    username: reg.adminUsername,
    name: reg.ownerName,
    passwordHash: reg.adminPasswordHash,
    role: "admin",
    privileges: JSON.stringify(privileges),
    isActive: true,
  }).returning();

  const [updated] = await db.update(businessRegistrationsTable)
    .set({ status: "approved" })
    .where(eq(businessRegistrationsTable.id, id))
    .returning();

  await logAudit(req.userId, "create", "user", newUser!.id, `Approved business: ${reg.businessName} → user ${reg.adminUsername}`);
  await logAudit(req.userId, "update", "business_registration", id, `Approved: ${reg.businessName}`);

  res.json({
    registration: { ...updated, adminPasswordHash: undefined, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() },
    createdUser: { id: newUser!.id, username: newUser!.username, name: newUser!.name, role: newUser!.role },
  });
});

export default router;

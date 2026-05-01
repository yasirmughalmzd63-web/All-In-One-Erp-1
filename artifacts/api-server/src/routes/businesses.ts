import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, businessRegistrationsTable, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ── Super-admin guard ─────────────────────────────────────────────────────────
function requireSuperAdmin(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]): void {
  if (req.userRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}

// ── Package module defaults (shared) ─────────────────────────────────────────
export const PACKAGE_PRIVILEGES: Record<string, string[]> = {
  free: ["pos", "sales", "pos_product", "pos_location", "pos_account"],
  basic: ["pos", "sales", "inventory", "accounts", "locations", "categories", "pos_product", "pos_location", "pos_account", "pos_credit_customer"],
  professional: ["dashboard", "pos", "sales", "purchases", "expenses", "credits", "inventory", "customers", "suppliers", "accounts", "locations", "categories", "cash_count", "currency", "pos_product", "pos_location", "pos_account", "pos_credit_customer"],
  enterprise: ["dashboard", "pos", "sales", "purchases", "expenses", "credits", "inventory", "customers", "suppliers", "accounts", "locations", "categories", "users", "audit", "currency", "cash_count", "reconciliation", "pos_product", "pos_location", "pos_account", "pos_credit_customer"],
};

const PACKAGE_MONTHLY_FEE: Record<string, string> = {
  free: "0.00",
  basic: "999.00",
  professional: "2499.00",
  enterprise: "4999.00",
};

// ── GET /api/businesses — super admin: list all businesses (all statuses) ─────
router.get("/businesses", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const regs = await db.select().from(businessRegistrationsTable)
    .orderBy(businessRegistrationsTable.createdAt);

  const usernames = regs.map(r => r.adminUsername);
  const users = usernames.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username, name: usersTable.name, role: usersTable.role, isActive: usersTable.isActive, privileges: usersTable.privileges })
        .from(usersTable)
    : [];

  const userMap = Object.fromEntries(users.map(u => [u.username, u]));

  res.json(regs.map(r => ({
    id: r.id,
    businessName: r.businessName,
    businessType: r.businessType,
    ownerName: r.ownerName,
    email: r.email,
    phone: r.phone,
    address: r.address,
    package: r.package,
    adminUsername: r.adminUsername,
    status: r.status,
    rejectionReason: r.rejectionReason,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    subscriptionEndDate: r.subscriptionEndDate,
    monthlyFee: r.monthlyFee,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    adminUser: userMap[r.adminUsername] ?? null,
    modules: userMap[r.adminUsername]?.privileges
      ? JSON.parse(userMap[r.adminUsername]!.privileges!)
      : null,
  })));
});

// ── GET /api/businesses/stats — super admin: aggregate stats ──────────────────
router.get("/businesses/stats", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const regs = await db.select().from(businessRegistrationsTable);

  const users = regs.length > 0
    ? await db.select({ username: usersTable.username, isActive: usersTable.isActive }).from(usersTable)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.username, u]));

  const approved = regs.filter(r => r.status === "approved");
  const pending  = regs.filter(r => r.status === "pending");
  const rejected = regs.filter(r => r.status === "rejected");

  const byPackage: Record<string, number> = { free: 0, basic: 0, professional: 0, enterprise: 0 };
  const byPaymentStatus: Record<string, number> = { trial: 0, active: 0, overdue: 0, cancelled: 0 };
  let monthlyRevenue = 0;
  let activeCount = 0;

  for (const r of approved) {
    byPackage[r.package] = (byPackage[r.package] ?? 0) + 1;
    const ps = r.paymentStatus ?? "trial";
    byPaymentStatus[ps] = (byPaymentStatus[ps] ?? 0) + 1;
    if (r.monthlyFee) monthlyRevenue += parseFloat(r.monthlyFee);
    if (userMap[r.adminUsername]?.isActive) activeCount++;
  }

  res.json({
    total: regs.length,
    approved: approved.length,
    pending:  pending.length,
    rejected: rejected.length,
    active:   activeCount,
    inactive: approved.length - activeCount,
    byPackage,
    byPaymentStatus,
    monthlyRevenue: monthlyRevenue.toFixed(2),
  });
});

// ── POST /api/businesses — super admin creates a business directly ─────────────
router.post("/businesses", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const {
    businessName, businessType, ownerName, email, phone, address,
    package: pkg, adminUsername, adminPassword, modules,
    paymentMethod, paymentStatus, subscriptionEndDate, monthlyFee, notes,
  } = req.body as {
    businessName?: string; businessType?: string; ownerName?: string;
    email?: string; phone?: string; address?: string;
    package?: string; adminUsername?: string; adminPassword?: string;
    modules?: string[] | null;
    paymentMethod?: string; paymentStatus?: string;
    subscriptionEndDate?: string; monthlyFee?: string; notes?: string;
  };

  if (!businessName || !businessType || !ownerName || !adminUsername || !adminPassword || !pkg) {
    res.status(400).json({ error: "businessName, businessType, ownerName, adminUsername, adminPassword, package required" });
    return;
  }
  if (!["free", "basic", "professional", "enterprise"].includes(pkg)) {
    res.status(400).json({ error: "Invalid package" }); return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, adminUsername));
  if (existing.length > 0) { res.status(409).json({ error: "Username already taken" }); return; }

  const privileges = modules ?? PACKAGE_PRIVILEGES[pkg] ?? PACKAGE_PRIVILEGES.basic!;
  const passwordHash = hashPassword(adminPassword);
  const fee = monthlyFee ?? PACKAGE_MONTHLY_FEE[pkg] ?? "0.00";

  const [reg] = await db.insert(businessRegistrationsTable).values({
    businessName, businessType, ownerName,
    email: email ?? null, phone: phone ?? null, address: address ?? null,
    package: pkg, adminUsername, adminPasswordHash: passwordHash,
    status: "approved",
    paymentMethod: paymentMethod ?? null,
    paymentStatus: paymentStatus ?? (pkg === "free" ? "active" : "trial"),
    subscriptionEndDate: subscriptionEndDate ?? null,
    monthlyFee: fee,
    notes: notes ?? null,
  }).returning();

  const [newUser] = await db.insert(usersTable).values({
    username: adminUsername,
    name: ownerName,
    passwordHash,
    role: "admin",
    privileges: JSON.stringify(privileges),
    isActive: true,
    businessId: reg!.id,
  }).returning();

  await logAudit(req.userId, "create", "business", reg!.id, `Super admin created business: ${businessName} → @${adminUsername}`);

  res.status(201).json({
    id: reg!.id,
    businessName: reg!.businessName,
    package: reg!.package,
    adminUsername: reg!.adminUsername,
    createdUser: { id: newUser!.id, username: newUser!.username, role: newUser!.role },
    modules: privileges,
  });
});

// ── PATCH /api/businesses/:id/modules — super admin updates modules ─────────────
router.patch("/businesses/:id/modules", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { modules } = req.body as { modules?: string[] | null };
  if (modules === undefined) { res.status(400).json({ error: "modules array required (or null for full access)" }); return; }

  const [reg] = await db.select().from(businessRegistrationsTable).where(eq(businessRegistrationsTable.id, id));
  if (!reg) { res.status(404).json({ error: "Business not found" }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, reg.adminUsername));
  if (!user) { res.status(404).json({ error: "Admin user not found" }); return; }

  await db.update(usersTable)
    .set({ privileges: modules === null ? null : JSON.stringify(modules) })
    .where(eq(usersTable.id, user.id));

  await logAudit(req.userId, "update", "business", id, `Updated modules for ${reg.businessName}: ${modules?.length ?? "all"} modules`);
  res.json({ success: true, modules });
});

// ── PATCH /api/businesses/:id — super admin updates business info/package/payment
router.patch("/businesses/:id", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const {
    package: pkg, isActive,
    paymentMethod, paymentStatus, subscriptionEndDate, monthlyFee, notes,
  } = req.body as {
    package?: string; isActive?: boolean;
    paymentMethod?: string; paymentStatus?: string;
    subscriptionEndDate?: string; monthlyFee?: string; notes?: string;
  };

  const [reg] = await db.select().from(businessRegistrationsTable).where(eq(businessRegistrationsTable.id, id));
  if (!reg) { res.status(404).json({ error: "Business not found" }); return; }

  const bizUpdates: Record<string, unknown> = {};

  if (pkg) {
    if (!["free", "basic", "professional", "enterprise"].includes(pkg)) {
      res.status(400).json({ error: "Invalid package" }); return;
    }
    bizUpdates.package = pkg;
    // Auto-update monthlyFee when package changes (unless explicitly overridden)
    if (!monthlyFee) bizUpdates.monthlyFee = PACKAGE_MONTHLY_FEE[pkg] ?? "0.00";
  }

  if (paymentMethod !== undefined) bizUpdates.paymentMethod = paymentMethod;
  if (paymentStatus !== undefined) bizUpdates.paymentStatus = paymentStatus;
  if (subscriptionEndDate !== undefined) bizUpdates.subscriptionEndDate = subscriptionEndDate || null;
  if (monthlyFee !== undefined)         bizUpdates.monthlyFee = monthlyFee;
  if (notes !== undefined)              bizUpdates.notes = notes;

  if (Object.keys(bizUpdates).length > 0) {
    await db.update(businessRegistrationsTable).set(bizUpdates).where(eq(businessRegistrationsTable.id, id));
  }

  if (isActive !== undefined) {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, reg.adminUsername));
    if (user) {
      await db.update(usersTable).set({ isActive }).where(eq(usersTable.id, user.id));
    }
  }

  await logAudit(req.userId, "update", "business", id, `Updated business ${reg.businessName}: pkg=${pkg ?? "unchanged"} payStatus=${paymentStatus ?? "unchanged"} active=${isActive ?? "unchanged"}`);
  res.json({ success: true });
});

// ── DELETE /api/businesses/:id — super admin deletes business + admin user ───
router.delete("/businesses/:id", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);

  const [reg] = await db.select().from(businessRegistrationsTable).where(eq(businessRegistrationsTable.id, id));
  if (!reg) { res.status(404).json({ error: "Business not found" }); return; }

  // Delete the admin user
  await db.delete(usersTable).where(eq(usersTable.username, reg.adminUsername));
  // Delete the registration
  await db.delete(businessRegistrationsTable).where(eq(businessRegistrationsTable.id, id));

  await logAudit(req.userId, "delete", "business", id, `Deleted business: ${reg.businessName} (@${reg.adminUsername})`);
  res.json({ success: true, deleted: { id, businessName: reg.businessName } });
});

export default router;

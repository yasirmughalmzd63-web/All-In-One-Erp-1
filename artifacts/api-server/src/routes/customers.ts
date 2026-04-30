import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, customersTable, creditsTable, creditPaymentsTable, salesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, customersTable.businessId);
  const locationFilter = !isAdmin(req) && req.userLocationId != null
    ? eq(customersTable.locationId, req.userLocationId)
    : undefined;
  const rows = await db.select().from(customersTable).where(and(tenant, locationFilter)).orderBy(customersTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email, address, openingCreditBalance, openingCreditType, locationId } = req.body as {
    name?: string; phone?: string | null; email?: string | null; address?: string | null;
    openingCreditBalance?: string | number | null; openingCreditType?: string | null; locationId?: number | null;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  // Non-admin: force their own location
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId
    : (locationId ?? null);

  const [customer] = await db.insert(customersTable).values({
    name, phone: phone ?? null, email: email ?? null, address: address ?? null,
    locationId: effectiveLocationId,
    businessId: tenantStamp(req),
  }).returning();

  const balanceNum = openingCreditBalance ? parseFloat(String(openingCreditBalance)) : 0;
  if (balanceNum > 0 && customer) {
    const creditType = openingCreditType === "payable" ? "payable" : "receivable";
    const balanceStr = balanceNum.toFixed(8);
    await db.insert(creditsTable).values({
      type: creditType,
      partyId: customer.id,
      partyType: "customer",
      amount: balanceStr,
      paidAmount: "0.00000000",
      remainingAmount: balanceStr,
      status: "pending",
      notes: "Opening balance",
      userId: req.userId ?? 1,
    });
  }

  res.status(201).json({ ...customer!, createdAt: customer!.createdAt.toISOString() });
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: customersTable.businessId }).from(customersTable).where(eq(customersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This customer belongs to another business" }); return; }

  const { name, phone, email, address, locationId } = req.body as {
    name?: string; phone?: string | null; email?: string | null; address?: string | null; locationId?: number | null;
  };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  if (locationId !== undefined) updates.locationId = locationId;
  const [row] = await db.update(customersTable).set(updates).where(eq(customersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

// GET /api/customers/:id/statement — full customer profile + statement
router.get("/customers/:id/statement", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid customer id" }); return; }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  if (!ownsRow(req, customer.businessId)) { res.status(404).json({ error: "Customer not found" }); return; }

  // Fetch all credits for this customer
  const credits = await db.select().from(creditsTable)
    .where(and(eq(creditsTable.partyId, id), tenantWhere(req, creditsTable.businessId)))
    .orderBy(desc(creditsTable.createdAt));

  // Fetch all credit payments for those credits
  const creditIds = credits.map(c => c.id);
  let payments: typeof creditPaymentsTable.$inferSelect[] = [];
  for (const cid of creditIds) {
    const rows = await db.select().from(creditPaymentsTable)
      .where(eq(creditPaymentsTable.creditId, cid))
      .orderBy(desc(creditPaymentsTable.createdAt));
    payments = payments.concat(rows);
  }

  // Fetch all sales for this customer
  const sales = await db.select().from(salesTable)
    .where(and(eq(salesTable.customerId, id), tenantWhere(req, salesTable.businessId)))
    .orderBy(desc(salesTable.createdAt));

  // Compute summary
  let totalCreditIssued   = 0;
  let totalCreditPaid     = 0;
  let totalCreditOutstanding = 0;
  for (const c of credits) {
    totalCreditIssued      += parseFloat(c.amount);
    totalCreditPaid        += parseFloat(c.paidAmount);
    totalCreditOutstanding += parseFloat(c.remainingAmount);
  }
  const totalSales = sales.reduce((s, r) => s + parseFloat(r.total), 0);

  // Build unified chronological statement:
  // Each entry: { id, kind, date, label, amount, sign, meta }
  type Entry = {
    id: string; kind: string; date: string; label: string;
    amount: number; sign: "+" | "-"; status?: string; notes?: string;
  };
  const entries: Entry[] = [];

  for (const c of credits) {
    entries.push({
      id:     `credit-${c.id}`,
      kind:   "credit",
      date:   c.createdAt.toISOString(),
      label:  c.type === "receivable" ? "Credit Issued" : "Payable",
      amount: parseFloat(c.amount),
      sign:   "-",
      status: c.status,
      notes:  c.notes ?? undefined,
    });
  }

  for (const p of payments) {
    entries.push({
      id:     `payment-${p.id}`,
      kind:   "payment",
      date:   p.createdAt.toISOString(),
      label:  "Credit Payment",
      amount: parseFloat(p.amount),
      sign:   "+",
      notes:  p.notes ?? undefined,
    });
  }

  for (const s of sales) {
    entries.push({
      id:     `sale-${s.id}`,
      kind:   "sale",
      date:   s.createdAt.toISOString(),
      label:  `Sale #${s.invoiceNo}`,
      amount: parseFloat(s.total),
      sign:   "-",
      status: s.status,
      notes:  s.notes ?? undefined,
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({
    customer: { ...customer, createdAt: customer.createdAt.toISOString() },
    summary: {
      totalSales:          totalSales.toFixed(2),
      totalCreditIssued:   totalCreditIssued.toFixed(2),
      totalCreditPaid:     totalCreditPaid.toFixed(2),
      totalCreditOutstanding: totalCreditOutstanding.toFixed(2),
      salesCount:   sales.length,
      creditCount:  credits.length,
      paymentCount: payments.length,
    },
    credits:  credits.map(c  => ({ ...c,  createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
    payments: payments.map(p  => ({ ...p,  createdAt: p.createdAt.toISOString() })),
    sales:    sales.map(s    => ({ ...s,  createdAt: s.createdAt.toISOString() })),
    statement: entries,
  });
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: customersTable.businessId }).from(customersTable).where(eq(customersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This customer belongs to another business" }); return; }

  const [row] = await db.delete(customersTable).where(eq(customersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.sendStatus(204);
});

export default router;

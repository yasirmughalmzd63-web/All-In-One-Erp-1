import { Router } from "express";
import { db, usersTable, locationsTable, accountsTable, categoriesTable, productsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth.js";

const router = Router();

router.post("/seed", async (_req, res): Promise<void> => {
  try {
    const existingUsers = await db.select().from(usersTable).limit(1);
    if (existingUsers.length > 0) {
      res.json({ message: "Already seeded" });
      return;
    }

    await db.insert(usersTable).values([
      { username: "admin", name: "Administrator", passwordHash: hashPassword("admin123"), role: "super_admin" },
      { username: "cashier", name: "Cashier 1", passwordHash: hashPassword("cashier123"), role: "cashier" },
    ]);

    await db.insert(locationsTable).values([
      { name: "Main Store", address: "123 Main St", phone: "+1234567890" },
      { name: "Branch 1", address: "456 Branch Ave", phone: "+0987654321" },
    ]);

    await db.insert(accountsTable).values([
      { name: "Cash Register", type: "cash", balance: "10000.00000000", currency: "USD" },
      { name: "Bank Account", type: "bank", balance: "50000.00000000", currency: "USD" },
    ]);

    await db.insert(categoriesTable).values([
      { name: "Electronics", type: "product", description: "Electronic items" },
      { name: "Food & Beverages", type: "product", description: "Food and drinks" },
      { name: "Office Supplies", type: "expense", description: "Office supplies" },
    ]);

    const cats = await db.select().from(categoriesTable);
    const elecCat = cats.find(c => c.name === "Electronics");
    const foodCat = cats.find(c => c.name === "Food & Beverages");

    await db.insert(productsTable).values([
      { name: "Laptop Pro", sku: "LAP-001", categoryId: elecCat?.id ?? null, unitPrice: "999.99999999", costPrice: "750.00000000", stock: 20, unit: "pcs" },
      { name: "Wireless Mouse", sku: "MOU-001", categoryId: elecCat?.id ?? null, unitPrice: "29.99000000", costPrice: "15.00000000", stock: 50, unit: "pcs" },
      { name: "Coffee Beans 1kg", sku: "COF-001", categoryId: foodCat?.id ?? null, unitPrice: "15.50000000", costPrice: "8.00000000", stock: 100, unit: "kg" },
      { name: "Mineral Water 500ml", sku: "WAT-001", categoryId: foodCat?.id ?? null, unitPrice: "1.50000000", costPrice: "0.50000000", stock: 200, unit: "bottle" },
    ]);

    res.json({ message: "Seeded successfully" });
  } catch (err) {
    res.status(500).json({ error: "Seed failed" });
  }
});

export default router;

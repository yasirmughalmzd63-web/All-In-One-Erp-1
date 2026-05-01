import { Router, type Request } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// Local-filesystem image storage. Works on any Node host (Replit, Hostinger,
// VPS, Docker) — no cloud SDK required.
//
// Files are written to UPLOADS_DIR (defaults to ./uploads next to the server)
// and served back over HTTPS at `${PUBLIC_BASE_URL}/api/uploads/<key>` via
// the express.static middleware mounted in app.ts.
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads"));

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function publicUrlFor(req: Request, key: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (base) return `${base}/api/uploads/${key}`;
  // Fallback: derive from incoming request (works when the server is reached
  // directly on its public domain). `app.set("trust proxy", 1)` in app.ts
  // makes req.protocol respect X-Forwarded-Proto from Hostinger's reverse proxy.
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/api/uploads/${key}`;
}

// POST /api/upload/product-image
// Body: { base64: string, mimeType: string }
// Returns: { url: string, key: string }
router.post("/upload/product-image", requireAuth, async (req, res): Promise<void> => {
  const { base64, mimeType } = req.body as { base64?: string; mimeType?: string };
  if (!base64 || !mimeType) {
    res.status(400).json({ error: "base64 and mimeType required" });
    return;
  }

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : mimeType === "image/webp" ? "webp" : "jpg";
  const key = `product-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(base64, "base64");

  try {
    const filePath = path.join(UPLOADS_DIR, key);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, buffer);
  } catch (err) {
    req.log.error({ err, uploadsDir: UPLOADS_DIR }, "Failed to write uploaded file");
    res.status(500).json({ error: "Upload failed" });
    return;
  }

  res.json({ url: publicUrlFor(req, key), key });
});

// POST /api/upload/product-image-refresh
// Body: { key: string }  — returns the current public URL for an existing key.
// With filesystem storage URLs never expire, so this is just a lookup helper
// that the mobile app can call if it ever needs to re-resolve a key → URL.
router.post("/upload/product-image-refresh", requireAuth, async (req, res): Promise<void> => {
  const { key } = req.body as { key?: string };
  if (!key) {
    res.status(400).json({ error: "key required" });
    return;
  }
  // Reject path traversal attempts.
  if (key.includes("..") || path.isAbsolute(key)) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    await fs.access(filePath);
  } catch {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  res.json({ url: publicUrlFor(req, key) });
});

export { UPLOADS_DIR };
export default router;

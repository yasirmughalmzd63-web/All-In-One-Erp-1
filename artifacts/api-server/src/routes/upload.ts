import { Router } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const PRODUCT_IMAGES_SUBDIR = "product-images";
const PRODUCT_IMAGES_DIR = path.join(UPLOADS_DIR, PRODUCT_IMAGES_SUBDIR);

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

const MAX_BYTES = 8 * 1024 * 1024;

function publicUrlFor(key: string): string {
  return `/api/uploads/${key}`;
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

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    res.status(413).json({ error: "Image too large (max 8MB)" });
    return;
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const key = `${PRODUCT_IMAGES_SUBDIR}/${filename}`;

  try {
    await ensureDir(PRODUCT_IMAGES_DIR);
    await fs.writeFile(path.join(PRODUCT_IMAGES_DIR, filename), buffer);
  } catch (err) {
    req.log.error({ err }, "Local file save failed");
    res.status(500).json({ error: "Upload failed" });
    return;
  }

  res.json({ url: publicUrlFor(key), key });
});

// POST /api/upload/product-image-refresh
// Body: { key: string }
// Local storage URLs do not expire — this just re-derives the public URL.
router.post("/upload/product-image-refresh", requireAuth, async (req, res): Promise<void> => {
  const { key } = req.body as { key?: string };
  if (!key) { res.status(400).json({ error: "key required" }); return; }

  const safeKey = key.replace(/^\/+/, "");
  if (safeKey.includes("..") || path.isAbsolute(safeKey)) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }
  try {
    await fs.access(path.join(UPLOADS_DIR, safeKey));
  } catch {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  res.json({ url: publicUrlFor(safeKey) });
});

export default router;

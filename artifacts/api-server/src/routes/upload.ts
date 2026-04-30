import { Router } from "express";
import { Client } from "@replit/object-storage";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();
let _client: Client | null = null;
function getClient(): Client {
  if (!_client) _client = new Client();
  return _client;
}

// POST /api/upload/product-image
// Body: { base64: string, mimeType: string }
// Returns: { url: string }
router.post("/upload/product-image", requireAuth, async (req, res): Promise<void> => {
  const { base64, mimeType } = req.body as { base64?: string; mimeType?: string };
  if (!base64 || !mimeType) {
    res.status(400).json({ error: "base64 and mimeType required" });
    return;
  }

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
  const key = `product-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(base64, "base64");

  const client = getClient();
  const { ok, error } = await client.uploadFromBytes(key, buffer, { contentType: mimeType });
  if (!ok) {
    req.log.error({ error }, "Object storage upload failed");
    res.status(500).json({ error: "Upload failed" });
    return;
  }

  const { ok: urlOk, value: url, error: urlError } = await client.getSignedUrl(key, { expiresIn: 60 * 60 * 24 * 365 * 5 });
  if (!urlOk || !url) {
    req.log.error({ urlError }, "Failed to generate signed URL");
    res.status(500).json({ error: "Failed to generate URL" });
    return;
  }

  res.json({ url, key });
});

// POST /api/upload/product-image-refresh
// Body: { key: string }  — refreshes the signed URL for an existing image
router.post("/upload/product-image-refresh", requireAuth, async (req, res): Promise<void> => {
  const { key } = req.body as { key?: string };
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const { ok, value: url } = await getClient().getSignedUrl(key, { expiresIn: 60 * 60 * 24 * 365 * 5 });
  if (!ok || !url) { res.status(404).json({ error: "Object not found" }); return; }
  res.json({ url });
});

export default router;

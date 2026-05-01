import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { UPLOADS_DIR } from "./routes/upload";
import { logger } from "./lib/logger";

const app: Express = express();

// Honour X-Forwarded-Proto/Host from Hostinger / any reverse proxy so
// req.protocol returns "https" and signed/public URLs are correct.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Allow base64-encoded image uploads (a single 1 MB image becomes ~1.4 MB
// after base64; cap generously to fit a few images at once).
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Serve uploaded files (product images, payment-proof screenshots) directly
// from the local filesystem. Cached for 1 day client-side.
app.use(
  "/api/uploads",
  express.static(UPLOADS_DIR, {
    fallthrough: false,
    maxAge: "1d",
    etag: true,
  }),
);

app.use("/api", router);

export default app;

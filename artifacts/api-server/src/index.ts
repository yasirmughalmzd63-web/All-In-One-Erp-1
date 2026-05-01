import app from "./app";
import { logger } from "./lib/logger";

// In a long-running environment (local dev, traditional Node host, Replit) the
// PORT env var is set and we start an HTTP listener. In serverless environments
// (Vercel, AWS Lambda, etc.) PORT is absent — the runtime imports `app` and
// invokes it per request, so we must NOT call `listen()`.
const rawPort = process.env["PORT"];

if (rawPort) {
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

export default app;

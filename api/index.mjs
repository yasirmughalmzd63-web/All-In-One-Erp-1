// Vercel serverless function entry point.
//
// Vercel auto-discovers files under /api at the repo root and turns each into
// a Node.js serverless function. We re-export the bundled Express app so every
// /api/* request is handled by the same routing layer as in long-running mode.
//
// The build that produces dist/index.mjs is run by Vercel's `buildCommand`
// in vercel.json (`pnpm --filter @workspace/api-server run build`). The bundle
// is wrapped: it default-exports the Express `app` and only calls listen()
// when PORT is set (so it does both jobs from one source file).
export { default } from "../artifacts/api-server/dist/index.mjs";

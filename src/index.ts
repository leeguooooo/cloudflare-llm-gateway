/**
 * Worker entrypoint: Hono app wiring + `export default { fetch, scheduled }`.
 *
 * Mounts the admin sub-app at `/admin`, the OpenAI-compatible sub-app at `/v1`,
 * and the native passthrough sub-app at the root (it self-prefixes its routes
 * with `/gemini/*`, `/mistral/*`, `/openrouter/*`). `GET /healthz` is unauthed
 * and returns a stats summary. The cron trigger runs the key-pool health check.
 */

import { Hono } from "hono";
import type { Env } from "./types";
import { statsSummary } from "./db";
import { runCheckAll, probeModels } from "./probe";
import { adminPage } from "./ui";
import auth from "./oidc";
import admin from "./routes/admin";
import me from "./routes/me";
import openai from "./routes/openai";
import passthrough from "./routes/passthrough";
import stripe from "./routes/stripe";

const app = new Hono<{ Bindings: Env }>();

// Role-routed admin/consumer console (self-contained HTML). Auth is enforced
// by the API routes it calls (SSO session or bearer token).
app.get("/", (c) => c.html(adminPage(c.env)));

app.get("/healthz", async (c) => {
  const stats = await statsSummary(c.env);
  return c.json({ ok: true, ...stats });
});

app.route("/stripe", stripe);
app.route("/auth", auth);
app.route("/admin", admin);
app.route("/me", me);
app.route("/v1", openai);
app.route("/", passthrough);

const scheduled = (
  _event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): void => {
  // Automatic health-check on the cron tick: revive recovered keys, disable
  // dead, then refresh per-model availability.
  ctx.waitUntil(runCheckAll(env).then(() => probeModels(env)));
};

export default {
  fetch: app.fetch,
  scheduled,
};

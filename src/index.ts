/**
 * Worker entrypoint: Hono app wiring + `export default { fetch, scheduled }`.
 *
 * Mounts the admin sub-app at `/admin`, the OpenAI-compatible sub-app at `/v1`,
 * the Gemini-native translation sub-app at `/v1beta`,
 * and the native passthrough sub-app at the root (it self-prefixes its routes
 * with `/gemini/*`, `/mistral/*`, `/openrouter/*`). `GET /healthz` is unauthed
 * and returns a stats summary. The cron trigger runs the key-pool health check.
 */

import { Hono } from "hono";
import type { Env } from "./types";
import { runCheckAll, probeModels } from "./probe";
import { adminPage } from "./ui";
import auth from "./oidc";
import admin from "./routes/admin";
import me from "./routes/me";
import openai from "./routes/openai";
import gemini from "./routes/gemini";
import passthrough from "./routes/passthrough";
import stripe from "./routes/stripe";

// strict:false so a trailing slash (e.g. `/v1/chat/completions/` sent by some
// OpenAI-compatible clients) still matches the route instead of 404ing.
const app = new Hono<{ Bindings: Env }>({ strict: false });

// Role-routed admin/consumer console (self-contained HTML). Auth is enforced
// by the API routes it calls (SSO session or bearer token).
app.get("/", (c) => c.html(adminPage(c.env)));

// Public liveness probe — intentionally minimal (no pool inventory leak).
app.get("/healthz", (c) => c.json({ ok: true }));

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. This gateway is a
// token-protected API (an OIDC relying party, NOT an authorization server), so
// it advertises itself as a protected resource and points agents at its
// authorization server (the leeguoo SSO IdP) to obtain tokens.
app.get("/.well-known/oauth-protected-resource", (c) => {
  const as = (c.env.OIDC_ISSUER || "https://account.leeguoo.com").replace(/\/$/, "");
  return c.json({
    resource: new URL(c.req.url).origin,
    authorization_servers: [as],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  });
});

app.route("/stripe", stripe);
app.route("/auth", auth);
app.route("/admin", admin);
app.route("/me", me);
app.route("/v1", openai);
app.route("/v1beta", gemini);
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

// Behind Alibaba Cloud ESA (mainland China) the gateway is reached as ai-origin.leeguoo.com.
// Put the public hostname back first so OAuth callbacks and cookies stay on ai.leeguoo.com.
// Managed with ~/github.com/leeguoo-edge.
const ORIGIN_ALIAS = "ai-origin.leeguoo.com";
const PUBLIC_HOST = "ai.leeguoo.com";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    let rewrite = false;
    if (url.hostname === ORIGIN_ALIAS) {
      url.hostname = PUBLIC_HOST;
      rewrite = true;
    }
    // Clients that join a trailing-slash base URL with "/v1/…" send "//v1/…"
    // (Magpie's Anthropic probe does); collapse it so the route still matches.
    if (url.pathname.includes("//")) {
      url.pathname = url.pathname.replace(/\/{2,}/g, "/");
      rewrite = true;
    }
    if (rewrite) request = new Request(url, request);
    return app.fetch(request, env, ctx);
  },
  scheduled,
};

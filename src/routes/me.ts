/**
 * Consumer self-service routes. Mounted at `/me`.
 *
 * Auth is a valid SSO session cookie (via `getSession`), NOT a bearer token.
 * Approved users can list, mint, and delete their own access tokens; pending
 * or blocked users are gated out of minting with a 403.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { getSession } from "../oidc";
import {
  listTokensByOwner,
  createToken,
  deleteOwnedToken,
  getUserBySub,
  usageSummary,
  recentLogs,
  getBalanceMicro,
  listTransactions,
  modelStats,
} from "../db";

const app = new Hono<{ Bindings: Env }>();

/** List the caller's own tokens (full token strings — they're the owner). */
app.get("/tokens", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  const tokens = await listTokensByOwner(c.env, session.sub);
  // Bare array — matches the admin /tokens shape and what the console expects.
  return c.json(tokens);
});

/** Mint a token for the caller. Requires an approved account. */
app.post("/tokens", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }

  const user = await getUserBySub(c.env, session.sub);
  if (!user || user.status !== "approved") {
    return c.json(
      {
        error: { message: "账号待开通,请联系管理员", type: "not_approved" },
      },
      403
    );
  }

  let name: string | undefined;
  try {
    const body = (await c.req.json()) as { name?: unknown } | null;
    if (body && typeof body.name === "string") name = body.name;
  } catch {
    // empty / invalid body → unnamed token
  }

  const created = await createToken(c.env, {
    name,
    role: "user",
    ownerSub: session.sub,
  });
  return c.json({ token: created.token, name: created.name });
});

/** Delete one of the caller's own tokens. 404 if not owned. */
app.delete("/tokens/:id", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: { message: "无效的令牌 ID", type: "bad_request" } }, 400);
  }

  const ok = await deleteOwnedToken(c.env, id, session.sub);
  if (!ok) {
    return c.json({ error: { message: "令牌不存在", type: "not_found" } }, 404);
  }
  return c.json({ ok: true });
});

// GET /usage — the caller's own usage aggregates (last 30 days).
app.get("/usage", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return c.json(await usageSummary(c.env, { ownerSub: session.sub, sinceMs }));
});

// GET /logs — the caller's own recent requests.
app.get("/logs", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  return c.json(await recentLogs(c.env, { ownerSub: session.sub, limit: 50 }));
});

// GET /model-stats — global per-model performance leaderboard (last 7 days), so a
// consumer can pick a fast/reliable model. Aggregate-only (no per-user identity).
app.get("/model-stats", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return c.json(await modelStats(c.env, { sinceMs, limit: 100 }));
});

// GET /balance — the caller's own balance in micro-USD.
app.get("/balance", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  return c.json({ balance_micro: await getBalanceMicro(c.env, session.sub) });
});

// GET /transactions — the caller's own billing transactions.
app.get("/transactions", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }
  return c.json(await listTransactions(c.env, { sub: session.sub, limit: 50 }));
});

// POST /checkout — start a Stripe Checkout Session to top up credit.
app.post("/checkout", async (c) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { message: "未登录", type: "unauthorized" } }, 401);
  }

  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json(
      { error: { message: "payment not configured", type: "not_configured" } },
      503
    );
  }

  let amountUsd = 0;
  try {
    const body = (await c.req.json()) as { amount_usd?: unknown } | null;
    if (body && typeof body.amount_usd === "number") amountUsd = body.amount_usd;
  } catch {
    // invalid body → amountUsd stays 0 and fails the check below
  }
  if (!(amountUsd > 0)) {
    return c.json(
      { error: { message: "无效的金额", type: "bad_request" } },
      400
    );
  }

  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  const currency = c.env.CURRENCY || "usd";
  const unitAmount = Math.round(amountUsd * 100);
  const amountMicro = Math.round(amountUsd * 1_000_000);

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${base}/?topup=success`);
  form.set("cancel_url", `${base}/?topup=cancel`);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency);
  form.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  form.set("line_items[0][price_data][product_data][name]", "Credit top-up");
  form.set("metadata[sub]", session.sub);
  form.set("metadata[amount_micro]", String(amountMicro));

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return c.json({ error: { message: text, type: "stripe_error" } }, 502);
  }

  const sessionJson = (await res.json()) as { url?: string };
  return c.json({ url: sessionJson.url });
});

export default app;

/** Admin routes: key import + management + token minting. Mounted at /admin. */

import { Hono } from "hono";
import type { Env, Provider } from "../types";
import { PROVIDERS } from "../types";
import { requireAdmin } from "../auth";
import {
  importKeys,
  statsSummary,
  reactivateKey,
  applyOutcome,
  createToken,
  listTokens,
  listUsers,
  setUserStatus,
  disableTokensByOwner,
  listAllKeys,
  getKeyById,
  deleteKey,
  usageSummary,
  recentLogs,
} from "../db";
import { cooldownMinutes, MAX_CONSECUTIVE_FAILS } from "../keypool";
import { runHealthCheck } from "../cron";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requireAdmin);

function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

/**
 * Parse `provider:key` lines. Provider is the text before the FIRST colon;
 * the rest (which may itself contain colons) is the key. Unknown providers and
 * malformed lines are collected as `skipped`.
 */
function parseKeyLines(text: string): {
  entries: Array<{ provider: Provider; api_key: string }>;
  skipped: string[];
} {
  const entries: Array<{ provider: Provider; api_key: string }> = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) {
      skipped.push(line);
      continue;
    }
    const provider = line.slice(0, idx).trim().toLowerCase();
    const api_key = line.slice(idx + 1).trim();
    if (api_key.length === 0 || !isProvider(provider)) {
      skipped.push(line);
      continue;
    }
    entries.push({ provider, api_key });
  }
  return { entries, skipped };
}

// POST /keys/import — JSON { keys: "..." } or raw text/plain lines.
app.post("/keys/import", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let text = "";
  if (contentType.includes("application/json")) {
    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { message: "invalid json body", type: "invalid_request_error" } },
        400
      );
    }
    if (
      body !== null &&
      typeof body === "object" &&
      typeof (body as { keys?: unknown }).keys === "string"
    ) {
      text = (body as { keys: string }).keys;
    } else {
      return c.json(
        {
          error: {
            message: "expected { keys: string }",
            type: "invalid_request_error",
          },
        },
        400
      );
    }
  } else {
    text = await c.req.text();
  }

  const { entries, skipped } = parseKeyLines(text);
  const result = await importKeys(c.env, entries);
  return c.json({
    added: result.added,
    duplicate: result.duplicate,
    skipped,
    byProvider: result.byProvider,
  });
});

// GET /keys — counts by provider/status.
app.get("/keys", async (c) => {
  const summary = await statsSummary(c.env);
  return c.json(summary);
});

// GET /usage — global usage aggregates (last 30 days).
app.get("/usage", async (c) => {
  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return c.json(await usageSummary(c.env, { sinceMs }));
});

// GET /logs — most recent requests across all callers.
app.get("/logs", async (c) => {
  return c.json(await recentLogs(c.env, { limit: 100 }));
});

// POST /probe — run the unattended health check on demand (revive expired
// cooldowns + probe disabled keys). Replaces the CF cron; point a free external
// pinger (cron-job.org, GitHub Actions) at it for fully unattended recovery.
app.post("/probe", async (c) => {
  const result = await runHealthCheck(c.env);
  return c.json({ ok: true, ...result });
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

// POST /keys/:id/enable — manual reactivation.
app.post("/keys/:id/enable", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json(
      { error: { message: "invalid key id", type: "invalid_request_error" } },
      400
    );
  }
  await reactivateKey(c.env, id);
  return c.json({ id, status: "active" });
});

// POST /keys/:id/disable — manual disable.
app.post("/keys/:id/disable", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json(
      { error: { message: "invalid key id", type: "invalid_request_error" } },
      400
    );
  }
  await applyOutcome(
    c.env,
    id,
    { kind: "disable", reason: "manual disable" },
    { cooldownMinutes: cooldownMinutes(c.env), maxConsecutive: MAX_CONSECUTIVE_FAILS }
  );
  return c.json({ id, status: "disabled" });
});

// POST /tokens — mint an access token.
app.post("/tokens", async (c) => {
  let opts: { name?: string; role?: "admin" | "user" } = {};
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body: unknown = await c.req.json();
      if (body !== null && typeof body === "object") {
        const b = body as { name?: unknown; role?: unknown };
        if (typeof b.name === "string") opts.name = b.name;
        if (b.role === "admin" || b.role === "user") opts.role = b.role;
      }
    } catch {
      return c.json(
        { error: { message: "invalid json body", type: "invalid_request_error" } },
        400
      );
    }
  }
  const created = await createToken(c.env, opts);
  return c.json(created);
});

// GET /tokens — list access tokens.
app.get("/tokens", async (c) => {
  const tokens = await listTokens(c.env);
  return c.json(tokens);
});

// GET /users — list all users (pending first, newest first within group).
app.get("/users", async (c) => {
  const users = await listUsers(c.env);
  return c.json(users);
});

// POST /users/:id/approve — approve a pending/blocked user.
app.post("/users/:id/approve", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json(
      { error: { message: "invalid user id", type: "invalid_request_error" } },
      400
    );
  }
  await setUserStatus(c.env, id, "approved");
  return c.json({ ok: true });
});

// POST /users/:id/block — block a user and disable all their tokens.
app.post("/users/:id/block", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json(
      { error: { message: "invalid user id", type: "invalid_request_error" } },
      400
    );
  }
  const sub = await setUserStatus(c.env, id, "blocked");
  if (sub) await disableTokensByOwner(c.env, sub);
  return c.json({ ok: true });
});

/** Mask a secret for display: first 6 + last 4. */
function mask(key: string): string {
  if (key.length <= 12) return key.slice(0, 2) + "…" + key.slice(-2);
  return key.slice(0, 6) + "…" + key.slice(-4);
}

// GET /keys/list — every key (masked) with per-key stats for the list page.
app.get("/keys/list", async (c) => {
  const keys = await listAllKeys(c.env);
  return c.json({
    keys: keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      masked: mask(k.api_key),
      status: k.status,
      consecutive_fails: k.consecutive_fails,
      total_requests: k.total_requests,
      total_fails: k.total_fails,
      last_error: k.last_error,
      last_used_at: k.last_used_at,
      cooldown_until: k.cooldown_until,
      created_at: k.created_at,
    })),
  });
});

// DELETE /keys/:id — permanently remove a key.
app.delete("/keys/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json({ error: { message: "invalid key id", type: "invalid_request_error" } }, 400);
  }
  const ok = await deleteKey(c.env, id);
  return c.json({ ok }, ok ? 200 : 404);
});

interface KeyBalance {
  remaining: number | null;
  total: number | null;
  usage: number | null;
  unit: string;
}

/** Live-probe one key. OpenRouter also returns real balance; others probe liveness. */
async function probeKey(
  provider: Provider,
  key: string
): Promise<{ alive: boolean; status: number; rateLimited: boolean; balance: KeyBalance | null; error?: string }> {
  try {
    if (provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { authorization: `Bearer ${key}` },
      });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      const j = (await r.json().catch(() => null)) as { data?: { total_credits?: number; total_usage?: number } } | null;
      const total = j?.data?.total_credits ?? null;
      const usage = j?.data?.total_usage ?? null;
      const remaining = total !== null && usage !== null ? total - usage : null;
      return { alive: r.ok, status: r.status, rateLimited: false, balance: { remaining, total, usage, unit: "credits" } };
    }
    if (provider === "mistral") {
      const r = await fetch("https://api.mistral.ai/v1/models", { headers: { authorization: `Bearer ${key}` } });
      return { alive: r.ok, status: r.status, rateLimited: r.status === 429, balance: null, error: r.ok ? undefined : `http ${r.status}` };
    }
    // gemini
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key },
    });
    const rateLimited = r.status === 429;
    const alive = r.ok || rateLimited; // 429 = valid key, just throttled
    return { alive, status: r.status, rateLimited, balance: null, error: alive ? undefined : `http ${r.status}` };
  } catch (err) {
    return { alive: false, status: 0, rateLimited: false, balance: null, error: String(err instanceof Error ? err.message : err) };
  }
}

// POST /keys/:id/check — live liveness + balance probe. Revives the key if alive.
app.post("/keys/:id/check", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.json({ error: { message: "invalid key id", type: "invalid_request_error" } }, 400);
  }
  const row = await getKeyById(c.env, id);
  if (!row) return c.json({ error: { message: "key not found", type: "not_found" } }, 404);

  const result = await probeKey(row.provider, row.api_key);
  // A successful check brings a disabled/cooled key back into rotation.
  if (result.alive && !result.rateLimited && row.status !== "active") {
    await reactivateKey(c.env, id);
  }
  return c.json({ id, provider: row.provider, ...result });
});

export default app;

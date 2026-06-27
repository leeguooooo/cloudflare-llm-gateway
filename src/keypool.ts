/** Error classification + the callWithPool dispatcher (retry across keys, apply health outcomes). */

import type { Env, Provider, Outcome } from "./types";
import {
  listActiveKeys,
  recordSuccess,
  applyOutcome,
  logRequest,
  reviveExpiredCooldowns,
  updateLogTokens,
  chargeForUsage,
} from "./db";

export const DEFAULT_COOLDOWN_MINUTES = 15;
export const DEFAULT_MAX_RETRIES = 4;
export const MAX_CONSECUTIVE_FAILS = 3;

const DISABLE_RE =
  /api[_ ]?key.*(not valid|invalid)|invalid.*api[_ ]?key|unauthor|permission denied|API_KEY_INVALID/i;
const COOLDOWN_RE =
  /quota|rate.?limit|exhaust|RESOURCE_EXHAUSTED|too many requests/i;

/** Helpers reading env numbers with the defaults above. */
export function cooldownMinutes(env: Env): number {
  const n = Number(env.COOLDOWN_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COOLDOWN_MINUTES;
}

export function maxRetries(env: Env): number {
  const n = Number(env.MAX_KEY_RETRIES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RETRIES;
}

/** Classify an upstream HTTP result into a key-health Outcome. */
export function classifyError(status: number, bodyText: string): Outcome {
  if (status >= 200 && status <= 299) {
    return { kind: "ok" };
  }

  const body = bodyText || "";

  if (status === 401 || status === 403 || DISABLE_RE.test(body)) {
    return {
      kind: "disable",
      reason: `http ${status}: ${snippet(body)}`,
    };
  }

  if (status === 429 || (status === 400 && COOLDOWN_RE.test(body))) {
    return {
      kind: "cooldown",
      minutes: 0, // filled in by caller using cooldownMinutes(env)
      reason: `http ${status}: ${snippet(body)}`,
    };
  }

  // Any other 4xx (likely caller error, not key death), 5xx, or network.
  return {
    kind: "transient",
    reason: `http ${status}: ${snippet(body)}`,
  };
}

function snippet(s: string): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > 300 ? t.slice(0, 300) : t;
}

/**
 * Core dispatcher. Picks active keys for `provider` and calls `attempt(key)`.
 * For 2xx responses (including streams) the Response is returned untouched —
 * its body is never read here. Only non-2xx responses are cloned and read to
 * classify the key's health.
 */
export async function callWithPool(
  env: Env,
  provider: Provider,
  attempt: (key: string) => Promise<Response>,
  meta?: {
    model?: string;
    tokenId?: number | null;
    ownerSub?: string | null;
    ctx?: { waitUntil(promise: Promise<unknown>): void };
  }
): Promise<Response> {
  const model = meta?.model ?? null;
  const tokenId = meta?.tokenId ?? null;
  const ownerSub = meta?.ownerSub ?? null;
  const ctx = meta?.ctx ?? null;
  let keys = await listActiveKeys(env, provider);

  // Inline unattended recovery: with no CF cron available, revive any keys whose
  // cooldown has expired and retry once before declaring the pool empty.
  if (keys.length === 0) {
    const revived = await reviveExpiredCooldowns(env, Date.now());
    if (revived > 0) {
      keys = await listActiveKeys(env, provider);
    }
  }

  if (keys.length === 0) {
    await logRequest(env, {
      provider, keyId: null, model, tokenId, ownerSub,
      statusCode: null, latencyMs: null, ok: false, final: true,
    });
    return noKeysResponse(provider);
  }

  const limit = Math.max(1, maxRetries(env));
  const coolMins = cooldownMinutes(env);
  const opts = {
    cooldownMinutes: coolMins,
    maxConsecutive: MAX_CONSECUTIVE_FAILS,
  };

  let attempts = 0;
  let lastStatus: number | null = null;

  for (const key of keys) {
    if (attempts >= limit) break;
    attempts++;

    const started = Date.now();
    let res: Response;
    try {
      res = await attempt(key.api_key);
    } catch (err) {
      // Network / fetch failure — treat as transient and try the next key.
      const latencyMs = Date.now() - started;
      const reason = `network error: ${String(
        err instanceof Error ? err.message : err
      )}`;
      await applyOutcome(env, key.id, { kind: "transient", reason }, opts);
      await logRequest(env, {
        provider,
        keyId: key.id,
        model,
        tokenId,
        ownerSub,
        statusCode: null,
        latencyMs,
        ok: false,
        final: false,
      });
      continue;
    }

    const latencyMs = Date.now() - started;
    const status = res.status;

    // Success (including streaming).
    if (status >= 200 && status <= 299) {
      await recordSuccess(env, key.id);
      const ct = res.headers.get("content-type") || "";

      // Streaming (SSE): tee the body so we can return one half to the caller
      // and scan the other half in the background for usage tokens.
      if (ct.includes("text/event-stream") && res.body) {
        const [clientStream, scanStream] = res.body.tee();
        const logId = await logRequest(env, {
          provider,
          keyId: key.id,
          model,
          tokenId,
          ownerSub,
          statusCode: status,
          latencyMs,
          ok: true,
          totalTokens: null,
          final: true,
        });
        const clientResponse = new Response(clientStream, {
          status,
          headers: res.headers,
        });
        const scan = scanStreamForUsage(env, scanStream, logId, ownerSub, model);
        if (ctx) {
          ctx.waitUntil(scan);
        } else {
          void scan;
        }
        return clientResponse;
      }

      // Non-streaming JSON body: peek at usage.total_tokens for billing.
      let totalTokens: number | null = null;
      if (ct.includes("application/json")) {
        try {
          const j = (await res.clone().json()) as { usage?: { total_tokens?: number } };
          if (j && j.usage && typeof j.usage.total_tokens === "number") {
            totalTokens = j.usage.total_tokens;
          }
        } catch {
          // usage is best-effort; never block the response
        }
      }
      await logRequest(env, {
        provider,
        keyId: key.id,
        model,
        tokenId,
        ownerSub,
        statusCode: status,
        latencyMs,
        ok: true,
        totalTokens,
        final: true,
      });
      await chargeForUsage(env, ownerSub, model, totalTokens);
      return res;
    }

    // Non-2xx: read the body via a clone so we never disturb the original.
    let bodyText = "";
    try {
      bodyText = await res.clone().text();
    } catch {
      bodyText = "";
    }

    let outcome = classifyError(status, bodyText);
    if (outcome.kind === "cooldown") {
      outcome = { ...outcome, minutes: coolMins };
    }

    await applyOutcome(env, key.id, outcome, opts);
    lastStatus = status;
    await logRequest(env, {
      provider,
      keyId: key.id,
      model,
      tokenId,
      ownerSub,
      statusCode: status,
      latencyMs,
      ok: false,
      final: false,
    });

    // Move on to the next key (re-fetch happens inside attempt()).
  }

  await logRequest(env, {
    provider, keyId: null, model, tokenId, ownerSub,
    statusCode: lastStatus, latencyMs: null, ok: false, final: true,
  });
  return exhaustedResponse(provider);
}

/**
 * Read an SSE stream to its end, parse `data:` lines for a usage object
 * (OpenAI-shaped `usage.total_tokens` or Gemini `usageMetadata.totalTokenCount`),
 * and once found persist the token count to the log row and charge the owner.
 * Best-effort: never throws.
 */
async function scanStreamForUsage(
  env: Env,
  stream: ReadableStream<Uint8Array>,
  logId: number | null,
  ownerSub: string | null,
  model: string | null
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokens: number | null = null;

  const tryParse = (jsonText: string): void => {
    const trimmed = jsonText.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    try {
      const obj = JSON.parse(trimmed) as {
        usage?: { total_tokens?: number } | null;
        usageMetadata?: { totalTokenCount?: number } | null;
      };
      if (obj && obj.usage && typeof obj.usage.total_tokens === "number") {
        tokens = obj.usage.total_tokens;
      } else if (
        obj &&
        obj.usageMetadata &&
        typeof obj.usageMetadata.totalTokenCount === "number"
      ) {
        tokens = obj.usageMetadata.totalTokenCount;
      }
    } catch {
      // non-JSON data line; ignore
    }
  };

  const consumeLines = (): void => {
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const t = line.replace(/\r$/, "").trim();
      if (t.startsWith("data:")) {
        tryParse(t.slice(5));
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeLines();
    }
    buffer += decoder.decode();
    consumeLines();
  } catch {
    // stream errors are non-fatal for accounting
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (tokens !== null) {
    if (logId !== null) {
      await updateLogTokens(env, logId, tokens);
    }
    await chargeForUsage(env, ownerSub, model, tokens);
  }
}

function jsonError(status: number, message: string, type: string): Response {
  return new Response(JSON.stringify({ error: { message, type } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noKeysResponse(provider: Provider): Response {
  return jsonError(
    503,
    `no active keys available for provider "${provider}"`,
    "no_keys_available"
  );
}

function exhaustedResponse(provider: Provider): Response {
  return jsonError(
    503,
    `all keys for provider "${provider}" failed or are unavailable`,
    "upstream_unavailable"
  );
}

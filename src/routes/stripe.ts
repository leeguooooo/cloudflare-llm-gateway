/**
 * Stripe webhook (NO auth) — credits a user's balance after a completed
 * Checkout Session. Mounted at `/stripe`, so the live endpoint is
 * `POST /stripe/webhook`.
 *
 * Verifies the `Stripe-Signature` header per Stripe's scheme
 * (`t=<ts>,v1=<sig>`; signedPayload = `${t}.${rawBody}`; expected =
 * HMAC-SHA256(STRIPE_WEBHOOK_SECRET, signedPayload) in hex), is idempotent
 * via the payment_events table, and tops up on
 * `checkout.session.completed`.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { topUpMicro } from "../db";

// ---------- HMAC-SHA256 hex (WebCrypto), mirroring oidc.ts ----------

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  );
  return toHex(sig);
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Parse a `t=<ts>,v1=<sig>` Stripe-Signature header. */
function parseSignatureHeader(header: string): { t: string; v1: string } | null {
  let t: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1 = v;
  }
  if (!t || !v1) return null;
  return { t, v1 };
}

// ---------- event shapes ----------

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: {
      payment_status?: string;
      amount_total?: number; // settled amount, in the currency's minor unit (cents)
      currency?: string;
      metadata?: { sub?: string; amount_micro?: string } | null;
    } | null;
  } | null;
}

/** Reject events whose signature timestamp is too old/new (replay defense). */
const SIG_TOLERANCE_SEC = 300;

// ---------- route ----------

const app = new Hono<{ Bindings: Env }>();

app.post("/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.text("webhook not configured", 400);

  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) return c.text("missing signature", 400);

  const parsed = parseSignatureHeader(sigHeader);
  if (!parsed) return c.text("invalid signature", 400);

  const expected = await hmacHex(secret, `${parsed.t}.${rawBody}`);
  if (!timingSafeEqual(expected, parsed.v1)) {
    return c.text("invalid signature", 400);
  }

  // Replay defense: the signed timestamp must be within tolerance of now.
  const ts = Number(parsed.t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SIG_TOLERANCE_SEC) {
    return c.text("signature timestamp out of tolerance", 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return c.text("invalid payload", 400);
  }

  if (event.type === "checkout.session.completed") {
    const eventId = event.id ?? "";
    // Idempotency: only the first INSERT for this event_id proceeds.
    const ins = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO keypool_gateway_payment_events (event_id, created_at) VALUES (?, ?)`
    )
      .bind(eventId, Date.now())
      .run();
    if (!ins.meta.changes) return c.json({ received: true });

    const obj = event.data?.object ?? null;
    // Only credit a settled payment. Async methods fire this event with
    // payment_status 'unpaid'/'no_payment_required' before money lands.
    if (obj && obj.payment_status === "paid") {
      const sub = obj.metadata?.sub;
      // Trust the SETTLED amount (amount_total is minor units = cents), not the
      // client-supplied metadata. micro-USD = cents * 10_000.
      const amountMicro =
        typeof obj.amount_total === "number" ? Math.round(obj.amount_total * 10000) : NaN;
      if (sub && Number.isFinite(amountMicro) && amountMicro > 0) {
        await topUpMicro(c.env, sub, amountMicro, "stripe: " + eventId);
      }
    }
  }

  return c.json({ received: true });
});

export default app;

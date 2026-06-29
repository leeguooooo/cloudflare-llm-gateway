/**
 * OIDC SSO (any OIDC provider) — Authorization Code + PKCE, public client
 * (no client secret). Issues an HS256 session cookie after a successful login.
 *
 *   GET /auth/login    -> redirect to the IdP authorize endpoint
 *   GET /auth/callback -> exchange code, fetch userinfo, set session cookie
 *   GET /auth/me       -> { email, role } from the session cookie (401 if none)
 *   GET /auth/logout   -> clear the session cookie
 *
 * Role: email === ADMIN_EMAIL -> "admin", any other logged-in user -> "user".
 */

import { Hono } from "hono";
import type { Env, Role } from "./types";
import { upsertUser, getUserBySub, topUpMicro } from "./db";

const DEFAULT_ISSUER = ""; // set OIDC_ISSUER; empty => SSO disabled
const SESSION_COOKIE = "kp_session";
const PKCE_COOKIE = "kp_oidc";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
const PKCE_TTL = 60 * 10; // 10 minutes

export interface Session {
  sub: string;
  email: string;
  role: Role;
  name?: string;
}

// ---------- base64url + HMAC (WebCrypto) ----------

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}
function b64urlDecodeStr(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return b;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Minimal HS256 JWT sign. */
async function jwtSign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = b64urlEncodeStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncodeStr(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  );
  return `${data}.${b64urlEncode(sig)}`;
}

/** Verify + decode an HS256 JWT. Returns the payload or null. */
async function jwtVerify(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${b}`))
  );
  let given: Uint8Array;
  try {
    given = Uint8Array.from(b64urlDecodeStr(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (expected.length !== given.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
  if (diff !== 0) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecodeStr(b));
  } catch {
    return null;
  }
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp && Date.now() / 1000 > exp) return null;
  return payload;
}

// ---------- PKCE ----------

function randomString(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64urlEncode(a);
}
async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  return b64urlEncode(digest);
}

// ---------- cookies ----------

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

// ---------- config ----------

function issuer(env: Env): string {
  return (env.OIDC_ISSUER || DEFAULT_ISSUER).replace(/\/$/, "");
}
function configured(env: Env): boolean {
  return Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.SESSION_SECRET);
}
function redirectUri(req: Request): string {
  return new URL(req.url).origin + "/auth/callback";
}

/** Resolve the session role from the request's session cookie, if any. */
export async function sessionRole(env: Env, req: Request): Promise<Role | null> {
  if (!env.SESSION_SECRET) return null;
  const tok = readCookie(req, SESSION_COOKIE);
  if (!tok) return null;
  const p = await jwtVerify(tok, env.SESSION_SECRET);
  if (!p) return null;
  return p.role === "admin" ? "admin" : p.role === "user" ? "user" : null;
}

/** Resolve the full verified session payload from the kp_session cookie, if any. */
export async function getSession(
  env: Env,
  req: Request
): Promise<{ sub: string; email: string; role: Role; name: string | null } | null> {
  if (!env.SESSION_SECRET) return null;
  const tok = readCookie(req, SESSION_COOKIE);
  if (!tok) return null;
  const p = await jwtVerify(tok, env.SESSION_SECRET);
  if (!p) return null;
  const sub = typeof p.sub === "string" ? p.sub : null;
  const email = typeof p.email === "string" ? p.email : null;
  if (!sub || !email) return null;
  const role: Role = p.role === "admin" ? "admin" : "user";
  const name = typeof p.name === "string" ? p.name : null;
  return { sub, email, role, name };
}

// ---------- routes ----------

const app = new Hono<{ Bindings: Env }>();

app.get("/login", async (c) => {
  if (!configured(c.env)) {
    return c.json({ error: "sso not configured (set OIDC_CLIENT_ID + SESSION_SECRET)" }, 503);
  }
  const verifier = randomString(32);
  const state = randomString(16);
  const challenge = await pkceChallenge(verifier);
  const stateJwt = await jwtSign(
    { v: verifier, s: state, exp: Math.floor(Date.now() / 1000) + PKCE_TTL },
    c.env.SESSION_SECRET as string
  );
  const u = new URL(issuer(c.env) + "/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.env.OIDC_CLIENT_ID as string);
  u.searchParams.set("redirect_uri", redirectUri(c.req.raw));
  u.searchParams.set("scope", "openid profile email");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  c.header("Set-Cookie", cookie(PKCE_COOKIE, stateJwt, PKCE_TTL, true));
  return c.redirect(u.toString());
});

app.get("/callback", async (c) => {
  if (!configured(c.env)) return c.json({ error: "sso not configured" }, 503);
  const secret = c.env.SESSION_SECRET as string;
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("missing code/state", 400);

  const pkceTok = readCookie(c.req.raw, PKCE_COOKIE);
  const pkce = pkceTok ? await jwtVerify(pkceTok, secret) : null;
  if (!pkce || pkce.s !== state || typeof pkce.v !== "string") {
    return c.text("invalid state", 400);
  }

  // Exchange the code (public client + PKCE, no secret).
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(c.req.raw),
    client_id: c.env.OIDC_CLIENT_ID as string,
    code_verifier: pkce.v,
  });
  const tokRes = await fetch(issuer(c.env) + "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokRes.ok) {
    return c.text(`token exchange failed: ${tokRes.status} ${await tokRes.text()}`, 502);
  }
  const tok = (await tokRes.json()) as { access_token?: string };
  if (!tok.access_token) return c.text("no access_token", 502);

  // The tokens came straight from the issuer over TLS (back-channel), so the
  // userinfo response is trustworthy without separately verifying the id_token.
  const uiRes = await fetch(issuer(c.env) + "/userinfo", {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  if (!uiRes.ok) return c.text(`userinfo failed: ${uiRes.status}`, 502);
  const info = (await uiRes.json()) as { sub?: string; email?: string; name?: string; email_verified?: boolean };
  const email = (info.email || "").toLowerCase();
  if (!email) return c.text("no email in profile", 403);

  // Admin is granted ONLY to the configured email, and never when the IdP
  // explicitly marks the email unverified (email_verified === false) — that
  // blocks a spoofed/unverified profile email on a permissive IdP. A first-party
  // IdP that omits the field is still trusted (avoids locking out the sole admin).
  const admin = (c.env.ADMIN_EMAIL || "").toLowerCase();
  const isAdmin = email === admin && info.email_verified !== false;
  const sub = info.sub || email;
  const name = info.name || null;
  // Campaign signup bonus: grant SIGNUP_BONUS_USD once, on a consumer's FIRST
  // login (detected before the upsert). Admins don't get a balance.
  const isNew = !(await getUserBySub(c.env, sub));
  const row = await upsertUser(c.env, { sub, email, name, isAdmin });
  if (isNew && !isAdmin) {
    const bonusUsd = Number(c.env.SIGNUP_BONUS_USD);
    if (Number.isFinite(bonusUsd) && bonusUsd > 0) {
      await topUpMicro(c.env, sub, Math.round(bonusUsd * 1_000_000), "新用户活动赠送");
    }
  }
  const session = await jwtSign(
    {
      sub,
      email,
      role: row.role,
      name,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    },
    secret
  );
  c.header("Set-Cookie", cookie(SESSION_COOKIE, session, SESSION_TTL, true), { append: true });
  // clear the pkce cookie
  c.header("Set-Cookie", cookie(PKCE_COOKIE, "", 0, true), { append: true });
  return c.redirect("/");
});

app.get("/me", async (c) => {
  if (!c.env.SESSION_SECRET) return c.json({ error: "sso not configured" }, 503);
  const sess = await getSession(c.env, c.req.raw);
  if (!sess) return c.json({ error: "not logged in" }, 401);
  const user = await getUserBySub(c.env, sess.sub);
  const status = user
    ? user.status
    : sess.role === "admin"
      ? "approved"
      : "pending";
  return c.json({
    email: user?.email ?? sess.email,
    role: user?.role ?? sess.role,
    status,
    sub: sess.sub,
  });
});

app.get("/logout", (c) => {
  c.header("Set-Cookie", cookie(SESSION_COOKIE, "", 0, true));
  return c.redirect("/");
});

export default app;

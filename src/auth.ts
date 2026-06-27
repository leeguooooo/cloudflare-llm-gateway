/** Hono auth middleware: `requireUser`, `requireAdmin`. */

import type { MiddlewareHandler } from "hono";
import type { Env, Role } from "./types";
import { resolveToken, resolveTokenFull } from "./db";
import { sessionRole, getSession } from "./oidc";

/**
 * Identify the caller of a request for usage attribution: a bearer token maps to
 * its token id + owner; an SSO session cookie maps to the user's sub (no token).
 */
export async function resolveCaller(
  env: Env,
  req: Request
): Promise<{ tokenId: number | null; ownerSub: string | null }> {
  const token = extractToken(req);
  if (token) {
    const full = await resolveTokenFull(env, token);
    if (full) return { tokenId: full.id, ownerSub: full.ownerSub };
  }
  const sess = await getSession(env, req);
  if (sess) return { tokenId: null, ownerSub: sess.sub };
  return { tokenId: null, ownerSub: null };
}

/** Hono generics shared by auth-protected routes (exposes `role` via c.get). */
type AuthEnv = { Bindings: Env; Variables: { role: Role } };

/** OpenAI-shaped 401 JSON body. */
const UNAUTHORIZED_BODY = {
  error: {
    message: "missing or invalid api key",
    type: "auth_error",
  },
} as const;

/**
 * Extract a bearer token from the request, in priority order:
 *  1. `Authorization: Bearer <token>` header.
 *  2. `x-goog-api-key` header (Gemini passthrough convenience).
 *  3. `?key=` query parameter (Gemini passthrough convenience).
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const match = /^\s*Bearer\s+(.+)\s*$/i.exec(auth);
    if (match && match[1]) return match[1].trim();
  }

  const goog = req.headers.get("x-goog-api-key");
  if (goog && goog.trim()) return goog.trim();

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key && key.trim()) return key.trim();
  } catch {
    // malformed URL — fall through to null
  }

  return null;
}

function unauthorized(): Response {
  return new Response(JSON.stringify(UNAUTHORIZED_BODY), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Build a middleware that authenticates the request and stashes the resolved
 * role on `c.set("role", role)`. If `adminOnly` is true, a `user` role is
 * rejected with 401.
 */
function makeAuth(adminOnly: boolean): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    // Bearer token (API clients) first, then the SSO session cookie (browser).
    let role: Role | null = null;
    const token = extractToken(c.req.raw);
    if (token) role = await resolveToken(c.env, token);
    if (!role) role = await sessionRole(c.env, c.req.raw);

    if (!role) return unauthorized();
    if (adminOnly && role !== "admin") return unauthorized();

    c.set("role", role);
    await next();
  };
}

/** Any valid token (user or admin). */
export const requireUser: MiddlewareHandler<AuthEnv> = makeAuth(false);

/** Admin tokens only. */
export const requireAdmin: MiddlewareHandler<AuthEnv> = makeAuth(true);

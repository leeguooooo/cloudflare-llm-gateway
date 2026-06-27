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

export default app;

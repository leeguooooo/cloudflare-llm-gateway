/** OpenAI-compatible routes: `/v1/models` + `/v1/chat/completions`. User auth. */

import { Hono } from "hono";
import type { Env } from "../types";
import { PROVIDERS } from "../types";
import type { OpenAIChatRequest } from "../providers/types";
import { routeModelToProvider } from "../providers/types";
import { getAdapter } from "../providers";
import { callWithPool } from "../keypool";
import { requireUser, resolveCaller } from "../auth";
import { checkTokenLimits, incrementTokenUse, billingEnabled, getBalanceMicro } from "../db";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requireUser);

/** GET /models — union of every adapter's models() in OpenAI list shape. */
app.get("/models", (c) => {
  const data: Array<{ id: string; object: "model"; owned_by: string }> = [];
  for (const provider of PROVIDERS) {
    for (const id of getAdapter(provider).models()) {
      data.push({ id, object: "model", owned_by: provider });
    }
  }
  return c.json({ object: "list", data });
});

/** POST /chat/completions — route to a provider and dispatch through the pool. */
app.post("/chat/completions", async (c) => {
  let body: OpenAIChatRequest;
  try {
    body = (await c.req.json()) as OpenAIChatRequest;
  } catch {
    return c.json(
      { error: { message: "invalid json body", type: "invalid_request_error" } },
      400,
    );
  }

  if (!body || typeof body.model !== "string" || !body.model) {
    return c.json(
      { error: { message: "missing required field: model", type: "invalid_request_error" } },
      400,
    );
  }

  const provider = routeModelToProvider(body.model);
  const caller = await resolveCaller(c.env, c.req.raw);
  if (caller.tokenId !== null) {
    const chk = await checkTokenLimits(c.env, caller.tokenId);
    if (!chk.ok) {
      return c.json({ error: { message: chk.message, type: "limit_exceeded" } }, chk.status as 429);
    }
  }
  if (billingEnabled(c.env) && caller.ownerSub) {
    const bal = await getBalanceMicro(c.env, caller.ownerSub);
    if (bal <= 0) return c.json({ error: { message: "余额不足,请充值", type: "insufficient_balance" } }, 402);
  }
  const promptChars = (body.messages ?? []).reduce((sum, m) => {
    const content: unknown = m.content;
    return sum + (typeof content === "string" ? content.length : JSON.stringify(content).length);
  }, 0);
  const res = await callWithPool(
    c.env,
    provider,
    (key) => getAdapter(provider).chatCompletions(body, key),
    {
      model: body.model,
      tokenId: caller.tokenId,
      ownerSub: caller.ownerSub,
      ctx: c.executionCtx,
      promptChars,
    },
  );
  if (caller.tokenId !== null && res.status >= 200 && res.status <= 299) {
    await incrementTokenUse(c.env, caller.tokenId);
  }
  return res;
});

export default app;

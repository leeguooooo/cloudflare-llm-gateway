/** OpenAI-compatible routes: `/v1/models` + `/v1/chat/completions`. User auth. */

import { Hono } from "hono";
import type { Env, Provider } from "../types";
import { PROVIDERS } from "../types";
import type { OpenAIChatRequest } from "../providers/types";
import { routeModelToProvider } from "../providers/types";
import { getAdapter } from "../providers";
import { callWithPool } from "../keypool";
import { requireUser, resolveCaller } from "../auth";
import { checkTokenLimits, incrementTokenUse, billingEnabled, getBalanceMicro, providersWithActiveKeys } from "../db";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requireUser);

/** GET /models — only models whose provider currently has ≥1 active key, so
 *  consumers never see (and pick) a model that can't be served right now. */
app.get("/models", async (c) => {
  const avail = await providersWithActiveKeys(c.env);
  const data: Array<{ id: string; object: "model"; owned_by: string }> = [];
  for (const provider of PROVIDERS) {
    if (!avail.has(provider)) continue;
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
  // Auto-fallback: try the requested provider first, then any other provider
  // that currently has active keys (using its default model), so a user never
  // gets a 503 when one provider is down/throttled.
  const avail = await providersWithActiveKeys(c.env);
  const order: Provider[] = [provider];
  for (const p of PROVIDERS) {
    if (p !== provider && avail.has(p)) order.push(p);
  }

  let res: Response | null = null;
  for (const prov of order) {
    const adapter = getAdapter(prov);
    const useModel = prov === provider ? body.model : adapter.models()[0];
    const reqBody: OpenAIChatRequest = prov === provider ? body : { ...body, model: useModel };
    res = await callWithPool(
      c.env,
      prov,
      (key) => adapter.chatCompletions(reqBody, key),
      {
        model: useModel,
        tokenId: caller.tokenId,
        ownerSub: caller.ownerSub,
        ctx: c.executionCtx,
        promptChars,
      },
    );
    if (res.status >= 200 && res.status <= 299) break; // success (incl. stream)
  }

  if (!res) {
    return c.json({ error: { message: "no providers available", type: "upstream_unavailable" } }, 503);
  }
  if (caller.tokenId !== null && res.status >= 200 && res.status <= 299) {
    await incrementTokenUse(c.env, caller.tokenId);
  }
  return res;
});

export default app;

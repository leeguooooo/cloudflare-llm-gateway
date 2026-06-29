/** OpenAI-compatible routes: `/v1/models` + `/v1/chat/completions`. User auth. */

import { Hono } from "hono";
import type { Env, Provider } from "../types";
import { PROVIDERS } from "../types";
import type { OpenAIChatRequest } from "../providers/types";
import { routeModelToProvider, FALLBACK_MODEL } from "../providers/types";
import { getAdapter } from "../providers";
import { callWithPool } from "../keypool";
import { requireUser, resolveCaller } from "../auth";
import { checkTokenLimits, incrementTokenUse, billingEnabled, providersWithActiveKeys, availableModelSet, logRequest, estimateMaxCostMicro, reserveBalance, refundBalance, priceForModel } from "../db";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requireUser);

/** GET /models — only models whose provider currently has ≥1 active key, so
 *  consumers never see (and pick) a model that can't be served right now. */
app.get("/models", async (c) => {
  const avail = await providersWithActiveKeys(c.env);
  // BLOCKED set: models explicitly marked unavailable (a never-probed model is
  // available by default, so it won't appear here).
  const blocked = await availableModelSet(c.env);
  const data: Array<{ id: string; object: "model"; owned_by: string }> = [];
  for (const provider of PROVIDERS) {
    if (!avail.has(provider)) continue;
    for (const id of getAdapter(provider).models()) {
      if (blocked.has(id)) continue;
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
  if (!Array.isArray(body.messages)) {
    return c.json(
      { error: { message: "messages must be an array", type: "invalid_request_error" } },
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
  const promptChars = (body.messages ?? []).reduce((sum, m) => {
    const content: unknown = m.content;
    return sum + (typeof content === "string" ? content.length : JSON.stringify(content).length);
  }, 0);

  // Billing: atomically RESERVE a conservative max-cost hold before dispatch.
  // The conditional deduct is the concurrency-safe overspend gate; we refund the
  // unused hold after the actual per-token charge lands.
  const billing = billingEnabled(c.env) && !!caller.ownerSub;
  const maxTokens = typeof (body as { max_tokens?: unknown }).max_tokens === "number"
    ? (body as { max_tokens: number }).max_tokens : null;
  let hold = 0;
  if (billing) {
    hold = await estimateMaxCostMicro(c.env, body.model, promptChars, maxTokens);
    const okReserve = await reserveBalance(c.env, caller.ownerSub as string, hold);
    if (!okReserve) {
      return c.json({ error: { message: "余额不足,请充值", type: "insufficient_balance" } }, 402);
    }
  }

  try {
    // Auto-fallback: try the requested provider first, then OTHER providers with
    // active keys ordered CHEAPEST-FIRST (by their fallback model's sell price),
    // using each provider's cheapest model — so a substitution doesn't burn balance.
    const allowFallback = (body as { fallback?: unknown }).fallback !== false;
    if ("fallback" in body) delete (body as { fallback?: unknown }).fallback;
    const avail = await providersWithActiveKeys(c.env);
    const order: Provider[] = [provider];
    if (allowFallback) {
      const others = PROVIDERS.filter((p) => p !== provider && avail.has(p));
      const priced = await Promise.all(
        others.map(async (p) => ({ p, price: (await priceForModel(c.env, FALLBACK_MODEL[p])).output }))
      );
      priced.sort((a, b) => a.price - b.price);
      for (const x of priced) order.push(x.p);
    }

    let res: Response | null = null;
    let servedBy: Provider = provider;
    let servedModel = body.model;
    let fellBack = false;
    for (let i = 0; i < order.length; i++) {
      const prov = order[i];
      const adapter = getAdapter(prov);
      const useModel = prov === provider ? body.model : FALLBACK_MODEL[prov];
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
          finalOnFailure: false,
          // Primary provider gets full retries; fallback providers fail fast (≤2 keys).
          maxKeys: i === 0 ? undefined : 2,
        },
      );
      if (res.status >= 200 && res.status <= 299) {
        servedBy = prov;
        servedModel = useModel;
        fellBack = i > 0;
        break;
      }
    }

    if (!res) {
      return c.json({ error: { message: "no providers available", type: "upstream_unavailable" } }, 503);
    }
    const ok = res.status >= 200 && res.status <= 299;
    if (!ok) {
      // Every provider failed — write exactly one final row for this user request.
      await logRequest(c.env, {
        provider, keyId: null, model: body.model, tokenId: caller.tokenId,
        ownerSub: caller.ownerSub, statusCode: res.status, latencyMs: null, ok: false, final: true,
      });
    }
    if (caller.tokenId !== null && ok) {
      await incrementTokenUse(c.env, caller.tokenId);
    }
    if (ok) {
      // Surface who actually served the request (transparency for fallback).
      // Sanitize the model (user-controlled) so an invalid header value can't
      // throw on Headers.set after the request was already charged.
      const safeModel = String(servedModel).replace(/[^\x20-\x7E]/g, "").slice(0, 200);
      const out = new Response(res.body, res);
      out.headers.set("X-KeyPool-Provider", servedBy);
      out.headers.set("X-KeyPool-Model", safeModel);
      if (fellBack) out.headers.set("X-KeyPool-Fallback", "1");
      return out;
    }
    return res;
  } finally {
    // Release the pre-authorized hold; the actual per-token charge (inside
    // callWithPool) is what permanently reduces the balance. Net = actual cost.
    if (billing && hold > 0) await refundBalance(c.env, caller.ownerSub as string, hold);
  }
});

export default app;

/**
 * Shared chat dispatch: billing reserve → cheapest-first cross-provider
 * fallback → per-token charge → refund hold. Returns an OpenAI-shaped Response
 * (stream or JSON), already billed, with X-KeyPool-* headers. Used by both the
 * OpenAI route (/v1/chat/completions) and the Anthropic route (/v1/messages,
 * which translates around it).
 */

import type { Env, Provider } from "./types";
import { PROVIDERS } from "./types";
import type { OpenAIChatRequest } from "./providers/types";
import { routeModelToProvider, FALLBACK_MODEL } from "./providers/types";
import { getAdapter } from "./providers";
import { callWithPool } from "./keypool";
import {
  incrementTokenUse,
  billingEnabled,
  providersWithActiveKeys,
  logRequest,
  estimateMaxCostMicro,
  reserveBalance,
  refundBalance,
  priceForModel,
} from "./db";

export interface Caller {
  tokenId: number | null;
  ownerSub: string | null;
}

export async function serveChat(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  body: OpenAIChatRequest,
  caller: Caller
): Promise<Response> {
  const provider = routeModelToProvider(body.model);
  const promptChars = (body.messages ?? []).reduce((sum, m) => {
    const content: unknown = m.content;
    return sum + (typeof content === "string" ? content.length : JSON.stringify(content).length);
  }, 0);

  const billing = billingEnabled(env) && !!caller.ownerSub;
  const maxTokens =
    typeof (body as { max_tokens?: unknown }).max_tokens === "number"
      ? (body as { max_tokens: number }).max_tokens
      : null;
  let hold = 0;
  if (billing) {
    hold = await estimateMaxCostMicro(env, body.model, promptChars, maxTokens);
    if (!(await reserveBalance(env, caller.ownerSub as string, hold))) {
      return new Response(
        JSON.stringify({ error: { message: "余额不足,请充值", type: "insufficient_balance" } }),
        { status: 402, headers: { "content-type": "application/json" } }
      );
    }
  }

  try {
    const allowFallback = (body as { fallback?: unknown }).fallback !== false;
    if ("fallback" in body) delete (body as { fallback?: unknown }).fallback;
    const avail = await providersWithActiveKeys(env);
    const order: Provider[] = [provider];
    if (allowFallback) {
      const others = PROVIDERS.filter((p) => p !== provider && avail.has(p));
      const priced = await Promise.all(
        others.map(async (p) => ({ p, price: (await priceForModel(env, FALLBACK_MODEL[p])).output }))
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
      res = await callWithPool(env, prov, (key) => adapter.chatCompletions(reqBody, key), {
        model: useModel,
        tokenId: caller.tokenId,
        ownerSub: caller.ownerSub,
        ctx,
        promptChars,
        finalOnFailure: false,
        maxKeys: i === 0 ? undefined : 2,
      });
      if (res.status >= 200 && res.status <= 299) {
        servedBy = prov;
        servedModel = useModel;
        fellBack = i > 0;
        break;
      }
    }

    if (!res) {
      return new Response(
        JSON.stringify({ error: { message: "no providers available", type: "upstream_unavailable" } }),
        { status: 503, headers: { "content-type": "application/json" } }
      );
    }
    const ok = res.status >= 200 && res.status <= 299;
    if (!ok) {
      await logRequest(env, {
        provider, keyId: null, model: body.model, tokenId: caller.tokenId,
        ownerSub: caller.ownerSub, statusCode: res.status, latencyMs: null, ok: false, final: true,
      });
    }
    if (caller.tokenId !== null && ok) {
      await incrementTokenUse(env, caller.tokenId);
    }
    if (ok) {
      const safeModel = String(servedModel).replace(/[^\x20-\x7E]/g, "").slice(0, 200);
      const out = new Response(res.body, res);
      out.headers.set("X-KeyPool-Provider", servedBy);
      out.headers.set("X-KeyPool-Model", safeModel);
      if (fellBack) out.headers.set("X-KeyPool-Fallback", "1");
      return out;
    }
    return res;
  } finally {
    if (billing && hold > 0) await refundBalance(env, caller.ownerSub as string, hold);
  }
}

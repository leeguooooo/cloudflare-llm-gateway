/**
 * Gemini-native API at the root `/v1beta`, translated onto the whole pool:
 *   GET  /v1beta/models
 *   GET  /v1beta/models/{model}
 *   POST /v1beta/models/{model}:generateContent
 *   POST /v1beta/models/{model}:streamGenerateContent[?alt=sse]
 *   POST /v1beta/models/{model}:countTokens
 * Any pooled model id works (not just Gemini). Auth: `x-goog-api-key`,
 * `?key=` or a bearer token. `/gemini/*` stays the raw Gemini passthrough.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { requireUser, resolveCaller } from "../auth";
import { checkTokenLimits } from "../db";
import { serveChat } from "../chat";
import { servableModels } from "./openai";
import { geminiToChat, chatToGemini, chatStreamToGemini, geminiModelEntry } from "../gemini-compat";
import type { GeminiRequest } from "../gemini-compat";
import { passKeypoolHeaders, upstreamErrorMessage } from "../sse";

type AppEnv = { Bindings: Env };
const app = new Hono<AppEnv>();

app.use("*", requireUser);

const STATUS_NAME: Record<number, string> = {
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  402: "RESOURCE_EXHAUSTED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  429: "RESOURCE_EXHAUSTED",
  503: "UNAVAILABLE",
};

function gErr(c: Context<AppEnv>, code: number, message: string): Response {
  return c.json({ error: { code, message, status: STATUS_NAME[code] ?? "INTERNAL" } }, code as 400);
}

/** `/v1beta/models/<rest>` → `<rest>` (model id, maybe with `:method`). */
function modelPath(c: Context<AppEnv>): string {
  const p = new URL(c.req.url).pathname.replace(/\/+$/, "");
  const i = p.indexOf("/models/");
  return i >= 0 ? decodeURIComponent(p.slice(i + "/models/".length)) : "";
}

app.get("/models", async (c) => {
  const models = (await servableModels(c.env)).map((m) => geminiModelEntry(m.id, m.owner));
  return c.json({ models });
});

app.get("/models/*", async (c) => {
  const id = modelPath(c);
  const m = (await servableModels(c.env)).find((x) => x.id === id);
  if (!m) return gErr(c, 404, `models/${id} is not found`);
  return c.json(geminiModelEntry(m.id, m.owner));
});

app.post("/models/*", async (c) => {
  const rest = modelPath(c);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0) return gErr(c, 404, `unsupported path: models/${rest}`);
  const model = rest.slice(0, colon);
  const method = rest.slice(colon + 1);

  let g: GeminiRequest;
  try {
    g = (await c.req.json()) as GeminiRequest;
  } catch {
    return gErr(c, 400, "invalid json body");
  }

  if (method === "countTokens") {
    // No tokenizer at the edge: ~4 chars per token is close enough for clients
    // that only use this to size a prompt.
    const chars = JSON.stringify(g.contents ?? []).length;
    return c.json({ totalTokens: Math.ceil(chars / 4) });
  }
  if (method !== "generateContent" && method !== "streamGenerateContent") {
    return gErr(c, 404, `unsupported method: ${method}`);
  }
  if (!Array.isArray(g?.contents)) return gErr(c, 400, "contents must be an array");

  const caller = await resolveCaller(c.env, c.req.raw);
  if (caller.tokenId !== null) {
    const chk = await checkTokenLimits(c.env, caller.tokenId);
    if (!chk.ok) return gErr(c, chk.status, chk.message);
  }

  const stream = method === "streamGenerateContent";
  const oai = await serveChat(c.env, c.executionCtx, geminiToChat(g, model, stream), caller);
  if (oai.status < 200 || oai.status > 299) {
    return gErr(c, oai.status, await upstreamErrorMessage(oai));
  }
  const passHeaders = passKeypoolHeaders(oai);
  if (stream && oai.body) {
    const sse = new URL(c.req.url).searchParams.get("alt") === "sse";
    return new Response(chatStreamToGemini(oai.body, model, sse), {
      status: 200,
      headers: {
        "content-type": sse ? "text/event-stream; charset=utf-8" : "application/json; charset=utf-8",
        "cache-control": "no-cache",
        ...passHeaders,
      },
    });
  }
  const j = await oai.json().catch(() => ({}));
  return new Response(JSON.stringify(chatToGemini(j as Parameters<typeof chatToGemini>[0], model)), {
    status: 200,
    headers: { "content-type": "application/json", ...passHeaders },
  });
});

export default app;

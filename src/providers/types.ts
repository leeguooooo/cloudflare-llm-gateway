/** Provider adapter contract — authoritative. Do not change signatures. */

import type { Provider } from "../types";

export interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: unknown; name?: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  [k: string]: unknown;
}

export interface ProviderAdapter {
  name: Provider;

  /** OpenAI model ids this provider exposes for GET /v1/models. */
  models(): string[];

  /**
   * Perform an OpenAI-style chat completion using `key`.
   *
   * Contract:
   *  - On upstream SUCCESS: return a 200 Response with an OpenAI-shaped body.
   *    When `req.stream` is true, return `text/event-stream` translated into
   *    OpenAI `chat.completion.chunk` SSE frames terminated by `data: [DONE]`.
   *  - On upstream FAILURE: return a Response whose `status` mirrors the
   *    upstream status (e.g. 401/403/429/5xx) and whose body is the upstream
   *    error text. The pool inspects `status` to classify the key's health,
   *    so failures MUST NOT be swallowed into a 200.
   */
  chatCompletions(req: OpenAIChatRequest, key: string): Promise<Response>;

  /**
   * Native passthrough. `subPath` is everything after `/<provider>` including
   * a leading `/` and the original query string (e.g.
   * `/v1beta/models/gemini-2.0-flash:generateContent?alt=sse`). Inject `key`
   * the way the provider expects and proxy upstream, returning the upstream
   * Response (status + body) unchanged.
   */
  passthrough(subPath: string, req: Request, key: string): Promise<Response>;
}

/** Map an OpenAI `model` string to the provider that should serve it. */
export function routeModelToProvider(model: string): Provider {
  const m = (model || "").toLowerCase();
  if (m.startsWith("gemini")) return "gemini";
  if (
    m.startsWith("mistral") ||
    m.startsWith("open-mistral") ||
    m.startsWith("open-mixtral") ||
    m.startsWith("codestral") ||
    m.startsWith("ministral") ||
    m.startsWith("magistral") ||
    m.startsWith("pixtral") ||
    m.startsWith("devstral")
  ) {
    return "mistral";
  }
  // OpenRouter uses "vendor/model" slugs and serves as the catch-all.
  return "openrouter";
}

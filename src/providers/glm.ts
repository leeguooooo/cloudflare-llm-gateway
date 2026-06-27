/** GLM (Zhipu / 智谱 BigModel, OpenAI-compatible v4) adapter.
 *  NOTE: the chat path is /chat/completions under the /api/paas/v4 base (no /v1).
 *  The API key has the form "<id>.<secret>" and is sent verbatim as a Bearer. */

import type { OpenAIChatRequest, ProviderAdapter } from "./types";
import { stripProviderPrefix } from "./types";

const BASE = "https://open.bigmodel.cn/api/paas/v4";

const glm: ProviderAdapter = {
  name: "glm",

  models(): string[] {
    return ["glm-4-plus", "glm-4-flash", "glm-4-air", "glm-4"];
  },

  async chatCompletions(req: OpenAIChatRequest, key: string): Promise<Response> {
    const body: OpenAIChatRequest = { ...req, model: stripProviderPrefix(req.model) };
    return fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  },

  async passthrough(subPath: string, req: Request, key: string): Promise<Response> {
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.delete("host");
    headers.delete("content-length");
    const method = req.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    return fetch(`${BASE}${subPath}`, { method: req.method, headers, body: hasBody ? req.body : undefined });
  },
};

export default glm;

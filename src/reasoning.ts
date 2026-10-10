/**
 * Thinking / reasoning across protocols and providers.
 *
 * Internally a request carries one field, OpenAI's `reasoning_effort`
 * (none … max), and a response carries one, DeepSeek-style
 * `reasoning_content` (message field + stream delta field). The protocol
 * translators (anthropic.ts, responses.ts, gemini-compat.ts) fold their own
 * knobs into `reasoning_effort` and render `reasoning_content` back out;
 * `applyReasoning` rewrites the field into whatever each upstream expects.
 *
 * Verified against the live upstreams on 2026-10-11: deepseek
 * (`reasoning_effort`, none = off), glm-4.5-flash (`thinking.type`),
 * openrouter (`reasoning.effort`, answers in `reasoning`). Everything else
 * follows the provider's OpenAI-compat docs and is marked unverified.
 */

import type { Provider } from "./types";
import type { OpenAIChatRequest } from "./providers/types";

export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

export function normEffort(v: unknown): Effort | undefined {
  if (typeof v !== "string") return undefined;
  const e = v.trim().toLowerCase();
  return (EFFORTS as string[]).includes(e) ? (e as Effort) : undefined;
}

/** Thinking-token budget → effort (Anthropic `budget_tokens`, Gemini `thinkingBudget`). */
export function effortFromBudget(budget: number): Effort {
  if (budget < 0) return "medium"; // Gemini -1 = dynamic
  if (budget === 0) return "none";
  if (budget <= 1024) return "minimal";
  if (budget <= 4096) return "low";
  if (budget <= 16384) return "medium";
  return "high";
}

/** Effort → thinking-token budget (for Gemini upstreams). */
export function budgetFromEffort(e: Effort): number {
  switch (e) {
    case "none": return 0;
    case "minimal": return 512;
    case "low": return 2048;
    case "medium": return 8192;
    case "high": return 16384;
    default: return 24576;
  }
}

/** Model ids the gateway knows can think; drives `/v1/models` metadata and "auto". */
export function canReason(model: string): boolean {
  const m = (model || "").toLowerCase();
  return (
    m === "auto" ||
    m.startsWith("deepseek-chat") ||
    m.startsWith("deepseek-reasoner") ||
    /^glm-(4\.[5-9]|[5-9])/.test(m) ||
    m.includes("thinking") ||
    /^o[1-9]/.test(m) ||
    m.startsWith("gpt-5") ||
    /^gemini-(2\.5|[3-9])/.test(m) ||
    m === "openrouter/auto"
  );
}

export const REASONING_LEVELS: Effort[] = ["none", "low", "medium", "high"];

/**
 * Entry normalisation for an OpenAI chat body: fold the aliases clients send
 * into `max_tokens` / `reasoning_effort`, so routing, billing and the
 * per-provider clamp all see one field.
 */
export function normalizeChatRequest(body: OpenAIChatRequest): void {
  const b = body as Record<string, unknown>;
  if (typeof b.max_completion_tokens === "number") {
    if (typeof b.max_tokens !== "number") b.max_tokens = b.max_completion_tokens;
    delete b.max_completion_tokens;
  }
  let effort = normEffort(b.reasoning_effort);
  // OpenRouter style `reasoning: {effort | max_tokens | enabled}`.
  const r = b.reasoning as { effort?: unknown; max_tokens?: unknown; enabled?: unknown } | undefined;
  if (!effort && r && typeof r === "object") {
    if (r.enabled === false) effort = "none";
    else effort = normEffort(r.effort) ?? (typeof r.max_tokens === "number" ? effortFromBudget(r.max_tokens) : "medium");
  }
  // GLM / DeepSeek style `thinking: {type}`.
  const t = b.thinking as { type?: unknown; budget_tokens?: unknown } | undefined;
  if (!effort && t && typeof t === "object") {
    if (t.type === "disabled") effort = "none";
    else if (t.type === "enabled" || t.type === "adaptive") {
      effort = typeof t.budget_tokens === "number" ? effortFromBudget(t.budget_tokens) : "medium";
    }
  }
  delete b.reasoning;
  delete b.thinking;
  if (effort) b.reasoning_effort = effort;
  else delete b.reasoning_effort;
}

/** Rewrite `reasoning_effort` into the param `provider` understands (or drop it). */
export function applyReasoning(provider: Provider, body: OpenAIChatRequest): OpenAIChatRequest {
  const out = { ...body } as Record<string, unknown>;
  const effort = normEffort(out.reasoning_effort);
  delete out.reasoning_effort;
  const model = String(out.model || "").toLowerCase();
  if (!effort) {
    // glm-4.5+ thinks by default (22s on a one-line question, verified): when
    // the caller didn't ask for thinking — e.g. "auto" landed here — turn it
    // off so latency matches what a non-thinking request expects.
    if (provider === "glm" && canReason(model)) out.thinking = { type: "disabled" };
    return out as OpenAIChatRequest;
  }

  switch (provider) {
    case "deepseek":
      // Verified: none disables, minimal…xhigh enable. "max" is not a DeepSeek level.
      out.reasoning_effort = effort === "max" ? "xhigh" : effort;
      break;
    case "glm":
      // Verified on glm-4.5-flash; glm-4-flash cannot think (param ignored → just skip it).
      if (canReason(model)) out.thinking = { type: effort === "none" ? "disabled" : "enabled" };
      break;
    case "openrouter":
      // Verified: `reasoning.effort`; answer arrives in `reasoning`.
      out.reasoning = effort === "none" ? { enabled: false } : { effort: effort === "minimal" ? "low" : effort === "max" || effort === "xhigh" ? "high" : effort };
      break;
    case "gemini":
      // The Gemini adapter maps this onto thinkingConfig itself.
      out.reasoning_effort = effort;
      break;
    case "openai":
      // unverified: only reasoning models accept it; gpt-4o would 400.
      if (canReason(model)) out.reasoning_effort = effort === "max" ? "xhigh" : effort;
      break;
    case "qwen":
      // unverified: DashScope OpenAI-compat `enable_thinking` (qwen3 / qwen-plus).
      if (model.startsWith("qwen3") || model === "qwen-plus") out.enable_thinking = effort !== "none";
      break;
    case "groq":
    case "cerebras":
    case "fireworks":
    case "deepinfra":
      // unverified: these accept `reasoning_effort` only on reasoning models (gpt-oss, qwen3 …).
      if (/gpt-oss|qwen3|deepseek-r1|magistral/.test(model)) out.reasoning_effort = effort === "minimal" ? "low" : effort === "max" || effort === "xhigh" ? "high" : effort;
      break;
    default:
      // mistral / cohere / moonshot / ai21: reject unknown fields — drop it.
      break;
  }
  return out as OpenAIChatRequest;
}

/** Providers that answer with `reasoning` instead of `reasoning_content`. */
const RENAME_REASONING = new Set<string>(["openrouter", "groq", "cerebras", "fireworks", "deepinfra"]);

function renameInPlace(obj: Record<string, unknown> | undefined): void {
  if (!obj) return;
  if (typeof obj.reasoning === "string" && obj.reasoning_content == null) obj.reasoning_content = obj.reasoning;
  delete obj.reasoning;
  delete obj.reasoning_details;
}

/**
 * Normalise an OK chat response so reasoning always sits in
 * `reasoning_content` (JSON message and SSE delta alike).
 */
export async function normalizeReasoningResponse(provider: Provider, res: Response): Promise<Response> {
  if (!RENAME_REASONING.has(provider) || !res.body) return res;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) {
    const t = await res.text();
    let out = t;
    try {
      const j = JSON.parse(t) as { choices?: Array<{ message?: Record<string, unknown> }> };
      for (const c of j.choices ?? []) renameInPlace(c.message);
      out = JSON.stringify(j);
    } catch {
      /* not JSON — pass through */
    }
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(out, { status: res.status, headers });
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  const rewrite = (line: string): string => {
    if (!line.startsWith("data:")) return line;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return line;
    try {
      const j = JSON.parse(data) as { choices?: Array<{ delta?: Record<string, unknown> }> };
      for (const c of j.choices ?? []) renameInPlace(c.delta);
      return "data: " + JSON.stringify(j);
    } catch {
      return line;
    }
  };
  const ts = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      if (lines.length) controller.enqueue(enc.encode(lines.map(rewrite).join("\n") + "\n"));
    },
    flush(controller) {
      if (buf) controller.enqueue(enc.encode(rewrite(buf)));
    },
  });
  return new Response(res.body.pipeThrough(ts), res);
}

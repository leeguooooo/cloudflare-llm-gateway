/**
 * Gemini generateContent <-> OpenAI Chat Completions translation, so
 * Gemini-native clients (google-genai SDK, Magpie's "Gemini" mode, Cherry
 * Studio …) can reach EVERY pooled provider at /v1beta/models/{model}:…,
 * not just Gemini keys (that's what the raw /gemini/* passthrough is for).
 */

import type { OpenAIChatRequest } from "./providers/types";
import { forEachOpenAIChunk, ToolCallAccumulator } from "./sse";
import { effortFromBudget, normEffort } from "./reasoning";

// ---------- request: Gemini -> Chat ----------

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  fileData?: { mimeType?: string; fileUri?: string };
  functionCall?: { name?: string; args?: unknown; id?: string };
  functionResponse?: { name?: string; response?: unknown; id?: string };
  thought?: boolean;
}

export interface GeminiRequest {
  contents?: Array<{ role?: string; parts?: GeminiPart[] }>;
  systemInstruction?: { parts?: GeminiPart[] } | string;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string; includeThoughts?: boolean };
  };
  tools?: Array<{ functionDeclarations?: Array<{ name?: string; description?: string; parameters?: unknown; parametersJsonSchema?: unknown }> }>;
}

function partsText(parts: GeminiPart[] | undefined): string {
  return (parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
}

export function geminiToChat(g: GeminiRequest, model: string, stream: boolean): OpenAIChatRequest {
  const messages: OpenAIChatRequest["messages"] = [];
  const sys = typeof g.systemInstruction === "string" ? g.systemInstruction : partsText(g.systemInstruction?.parts);
  if (sys) messages.push({ role: "system", content: sys });

  let callSeq = 0;
  const pendingIds: string[] = [];
  for (const c of g.contents ?? []) {
    const role = c.role === "model" ? "assistant" : "user";
    const parts = c.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    const responses = parts.filter((p) => p.functionResponse);

    for (const p of responses) {
      const id = p.functionResponse?.id || pendingIds.shift() || `call_${callSeq++}`;
      messages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(p.functionResponse?.response ?? {}),
      } as OpenAIChatRequest["messages"][number]);
    }

    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    for (const p of parts) {
      if (typeof p.text === "string" && !p.thought) content.push({ type: "text", text: p.text });
      else if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
      } else if (p.fileData?.fileUri) {
        content.push({ type: "image_url", image_url: { url: p.fileData.fileUri } });
      }
    }
    const flat = content.every((x) => x.type === "text") ? content.map((x) => (x as { text: string }).text).join("") : content;

    if (calls.length) {
      const toolCalls = calls.map((p) => {
        const id = p.functionCall?.id || `call_${callSeq++}`;
        pendingIds.push(id);
        return { id, type: "function", function: { name: p.functionCall?.name ?? "", arguments: JSON.stringify(p.functionCall?.args ?? {}) } };
      });
      messages.push({ role: "assistant", content: flat || null, tool_calls: toolCalls } as OpenAIChatRequest["messages"][number]);
    } else if (content.length || !responses.length) {
      messages.push({ role, content: flat });
    }
  }

  const gc = g.generationConfig ?? {};
  const out: OpenAIChatRequest = {
    model,
    messages,
    stream: stream ? true : undefined,
    max_tokens: typeof gc.maxOutputTokens === "number" ? gc.maxOutputTokens : undefined,
    temperature: typeof gc.temperature === "number" ? gc.temperature : undefined,
    top_p: typeof gc.topP === "number" ? gc.topP : undefined,
    stop: Array.isArray(gc.stopSequences) && gc.stopSequences.length ? gc.stopSequences : undefined,
  };
  const tc = gc.thinkingConfig;
  const effort = tc ? (normEffort(tc.thinkingLevel) ?? (typeof tc.thinkingBudget === "number" ? effortFromBudget(tc.thinkingBudget) : undefined)) : undefined;
  if (effort) out.reasoning_effort = effort;
  const decls = (g.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).filter((d) => d.name);
  if (decls.length) {
    out.tools = decls.map((d) => ({
      type: "function",
      function: { name: d.name, description: d.description, parameters: d.parameters ?? d.parametersJsonSchema ?? { type: "object", properties: {} } },
    }));
  }
  return out;
}

// ---------- response: Chat -> Gemini ----------

function mapFinish(f: string | null | undefined): string {
  switch (f) {
    case "length": return "MAX_TOKENS";
    case "content_filter": return "SAFETY";
    default: return "STOP";
  }
}

function parseArgs(s: string): unknown {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function candidate(parts: GeminiPart[], finish: string | null) {
  const c: Record<string, unknown> = { content: { role: "model", parts }, index: 0 };
  if (finish !== null) c.finishReason = finish;
  return c;
}

function usageMeta(inTok: number, outTok: number) {
  return { promptTokenCount: inTok, candidatesTokenCount: outTok, totalTokenCount: inTok + outTok };
}

interface ChatCompletion {
  choices?: Array<{
    message?: { content?: unknown; reasoning_content?: unknown; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Whether the Gemini caller asked to see thoughts (`includeThoughts`). */
export function wantsThoughts(g: GeminiRequest): boolean {
  return g.generationConfig?.thinkingConfig?.includeThoughts === true;
}

export function chatToGemini(c: ChatCompletion, model: string, thoughts = false): unknown {
  const ch = c.choices?.[0];
  const parts: GeminiPart[] = [];
  const thinking = typeof ch?.message?.reasoning_content === "string" ? ch.message.reasoning_content : "";
  if (thoughts && thinking) parts.push({ text: thinking, thought: true });
  const text = typeof ch?.message?.content === "string" ? ch.message.content : "";
  if (text || !ch?.message?.tool_calls?.length) parts.push({ text });
  for (const t of ch?.message?.tool_calls ?? []) {
    parts.push({ functionCall: { id: t.id, name: t.function?.name ?? "", args: parseArgs(t.function?.arguments ?? "") } });
  }
  return {
    candidates: [candidate(parts, mapFinish(ch?.finish_reason))],
    usageMetadata: usageMeta(c.usage?.prompt_tokens ?? 0, c.usage?.completion_tokens ?? 0),
    modelVersion: model,
  };
}

/**
 * Translate a chat SSE stream into Gemini streamGenerateContent output. With
 * `sse` the frames are `data: {GenerateContentResponse}`; without it Gemini
 * streams a single JSON array, which we emit incrementally as `[obj,obj,…]`.
 */
export function chatStreamToGemini(upstream: ReadableStream<Uint8Array>, model: string, sse: boolean, thoughts = false): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let first = true;
      const emit = (obj: unknown) => {
        const json = JSON.stringify(obj);
        if (sse) controller.enqueue(enc.encode(`data: ${json}\r\n\r\n`));
        else {
          controller.enqueue(enc.encode((first ? "[" : ",\r\n") + json));
          first = false;
        }
      };
      void (async () => {
        let finish: string | null = null;
        let inTok = 0;
        let outTok = 0;
        const tools = new ToolCallAccumulator();
        await forEachOpenAIChunk(upstream, (chunk) => {
          if (chunk.usage) {
            if (typeof chunk.usage.prompt_tokens === "number") inTok = chunk.usage.prompt_tokens;
            if (typeof chunk.usage.completion_tokens === "number") outTok = chunk.usage.completion_tokens;
          }
          const ch = chunk.choices?.[0];
          if (!ch) return;
          const thought = (ch.delta as { reasoning_content?: string | null } | undefined)?.reasoning_content;
          if (thoughts && typeof thought === "string" && thought.length) {
            emit({ candidates: [candidate([{ text: thought, thought: true }], null)], modelVersion: model });
          }
          const piece = ch.delta?.content;
          if (typeof piece === "string" && piece.length) {
            emit({ candidates: [candidate([{ text: piece }], null)], modelVersion: model });
          }
          if (ch.delta?.tool_calls) tools.add(ch.delta.tool_calls);
          if (ch.finish_reason) finish = ch.finish_reason;
        });
        try {
          const parts: GeminiPart[] = tools.list().map((t) => ({ functionCall: { id: t.id || undefined, name: t.name, args: parseArgs(t.args) } }));
          if (!parts.length) parts.push({ text: "" });
          emit({ candidates: [candidate(parts, mapFinish(finish))], usageMetadata: usageMeta(inTok, outTok), modelVersion: model });
          if (!sse) controller.enqueue(enc.encode("]"));
          controller.close();
        } catch {
          /* already closed */
        }
      })();
    },
  });
}

/** Gemini `Model` resource for GET /v1beta/models. */
export function geminiModelEntry(id: string, owner: string) {
  return {
    name: `models/${id}`,
    baseModelId: id,
    version: "001",
    displayName: id,
    description: `${id} via keypool (${owner})`,
    inputTokenLimit: 128000,
    outputTokenLimit: 8192,
    supportedGenerationMethods: ["generateContent", "streamGenerateContent", "countTokens"],
  };
}

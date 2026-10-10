/**
 * OpenAI Responses API <-> Chat Completions translation, so Responses-native
 * clients (Codex CLI, the OpenAI SDK's `client.responses`, Magpie's
 * "OpenAI Responses" mode) can use the gateway at POST /v1/responses. Requests
 * are translated to chat, dispatched through the shared pool, and the chat
 * response (JSON or SSE) is translated back into the Responses shape.
 */

import type { OpenAIChatRequest } from "./providers/types";
import { forEachOpenAIChunk, randomHex, ToolCallAccumulator } from "./sse";
import { normEffort } from "./reasoning";

// ---------- request: Responses -> Chat ----------

type ContentPart = { type?: string; text?: string; image_url?: string | { url?: string }; [k: string]: unknown };

interface InputItem {
  type?: string;
  role?: string;
  content?: string | ContentPart[];
  // function_call
  call_id?: string;
  name?: string;
  arguments?: string;
  // function_call_output
  output?: unknown;
}

export interface ResponsesRequest {
  model: string;
  input?: string | InputItem[];
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: Array<{ type?: string; name?: string; description?: string; parameters?: unknown; strict?: boolean }>;
  tool_choice?: unknown;
  reasoning?: { effort?: string; summary?: string };
  [k: string]: unknown;
}

function partsToChatContent(content: string | ContentPart[] | undefined): unknown {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  for (const p of content) {
    if (!p) continue;
    if (p.type === "input_text" || p.type === "output_text" || p.type === "text") {
      parts.push({ type: "text", text: String(p.text ?? "") });
    } else if (p.type === "input_image") {
      const url = typeof p.image_url === "string" ? p.image_url : p.image_url?.url;
      if (url) parts.push({ type: "image_url", image_url: { url } });
    }
  }
  if (parts.every((p) => p.type === "text")) return parts.map((p) => (p as { text: string }).text).join("");
  return parts;
}

/** Build a chat-completions request from a Responses request. */
export function responsesToChat(r: ResponsesRequest): OpenAIChatRequest {
  const messages: OpenAIChatRequest["messages"] = [];
  if (r.instructions) messages.push({ role: "system", content: r.instructions });

  if (typeof r.input === "string") {
    messages.push({ role: "user", content: r.input });
  } else if (Array.isArray(r.input)) {
    for (const item of r.input) {
      if (!item) continue;
      if (item.type === "function_call") {
        const call = { id: item.call_id ?? "", type: "function", function: { name: item.name ?? "", arguments: item.arguments ?? "" } };
        const last = messages[messages.length - 1] as { role: string; tool_calls?: unknown[] } | undefined;
        if (last && last.role === "assistant" && Array.isArray(last.tool_calls)) last.tool_calls.push(call);
        else messages.push({ role: "assistant", content: null, tool_calls: [call] } as OpenAIChatRequest["messages"][number]);
      } else if (item.type === "function_call_output") {
        const out = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? "");
        messages.push({ role: "tool", content: out, tool_call_id: item.call_id ?? "" } as OpenAIChatRequest["messages"][number]);
      } else if (item.type === undefined || item.type === "message") {
        // Responses uses "developer" where chat providers expect "system".
        const role = item.role === "developer" ? "system" : item.role ?? "user";
        messages.push({ role, content: partsToChatContent(item.content) });
      }
      // reasoning / web_search_call / other item types are dropped.
    }
  }

  const out: OpenAIChatRequest = {
    model: r.model,
    messages,
    stream: r.stream === true ? true : undefined,
    max_tokens: typeof r.max_output_tokens === "number" ? r.max_output_tokens : undefined,
    temperature: typeof r.temperature === "number" ? r.temperature : undefined,
    top_p: typeof r.top_p === "number" ? r.top_p : undefined,
  };
  const fnTools = (r.tools ?? []).filter((t) => t && t.type === "function" && t.name);
  if (fnTools.length) {
    out.tools = fnTools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } },
    }));
    if (typeof r.tool_choice === "string") out.tool_choice = r.tool_choice;
    else if (r.tool_choice && typeof r.tool_choice === "object" && (r.tool_choice as { name?: string }).name) {
      out.tool_choice = { type: "function", function: { name: (r.tool_choice as { name: string }).name } };
    }
  }
  if ("fallback" in r) out.fallback = r.fallback;
  const effort = normEffort(r.reasoning?.effort);
  if (effort) out.reasoning_effort = effort;
  return out;
}

// ---------- response: Chat -> Responses ----------

interface ChatCompletion {
  choices?: Array<{
    message?: { content?: unknown; reasoning_content?: unknown; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function usageOf(inTok: number, outTok: number) {
  return {
    input_tokens: inTok,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: outTok,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: inTok + outTok,
  };
}

function baseResponse(id: string, model: string, r: ResponsesRequest, status: string) {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    error: null,
    incomplete_details: null as null | { reason: string },
    instructions: r.instructions ?? null,
    max_output_tokens: r.max_output_tokens ?? null,
    model,
    output: [] as unknown[],
    parallel_tool_calls: true,
    temperature: r.temperature ?? null,
    tool_choice: r.tool_choice ?? "auto",
    tools: r.tools ?? [],
    top_p: r.top_p ?? null,
    usage: null as null | ReturnType<typeof usageOf>,
  };
}

function messageItem(id: string, text: string, status = "completed") {
  return {
    type: "message",
    id,
    status,
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [] }],
  };
}

function reasoningItem(id: string, text: string) {
  return { type: "reasoning", id, summary: text ? [{ type: "summary_text", text }] : [] };
}

function functionCallItem(callId: string, name: string, args: string) {
  return { type: "function_call", id: "fc_" + randomHex(12), call_id: callId || "call_" + randomHex(12), name, arguments: args, status: "completed" };
}

/** Translate a non-streaming chat completion into a Responses object. */
export function chatToResponses(c: ChatCompletion, r: ResponsesRequest): unknown {
  const choice = c.choices?.[0];
  const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
  const resp = baseResponse("resp_" + randomHex(24), r.model, r, "completed");
  const thinking = typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content : "";
  if (thinking) resp.output.push(reasoningItem("rs_" + randomHex(24), thinking));
  if (text || !choice?.message?.tool_calls?.length) resp.output.push(messageItem("msg_" + randomHex(24), text));
  for (const t of choice?.message?.tool_calls ?? []) {
    resp.output.push(functionCallItem(t.id ?? "", t.function?.name ?? "", t.function?.arguments ?? ""));
  }
  if (choice?.finish_reason === "length") {
    resp.status = "incomplete";
    resp.incomplete_details = { reason: "max_output_tokens" };
  }
  const inTok = c.usage?.prompt_tokens ?? 0;
  const outTok = c.usage?.completion_tokens ?? 0;
  resp.usage = usageOf(inTok, outTok);
  return { ...resp, output_text: text };
}

/**
 * Translate a chat SSE stream into the Responses SSE event sequence:
 * response.created → in_progress → [reasoning item: summary_text deltas] →
 * message item: output_text deltas → (function_call items) →
 * response.completed. Output indices follow the order items open.
 */
export function chatStreamToResponses(upstream: ReadableStream<Uint8Array>, r: ResponsesRequest): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const respId = "resp_" + randomHex(24);
  const msgId = "msg_" + randomHex(24);
  const rsId = "rs_" + randomHex(24);
  let seq = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: seq++, ...data })}\n\n`));
      };

      void (async () => {
        const base = baseResponse(respId, r.model, r, "in_progress");
        emit("response.created", { response: base });
        emit("response.in_progress", { response: base });

        const output: unknown[] = [];
        let text = "";
        let thinking = "";
        let msgIdx = -1;
        let rsIdx = -1;
        let rsDone = false;
        let finish: string | null = null;
        let inTok = 0;
        let outTok = 0;
        const tools = new ToolCallAccumulator();

        const openReasoning = () => {
          if (rsIdx >= 0) return;
          rsIdx = output.length;
          output.push(null);
          emit("response.output_item.added", { output_index: rsIdx, item: { ...reasoningItem(rsId, ""), summary: [] } });
          emit("response.reasoning_summary_part.added", { item_id: rsId, output_index: rsIdx, summary_index: 0, part: { type: "summary_text", text: "" } });
        };
        const closeReasoning = () => {
          if (rsIdx < 0 || rsDone) return;
          rsDone = true;
          emit("response.reasoning_summary_text.done", { item_id: rsId, output_index: rsIdx, summary_index: 0, text: thinking });
          emit("response.reasoning_summary_part.done", { item_id: rsId, output_index: rsIdx, summary_index: 0, part: { type: "summary_text", text: thinking } });
          const item = reasoningItem(rsId, thinking);
          emit("response.output_item.done", { output_index: rsIdx, item });
          output[rsIdx] = item;
        };
        const openMsg = () => {
          if (msgIdx >= 0) return;
          closeReasoning();
          msgIdx = output.length;
          output.push(null);
          emit("response.output_item.added", { output_index: msgIdx, item: { ...messageItem(msgId, "", "in_progress"), content: [] } });
          emit("response.content_part.added", { item_id: msgId, output_index: msgIdx, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
        };

        await forEachOpenAIChunk(upstream, (chunk) => {
          if (chunk.usage) {
            if (typeof chunk.usage.prompt_tokens === "number") inTok = chunk.usage.prompt_tokens;
            if (typeof chunk.usage.completion_tokens === "number") outTok = chunk.usage.completion_tokens;
          }
          const ch = chunk.choices?.[0];
          if (!ch) return;
          const thought = (ch.delta as { reasoning_content?: string | null } | undefined)?.reasoning_content;
          if (typeof thought === "string" && thought.length && msgIdx < 0) {
            openReasoning();
            thinking += thought;
            emit("response.reasoning_summary_text.delta", { item_id: rsId, output_index: rsIdx, summary_index: 0, delta: thought });
          }
          const piece = ch.delta?.content;
          if (typeof piece === "string" && piece.length) {
            openMsg();
            text += piece;
            emit("response.output_text.delta", { item_id: msgId, output_index: msgIdx, content_index: 0, delta: piece, logprobs: [] });
          }
          if (ch.delta?.tool_calls) tools.add(ch.delta.tool_calls);
          if (ch.finish_reason) finish = ch.finish_reason;
        });

        try {
          closeReasoning();
          const calls = tools.list();
          if (msgIdx >= 0 || calls.length === 0) {
            openMsg();
            emit("response.output_text.done", { item_id: msgId, output_index: msgIdx, content_index: 0, text, logprobs: [] });
            emit("response.content_part.done", { item_id: msgId, output_index: msgIdx, content_index: 0, part: { type: "output_text", text, annotations: [] } });
            const item = messageItem(msgId, text);
            emit("response.output_item.done", { output_index: msgIdx, item });
            output[msgIdx] = item;
          }
          for (const c of calls) {
            const idx = output.length;
            const item = functionCallItem(c.id, c.name, c.args);
            emit("response.output_item.added", { output_index: idx, item: { ...item, arguments: "", status: "in_progress" } });
            emit("response.function_call_arguments.delta", { item_id: item.id, output_index: idx, delta: c.args });
            emit("response.function_call_arguments.done", { item_id: item.id, output_index: idx, arguments: c.args });
            emit("response.output_item.done", { output_index: idx, item });
            output.push(item);
          }
          const done = baseResponse(respId, r.model, r, finish === "length" ? "incomplete" : "completed");
          if (finish === "length") done.incomplete_details = { reason: "max_output_tokens" };
          done.output = output;
          done.usage = usageOf(inTok, outTok);
          emit(finish === "length" ? "response.incomplete" : "response.completed", { response: done });
          controller.close();
        } catch {
          /* already closed */
        }
      })();
    },
  });
}

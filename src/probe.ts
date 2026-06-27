/**
 * Shared key probing. `probeKey` does a per-provider liveness/balance check
 * (chat-based where /models would lie about a suspended/arrears account);
 * `runCheckAll` probes every key and auto-revives the healthy ones / auto-
 * disables the dead ones. Used by the admin "检测全部" button, the per-key
 * "测活", and the scheduled (cron) auto health-check.
 */

import type { Env, Provider } from "./types";
import { listAllKeys, reactivateKey, applyOutcome } from "./db";
import { cooldownMinutes, MAX_CONSECUTIVE_FAILS } from "./keypool";

export interface KeyBalance {
  remaining: number | null;
  total: number | null;
  usage: number | null;
  unit: string;
}

export interface ProbeResult {
  alive: boolean;
  status: number;
  rateLimited: boolean;
  balance: KeyBalance | null;
  error?: string;
}

/** Live-probe one key. OpenRouter/DeepSeek also return real balance. */
export async function probeKey(provider: Provider, key: string): Promise<ProbeResult> {
  try {
    if (provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/credits", { headers: { authorization: `Bearer ${key}` } });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      const j = (await r.json().catch(() => null)) as { data?: { total_credits?: number; total_usage?: number } } | null;
      const total = j?.data?.total_credits ?? null;
      const usage = j?.data?.total_usage ?? null;
      const remaining = total !== null && usage !== null ? total - usage : null;
      const alive = r.ok && (remaining === null || remaining > 0);
      return { alive, status: r.status, rateLimited: false, balance: { remaining, total, usage, unit: "credits" }, error: alive ? undefined : "余额不足" };
    }
    if (provider === "mistral") {
      const r = await fetch("https://api.mistral.ai/v1/models", { headers: { authorization: `Bearer ${key}` } });
      return { alive: r.ok, status: r.status, rateLimited: r.status === 429, balance: null, error: r.ok ? undefined : `http ${r.status}` };
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
      return { alive: r.ok, status: r.status, rateLimited: r.status === 429, balance: null, error: r.ok ? undefined : `http ${r.status}` };
    }
    if (provider === "deepseek") {
      const r = await fetch("https://api.deepseek.com/user/balance", { headers: { authorization: `Bearer ${key}` } });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      if (!r.ok) return { alive: false, status: r.status, rateLimited: r.status === 429, balance: null, error: `http ${r.status}` };
      const j = (await r.json().catch(() => null)) as { balance_infos?: Array<{ total_balance?: string | number; currency?: string }> } | null;
      const info = j?.balance_infos?.[0] ?? null;
      const remaining = info && info.total_balance != null ? Number(info.total_balance) : null;
      const unit = info?.currency ?? "USD";
      return { alive: true, status: r.status, rateLimited: false, balance: { remaining, total: null, usage: null, unit } };
    }
    if (provider === "groq") {
      const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
      return { alive: r.ok, status: r.status, rateLimited: r.status === 429, balance: null, error: r.ok ? undefined : `http ${r.status}` };
    }
    if (provider === "moonshot") {
      const r = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "moonshot-v1-8k", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        const arrears = /insufficient|balance|余额|exceeded_current_quota/i.test(t);
        return { alive: false, status: r.status, rateLimited: r.status === 429 && !arrears, balance: null, error: arrears ? "欠费/余额不足" : `http ${r.status}` };
      }
      return { alive: true, status: r.status, rateLimited: false, balance: null };
    }
    if (provider === "qwen") {
      const r = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "qwen-turbo", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        const arrears = /arrearage|overdue|欠费|insufficient/i.test(t);
        return { alive: false, status: r.status, rateLimited: r.status === 429, balance: null, error: arrears ? "欠费/余额不足" : `http ${r.status}` };
      }
      return { alive: true, status: r.status, rateLimited: false, balance: null };
    }
    if (provider === "glm") {
      const r = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "glm-4-flash", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      });
      if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
      return { alive: r.ok, status: r.status, rateLimited: r.status === 429, balance: null, error: r.ok ? undefined : `http ${r.status}` };
    }
    // gemini — /v1beta/models is NOT rate-limited and lies about usability, so
    // probe the actual generateContent path with a 1-token request.
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "hi" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      }
    );
    if (r.status === 401 || r.status === 403) return { alive: false, status: r.status, rateLimited: false, balance: null, error: "invalid key" };
    const rateLimited = r.status === 429; // valid key, just throttled (per-minute/day)
    const alive = r.ok || rateLimited;
    return { alive, status: r.status, rateLimited, balance: null, error: r.ok ? undefined : rateLimited ? "限流" : `http ${r.status}` };
  } catch (err) {
    return { alive: false, status: 0, rateLimited: false, balance: null, error: String(err instanceof Error ? err.message : err) };
  }
}

/** Probe every key (capped for the subrequest limit): revive healthy, disable dead. */
export async function runCheckAll(
  env: Env,
  limit = 48
): Promise<{ checked: number; alive: number; dead: number; capped: boolean }> {
  const all = await listAllKeys(env);
  const subset = all.slice(0, limit);
  const results = await Promise.all(
    subset.map(async (k) => {
      try {
        const r = await probeKey(k.provider, k.api_key);
        if (r.alive && !r.rateLimited && k.status !== "active") {
          await reactivateKey(env, k.id);
        } else if (r.rateLimited && k.status === "active") {
          // Valid key but can't serve right now — cool it down so it shows as
          // 'cooldown' (not a misleading green 'active') and is skipped until it
          // recovers; inline revive brings it back when cooldown_until passes.
          await applyOutcome(
            env,
            k.id,
            { kind: "cooldown", minutes: cooldownMinutes(env), reason: r.error || "rate limited" },
            { cooldownMinutes: cooldownMinutes(env), maxConsecutive: MAX_CONSECUTIVE_FAILS }
          );
        } else if (!r.alive && !r.rateLimited && k.status === "active") {
          await applyOutcome(
            env,
            k.id,
            { kind: "disable", reason: r.error || `http ${r.status}` },
            { cooldownMinutes: cooldownMinutes(env), maxConsecutive: MAX_CONSECUTIVE_FAILS }
          );
        }
        return r.alive && !r.rateLimited;
      } catch {
        return false;
      }
    })
  );
  const alive = results.filter(Boolean).length;
  return { checked: results.length, alive, dead: results.length - alive, capped: all.length > subset.length };
}

# keypool-gateway v4 — streaming usage + billing + more providers

Three features, one batch. Runtime: Cloudflare Worker, Hono v4, TS strict, ESM,
WebCrypto only. Timestamps epoch ms. All D1 objects prefixed `keypool_gateway_`.
Money is integer **micro-USD** (1 USD = 1_000_000). Token prices are micro-USD
per **1M tokens**.

## Central changes ALREADY DONE by the integrator (read, rely on, don't redo)
- `src/types.ts`: `Provider` union now also includes `"openai" | "deepseek" | "groq"`; `PROVIDERS` updated. `Env` gains `BILLING_ENABLED?: string` (="1" to enforce) and `DEFAULT_PRICE_MICRO?: string`.
- `src/providers/types.ts`: `routeModelToProvider(model)` now supports an explicit `"<provider>:<model>"` prefix (e.g. `"groq:llama-3.3-70b-versatile"`) AND name patterns: `gpt-*`/`o1*`/`o3*`/`o4*`→openai, `deepseek-*`→deepseek; mistral/gemini as before; openrouter is catch-all.
- D1 migrated: `keypool_gateway_users.balance_micro INTEGER NOT NULL DEFAULT 0`; new tables `keypool_gateway_transactions` and `keypool_gateway_prices`; `request_logs` already has token_id/owner_sub/total_tokens/final.
- `src/db.ts` `logRequest` MUST be changed (see below) to RETURN the inserted row id.

### transactions / prices schema (already migrated; for reference)
```sql
keypool_gateway_transactions(
  id INTEGER PK AUTOINCREMENT, sub TEXT NOT NULL, kind TEXT NOT NULL,  -- topup | charge
  amount_micro INTEGER NOT NULL, balance_after_micro INTEGER NOT NULL,
  model TEXT, tokens INTEGER, note TEXT, created_at INTEGER NOT NULL)
keypool_gateway_prices(model TEXT PRIMARY KEY, price_per_mtok_micro INTEGER NOT NULL)
```

---

## Feature C — more providers (openai, deepseek, groq)

Each is **OpenAI-compatible** (like the existing `openrouter.ts`). Create:
- `src/providers/openai.ts` — base `https://api.openai.com`. chatCompletions → POST `/v1/chat/completions` with `Authorization: Bearer <key>`, body forwarded as-is, status/stream preserved. passthrough → proxy subPath with bearer. models(): `["gpt-4o","gpt-4o-mini","o3-mini"]`. check/balance: liveness via GET `/v1/models`; no balance.
- `src/providers/deepseek.ts` — base `https://api.deepseek.com`. Same OpenAI-compatible shape. models(): `["deepseek-chat","deepseek-reasoner"]`. **Balance available**: GET `/user/balance` with bearer returns `{ balance_infos: [{ total_balance, currency }] }`.
- `src/providers/groq.ts` — base `https://api.groq.com/openai`. OpenAI-compatible at `/openai/v1/chat/completions`. models(): `["llama-3.3-70b-versatile","llama-3.1-8b-instant"]`. liveness via GET `/openai/v1/models`; no balance.

Each exports `default` a `ProviderAdapter` (see `src/providers/types.ts`). Then update
`src/providers/index.ts` `getAdapter()` to register all six providers (switch on the
union). Mirror `openrouter.ts` exactly for structure.

Note: the admin per-key `check` route in `src/routes/admin.ts` has a `probeKey(provider,key)`
switch — extend it: openai → GET api.openai.com/v1/models (bearer); deepseek → GET
api.deepseek.com/user/balance (bearer) and return `balance {remaining,total,usage:null,unit:"USD"}`
from `balance_infos[0].total_balance`; groq → GET api.groq.com/openai/v1/models (bearer).

---

## Feature A — streaming token counting

Today `callWithPool` only captures `total_tokens` from non-stream JSON. Add streaming:

1. `src/db.ts`:
   - `logRequest(...)` MUST RETURN `Promise<number | null>` — the inserted row id (use `result.meta.last_row_id`; return null on failure).
   - ADD `export function updateLogTokens(env: Env, logId: number, totalTokens: number): Promise<void>` — `UPDATE keypool_gateway_request_logs SET total_tokens = ? WHERE id = ?`.

2. `src/keypool.ts` `callWithPool`:
   - Signature gains `meta.ctx?: ExecutionContext`.
   - On streaming success (status 2xx AND content-type includes `text/event-stream`): tee the body with `res.body.tee()` → `[clientStream, scanStream]`. Return a NEW `Response(clientStream, { status, headers: res.headers })` to the caller. Capture the `final` log row id from `logRequest`. Then, in the background (`meta.ctx.waitUntil(...)` if present, else fire-and-forget), read `scanStream` to the end, parse SSE `data:` lines for a usage object (`usage.total_tokens` for OpenAI-shaped, or Gemini `usageMetadata.totalTokenCount`), and if found: `await updateLogTokens(env, logId, tokens)` and (if billing) `await chargeForUsage(env, ownerSub, model, tokens)`.
   - Non-stream success path stays as-is (already captures total_tokens), PLUS now also charge (see Feature B).
   - The existing `logRequest` calls just need to keep working with the new return type (ignore the returned id where not needed).

3. Routes `openai.ts` + `passthrough.ts`: pass `ctx: c.executionCtx` into the `callWithPool` meta so the streaming scan survives. (Use `c.executionCtx` — Hono exposes it.)

---

## Feature B — billing (balance + pricing + deduct + admin top-up)

**Gated by `env.BILLING_ENABLED === "1"`** — when off, NO balance checks or charges (current behavior). Charges/balances apply to a caller's `ownerSub` (consumers). Admin-token / session-only callers (ownerSub null) are never charged.

`src/db.ts` add:
```ts
export function billingEnabled(env: Env): boolean;                 // env.BILLING_ENABLED === "1"
export function getBalanceMicro(env: Env, sub: string): Promise<number>;   // users.balance_micro, 0 if no row
export function priceForModelMicro(env: Env, model: string | null): Promise<number>; // prices table by exact model, else Number(env.DEFAULT_PRICE_MICRO||"500000")
export function chargeForUsage(env: Env, sub: string | null, model: string | null, tokens: number | null): Promise<void>;
//   no-op if !sub or !tokens or !billingEnabled. cost = round(tokens * priceForModelMicro / 1_000_000).
//   UPDATE users SET balance_micro = balance_micro - cost WHERE sub=?; INSERT a 'charge' transaction with balance_after.
export function topUpMicro(env: Env, sub: string, amountMicro: number, note: string | null): Promise<number>; // adds, inserts 'topup' txn, returns new balance
export function listTransactions(env: Env, opts: { sub?: string; limit: number }): Promise<Array<{ id:number; sub:string; kind:string; amount_micro:number; balance_after_micro:number; model:string|null; tokens:number|null; note:string|null; created_at:number }>>;
export function listBalances(env: Env): Promise<Array<{ sub:string; email:string|null; balance_micro:number }>>; // join users; admin overview
```

**Enforcement** (in `openai.ts` + `passthrough.ts`, after the existing `checkTokenLimits`):
```ts
if (billingEnabled(c.env) && caller.ownerSub) {
  const bal = await getBalanceMicro(c.env, caller.ownerSub);
  if (bal <= 0) return c.json({ error: { message: "余额不足,请充值", type: "insufficient_balance" } }, 402);
}
```
**Charging** happens in `callWithPool` on success (non-stream: right after capturing total_tokens; stream: in the background scan) via `chargeForUsage(env, ownerSub, model, tokens)`. Do NOT charge in the routes (tokens aren't known there).

**Admin routes** (`src/routes/admin.ts`, under requireAdmin):
- `GET /balances` → `listBalances(env)`.
- `POST /balances/:sub/topup` → body `{ amount_usd: number, note?: string }`; `topUpMicro(env, sub, Math.round(amount_usd*1_000_000), note)`; return `{ balance_micro }`. (`:sub` is the user's OIDC sub; url-encoded.)
- `GET /transactions` → `listTransactions(env, { limit: 100 })`.
- `GET /prices` / `POST /prices` → list / upsert a model price (`{ model, price_per_mtok_micro }`).

**Consumer routes** (`src/routes/me.ts`, session auth):
- `GET /balance` → `{ balance_micro }` for the session sub.
- `GET /transactions` → `listTransactions(env, { sub: session.sub, limit: 50 })`.

---

## UI (`src/ui.ts`)

Reuse the existing theme + nav/section pattern (`NAV.admin` / `NAV.user`, `onSectionEnter`, `$()`, `api()`, `esc()`, `fmtDate()`).

- **Admin nav** add `{id:'billing', label:'计费', color:'red'}` (before 文档). Section `sec-billing`:
  - balances table (email, sub short, 余额 USD) with a top-up form per row OR a top-up form (sub input + amount USD).
  - recent transactions table.
  - Money display: `(micro/1_000_000).toFixed(4)` USD.
- **Consumer nav** add `{id:'balance', label:'余额', color:'red'}` (before 文档). Section `sec-balance`:
  - a big 余额 stat card (USD), and a transactions table (time, kind, amount USD, model, tokens).
- The 模型/文档 sections already list `/v1/models`; nothing else needed for new providers (they appear automatically once registered).

Keep everything same-origin cookie-auth. Vanilla JS, one file.

/** Shared domain types — authoritative contract. Do not change signatures. */

export type Provider =
  | "gemini"
  | "mistral"
  | "openrouter"
  | "openai"
  | "deepseek"
  | "groq";

export const PROVIDERS: Provider[] = [
  "gemini",
  "mistral",
  "openrouter",
  "openai",
  "deepseek",
  "groq",
];

export interface Env {
  DB: D1Database;
  /** Master admin token (Worker secret). Grants admin + user access. */
  ADMIN_TOKEN: string;
  /** Minutes a key stays in cooldown after a rate-limit error. */
  COOLDOWN_MINUTES?: string;
  /** Max pooled keys to try per request. */
  MAX_KEY_RETRIES?: string;
  /** Minutes between cron probes of a disabled key. */
  PROBE_INTERVAL_MINUTES?: string;
  /** OIDC issuer base, e.g. https://your-idp.example.com */
  OIDC_ISSUER?: string;
  /** OIDC public client id registered for this gateway. */
  OIDC_CLIENT_ID?: string;
  /** Email granted admin role on SSO login; everyone else logs in as user. */
  ADMIN_EMAIL?: string;
  /** HMAC secret for signing session + PKCE cookies (Worker secret). */
  SESSION_SECRET?: string;
  /** Console branding (optional). */
  BRAND_NAME?: string;
  SSO_LABEL?: string;
  SSO_NOTE?: string;
  /** Set to "1" to enforce credit balances + charge per token. */
  BILLING_ENABLED?: string;
  /** Fallback price (micro-USD per 1M tokens) when a model isn't in the prices table. */
  DEFAULT_PRICE_MICRO?: string;
}

export interface ApiKeyRow {
  id: number;
  provider: Provider;
  api_key: string;
  status: "active" | "cooldown" | "disabled";
  consecutive_fails: number;
  total_requests: number;
  total_fails: number;
  last_error: string | null;
  last_used_at: number | null;
  cooldown_until: number | null;
  disabled_reason: string | null;
  created_at: number;
}

/** Result of evaluating a single upstream call against one key. */
export type Outcome =
  | { kind: "ok" }
  | { kind: "disable"; reason: string }
  | { kind: "cooldown"; minutes: number; reason: string }
  | { kind: "transient"; reason: string };

export type Role = "admin" | "user";

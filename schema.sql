-- keypool-gateway D1 schema
-- Apply with:  wrangler d1 execute keypool --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS keypool_gateway_api_keys (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT    NOT NULL,                 -- gemini | mistral | openrouter
  api_key           TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'active', -- active | cooldown | disabled
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  total_requests    INTEGER NOT NULL DEFAULT 0,
  total_fails       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  last_used_at      INTEGER,                           -- epoch ms
  cooldown_until    INTEGER,                           -- epoch ms
  disabled_reason   TEXT,
  created_at        INTEGER NOT NULL,                  -- epoch ms
  UNIQUE(provider, api_key)
);

CREATE INDEX IF NOT EXISTS keypool_gateway_idx_keys_provider_status ON keypool_gateway_api_keys(provider, status);
CREATE INDEX IF NOT EXISTS keypool_gateway_idx_keys_status_cooldown ON keypool_gateway_api_keys(status, cooldown_until);

CREATE TABLE IF NOT EXISTS keypool_gateway_access_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  name       TEXT,
  role       TEXT    NOT NULL DEFAULT 'user',          -- user | admin
  enabled    INTEGER NOT NULL DEFAULT 1,
  expires_at     INTEGER,
  rpm_limit      INTEGER,
  quota_requests INTEGER,
  used_requests  INTEGER NOT NULL DEFAULT 0,
  owner_sub  TEXT,                                      -- OIDC subject of owner (NULL = admin-minted)
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS keypool_gateway_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sub         TEXT NOT NULL UNIQUE,      -- OIDC subject
  email       TEXT,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'user',     -- admin | user
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | blocked
  created_at  INTEGER NOT NULL,
  approved_at INTEGER
);
CREATE INDEX IF NOT EXISTS keypool_gateway_idx_users_status ON keypool_gateway_users(status);

CREATE TABLE IF NOT EXISTS keypool_gateway_request_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT    NOT NULL,
  key_id      INTEGER,
  model       TEXT,
  status_code INTEGER,
  latency_ms  INTEGER,
  ok          INTEGER NOT NULL DEFAULT 0,
  token_id    INTEGER,
  owner_sub   TEXT,
  total_tokens INTEGER,
  final       INTEGER NOT NULL DEFAULT 0,  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS keypool_gateway_idx_logs_created ON keypool_gateway_request_logs(created_at);
CREATE INDEX IF NOT EXISTS keypool_gateway_idx_logs_owner ON keypool_gateway_request_logs(owner_sub, created_at);
CREATE INDEX IF NOT EXISTS keypool_gateway_idx_logs_final ON keypool_gateway_request_logs(final, created_at);
CREATE INDEX IF NOT EXISTS keypool_gateway_idx_logs_token ON keypool_gateway_request_logs(token_id, created_at);

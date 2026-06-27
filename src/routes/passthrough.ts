/**
 * Native passthrough routes: /gemini/*, /mistral/*, /openrouter/*.
 *
 * Each prefix proxies the request to the matching provider's upstream API via
 * the key pool. `subPath` is everything after `/<provider>` (keeping the
 * leading `/` and the original query string), e.g.
 * `/v1beta/models/gemini-2.0-flash:generateContent?alt=sse`.
 *
 * This module exports a default Hono instance that handles all three prefixes
 * (via `app.all("/gemini/*", ...)` etc). `index.ts` mounts it at the root with
 * `app.route("/", passthrough)`.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Provider } from "../types";
import { requireUser, resolveCaller } from "../auth";
import { callWithPool } from "../keypool";
import { getAdapter } from "../providers";

type AppEnv = { Bindings: Env };

/**
 * Compute the subPath after the `/<provider>` segment: the remaining pathname
 * (always starting with `/`) plus the original query string.
 */
function computeSubPath(c: Context<AppEnv>, provider: Provider): string {
  const url = new URL(c.req.url);
  const prefix = `/${provider}`;
  let path = url.pathname;
  if (path.startsWith(prefix)) {
    path = path.slice(prefix.length);
  }
  if (path.length === 0 || !path.startsWith("/")) {
    path = `/${path}`;
  }
  return `${path}${url.search}`;
}

function handle(provider: Provider): (c: Context<AppEnv>) => Promise<Response> {
  return async (c: Context<AppEnv>): Promise<Response> => {
    const subPath = computeSubPath(c, provider);
    const req = c.req.raw;
    const caller = await resolveCaller(c.env, req);
    return callWithPool(
      c.env,
      provider,
      (key: string) => getAdapter(provider).passthrough(subPath, req, key),
      { tokenId: caller.tokenId, ownerSub: caller.ownerSub }
    );
  };
}

const app = new Hono<AppEnv>();

app.use("/gemini/*", requireUser);
app.use("/mistral/*", requireUser);
app.use("/openrouter/*", requireUser);

app.all("/gemini/*", handle("gemini"));
app.all("/mistral/*", handle("mistral"));
app.all("/openrouter/*", handle("openrouter"));

export default app;

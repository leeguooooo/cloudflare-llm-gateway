/** OpenAI-compatible routes: `/v1/models` + `/v1/chat/completions`. User auth. */

import { Hono } from "hono";
import type { Env } from "../types";
import { PROVIDERS } from "../types";
import type { OpenAIChatRequest } from "../providers/types";
import { routeModelToProvider } from "../providers/types";
import { getAdapter } from "../providers";
import { callWithPool } from "../keypool";
import { requireUser } from "../auth";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requireUser);

/** GET /models — union of every adapter's models() in OpenAI list shape. */
app.get("/models", (c) => {
  const data: Array<{ id: string; object: "model"; owned_by: string }> = [];
  for (const provider of PROVIDERS) {
    for (const id of getAdapter(provider).models()) {
      data.push({ id, object: "model", owned_by: provider });
    }
  }
  return c.json({ object: "list", data });
});

/** POST /chat/completions — route to a provider and dispatch through the pool. */
app.post("/chat/completions", async (c) => {
  let body: OpenAIChatRequest;
  try {
    body = (await c.req.json()) as OpenAIChatRequest;
  } catch {
    return c.json(
      { error: { message: "invalid json body", type: "invalid_request_error" } },
      400,
    );
  }

  if (!body || typeof body.model !== "string" || !body.model) {
    return c.json(
      { error: { message: "missing required field: model", type: "invalid_request_error" } },
      400,
    );
  }

  const provider = routeModelToProvider(body.model);
  return callWithPool(
    c.env,
    provider,
    (key) => getAdapter(provider).chatCompletions(body, key),
    { model: body.model },
  );
});

export default app;

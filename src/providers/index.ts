/** Provider adapter registry. Maps a `Provider` to its `ProviderAdapter`. */

import type { Provider } from "../types";
import type { ProviderAdapter } from "./types";
import gemini from "./gemini";
import mistral from "./mistral";
import openrouter from "./openrouter";

/** Return the adapter that serves `provider`. Throws on an unknown provider. */
export function getAdapter(provider: Provider): ProviderAdapter {
  switch (provider) {
    case "gemini":
      return gemini;
    case "mistral":
      return mistral;
    case "openrouter":
      return openrouter;
    default: {
      // Exhaustiveness guard: if `Provider` grows, tsc flags this branch.
      const exhaustive: never = provider;
      throw new Error(`unknown provider: ${String(exhaustive)}`);
    }
  }
}

import type { Provider } from "@devdigest/shared";

/** Providers offered in the picker (values are the `Provider` enum). */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];

/** Select value meaning "no provider chosen yet". */
export const NO_PROVIDER = "";

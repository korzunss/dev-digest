/** Pure helpers for IntentCard — derive UI state from the fetched record
    instead of storing it, so the card can never drift from what the server
    just returned. */
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

export type IntentCardState = "empty" | "low" | "missing" | "ok";
export type IntentStaleReason = NonNullable<PrIntentRecord["stale_reason"]>;

/** Which of the card's four bodies to render. `missing` (a source the
    classifier tried to read failed) takes priority over `low` confidence —
    a failed source is the more actionable warning. */
export function cardState(resp: PrIntentResponse | undefined): IntentCardState {
  const intent = resp?.intent;
  if (!intent) return "empty";
  if (intent.missing_context.length > 0) return "missing";
  if (intent.confidence === "low") return "low";
  return "ok";
}

/** The record already carries `stale`/`stale_reason` computed server-side at
    read time — this just makes "no reason" explicit as `null` when the
    record itself is absent or not stale. */
export function staleReason(resp: PrIntentResponse | undefined): IntentStaleReason | null {
  const intent = resp?.intent;
  if (!intent || !intent.stale) return null;
  return intent.stale_reason;
}

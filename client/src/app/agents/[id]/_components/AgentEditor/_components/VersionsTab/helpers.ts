/** Pure helpers for the agent VersionsTab. */
import { FIELD_LABEL_KEYS, SHORT_ID_LENGTH, VERSION_DATE_FORMAT, type FieldLabelKey } from "./constants";

/** An absolute date. Falls back to the raw string if the server sent garbage. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, VERSION_DATE_FORMAT);
}

/** First characters of a skill id, for a skill whose name is gone. */
export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

/** A field value from the diff as display text. */
export function formatFieldValue(value: string | boolean | null): string {
  if (value === null) return "—";
  return String(value);
}

/** The i18n key of a diff field's label, or null for a field this client does not know. */
export function fieldLabelKey(field: string): FieldLabelKey | null {
  return Object.hasOwn(FIELD_LABEL_KEYS, field) ? FIELD_LABEL_KEYS[field as FieldLabelKey] : null;
}

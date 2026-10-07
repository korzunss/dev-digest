import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/**
 * Collapse key/value setting rows into a flat `Settings` object. Rows with a
 * blank key or an `undefined` value are skipped, so a half-written row never
 * shadows a setting's default.
 */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.key.trim() || r.value === undefined) continue;
    out[r.key] = r.value;
  }
  return out as Settings;
}

/** Pure helpers for the skill VersionsTab. */
import type { SkillVersion } from "@devdigest/shared";
import { VERSION_DATE_FORMAT } from "./constants";

/**
 * The newest version number, i.e. the one the skill currently is.
 *
 * Read from the LIST rather than from `skill.version`, so the row marked
 * "Current" and the diff's right-hand side can never disagree. Taken as the
 * MAXIMUM rather than the head: the endpoint happens to sort newest-first, but
 * a helper that quietly depends on that would put the badge — and the restore
 * target — on the wrong row the day anything filters or re-sorts the list.
 */
export function currentVersion(versions: SkillVersion[]): number | null {
  if (versions.length === 0) return null;
  return versions.reduce((max, v) => (v.version > max ? v.version : max), versions[0]!.version);
}

/** An absolute date. Falls back to the raw string if the server sent garbage. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, VERSION_DATE_FORMAT);
}

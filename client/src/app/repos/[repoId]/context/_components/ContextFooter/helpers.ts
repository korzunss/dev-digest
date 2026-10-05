/** Pure helpers for ContextFooter. */

/** The repo's last sync as a locale date-time, or null when it never synced / the value is unparseable. */
export function formatSync(iso: string | null | undefined, locale = "en"): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(locale);
}

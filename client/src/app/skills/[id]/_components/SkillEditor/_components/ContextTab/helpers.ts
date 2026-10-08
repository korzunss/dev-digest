/**
 * Pure helpers for the skill Context tab. The list itself (rows, ordering,
 * filter, preview) moved to the shared `ContextDocPicker`; what stays here is
 * what only this tab knows: spelling how they reach the prompt.
 */

/** Mirrors the engine's label escaping (`reviewer-core/src/prompt.ts`), so an odd path reads as it is sent. */
function escapeLabel(label: string): string {
  return label
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The delimiter the engine wraps a document's full text in, labelled with its
 * repo path. Rendered beside each path in the "serializes as" box so the
 * summary states what is actually sent: the whole document, as untrusted data
 * — not its name.
 */
export function untrustedMarker(path: string): string {
  return `<untrusted source="${escapeLabel(path)}">…</untrusted>`;
}

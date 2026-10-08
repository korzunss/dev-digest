/**
 * Ordered-attachment list operations shared by every editor that attaches a
 * set of things to an agent or a skill (skills to an agent, context documents
 * to either). One ordering rule for all of them — it must not fork.
 */

/** Attach (append, so a new item lands last) or detach, preserving order. */
export function toggleAttachment(attached: string[], id: string): string[] {
  return attached.includes(id) ? attached.filter((x) => x !== id) : [...attached, id];
}

/** Move one attached id to another position. Out-of-range targets are a no-op. */
export function moveId(attached: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= attached.length || to >= attached.length) {
    return attached;
  }
  const next = [...attached];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** The ids attached to an agent, in stored order. */
export function attachedIds(links: AgentSkillLink[] | undefined): string[] {
  return [...(links ?? [])].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/**
 * The tab lists EVERY skill in the workspace: attached ones first, in their
 * prompt order, then the rest alphabetically. Attaching is the toggle, so the
 * unattached ones have to be on screen to be attachable at all.
 */
export function orderedRows(skills: Skill[], attached: string[]): Skill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const head = attached.map((id) => byId.get(id)).filter((s): s is Skill => s !== undefined);
  const headIds = new Set(head.map((s) => s.id));
  const tail = skills.filter((s) => !headIds.has(s.id));
  return [...head, ...tail];
}

/** Attach (append, so a new skill lands last) or detach, preserving order. */
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

/** Filter the list by name or description, like the Skills page does. */
export function filterRows(rows: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (q === "") return rows;
  return rows.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

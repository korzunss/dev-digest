import type { Skill } from "@devdigest/shared";

/** Filter the rail by name or description — the two things the card shows. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (q === "") return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

/**
 * The href of a skill in the rail. The tab rides along so that switching
 * skills keeps you on the tab you were reading — the selection moved, the
 * question you were asking did not.
 */
export function skillHref(id: string, tab: string): string {
  return `/skills/${id}?tab=${tab}`;
}

import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab index). Thin route entry — the view, its create
   modal, import drawer, styles and constants are colocated under
   _components/SkillsListView, exactly as /agents does. */
export default function SkillsPage() {
  return <SkillsListView />;
}

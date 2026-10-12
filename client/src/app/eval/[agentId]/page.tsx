import React from "react";
import { AgentEvalDetail } from "./_components/AgentEvalDetail";

/* Route: /eval/:agentId (one agent's eval history, spec 011). Thin route
   entry. The detail view reads `?period=` through `useSearchParams`, so it
   sits inside a <Suspense> boundary (client/insights/gotchas.md, Tooling). */
export default async function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return (
    <React.Suspense fallback={null}>
      <AgentEvalDetail agentId={agentId} />
    </React.Suspense>
  );
}

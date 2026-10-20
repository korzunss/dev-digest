import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance (Agent Performance, spec 015). Thin route entry — the
   view reads the period from the URL, so it sits inside Suspense. */
export default function AgentPerformancePage() {
  return (
    <Suspense fallback={null}>
      <AgentPerformanceView />
    </Suspense>
  );
}

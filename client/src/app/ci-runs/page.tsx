import { Suspense } from "react";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs, spec 014). Thin route entry — the view, its filters,
   rows and styles live under _components/CiRunsView. The view reads the URL
   params, so it sits inside Suspense. */
export default function CiRunsPage() {
  return (
    <Suspense fallback={null}>
      <CiRunsView />
    </Suspense>
  );
}

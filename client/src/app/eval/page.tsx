import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (Eval Dashboard, spec 011). Thin route entry — the view, its
   rows, the run-all confirm and its styles live under _components/EvalDashboardView. */
export default function EvalDashboardPage() {
  return <EvalDashboardView />;
}

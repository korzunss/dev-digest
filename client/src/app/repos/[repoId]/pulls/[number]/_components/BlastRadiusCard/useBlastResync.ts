/* useBlastResync — resync the repo index, then refresh the blast map once the
   index state advances. `useRepoIntelStatus` polls only while we wait; the
   effect is the single place that watches `updatedAt` move past the value
   captured at click time (the status enum is terminal-only). A resync that
   leaves `updatedAt` unchanged ends the wait after RESYNC_WAIT_MS. */
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";

const RESYNC_WAIT_MS = 60_000;

export function useBlastResync(repoId: string | null | undefined, prId: string | null | undefined) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // undefined = idle; otherwise the `updatedAt` captured at click (null = none yet).
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined);
  const waiting = baseline !== undefined;
  const status = useRepoIntelStatus(repoId, waiting);
  const updatedAt = status.data?.updatedAt;
  // Without a loaded baseline the first poll would read as "advanced".
  const ready = status.data !== undefined;

  useEffect(() => {
    if (waiting && updatedAt && updatedAt !== baseline) {
      setBaseline(undefined);
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    }
  }, [waiting, updatedAt, baseline, qc, prId]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setBaseline(undefined);
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    }, RESYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, qc, prId]);

  function start() {
    if (!ready) return;
    setBaseline(updatedAt ?? null);
    resync.mutate(undefined, { onError: () => setBaseline(undefined) });
  }

  return { start, ready, pending: resync.isPending || waiting, failed: resync.isError };
}

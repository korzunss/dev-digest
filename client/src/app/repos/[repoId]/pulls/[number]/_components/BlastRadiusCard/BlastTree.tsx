"use client";

import React from "react";
import type { BlastRadius } from "@devdigest/shared";
import type { ForgeRepoRef } from "@/lib/forge-urls";
import { BlastSymbolNode } from "./BlastSymbolNode";

interface Props {
  data: BlastRadius;
  headSha: string | null | undefined;
  repo: ForgeRepoRef | null;
}

export function BlastTree({ data, headSha, repo }: Props) {
  const cap = data.limits.callers_per_symbol;
  return (
    <div>
      {/* `downstream` is grouped by symbol name on the server
          (modules/blast/helpers.ts toBlastRadius), so `symbol` is unique. */}
      {data.downstream.map((d, i) => (
        <BlastSymbolNode
          key={d.symbol}
          impact={d}
          symbol={data.changed_symbols.find((c) => c.name === d.symbol)}
          cap={cap}
          defaultOpen={i === 0}
          headSha={headSha}
          repo={repo}
        />
      ))}
    </div>
  );
}

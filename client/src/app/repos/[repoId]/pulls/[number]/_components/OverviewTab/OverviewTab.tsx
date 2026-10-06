"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { PrBriefBlock } from "../PrBriefBlock";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
  prBody: string | null | undefined;
  repo: Repo | null;
  diffPaths: string[];
  onOpenInDiff: (path: string, line: number | null) => void;
}

export function OverviewTab({ prId, prHeadSha, prBody, repo, diffPaths, onOpenInDiff }: OverviewTabProps) {
  return (
    <>
      <PrBriefBlock
        prId={prId}
        prHeadSha={prHeadSha}
        repo={repo}
        diffPaths={diffPaths}
        onOpenInDiff={onOpenInDiff}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

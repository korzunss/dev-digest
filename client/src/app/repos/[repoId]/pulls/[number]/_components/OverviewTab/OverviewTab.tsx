"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
  prBody: string | null | undefined;
  repo: Repo | null;
}

export function OverviewTab({ prId, prHeadSha, prBody, repo }: OverviewTabProps) {
  return (
    <>
      <div style={s.columns} data-testid="overview-columns">
        <section>
          <IntentCard prId={prId} prHeadSha={prHeadSha} />
        </section>
        <section>
          <BlastRadiusCard prId={prId} headSha={prHeadSha} repo={repo} />
        </section>
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

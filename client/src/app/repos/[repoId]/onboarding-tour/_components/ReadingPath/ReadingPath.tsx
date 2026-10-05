/* ReadingPath — the guided reading path: the same file rows, numbered. */
"use client";

import React from "react";
import type { OnboardingFileRow } from "@devdigest/shared";
import type { ForgeRepoRef } from "@/lib/forge-urls";
import { FileRowList } from "../FileRowList";

export function ReadingPath({
  steps,
  repo,
  builtSha,
}: {
  steps: OnboardingFileRow[];
  repo: ForgeRepoRef | null;
  builtSha: string | null;
}) {
  return <FileRowList rows={steps} repo={repo} builtSha={builtSha} ordered />;
}

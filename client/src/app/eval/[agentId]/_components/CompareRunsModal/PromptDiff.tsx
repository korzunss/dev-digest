/* PromptDiff — the line diff of two system prompts (AC-52). Prompts are
   untrusted-shaped text: every line renders as a plain React text node. */
import React from "react";
import type { EvalPromptDiffLine } from "@devdigest/shared";
import { s } from "./styles";

const STYLE = { add: s.lineAdd, del: s.lineDel, same: s.diffLine } as const;

export function PromptDiff({ lines }: { lines: EvalPromptDiffLine[] }) {
  return (
    <div className="mono" style={s.diffBox}>
      {lines.map((l, i) => (
        <div key={i} data-op={l.op} style={STYLE[l.op]}>
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

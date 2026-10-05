/* ArchitectureSection — the model's (or skeleton's) architecture read: a
   Markdown body, stack chips, the top-level structure and, only when the tour
   carries one, a Mermaid diagram. Text from the model goes through `SafeMarkdown`
   (no images) or a plain text node — never raw HTML (AC-34). */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { stripMarkdownImages } from "../../helpers";
import { SafeMarkdown } from "../SafeMarkdown";

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies React.CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies React.CSSProperties,
  structure: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies React.CSSProperties,
} as const;

export function ArchitectureSection({ architecture }: { architecture: OnboardingTour["architecture"] }) {
  const { body, stack, structure, diagram } = architecture;
  return (
    <div style={styles.wrap}>
      <SafeMarkdown>{stripMarkdownImages(body)}</SafeMarkdown>
      {stack.length > 0 && (
        <div style={styles.chips}>
          {stack.map((item) => (
            <Badge key={item} mono>
              {item}
            </Badge>
          ))}
        </div>
      )}
      {structure.length > 0 && (
        <ul style={styles.structure} className="mono">
          {structure.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {diagram != null && diagram.trim() !== "" && <MermaidDiagram chart={diagram} variant="boxes" />}
    </div>
  );
}

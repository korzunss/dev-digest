/* SafeMarkdown — the tour's Markdown renderer. Model text must never load a
   remote picture (AC-34), so `img` is not an allowed element at all: this holds
   for every image form (inline, reference, shortcut, raw HTML), whatever a
   text-level stripper missed. No `rehype-raw`, no `dangerouslySetInnerHTML`. */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { styles } from "./styles";

export function SafeMarkdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={styles.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        unwrapDisallowed={false}
        skipHtml
        components={{
          p: ({ children }) => <p style={styles.p}>{children}</p>,
          strong: ({ children }) => <strong style={styles.strong}>{children}</strong>,
          code: ({ children }) => (
            <code className="mono" style={styles.code}>
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={styles.a}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

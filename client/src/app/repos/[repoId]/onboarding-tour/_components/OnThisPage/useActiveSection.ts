/* useActiveSection — which section is currently in view. One IntersectionObserver,
   created and disconnected in a single effect. */
"use client";

import React from "react";

/** Fraction of the viewport (from the top) in which a section counts as "current". */
const ROOT_MARGIN = "0px 0px -60% 0px";

export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  // A stable dependency: the observer is rebuilt only when the id list changes.
  const key = ids.join("|");

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const list = key ? key.split("|") : [];
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // Document order, not callback order, decides ties.
        const first = list.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: ROOT_MARGIN },
    );
    for (const id of list) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);

  return active;
}

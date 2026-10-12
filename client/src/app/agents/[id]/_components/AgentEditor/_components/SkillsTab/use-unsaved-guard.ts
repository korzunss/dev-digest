"use client";

import React from "react";

/**
 * While `dirty`, warn before the page is left without going through the app's
 * own confirm: a tab close / reload (`beforeunload`) and a click on any
 * same-origin link (capture phase, so it runs before the router's handler).
 * Tab switches and agent cards are guarded by the page's own modal.
 */
export function useUnsavedGuard(dirty: boolean, message: string): void {
  React.useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers only show the prompt when returnValue is set.
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      // A modified or non-primary click opens a new tab/window and leaves nothing behind.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // A link to the page we are already on leaves nothing behind.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

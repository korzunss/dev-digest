/* TourSection — one collapsible frame of the tour. Open by default; the state
   is local and never persisted (AC-29). */
"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function TourSection({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const I = Icon[icon];
  const bodyId = `${id}-body`;

  return (
    <section id={id} aria-labelledby={`${id}-title`} style={s.section}>
      <div style={s.head}>
        <span style={s.icon} aria-hidden="true">
          <I size={16} />
        </span>
        <h2 id={`${id}-title`} style={s.title}>
          {title}
        </h2>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={title}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
        </button>
      </div>
      <div id={bodyId} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}

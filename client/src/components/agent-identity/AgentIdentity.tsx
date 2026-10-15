/* AgentIdentity — the agent's icon + colour, derived from its name so the same
   agent looks the same on every screen (spec 013, AC-20). Decorative: the name
   is always rendered beside it. */
import React from "react";
import { Icon } from "@devdigest/ui";
import { agentIdentity } from "./helpers";
import { s } from "./styles";

export function AgentIdentity({ name, size = 22 }: { name: string | null | undefined; size?: number }) {
  const { icon, color } = agentIdentity(name);
  const I = Icon[icon];
  return (
    <span aria-hidden="true" data-testid="agent-identity" data-icon={icon} style={s.badge(color, size)}>
      <I size={Math.round(size * 0.6)} />
    </span>
  );
}

export default AgentIdentity;

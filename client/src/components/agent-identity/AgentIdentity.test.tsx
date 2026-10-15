import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentIdentity, agentIdentity, NEUTRAL_IDENTITY } from "./index";

afterEach(cleanup);

describe("agentIdentity", () => {
  it("is stable per name, case-insensitive, neutral for null, and uses more than one slot", () => {
    expect(agentIdentity("Security")).toEqual(agentIdentity("Security"));
    expect(agentIdentity("Security")).toEqual(agentIdentity(" security "));
    expect(agentIdentity(null)).toEqual(NEUTRAL_IDENTITY);

    const names = ["Security", "Performance", "Style", "Tests", "Docs", "Architecture", "Bugs", "Types"];
    const slots = new Set(names.map((n) => JSON.stringify(agentIdentity(n))));
    expect(slots.size).toBeGreaterThanOrEqual(2);
  });
});

describe("agentIdentity keywords", () => {
  it("maps well-known names to a fitting icon and falls back to the palette", () => {
    expect(agentIdentity("Security Reviewer").icon).toBe("Shield");
    expect(agentIdentity("Performance Reviewer").icon).toBe("Zap");
    expect(agentIdentity("Junior Mentor").icon).toBe("Lightbulb");
    expect(agentIdentity("Customer-Facing").icon).toBe("Users");
    expect(agentIdentity("Architecture").icon).toBe("Workflow");
    expect(agentIdentity("Test coverage").icon).toBe("FlaskConical");
    expect(agentIdentity("API contract").icon).toBe("Globe");
    expect(agentIdentity("General").icon).toBe("Boxes");
    expect(agentIdentity("Zzz")).toEqual(agentIdentity("zzz"));
  });
});

describe("AgentIdentity", () => {
  it("renders the icon of the derived identity", () => {
    render(<AgentIdentity name="Security" />);
    expect(screen.getByTestId("agent-identity").getAttribute("data-icon")).toBe(agentIdentity("Security").icon);
  });
});

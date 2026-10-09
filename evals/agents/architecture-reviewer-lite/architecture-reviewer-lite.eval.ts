import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixture, same prompt, same practices,
// threshold and maxTurns. Only the injected agent artifact differs: architecture-reviewer-lite
// makes the *Rule (source)* column optional and allows findings with no documented rule. Tools
// come from identical frontmatter, so run conditions match. That is what makes this pair a
// controlled A/B: pnpm eval:repeat both with labels and pnpm eval:delta them to see which
// practice moved.
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", cases));

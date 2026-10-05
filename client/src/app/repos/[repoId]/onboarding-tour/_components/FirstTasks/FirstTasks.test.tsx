/* FirstTasks — surviving starter tasks (spec 009 AC-11, AC-15, AC-34). */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTask } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { FirstTasks } from "./FirstTasks";

afterEach(cleanup);

const task = (n: number, over: Partial<OnboardingTask> = {}): OnboardingTask => ({
  title: `Task ${n}`,
  body: `Do thing ${n}`,
  files: [`src/f${n}.ts`],
  ...over,
});

function renderTasks(tasks: OnboardingTask[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <FirstTasks tasks={tasks} />
    </NextIntlClientProvider>,
  );
}

describe("FirstTasks", () => {
  // AC-11: 1 or 2 survivors are shown with the "only N" note
  it("AC-11: shows 'only 2 tasks could be tied to files' when two tasks survive", () => {
    renderTasks([task(1), task(2)]);
    expect(screen.getByText("only 2 tasks could be tied to files")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("src/f1.ts")).toBeInTheDocument();
  });

  it("AC-11: shows 'only 1 tasks…' for a single survivor", () => {
    renderTasks([task(1)]);
    expect(screen.getByText("only 1 tasks could be tied to files")).toBeInTheDocument();
  });

  // AC-11: a full set of 3 needs no note
  it("AC-11: shows no 'only N' note when three tasks survive", () => {
    renderTasks([task(1), task(2), task(3)]);
    expect(screen.queryByText(/could be tied to files/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  // AC-15/AC-18: nothing to show (no tour yet) prompts to generate rather than rendering blank
  it("AC-15: with no tasks, tells the user to generate the tour", () => {
    renderTasks([]);
    expect(screen.getByText("Generate the tour to get first tasks")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  // AC-34: raw HTML / script / embeds in model text are never rendered as elements
  it("AC-34: renders no script, iframe or raw HTML element from a task body", () => {
    const { container } = renderTasks([
      task(1, {
        body: [
          "Read **this** first.",
          '<img src="https://tracker.example/q.png" onerror="alert(1)">',
          "<script>alert(2)</script>",
          '<iframe src="https://evil.example"></iframe>',
        ].join("\n\n"),
      }),
    ]);
    expect(screen.getByText("this")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  // AC-34: Markdown image syntax must not load a remote image (tracking pixel)
  it("AC-34: renders no <img> for Markdown image syntax in a task body", () => {
    const { container } = renderTasks([task(1, { body: "Look ![pixel](https://tracker.example/p.png) here" })]);
    expect(screen.getByText(/Look/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

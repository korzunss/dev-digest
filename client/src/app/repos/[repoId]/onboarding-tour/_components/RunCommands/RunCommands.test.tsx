/* RunCommands — copy control (spec 009 AC-30). Clipboard and toast are the outside world. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() };
vi.mock("@/lib/toast", () => ({ useToast: () => toast }));

import { RunCommands } from "./RunCommands";

const writeText = vi.fn();

function renderCommands(commands: React.ComponentProps<typeof RunCommands>["commands"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <RunCommands commands={commands} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  cleanup();
  toast.success.mockReset();
  toast.error.mockReset();
  // restore jsdom's lack of clipboard
  Reflect.deleteProperty(navigator, "clipboard");
});

const CMDS = [
  { command: "pnpm install", note: null },
  { command: "cp .env.example .env && pnpm dev", note: "starts the API" },
];

describe("RunCommands", () => {
  // AC-30: copies exactly that command (not a neighbour) and confirms "Copied"
  it("AC-30: copy copies exactly that command's text and toasts 'Copied'", async () => {
    renderCommands(CMDS);
    fireEvent.click(screen.getByRole("button", { name: "Copy cp .env.example .env && pnpm dev" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("cp .env.example .env && pnpm dev");
    expect(screen.getByText("starts the API")).toBeInTheDocument();
  });

  // a refused clipboard must not claim success
  it("AC-30: a clipboard failure shows the failure toast, not 'Copied'", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderCommands(CMDS);
    fireEvent.click(screen.getByRole("button", { name: "Copy pnpm install" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not copy"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  // no scripts: say so, offer no copy control
  it("shows 'no run scripts found' when there are no commands", () => {
    renderCommands([]);
    expect(screen.getByText("no run scripts found")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

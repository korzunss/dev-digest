/* ModelPicker — the provider/model pair of a paid eval run. The network edge
   (`api`) is stubbed. No `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalModelPick } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));

import { ModelPicker } from "./ModelPicker";

const onChange = vi.fn();

beforeEach(() => {
  get.mockImplementation(async (path: string) =>
    path === "/providers/openai/models"
      ? [{ id: "gpt-x" }, { id: "gpt-y" }]
      : path === "/providers/anthropic/models"
        ? [{ id: "claude-z" }]
        : [],
  );
});
afterEach(() => {
  cleanup();
  get.mockReset();
  onChange.mockReset();
});

function renderPicker(value: EvalModelPick | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (v: EvalModelPick | null) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <ModelPicker value={v} onChange={onChange} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(ui(value));
  return { rerender: (v: EvalModelPick | null) => view.rerender(ui(v)) };
}

describe("ModelPicker", () => {
  it("starts empty, reports a pick once a model is chosen, and clears it on a provider change", async () => {
    const { rerender } = renderPicker(null);
    const provider = screen.getByRole("combobox") as HTMLSelectElement;
    expect(provider.value).toBe("");
    expect(get).not.toHaveBeenCalled();

    fireEvent.change(provider, { target: { value: "openai" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/providers/openai/models"));

    fireEvent.click(screen.getByText("Search models…"));
    fireEvent.click(await screen.findByText("gpt-y"));
    expect(onChange).toHaveBeenLastCalledWith({ provider: "openai", model: "gpt-y" });

    rerender({ provider: "openai", model: "gpt-y" });
    expect(screen.getByText("gpt-y")).toBeInTheDocument();

    fireEvent.change(provider, { target: { value: "anthropic" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows a provided pick and a hint when the provider lists no models", async () => {
    renderPicker({ provider: "openrouter", model: "vendor/m" });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("openrouter");
    expect(screen.getByText("vendor/m")).toBeInTheDocument();
    expect(await screen.findByText("No models listed for openrouter. Check its API key in Settings.")).toBeInTheDocument();
  });
});

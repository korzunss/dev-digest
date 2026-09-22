/**
 * ConfigTab — the skill form. Three things here carry meaning and are worth
 * guarding: `unsaved` appears only once the body actually differs from the
 * saved one, the token count is visibly an ESTIMATE, and the optional
 * "what changed" note reaches the PUT as `message`.
 *
 * No `@testing-library/user-event` in this package — interaction is driven
 * with `fireEvent`, synchronously (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const routerPush = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({
    mutate: updateMutate,
    isPending: false,
    isSuccess: false,
    data: undefined,
  }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

import { ConfigTab } from "./ConfigTab";
import { fileBaseName, isDirty } from "./helpers";

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flag hardcoded credentials before they reach main.",
  type: "security",
  source: "manual",
  body: "# Rule\nNo sk_live keys.",
  enabled: true,
  version: 3,
  evidence_files: null,
  agent_count: null,
  pull_rate: null,
  accept_rate: null,
};

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  routerPush.mockReset();
});

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The body textarea is the mono one; the description textarea is not. */
function bodyTextarea(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector("textarea.mono");
  if (!el) throw new Error("body textarea not found");
  return el as HTMLTextAreaElement;
}

describe("helpers", () => {
  it("falls back to a placeholder name so the chip is never just '.md'", () => {
    expect(fileBaseName("secret-leakage-gate")).toBe("secret-leakage-gate");
    expect(fileBaseName("   ")).toBe("skill");
  });

  it("is dirty only when the text actually differs", () => {
    expect(isDirty("a", "a")).toBe(false);
    expect(isDirty("a", "b")).toBe(true);
  });
});

describe("ConfigTab", () => {
  it("names the body after the skill, as a markdown file", () => {
    renderTab();
    expect(screen.getByText("secret-leakage-gate.md")).toBeInTheDocument();
  });

  it("shows the unsaved badge only after the body is edited", () => {
    const { container } = renderTab();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    fireEvent.change(bodyTextarea(container), { target: { value: "# Rule\nAlso no tokens." } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("drops the unsaved badge again when the body is typed back to the saved text", () => {
    // Dirtiness is a comparison, not a "has been touched" flag.
    const { container } = renderTab();
    fireEvent.change(bodyTextarea(container), { target: { value: "changed" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();

    fireEvent.change(bodyTextarea(container), { target: { value: SKILL.body } });
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("renders the token count as an estimate, with a ~ and an explanation", () => {
    const { container } = renderTab();
    // "# Rule\nNo sk_live keys." is 23 chars → ceil(23 / 4) = 6.
    const tokens = screen.getByText("~6 tokens");
    expect(tokens).toBeInTheDocument();
    expect(tokens.getAttribute("title")).toMatch(/estimated/i);
    expect(tokens.getAttribute("title")).toMatch(/trace/i);

    fireEvent.change(bodyTextarea(container), { target: { value: "x".repeat(4000) } });
    expect(screen.getByText("~1,000 tokens")).toBeInTheDocument();
  });

  it("sends the 'what changed' note as `message` on save", () => {
    const { container } = renderTab();
    fireEvent.change(bodyTextarea(container), { target: { value: "# Rule\nTightened." } });
    fireEvent.change(screen.getByPlaceholderText("Tightened the secret-detection rule"), {
      target: { value: "narrowed the regex" },
    });
    fireEvent.click(screen.getByText("Save skill"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [input] = updateMutate.mock.calls[0]!;
    expect(input.id).toBe("sk1");
    expect(input.patch.body).toBe("# Rule\nTightened.");
    expect(input.patch.message).toBe("narrowed the regex");
  });

  it("omits `message` entirely when no note was written", () => {
    // An empty string would store a blank note on the version rather than none.
    renderTab();
    fireEvent.click(screen.getByText("Save skill"));

    const [input] = updateMutate.mock.calls[0]!;
    expect("message" in input.patch).toBe(false);
  });

  it("warns that an imported body is untrusted", () => {
    renderTab({ ...SKILL, source: "imported_url", enabled: false });
    expect(screen.getByText(/untrusted source/i)).toBeInTheDocument();
  });

  it("says which version a save would create, and only while it would create one", () => {
    // Predictive, not a receipt: the note has to be readable while the save is
    // still avoidable, so it appears with the edit and not after it.
    const { container } = renderTab();
    expect(container.textContent).not.toContain("Saving snapshots the body as");

    fireEvent.change(bodyTextarea(container), { target: { value: "# Rule\nEdited." } });
    expect(container.textContent).toContain("Saving snapshots the body as");
    // The skill is v3, so the next snapshot is v4 — not the current version.
    expect(screen.getByText("v4")).toBeInTheDocument();
  });

  it("Cancel puts every field back to what is stored, note included", () => {
    const { container } = renderTab();
    fireEvent.change(bodyTextarea(container), { target: { value: "# Rule\nEdited." } });
    fireEvent.change(screen.getByPlaceholderText(messages.config.messagePlaceholder), {
      target: { value: "a note" },
    });
    expect(screen.getByText(messages.config.unsaved)).toBeInTheDocument();

    fireEvent.click(screen.getByText(messages.config.cancel));

    expect(screen.queryByText(messages.config.unsaved)).not.toBeInTheDocument();
    expect(bodyTextarea(container)).toHaveValue(SKILL.body);
    expect(screen.getByPlaceholderText(messages.config.messagePlaceholder)).toHaveValue("");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("keeps deletion in its own section, behind a confirm", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();

    expect(screen.getByText(messages.config.deleteTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.config.deleteBody)).toBeInTheDocument();

    fireEvent.click(screen.getByText(messages.config.deleteAction));
    expect(confirm).toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText(messages.config.deleteAction));
    expect(deleteMutate).toHaveBeenCalledWith(SKILL.id, expect.anything());
    confirm.mockRestore();
  });

});

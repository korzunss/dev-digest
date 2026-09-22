/**
 * CreateSkillFromConventionsModal — the preview → edit → create flow.
 *
 * What is worth guarding here is the promise the modal makes: it asks the
 * server what the accepted rules WOULD become, lets every field be edited, and
 * persists nothing until Create. So: the fields really come from the preview,
 * Create refuses an unnamed or empty skill, Cancel writes nothing, and flipping
 * Split asks the server again instead of slicing the merged body client-side.
 *
 * No `@testing-library/user-event` in this package — interaction is driven with
 * `fireEvent`, synchronously (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillPreview, Skill } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillPreview: () => ({
    mutate: previewMutate,
    isPending: false,
    isIdle: false,
    isError: false,
  }),
  useCreateConventionSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";
import { candidateIdsOf, fileBaseName, isDraftReady, toDraft, trimDraft } from "./helpers";

const MERGED: ConventionSkillPreview = {
  name: "payments-api-conventions",
  description: "3 house conventions extracted from payments-api",
  type: "convention",
  body: "# payments-api-conventions\n\n## async-await-then-chains\nAlways use async/await.",
  evidence_files: ["src/api/users.ts", "src/db/repo.ts"],
  candidate_ids: ["c1", "c2", "c3"],
};

const NAMING: ConventionSkillPreview = {
  ...MERGED,
  name: "payments-api-naming",
  description: "1 naming convention extracted from payments-api",
  body: "# payments-api-naming\n\nFiles are kebab-case.",
  evidence_files: ["src/api/users.ts"],
  candidate_ids: ["c1"],
};

const ASYNC: ConventionSkillPreview = {
  ...MERGED,
  name: "payments-api-async",
  description: "2 async conventions extracted from payments-api",
  body: "# payments-api-async\n\nAlways use async/await.",
  evidence_files: ["src/db/repo.ts"],
  // Overlaps the first preview on purpose — the commit payload must not repeat
  // an id just because two previews happened to cite the same rule.
  candidate_ids: ["c1", "c2"],
};

const BY_CATEGORY: ConventionSkillPreview[] = [NAMING, ASYNC];

const CREATED: Skill = {
  id: "sk1",
  name: "payments-api-conventions",
  description: "3 house conventions extracted from payments-api",
  type: "convention",
  source: "extracted",
  body: MERGED.body,
  enabled: true,
  version: 1,
  evidence_files: MERGED.evidence_files,
  agent_count: null,
  pull_rate: null,
  accept_rate: null,
};

const onClose = vi.fn();

beforeEach(() => {
  previewMutate.mockImplementation(
    (vars: { split?: boolean }, opts?: { onSuccess?: (p: ConventionSkillPreview[]) => void }) =>
      opts?.onSuccess?.(vars.split ? BY_CATEGORY : [MERGED]),
  );
});

afterEach(() => {
  cleanup();
  previewMutate.mockReset();
  createMutate.mockReset();
  onClose.mockReset();
});

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateSkillFromConventionsModal repoId="repo-1" onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The body editor is the mono textarea; nothing else in the form is one. */
function bodyEditor(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector("textarea.mono");
  if (!el) throw new Error("body editor not found");
  return el as HTMLTextAreaElement;
}

/** Two switches, in DOM order: Split by category, then Enabled. */
const SPLIT = 0;
const ENABLED = 1;

function switchAt(which: number): HTMLElement {
  const el = screen.getAllByRole("switch")[which];
  if (!el) throw new Error(`no switch at ${which}`);
  return el;
}

function createButton() {
  return screen.getByText(conventions.createSkill.create);
}

describe("helpers", () => {
  it("starts an extracted skill enabled, unlike an import", () => {
    expect(toDraft(MERGED)).toEqual({
      name: MERGED.name,
      description: MERGED.description,
      type: "convention",
      body: MERGED.body,
      enabled: true,
    });
  });

  it("requires a name and a body, but not a description", () => {
    const draft = toDraft(MERGED);
    expect(isDraftReady(draft)).toBe(true);
    expect(isDraftReady({ ...draft, description: "" })).toBe(true);
    expect(isDraftReady({ ...draft, name: "   " })).toBe(false);
    expect(isDraftReady({ ...draft, body: "" })).toBe(false);
  });

  it("trims the single-line fields and leaves markdown alone", () => {
    const draft = trimDraft({ ...toDraft(MERGED), name: "  a  ", body: "  # x" });
    expect(draft.name).toBe("a");
    // Leading whitespace is meaningful in markdown — trimming it would move
    // a fenced block or an indented list.
    expect(draft.body).toBe("  # x");
  });

  it("de-duplicates the candidate ids across previews", () => {
    expect(candidateIdsOf(BY_CATEGORY)).toEqual(["c1", "c2"]);
    expect(candidateIdsOf([])).toEqual([]);
  });

  it("never lets the file chip degrade to a bare extension", () => {
    expect(fileBaseName(MERGED.name)).toBe("payments-api-conventions");
    expect(fileBaseName("  ")).toBe("conventions");
  });
});

describe("CreateSkillFromConventionsModal", () => {
  it("asks the server to build the preview as soon as it opens", () => {
    renderModal();
    expect(previewMutate).toHaveBeenCalledTimes(1);
    expect(previewMutate).toHaveBeenCalledWith({ repoId: "repo-1", split: false }, expect.anything());
  });

  it("fills every field from the returned preview", () => {
    const { container } = renderModal();

    expect(screen.getByDisplayValue(MERGED.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(MERGED.description)).toBeInTheDocument();
    expect(bodyEditor(container).value).toBe(MERGED.body);
    expect(screen.getByDisplayValue("convention")).toBeInTheDocument();
    // The banner says where this text came from, counting rules and files.
    expect(screen.getByText("Merged from 3 accepted rules citing 2 files.")).toBeInTheDocument();
    // The body is named like the markdown file a skill is everywhere else,
    // and carries an estimate marked as one.
    expect(screen.getByText("payments-api-conventions.md")).toBeInTheDocument();
    expect(screen.getByText(/^~\d+ tokens$/)).toBeInTheDocument();
  });

  it("offers the fields in an editable state, enabled by default", () => {
    renderModal();
    expect(switchAt(SPLIT)).toHaveAttribute("aria-checked", "false");
    expect(switchAt(ENABLED)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(switchAt(ENABLED));
    expect(switchAt(ENABLED)).toHaveAttribute("aria-checked", "false");
    // Flipping a field is not a save — nothing has been persisted yet.
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("refuses to create a skill with no name", () => {
    renderModal();
    expect(createButton()).not.toBeDisabled();

    const name = screen.getByDisplayValue(MERGED.name);
    fireEvent.change(name, { target: { value: "   " } });
    expect(createButton()).toBeDisabled();

    fireEvent.change(name, { target: { value: "renamed" } });
    expect(createButton()).not.toBeDisabled();
  });

  it("refuses to create a skill with an empty body", () => {
    const { container } = renderModal();
    fireEvent.change(bodyEditor(container), { target: { value: "" } });
    expect(createButton()).toBeDisabled();
  });

  it("writes nothing when the modal is cancelled", () => {
    const { container } = renderModal();
    fireEvent.change(bodyEditor(container), { target: { value: "# edited by hand" } });
    fireEvent.click(screen.getByText(conventions.createSkill.cancel));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("re-fetches the preview when Split by category is turned on", () => {
    const { container } = renderModal();
    fireEvent.click(switchAt(SPLIT));

    // The N category skills come from the server, not from slicing the merged
    // body here — the modal has no idea which rule sits in which category.
    expect(previewMutate).toHaveBeenCalledTimes(2);
    expect(previewMutate).toHaveBeenLastCalledWith(
      { repoId: "repo-1", split: true },
      expect.anything(),
    );
    expect(screen.getByDisplayValue("payments-api-naming")).toBeInTheDocument();
    expect(bodyEditor(container).value).toBe(NAMING.body);
  });

  it("steps through the split previews before creating them all", () => {
    const { container } = renderModal();
    fireEvent.click(switchAt(SPLIT));

    expect(screen.getByText("Skill 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(conventions.createSkill.next));
    expect(screen.getByText("Skill 2 of 2")).toBeInTheDocument();
    expect(bodyEditor(container).value).toBe(ASYNC.body);

    fireEvent.click(screen.getByText("Create 2 skills"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0]?.[0] as {
      skills: { name: string }[];
      candidateIds: string[];
    };
    expect(payload.skills.map((d) => d.name)).toEqual([
      "payments-api-naming",
      "payments-api-async",
    ]);
    expect(payload.candidateIds).toEqual(["c1", "c2"]);
  });

  it("keeps an incomplete step from being created by a button two steps away", () => {
    renderModal();
    fireEvent.click(switchAt(SPLIT));
    fireEvent.change(screen.getByDisplayValue("payments-api-naming"), { target: { value: "" } });

    fireEvent.click(screen.getByLabelText(conventions.createSkill.next));
    expect(screen.getByText("Create 2 skills")).toBeDisabled();
  });

  it("closes and names the created skill only once the server has answered", () => {
    renderModal();
    // A create that never calls back is a create still in flight, or a failed
    // one — either way the typing stays on screen.
    fireEvent.click(createButton());
    expect(onClose).not.toHaveBeenCalled();

    createMutate.mockImplementation(
      (_vars: unknown, opts?: { onSuccess?: (s: Skill[]) => void }) =>
        opts?.onSuccess?.([CREATED]),
    );
    fireEvent.click(createButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Created “payments-api-conventions” — it is in the Skills Lab/),
    ).toBeInTheDocument();
  });
});

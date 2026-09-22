import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { isArchiveFile, isMarkdownFile } from "./helpers";

const previewMutate = vi.fn();
const createMutateAsync = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

const PREVIEW: SkillImportPreview = {
  name: "archived-rule",
  description: "The rule itself.",
  type: "custom",
  body: "# archived-rule\n\nThe rule itself.",
  source: "imported_file",
  ignored: ["install.sh", "assets/logo.png"],
};

afterEach(() => {
  cleanup();
  previewMutate.mockReset();
  createMutateAsync.mockReset();
});

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillDrawer onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

/** Drive the mocked preview mutation's onSuccess with a parsed skill. */
function resolvePreview(p: SkillImportPreview = PREVIEW) {
  const onSuccess = previewMutate.mock.calls.at(-1)?.[1]?.onSuccess as
    | ((p: SkillImportPreview) => void)
    | undefined;
  act(() => onSuccess?.(p));
}

describe("import helpers", () => {
  it("accepts markdown and archives, and nothing else", () => {
    expect(isMarkdownFile("SKILL.md")).toBe(true);
    expect(isMarkdownFile("notes.markdown")).toBe(true);
    expect(isArchiveFile("pack.zip")).toBe(true);
    expect(isMarkdownFile("install.sh")).toBe(false);
    expect(isArchiveFile("install.sh")).toBe(false);
  });
});

describe("ImportSkillDrawer", () => {
  it("previews a URL without creating anything", async () => {
    renderDrawer();
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));

    expect(previewMutate).toHaveBeenCalledWith(
      { kind: "url", url: "https://example.com/skill.md" },
      expect.anything(),
    );
    // The preview is a parse, not a save.
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the parsed skill and the entries it refused to process", async () => {
    renderDrawer();
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));
    resolvePreview();

    await waitFor(() =>
      expect(screen.getByText("Preview — nothing is saved yet")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("archived-rule")).toBeInTheDocument();
    expect(screen.getByText("Not processed (2)")).toBeInTheDocument();
    expect(screen.getByText("install.sh")).toBeInTheDocument();
    // Still nothing stored.
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("creates the skill only once the preview is confirmed, carrying its source", async () => {
    renderDrawer();
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));
    resolvePreview();

    await waitFor(() => expect(screen.getByText("Save skill")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save skill"));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "archived-rule",
        description: "The rule itself.",
        type: "custom",
        body: "# archived-rule\n\nThe rule itself.",
        // The source is what makes it land disabled server-side.
        source: "imported_file",
      }),
    );
  });

  it("refuses to save without a description — it is the skill's interface", async () => {
    renderDrawer();
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));
    resolvePreview({ ...PREVIEW, description: "" });

    await waitFor(() => expect(screen.getByText("Save skill")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save skill"));

    await waitFor(() =>
      expect(
        screen.getByText("Add a description — it is what tells an agent when this rule applies."),
      ).toBeInTheDocument(),
    );
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("cannot be confirmed before a preview exists", () => {
    renderDrawer();
    expect(screen.getByText("Save skill").closest("button")).toBeDisabled();
  });
});

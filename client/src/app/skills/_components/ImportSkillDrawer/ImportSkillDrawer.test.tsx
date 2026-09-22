import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { fileToImportInput, isArchiveFile, isMarkdownFile, toBase64 } from "./helpers";
import { ApiError } from "../../../../lib/api";

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
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
  createMutate.mockReset();
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


/**
 * jsdom's `File` has no `text()` / `arrayBuffer()` in this version, so a real
 * File cannot be read here. `fileToImportInput` only ever touches `name`,
 * `text()` and `arrayBuffer()` — this stands in for exactly that surface, which
 * keeps the test about our branching rather than about the platform's.
 */
function pickedFile(name: string, content: string): File {
  return {
    name,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  } as unknown as File;
}

/** Drive the mocked preview mutation's onError. */
function rejectPreview(err: unknown) {
  const onError = previewMutate.mock.calls.at(-1)?.[1]?.onError as
    | ((e: unknown) => void)
    | undefined;
  act(() => onError?.(err));
}

/** The hidden file input the picker button clicks for you. */
function fileInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector('input[type="file"]');
  if (!el) throw new Error("no file input rendered");
  return el as HTMLInputElement;
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
    expect(createMutate).not.toHaveBeenCalled();
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
    expect(createMutate).not.toHaveBeenCalled();
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
      expect(createMutate).toHaveBeenCalledWith(
        {
          name: "archived-rule",
          description: "The rule itself.",
          type: "custom",
          body: "# archived-rule\n\nThe rule itself.",
          // The source is what makes it land disabled server-side.
          source: "imported_file",
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      ),
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
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("cannot be confirmed before a preview exists", () => {
    renderDrawer();
    expect(screen.getByText("Save skill").closest("button")).toBeDisabled();
  });

  it("keeps the preview on screen when the save fails", async () => {
    // The parsed skill lives nowhere but this component, so closing on failure
    // would throw away work the user cannot get back without re-importing.
    // `mutate` + onSuccess also means no awaited promise is left to reject
    // unhandled; the global MutationCache.onError reports the reason.
    const onClose = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillDrawer onClose={onClose} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));
    resolvePreview();

    await waitFor(() => expect(screen.getByText("Save skill")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save skill"));

    // The mutation was fired but never succeeded: onSuccess is simply not run.
    expect(createMutate).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Preview — nothing is saved yet")).toBeInTheDocument();
  });

});

describe("fileToImportInput", () => {
  it("sends markdown as text", async () => {
    expect(await fileToImportInput(pickedFile("SKILL.md", "# rule"))).toEqual({
      kind: "md",
      filename: "SKILL.md",
      content: "# rule",
    });
  });

  it("sends an archive as base64, never as text", async () => {
    const input = await fileToImportInput(pickedFile("pack.zip", "PK\u0003\u0004"));
    expect(input).toMatchObject({ kind: "zip", filename: "pack.zip" });
    expect(input).toHaveProperty("content_b64");
    expect(input).not.toHaveProperty("content");
  });

  it("refuses anything else, rather than guessing", async () => {
    expect(await fileToImportInput(pickedFile("install.sh", "rm -rf /"))).toBeNull();
  });

  it("encodes bytes without blowing the stack on a large archive", () => {
    // Chunked on purpose: String.fromCharCode(...view) overflows the argument
    // limit somewhere around a megabyte, which is well inside a real archive.
    const big = new Uint8Array(200_000).fill(65).buffer;
    expect(toBase64(big)).toBe(btoa("A".repeat(200_000)));
  });
});

describe("ImportSkillDrawer file picker", () => {
  it("previews a markdown file the moment it is chosen", async () => {
    const { container } = renderDrawer();
    fireEvent.change(fileInput(container), {
      target: { files: [pickedFile("pr-rubric.md", "# pr-rubric\n\nThe rule.")] },
    });

    await waitFor(() =>
      expect(previewMutate).toHaveBeenCalledWith(
        { kind: "md", filename: "pr-rubric.md", content: "# pr-rubric\n\nThe rule." },
        expect.anything(),
      ),
    );
    // Still a parse, not a save.
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("names the chosen file so the user can see what is being read", async () => {
    const { container } = renderDrawer();
    fireEvent.change(fileInput(container), {
      target: { files: [pickedFile("pr-rubric.md", "# x")] },
    });
    await waitFor(() => expect(screen.getByText("pr-rubric.md")).toBeInTheDocument());
  });

  it("refuses an unsupported file without asking the server", async () => {
    const { container } = renderDrawer();
    fireEvent.change(fileInput(container), {
      target: { files: [pickedFile("install.sh", "rm -rf /")] },
    });

    await waitFor(() =>
      expect(screen.getByText(messages.import.unsupported)).toBeInTheDocument(),
    );
    expect(previewMutate).not.toHaveBeenCalled();
  });
});

describe("ImportSkillDrawer failure paths", () => {
  function previewFrom(container: HTMLElement) {
    fireEvent.change(fileInput(container), {
      target: { files: [pickedFile("a.md", "# a")] },
    });
    return waitFor(() => expect(previewMutate).toHaveBeenCalled());
  }

  it("shows the server's reason when the parse fails", async () => {
    const { container } = renderDrawer();
    await previewFrom(container);

    rejectPreview(new ApiError("The archive expands to more than 2 MB.", 422));
    expect(
      screen.getByText("The archive expands to more than 2 MB."),
    ).toBeInTheDocument();
    // And no preview to confirm, so nothing can be stored by accident.
    expect(screen.queryByText(messages.import.previewTitle)).not.toBeInTheDocument();
  });

  it("falls back to its own copy when the failure is not an API error", async () => {
    const { container } = renderDrawer();
    await previewFrom(container);

    rejectPreview(new Error("socket hang up"));
    expect(screen.getByText(messages.drawer.importFailed)).toBeInTheDocument();
    expect(screen.queryByText("socket hang up")).not.toBeInTheDocument();
  });

  it("refuses to save without a name — it is what the prompt shows", async () => {
    renderDrawer();
    fireEvent.click(screen.getByText("From URL"));
    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    fireEvent.click(screen.getByText("Import from URL"));
    resolvePreview({ ...PREVIEW, name: "" });

    await waitFor(() => expect(screen.getByText("Save skill")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save skill"));

    expect(screen.getByText(messages.import.nameRequired)).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });
});

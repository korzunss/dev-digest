/* ContextRootsEditor — Save sends the edited list, Reset restores the default,
   a refused save shows the server's message. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import { ContextRootsEditor } from "./ContextRootsEditor";
import { parseGlobs } from "./helpers";

afterEach(cleanup);

function renderEditor(over: Partial<React.ComponentProps<typeof ContextRootsEditor>> = {}) {
  const props = {
    roots: { globs: ["docs/**/*.md"], is_default: false },
    error: null,
    onSave: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextRootsEditor {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("ContextRootsEditor", () => {
  it("saves the edited globs, one per line, and resets to the default", () => {
    const props = renderEditor();
    fireEvent.change(screen.getByLabelText("Search roots, one glob per line"), {
      target: { value: "docs/**/*.md\n\n  specs/**/*.md  \n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith(["docs/**/*.md", "specs/**/*.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal and marks the default roots", () => {
    renderEditor({ roots: { globs: ["**/*.md"], is_default: true }, error: "Invalid glob: **/*.txt" });
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid glob: **/*.txt");
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  it("parses blank lines away", () => {
    expect(parseGlobs("\n a \n\nb\n")).toEqual(["a", "b"]);
  });
});

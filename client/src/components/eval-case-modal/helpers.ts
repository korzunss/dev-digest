/* Pure helpers for the EvalCaseModal. `JSON.parse` of user text lives only
   here, inside a try — a malformed expected output is a state of the form,
   never an exception in render. */
import type { EvalCaseResult, EvalExpectation, EvalCaseSource, PrFile } from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Unified diff → PrFile[] (for the DiffViewer preview and the Files tab)
// ---------------------------------------------------------------------------

interface FileAcc {
  path: string;
  hunks: string[];
  additions: number;
  deletions: number;
  inHunk: boolean;
  headerSeen: boolean;
}

const stripPrefix = (p: string): string => p.replace(/^[ab]\//, "").replace(/\t.*$/, "");

/** Split raw unified-diff text into one PrFile per file. `patch` is the hunk
    text only (from the first `@@`), the shape the DiffViewer already renders.
    Text with no recognisable file header gives `[]`. */
export function diffToPrFiles(raw: string): PrFile[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const files: FileAcc[] = [];
  let cur: FileAcc | null = null;
  const begin = (path: string): FileAcc => {
    const acc: FileAcc = { path, hunks: [], additions: 0, deletions: 0, inHunk: false, headerSeen: false };
    files.push(acc);
    return acc;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (git) {
      cur = begin(git[2]!);
      continue;
    }
    if (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")) {
      const oldPath = line.slice(4).trim();
      const newPath = (lines[i + 1] ?? "").slice(4).trim();
      const path = newPath === "/dev/null" ? stripPrefix(oldPath) : stripPrefix(newPath);
      if (cur && !cur.inHunk && !cur.headerSeen) {
        cur.path = path;
      } else {
        cur = begin(path);
      }
      cur.headerSeen = true;
      i++;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("@@")) cur.inHunk = true;
    if (!cur.inHunk) continue;
    cur.hunks.push(line);
    if (line.startsWith("+")) cur.additions++;
    else if (line.startsWith("-")) cur.deletions++;
  }

  return files
    .filter((f) => f.path !== "")
    .map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.hunks.join("\n").replace(/\n+$/, ""),
    }));
}

/** True when the pasted text holds at least one file with a hunk. */
export function hasHunk(files: PrFile[]): boolean {
  return files.some((f) => (f.patch ?? "").includes("@@"));
}

// ---------------------------------------------------------------------------
// Expected output JSON
// ---------------------------------------------------------------------------

export type ParsedExpected =
  | { ok: true; value: unknown[] }
  | { ok: false; message: string };

export function parseExpected(text: string): ParsedExpected {
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return { ok: false, message: "must be a JSON array" };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const formatExpected = (expected: EvalExpectation[]): string => JSON.stringify(expected, null, 2);

/** Append a pre-filled `must_find` element. Invalid JSON is left as it is:
    appending to text we cannot read would destroy what the user typed. */
export function appendSkeleton(text: string, file: string): string {
  const parsed = text.trim() === "" ? ({ ok: true, value: [] } as const) : parseExpected(text);
  if (!parsed.ok) return text;
  const skeleton = { expect: "must_find", file, start_line: 1, end_line: 1, title: "", severity: "", category: "" };
  return JSON.stringify([...parsed.value, skeleton], null, 2);
}

export type ExpectedKind = "mustFind" | "mustNotFlag" | "mixed" | "empty";

/** The expectation type a saved case is named by in the confirmation. */
export function expectedKind(value: unknown[]): ExpectedKind {
  const kinds = new Set(
    value.map((v) => (typeof v === "object" && v !== null ? (v as { expect?: unknown }).expect : undefined)),
  );
  if (value.length === 0) return "empty";
  if (kinds.size === 1 && kinds.has("must_find")) return "mustFind";
  if (kinds.size === 1 && kinds.has("must_not_flag")) return "mustNotFlag";
  return "mixed";
}

/** `12` for a single line, `12-18` for a range. */
export const lineLabel = (start: number, end?: number | null): string =>
  end != null && end !== start ? `${start}-${end}` : String(start);

// ---------------------------------------------------------------------------
// Results, errors, links
// ---------------------------------------------------------------------------

export const secondsLabel = (ms: number): string => (ms / 1000).toFixed(1);

export const costLabel = (usd: number | null): string => (usd == null ? "n/a" : `$${usd.toFixed(4)}`);

/** `pick` is the "provider/model" a skill case ran on ("" for an agent case). */
export type RunSnapshot = { diff: string; expected: string; pick?: string };

/** A shown result is stale once the input, expected output or (skill) picked model differs from what ran. */
export const isStale = (ran: RunSnapshot | null, now: RunSnapshot): boolean =>
  ran !== null &&
  (ran.diff !== now.diff || ran.expected !== now.expected || (ran.pick ?? "") !== (now.pick ?? ""));

export interface CaseIssue {
  message: string;
}

/** The server's refusal as a list of lines. Its messages already name the
    offending element, so they are shown as they come. */
export function issuesFromError(err: { message: string; details?: unknown }): CaseIssue[] {
  const d = err.details;
  if (Array.isArray(d) && d.length > 0) {
    return d.map((x) => ({
      message: typeof x === "object" && x !== null && "message" in x ? String((x as { message: unknown }).message) : String(x),
    }));
  }
  return [{ message: err.message }];
}

/** `details.case_id` of a `case_exists` refusal, or null. */
export function existingCaseId(details: unknown): string | null {
  if (typeof details === "object" && details !== null && "case_id" in details) {
    const id = (details as { case_id: unknown }).case_id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export interface SourceLinks {
  pr: string;
  finding: string | null;
}

/** AC-77: links to the source PR and finding; null when the source is gone. */
export function sourceLinks(source: EvalCaseSource | null | undefined): SourceLinks | null {
  if (!source || !source.repo_id || source.pr_number == null) return null;
  const pr = `/repos/${source.repo_id}/pulls/${source.pr_number}`;
  return { pr, finding: source.finding_id ? `${pr}#finding-${source.finding_id}` : null };
}

export type RunStatus = EvalCaseResult["status"];

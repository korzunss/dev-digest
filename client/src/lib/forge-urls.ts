/* forge-urls.ts — build forge deep-links from data we already hold.
   PR detail has the repo (provider + instance + owner/repo), the PR number,
   the head sha, and a finding's file/line — enough to open the MR/PR or a file
   blob at a line range in a new tab.

   Two forges, two URL grammars, and a self-managed instance may live under a
   path prefix — so every link is composed from the repo's own `api_base`
   rather than from a constant host. */

import type { ForgeProvider } from "./types";

/** The slice of a Repo these builders need. */
export interface ForgeRepoRef {
  provider: ForgeProvider;
  /** Origin + any path prefix of a self-managed instance; null ⇒ public host. */
  api_base: string | null;
  full_name: string;
}

const PUBLIC_BASE: Record<ForgeProvider, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

/** Human label for the forge, for "View on …" affordances. */
export const FORGE_LABEL: Record<ForgeProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

function baseFor(repo: ForgeRepoRef): string {
  const base = repo.api_base ?? PUBLIC_BASE[repo.provider] ?? PUBLIC_BASE.github;
  return base.replace(/\/+$/, "");
}

/** Encode a repo-relative path for a URL while keeping "/" separators. */
function encPath(file: string): string {
  return file.split("/").map(encodeURIComponent).join("/");
}

/**
 * GitHub: `{base}/{owner}/{repo}/pull/{n}`
 * GitLab: `{base}/{group}/{project}/-/merge_requests/{iid}`
 */
export function forgePrUrl(repo: ForgeRepoRef, number: number): string {
  const root = `${baseFor(repo)}/${repo.full_name}`;
  return repo.provider === "gitlab"
    ? `${root}/-/merge_requests/${number}`
    : `${root}/pull/${number}`;
}

/**
 * Blob link pinned to `sha` so line numbers stay accurate.
 *
 * The line anchors differ and it is easy to miss: GitHub wants `#L10-L20`,
 * GitLab wants `#L10-20` (no second "L"). GitLab also needs the `/-/` infix.
 */
export function forgeBlobUrl(
  repo: ForgeRepoRef,
  sha: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  const root = `${baseFor(repo)}/${repo.full_name}`;
  const isGitlab = repo.provider === "gitlab";
  let url = `${root}${isGitlab ? "/-" : ""}/blob/${sha}/${encPath(file)}`;
  if (startLine != null) {
    url += `#L${startLine}`;
    if (endLine != null && endLine !== startLine) {
      url += isGitlab ? `-${endLine}` : `-L${endLine}`;
    }
  }
  return url;
}

import type { ImportSkillInput } from "../../../../lib/hooks/skills";

/** Extensions the import accepts. Anything else is refused before upload. */
export const ACCEPTED = ".md,.markdown,.zip";

export function isMarkdownFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".md") || n.endsWith(".markdown");
}

export function isArchiveFile(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

/** Base64 without blowing the call stack on a multi-megabyte archive. */
export function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Turn a picked file into the preview request. Markdown is sent as text;
 * an archive is sent as base64 and expanded server-side, in memory only.
 * Anything else is rejected here rather than uploaded and refused.
 */
export async function fileToImportInput(file: File): Promise<ImportSkillInput | null> {
  if (isMarkdownFile(file.name)) {
    return { kind: "md", filename: file.name, content: await file.text() };
  }
  if (isArchiveFile(file.name)) {
    return {
      kind: "zip",
      filename: file.name,
      content_b64: toBase64(await file.arrayBuffer()),
    };
  }
  return null;
}

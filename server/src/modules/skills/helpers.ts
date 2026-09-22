import { unzipSync } from 'fflate';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_CORE_CANDIDATES,
  DEFAULT_SKILL_TYPE,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
} from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping and the two rules that
 * are easier to trust as functions than as conditions buried in a service: when
 * an imported skill may be on, and when a save creates a new version. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Whether a newly created skill starts enabled.
 *
 * Only a skill written here is on by default. Anything imported — a file, an
 * archive, a URL, the community catalogue — is somebody else's instructions
 * about to be pasted into an agent's prompt, so it lands OFF and stays off
 * until a person reads the body and flips the switch. That human step is the
 * whole control: the body is deliberately NOT wrapped in `<untrusted>`, because
 * a skill's purpose is to be an instruction and the injection guard would
 * neutralise it (spec 003).
 */
export function defaultEnabledFor(source: SkillSource): boolean {
  return source === 'manual';
}

/**
 * True when a patch changes the body — the only change that creates a new
 * immutable version. A rename or a toggle does not: a version IS a body,
 * because the body is what ends up in the prompt.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/**
 * One skill's block as it appears in the assembled prompt.
 *
 * The BODY goes in verbatim: it is the instruction the skill exists to deliver,
 * and the gate on it is human vetting (an imported skill lands disabled), not
 * escaping — wrapping it as untrusted would tell the model to ignore it.
 *
 * The NAME is different. It is metadata rendered in a STRUCTURAL position, so
 * it is flattened to one line first: a name carrying newlines could otherwise
 * forge a section boundary inside the user message — a second `## …` heading,
 * or something shaped like a delimiter — and change what the model believes
 * the message is made of. Costs nothing, and keeps the block's shape a
 * property of the code rather than of whatever someone typed in a name field.
 */
export function renderSkillBlock(name: string, body: string): string {
  return `### Skill: ${name.replace(/\s+/g, ' ').trim()}\n\n${body}`;
}

// ---- Import parsing -------------------------------------------------------

/** What a markdown skill file yields before it becomes a row. */
export interface ParsedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

const SKILL_TYPES: readonly string[] = ['rubric', 'convention', 'security', 'custom'];

/** Strip one layer of matching quotes from a front-matter scalar. */
function unquote(value: string): string {
  const v = value.trim();
  const quoted =
    (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
  return quoted && v.length >= 2 ? v.slice(1, -1) : v;
}

/**
 * Split off a leading `---` front-matter block. Deliberately a flat key: value
 * reader rather than a YAML parser — a skill's front matter is three scalars,
 * and pulling in a YAML engine to read them would mean running a far larger
 * parser over untrusted input for no gain.
 */
function splitFrontMatter(text: string): { meta: Record<string, string>; rest: string } {
  const normalised = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalised.startsWith('---\n')) return { meta: {}, rest: normalised };

  const end = normalised.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, rest: normalised };

  const block = normalised.slice(4, end);
  const rest = normalised.slice(end + 4).replace(/^\n/, '');
  const meta: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    meta[line.slice(0, at).trim().toLowerCase()] = unquote(line.slice(at + 1));
  }
  return { meta, rest };
}

/** The text of the first `# `/`## ` heading, if the document opens with one. */
function firstHeading(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const m = /^#{1,3}\s+(.*\S)\s*$/.exec(line);
    if (m) return m[1];
    if (line.trim() !== '') return undefined;
  }
  return undefined;
}

/** The first non-empty line that is not a heading, list marker or fence. */
function firstParagraph(body: string): string | undefined {
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('```') || line.startsWith('---')) {
      continue;
    }
    return line.replace(/^[-*+]\s+/, '');
  }
  return undefined;
}

/** Drop a directory prefix and a `.md` extension: `skills/foo.md` → `foo`. */
export function nameFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  return base.replace(/\.[^.]+$/, '');
}

/**
 * Pull a skill's core out of a markdown document.
 *
 * Front matter wins when present; otherwise the name comes from the first
 * heading (falling back to the filename) and the description from the first
 * paragraph. An unrecognised `type` degrades to `custom` rather than failing —
 * a foreign skill declaring its own vocabulary should still import.
 *
 * The body is returned WITHOUT the front matter but otherwise verbatim: it is
 * what reaches the prompt, so nothing is rewritten on the way in.
 */
export function parseSkillMarkdown(text: string, filename?: string): ParsedSkill {
  const { meta, rest } = splitFrontMatter(text);
  const body = rest.trim();
  const declaredType = meta.type?.toLowerCase();

  return {
    name:
      meta.name ||
      firstHeading(body) ||
      (filename ? nameFromFilename(filename) : '') ||
      'Imported skill',
    description: meta.description || firstParagraph(body) || '',
    type: (SKILL_TYPES.includes(declaredType ?? '')
      ? declaredType
      : DEFAULT_SKILL_TYPE) as SkillType,
    body,
  };
}

// ---- Import: archives -----------------------------------------------------

export interface ArchiveExtraction {
  /** The markdown file treated as the skill, and its path inside the archive. */
  core: { path: string; text: string };
  /** Every other entry — listed, never unpacked to disk, never executed. */
  ignored: string[];
}

function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * Pick the archive entry that is the skill. `SKILL.md` first (the convention
 * every skill catalogue uses), then `skill.md`/`README.md`, then a lone `.md`.
 * Shallower paths win, so a top-level SKILL.md beats one nested in an example.
 */
function pickCore(paths: string[]): string | undefined {
  const markdown = paths.filter(isMarkdown);
  if (markdown.length === 0) return undefined;

  const byDepth = [...markdown].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
  );
  for (const candidate of ARCHIVE_CORE_CANDIDATES) {
    const hit = byDepth.find((p) => (p.split('/').pop() ?? p).toLowerCase() === candidate);
    if (hit) return hit;
  }
  return markdown.length === 1 ? markdown[0] : byDepth[0];
}

/**
 * Read a skill out of a zip archive.
 *
 * The archive is expanded IN MEMORY and only the one markdown file we choose is
 * ever decompressed — scripts, binaries and anything else are listed in
 * `ignored` and otherwise untouched. Nothing is written to disk and nothing is
 * executed, which is the property the import preview exists to make visible.
 *
 * Two passes on purpose: the first reads the central directory only (the filter
 * returns false for everything, so no entry is inflated) which is what lets the
 * size and count caps be enforced BEFORE any decompression happens.
 */
export function extractSkillFromArchive(archive: Uint8Array): ArchiveExtraction {
  const entries: { path: string; size: number }[] = [];
  try {
    unzipSync(archive, {
      filter: (file) => {
        if (!file.name.endsWith('/')) {
          entries.push({ path: file.name, size: file.originalSize });
        }
        return false;
      },
    });
  } catch {
    throw new ValidationError('Could not read the archive — is it a valid .zip?');
  }

  if (entries.length === 0) throw new ValidationError('The archive is empty.');
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new ValidationError(`The archive has more than ${MAX_ARCHIVE_ENTRIES} entries.`);
  }
  const total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total > MAX_ARCHIVE_BYTES) {
    throw new ValidationError('The archive expands to more than 2 MB.');
  }

  const paths = entries.map((e) => e.path);
  const corePath = pickCore(paths);
  if (!corePath) {
    throw new ValidationError('The archive contains no markdown file to import.');
  }

  const unpacked = unzipSync(archive, { filter: (file) => file.name === corePath });
  const bytes = unpacked[corePath];
  if (!bytes) throw new ValidationError('The archive contains no markdown file to import.');

  return {
    core: { path: corePath, text: new TextDecoder().decode(bytes) },
    ignored: paths.filter((p) => p !== corePath),
  };
}

// ---- Import: URLs ---------------------------------------------------------

/**
 * Whether an IP is one we refuse to fetch from: loopback, link-local, and the
 * private ranges. Import-by-URL takes a user-supplied address and the server
 * fetches it, so without this the endpoint is a probe for anything reachable
 * from the host — the cloud metadata endpoint included.
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || // "this network"
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local, incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      a >= 224 // multicast + reserved
    );
  }

  const v6 = ip.toLowerCase().split('%')[0] ?? '';
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  // IPv4-mapped (::ffff:10.0.0.1) — judge the embedded address.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v6);
  return mapped ? isBlockedAddress(mapped[1]!) : false;
}

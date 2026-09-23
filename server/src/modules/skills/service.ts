import { lookup } from 'node:dns/promises';
import type { Container } from '../../platform/container.js';
import { createTwoFilesPatch } from 'diff';
import type {
  Skill,
  SkillContextLink,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { ValidationError } from '../../platform/errors.js';
import {
  defaultEnabledFor,
  extractSkillFromArchive,
  isBlockedAddress,
  parseSkillMarkdown,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import { MAX_URL_BYTES, STATS_WINDOW_DAYS, URL_FETCH_TIMEOUT_MS } from './constants.js';
import { buildSkillStats, rollupForList } from './stats.js';

/** What the import preview accepts: a markdown file, an archive, or a URL. */
export type ImportSource =
  | { kind: 'md'; filename: string; content: string }
  | { kind: 'zip'; filename: string; content_b64: string }
  | { kind: 'url'; url: string };

/** Redirect hops followed during an import-by-URL; each one is re-validated. */
const MAX_REDIRECTS = 3;

/**
 * Skills service. A skill is a reusable block of review rules — name,
 * description, type, markdown body — that any number of agents can attach.
 * The description is the skill's INTERFACE: it is what tells an agent when the
 * rule applies, which is why the editor asks for it imperatively.
 *
 * Body changes are versioned via `skill_versions` (repository).
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Note recorded on the version a body change creates. */
  message?: string;
}

/** A unified diff between two body snapshots of one skill. */
export interface SkillVersionDiff {
  from: number;
  to: number;
  patch: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /**
   * Every skill, with the rail card's rollup attached. Four queries for the
   * whole page rather than three per card — the same shape the PR list uses.
   */
  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const since = statsWindowStart();
    const [agentCounts, runCounts, runsTotal, findings] = await Promise.all([
      this.repo.agentCountsBySkill(workspaceId, ids),
      this.repo.runCountsBySkill(workspaceId, ids, since),
      this.repo.completedRunCount(workspaceId, since),
      this.repo.findingsBySkill(workspaceId, ids, since),
    ]);
    const findingsBySkill = new Map<string, typeof findings>();
    for (const f of findings) {
      const list = findingsBySkill.get(f.skillId) ?? [];
      list.push(f);
      findingsBySkill.set(f.skillId, list);
    }

    return rows.map((row) => ({
      ...toSkillDto(row),
      ...rollupForList(
        agentCounts.get(row.id) ?? 0,
        runCounts.get(row.id) ?? 0,
        runsTotal,
        findingsBySkill.get(row.id) ?? [],
      ),
    }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Create a skill. An imported one lands DISABLED unless the caller says
   * otherwise — see `defaultEnabledFor`: a foreign body is foreign instructions,
   * and a person has to read it before any agent runs with it.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      enabled: input.enabled ?? defaultEnabledFor(source),
      evidenceFiles: input.evidence_files ?? null,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.message !== undefined ? { message: patch.message } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Body history, newest first. Workspace-scoped: undefined when the skill is
   * not in this workspace (the route maps that to 404), so one tenant's bodies
   * can't be read through another's.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * A unified diff between two body snapshots. Computed here rather than in the
   * browser so the algorithm stays in the unit lane; the client already renders
   * unified-diff text with the PR viewer's `parsePatch`.
   */
  async versionDiff(
    workspaceId: string,
    id: string,
    from: number,
    to: number,
  ): Promise<SkillVersionDiff | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const [a, b] = await Promise.all([
      this.repo.getVersion(id, from),
      this.repo.getVersion(id, to),
    ]);
    if (!a || !b) throw new ValidationError('No such version of this skill.');

    const name = `${skill.name}.md`;
    return {
      from,
      to,
      patch: createTwoFilesPatch(name, name, a.body, b.body, `v${from}`, `v${to}`),
    };
  }

  /**
   * Restore an old body. It goes through the ordinary update path, so it
   * APPENDS a version rather than rewinding to one: history is what makes an
   * eval run reproducible against the text it scored, and rewriting it would
   * quietly invalidate those runs.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
    message?: string,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new ValidationError('No such version of this skill.');
    if (snapshot.body === skill.body) {
      throw new ValidationError('That version is already the current body.');
    }

    const row = await this.repo.update(workspaceId, id, {
      body: snapshot.body,
      message: message ?? `Restored v${version}`,
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Project-context documents attached to this skill, in prompt order. */
  async contextLinks(
    workspaceId: string,
    id: string,
  ): Promise<SkillContextLink[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listContextDocs(id);
    return rows.map((r) => ({ skill_id: id, path: r.path, order: r.order }));
  }

  /**
   * Replace the attached set. Paths are stored verbatim and validated when they
   * are READ, not here: a document can appear or vanish from a clone between
   * attaching and running, so there is no moment at which a stored path is
   * guaranteed to resolve.
   */
  async setContextLinks(
    workspaceId: string,
    id: string,
    paths: string[],
  ): Promise<SkillContextLink[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const deduped = [...new Set(paths)];
    await this.repo.setContextDocs(id, deduped);
    return this.contextLinks(workspaceId, id);
  }

  /** Usage figures. See `stats.ts` for what is exact and what is transitive. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const since = statsWindowStart();
    const [agents, runCounts, runsTotal, findings] = await Promise.all([
      this.repo.agentsUsingSkill(workspaceId, id),
      this.repo.runCountsBySkill(workspaceId, [id], since),
      this.repo.completedRunCount(workspaceId, since),
      this.repo.findingsBySkill(workspaceId, [id], since),
    ]);

    return buildSkillStats({
      skillId: id,
      agents,
      runsWithSkill: runCounts.get(id) ?? 0,
      runsTotal,
      findings,
    });
  }

  /**
   * Parse an incoming skill and return what WOULD be stored. Deliberately
   * persists nothing: the drawer shows this, and only a confirmed preview comes
   * back as a `create`. So abandoning an import leaves no row to clean up, and
   * "saved only after confirmation" is a property of the API, not of the UI
   * remembering to ask.
   */
  async importPreview(input: ImportSource): Promise<SkillImportPreview> {
    if (input.kind === 'md') {
      const parsed = parseSkillMarkdown(input.content, input.filename);
      return { ...parsed, source: 'imported_file', ignored: [] };
    }

    if (input.kind === 'zip') {
      const archive = decodeBase64(input.content_b64);
      const { core, ignored } = extractSkillFromArchive(archive);
      const parsed = parseSkillMarkdown(core.text, core.path);
      return { ...parsed, source: 'imported_file', ignored };
    }

    const { text, url } = await this.fetchSkillUrl(input.url);
    const parsed = parseSkillMarkdown(text, new URL(url).pathname);
    return { ...parsed, source: 'imported_url', ignored: [] };
  }

  /**
   * Fetch a skill body over http(s), refusing anything that resolves to an
   * address we shouldn't be reaching on the user's behalf. Redirects are
   * followed by hand precisely so each hop gets the same check — letting fetch
   * follow them would let a public URL bounce us to a private one after the
   * check had already passed.
   */
  private async fetchSkillUrl(raw: string): Promise<{ text: string; url: string }> {
    let current = raw;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertFetchableUrl(current);

      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
        headers: { accept: 'text/markdown, text/plain, */*' },
      }).catch((e: unknown) => {
        throw new ValidationError(`Could not fetch that URL: ${(e as Error).message}`);
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) throw new ValidationError('The URL redirected without a destination.');
        current = new URL(next, current).toString();
        continue;
      }

      if (!res.ok) {
        throw new ValidationError(`The URL answered ${res.status}.`);
      }

      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > MAX_URL_BYTES) {
        throw new ValidationError('That file is larger than 1 MB.');
      }
      const text = await res.text();
      if (text.length > MAX_URL_BYTES) {
        throw new ValidationError('That file is larger than 1 MB.');
      }
      if (text.trim() === '') throw new ValidationError('That URL returned an empty document.');
      return { text, url: current };
    }

    throw new ValidationError('That URL redirected too many times.');
  }
}

/** Start of the stats window. */
function statsWindowStart(): Date {
  return new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Decode a base64 upload, rejecting anything that isn't base64 at all. */
function decodeBase64(b64: string): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) throw new ValidationError('The uploaded file is empty.');
  return new Uint8Array(buf);
}

/**
 * Allow only http(s), and only when every address the host resolves to is
 * public. Resolving here rather than trusting the hostname is the point: a name
 * that looks external can still point at 127.0.0.1.
 */
async function assertFetchableUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http and https URLs can be imported.');
  }

  const addresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new ValidationError(`Could not resolve ${url.hostname}.`);
  });

  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new ValidationError('That address is not reachable for import.');
  }
}

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  extractSkillFromArchive,
  isBlockedAddress,
  nameFromFilename,
  parseSkillMarkdown,
} from '../src/modules/skills/helpers.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Skill import, the pure half: markdown parsing, archive extraction, and the
 * address guard behind import-by-URL. Hermetic — no DB, no network.
 */

describe('parseSkillMarkdown', () => {
  it('prefers front matter over the document', () => {
    const parsed = parseSkillMarkdown(
      ['---', 'name: secret-gate', 'description: Flag leaked keys.', 'type: security', '---', '', '# Something else', '', 'Other prose.'].join('\n'),
    );
    expect(parsed).toMatchObject({
      name: 'secret-gate',
      description: 'Flag leaked keys.',
      type: 'security',
    });
    expect(parsed.body).toBe('# Something else\n\nOther prose.');
  });

  it('falls back to the first heading and the first paragraph', () => {
    const parsed = parseSkillMarkdown('# pr-quality-rubric\n\nScore PRs on clarity.\n\n- one\n');
    expect(parsed).toMatchObject({
      name: 'pr-quality-rubric',
      description: 'Score PRs on clarity.',
      type: 'custom',
    });
  });

  it('falls back to the filename when there is no heading', () => {
    expect(parseSkillMarkdown('Just prose.', 'skills/no-then-chains.md').name).toBe(
      'no-then-chains',
    );
  });

  it('degrades an unknown type to custom rather than failing the import', () => {
    const parsed = parseSkillMarkdown('---\nname: x\ntype: taxonomy-we-do-not-have\n---\n\nBody.');
    expect(parsed.type).toBe('custom');
  });

  it('strips quotes from front-matter scalars', () => {
    const parsed = parseSkillMarkdown('---\nname: "quoted-name"\n---\n\nBody.');
    expect(parsed.name).toBe('quoted-name');
  });

  it('keeps the body verbatim — it is what reaches the prompt', () => {
    const body = '# Rule\n\n```ts\nconst a = 1;\n```\n\nDone.';
    expect(parseSkillMarkdown(`---\nname: x\n---\n\n${body}\n`).body).toBe(body);
  });

  it('handles CRLF and a BOM', () => {
    const parsed = parseSkillMarkdown('﻿---\r\nname: crlf-skill\r\n---\r\n\r\nBody.\r\n');
    expect(parsed.name).toBe('crlf-skill');
    expect(parsed.body).toBe('Body.');
  });

  it('never returns an empty name', () => {
    expect(parseSkillMarkdown('').name).toBe('Imported skill');
  });
});

describe('nameFromFilename', () => {
  it('drops the directory and the extension', () => {
    expect(nameFromFilename('pack/skills/secret-gate.md')).toBe('secret-gate');
  });
});

describe('extractSkillFromArchive', () => {
  function zip(files: Record<string, string>): Uint8Array {
    return zipSync(
      Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
    );
  }

  it('takes SKILL.md and reports every other entry as ignored', () => {
    const archive = zip({
      'SKILL.md': '# archive-skill\n\nThe rule.',
      'install.sh': 'rm -rf /',
      'assets/logo.png': 'binary-ish',
    });

    const { core, ignored } = extractSkillFromArchive(archive);
    expect(core.path).toBe('SKILL.md');
    expect(core.text).toContain('archive-skill');
    // The executable is listed, never unpacked to disk and never run.
    expect(ignored.sort()).toEqual(['assets/logo.png', 'install.sh']);
  });

  it('prefers a top-level SKILL.md over a nested one', () => {
    const archive = zip({
      'SKILL.md': '# top',
      'examples/SKILL.md': '# nested',
    });
    expect(extractSkillFromArchive(archive).core.path).toBe('SKILL.md');
  });

  it('falls back to README.md, then to a lone markdown file', () => {
    expect(extractSkillFromArchive(zip({ 'README.md': '# readme', 'a.txt': 'x' })).core.path).toBe(
      'README.md',
    );
    expect(extractSkillFromArchive(zip({ 'docs/only.md': '# only' })).core.path).toBe(
      'docs/only.md',
    );
  });

  it('rejects an archive with no markdown at all', () => {
    expect(() => extractSkillFromArchive(zip({ 'run.sh': 'echo hi' }))).toThrow(AppError);
  });

  it('rejects something that is not a zip', () => {
    expect(() => extractSkillFromArchive(strToU8('not an archive'))).toThrow(
      /valid \.zip/,
    );
  });

  it('rejects an archive with too many entries', () => {
    const many: Record<string, string> = { 'SKILL.md': '# x' };
    for (let i = 0; i < 250; i++) many[`f${i}.txt`] = 'x';
    expect(() => extractSkillFromArchive(zip(many))).toThrow(/more than 200 entries/);
  });

  it('rejects an archive that expands past the size cap', () => {
    // Highly compressible, so the zip itself stays small — which is exactly the
    // case the cap has to catch, since it is read from the metadata.
    const archive = zip({ 'SKILL.md': '# x', 'big.txt': 'a'.repeat(3 * 1024 * 1024) });
    expect(() => extractSkillFromArchive(archive)).toThrow(/more than 2 MB/);
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '140.82.121.4', '172.32.0.1', '2606:4700::1111'])(
    'allows %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

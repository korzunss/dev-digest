import { describe, it, expect } from 'vitest';
import {
  defaultEnabledFor,
  isBodyChange,
  toSkillDto,
  toSkillVersionDto,
} from '../src/modules/skills/helpers.js';
import type { SkillRow, SkillVersionRow } from '../src/db/rows.js';

/**
 * The pure half of the skills module: the row⇄DTO mapping and the two rules the
 * service leans on — when an imported skill may start enabled, and when a save
 * creates a new version. No DB, so this runs in the unit lane.
 */

const ROW: SkillRow = {
  id: 'sk1',
  workspaceId: 'ws1',
  name: 'secret-leakage-gate',
  description: 'Flag hardcoded credentials before they reach main.',
  type: 'security',
  source: 'manual',
  body: '# Rule\nNo sk_live keys in the diff.',
  enabled: true,
  version: 3,
  evidenceFiles: null,
  createdAt: new Date('2026-09-21T10:00:00.000Z'),
};

describe('toSkillDto', () => {
  it('maps a row onto the wire shape', () => {
    expect(toSkillDto(ROW)).toEqual({
      id: 'sk1',
      name: 'secret-leakage-gate',
      description: 'Flag hardcoded credentials before they reach main.',
      type: 'security',
      source: 'manual',
      body: '# Rule\nNo sk_live keys in the diff.',
      enabled: true,
      version: 3,
      evidence_files: null,
    });
  });

  it('does not leak workspace_id or created_at', () => {
    const dto = toSkillDto(ROW) as Record<string, unknown>;
    expect(dto).not.toHaveProperty('workspaceId');
    expect(dto).not.toHaveProperty('created_at');
  });

  it('passes evidence files through when present', () => {
    expect(toSkillDto({ ...ROW, evidenceFiles: ['src/a.ts'] }).evidence_files).toEqual([
      'src/a.ts',
    ]);
  });
});

describe('toSkillVersionDto', () => {
  it('serialises created_at as an ISO string', () => {
    const row: SkillVersionRow = {
      skillId: 'sk1',
      version: 2,
      body: 'older body',
      createdAt: new Date('2026-09-20T08:30:00.000Z'),
    };
    expect(toSkillVersionDto(row)).toEqual({
      skill_id: 'sk1',
      version: 2,
      body: 'older body',
      created_at: '2026-09-20T08:30:00.000Z',
    });
  });
});

describe('defaultEnabledFor', () => {
  it('enables a skill written here', () => {
    expect(defaultEnabledFor('manual')).toBe(true);
  });

  // Everything below is somebody else's instructions about to be pasted into an
  // agent's prompt. It stays off until a person reads the body.
  it.each(['imported_file', 'imported_url', 'community', 'extracted'] as const)(
    'leaves a %s skill disabled until vetted',
    (source) => {
      expect(defaultEnabledFor(source)).toBe(false);
    },
  );
});

describe('isBodyChange', () => {
  it('is true only when the body actually differs', () => {
    expect(isBodyChange({ body: 'a' }, { body: 'b' })).toBe(true);
  });

  it('is false when the body is resubmitted unchanged', () => {
    // The editor posts the whole form, so an untouched body arrives on every
    // save — versioning on "field present" would inflate the history.
    expect(isBodyChange({ body: 'a' }, { body: 'a' })).toBe(false);
  });

  it('is false for a rename or a toggle', () => {
    expect(isBodyChange({ body: 'a' }, {})).toBe(false);
  });
});

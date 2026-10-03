import { describe, it, expect } from 'vitest';
import { ConventionCategory } from '@devdigest/shared';
import { SEED_CONVENTIONS, seedConventionFingerprint } from '../src/db/seed-conventions.js';
import { fingerprintFor } from '../src/modules/conventions/helpers.js';

describe('SEED_CONVENTIONS', () => {
  it('has at least two entries', () => {
    expect(SEED_CONVENTIONS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(SEED_CONVENTIONS.map((c) => [c.evidencePath, c] as const))('%s is well-formed', (_p, c) => {
    expect(seedConventionFingerprint(c.rule, c.evidencePath)).toBe(fingerprintFor(c.rule, c.evidencePath));
    expect(ConventionCategory.safeParse(c.category).success).toBe(true);
    expect(c.confidence).toBeGreaterThanOrEqual(0);
    expect(c.confidence).toBeLessThanOrEqual(1);
    expect(c.evidenceEndLine - c.evidenceLine + 1).toBe(c.evidenceSnippet.split('\n').length);
    expect(c.rule).not.toMatch(/reject|accept|select|create|confidence|current|convention/i);
  });

  it('has unique fingerprints and confidences', () => {
    const fps = SEED_CONVENTIONS.map((c) => seedConventionFingerprint(c.rule, c.evidencePath));
    expect(new Set(fps).size).toBe(fps.length);
    expect(new Set(SEED_CONVENTIONS.map((c) => c.confidence)).size).toBe(SEED_CONVENTIONS.length);
  });
});

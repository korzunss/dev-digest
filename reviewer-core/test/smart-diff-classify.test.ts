import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile, SMART_DIFF_ROLE_ORDER } from '../src/index.js';

/**
 * Table-driven coverage for `classifyFile` (spec 007 D8): rules match a path
 * segment at any depth, first match wins, evaluation order is
 * boilerplate -> tests -> wiring -> docs, with `core` as the fallback.
 */

describe('classifyFile', () => {
  it.each([
    // Mandatory (from the assignment)
    ['__tests__/__snapshots__/x.snap', 'boilerplate', 'snapshot inside __tests__ still boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring', '.claude segment wins over the .md docs suffix'],
    ['e2e/README.md', 'tests', 'tests rule precedes docs; deliberate'],

    // Boilerplate
    ['pnpm-lock.yaml', 'boilerplate', 'lockfile basename'],
    ['server/pnpm-lock.yaml', 'boilerplate', 'lockfile basename at depth'],
    ['reviewer-core/package-lock.json', 'boilerplate', 'lockfile basename'],
    ['yarn.lock', 'boilerplate', '.lock suffix'],
    ['Cargo.lock', 'boilerplate', '.lock suffix'],
    ['dist/a.js', 'boilerplate', 'dist segment'],
    ['server/dist/app.js', 'boilerplate', 'dist segment at depth'],
    ['build/x.js', 'boilerplate', 'build segment'],
    ['src/__snapshots__/a.ts.snap', 'boilerplate', '__snapshots__ segment and .snap suffix'],
    ['src/api.generated.ts', 'boilerplate', '.generated. includes'],
    ['vendor/jquery.min.js', 'boilerplate', '.min.js suffix'],

    // Tests
    ['src/a.test.ts', 'tests', '.test.ts suffix'],
    ['src/a.test.tsx', 'tests', '.test.tsx suffix'],
    ['server/test/reviews.it.test.ts', 'tests', 'test segment'],
    ['src/a.spec.ts', 'tests', '.spec.ts suffix'],
    ['test/helpers.ts', 'tests', 'test segment'],
    ['client/tests/x.ts', 'tests', 'tests segment'],
    ['src/__tests__/a.ts', 'tests', '__tests__ segment'],
    ['e2e/specs/01-x.flow.json', 'tests', 'e2e segment'],

    // Wiring
    ['src/index.ts', 'wiring', 'index.ts basename'],
    ['lib/index.js', 'wiring', 'index.js basename'],
    ['vitest.config.ts', 'wiring', '.config. includes'],
    ['client/next.config.mjs', 'wiring', '.config. includes'],
    ['tsconfig.json', 'wiring', 'tsconfig/.json prefix+suffix'],
    ['server/tsconfig.build.json', 'wiring', 'tsconfig/.json prefix+suffix'],
    ['.eslintrc.cjs', 'wiring', '.eslintrc prefix'],
    ['.env.example', 'wiring', '.env prefix'],
    ['docker-compose.yml', 'wiring', 'docker-compose/.yml prefix+suffix'],
    ['docker-compose.dev.yml', 'wiring', 'docker-compose/.yml prefix+suffix'],
    ['.github/workflows/ci.yml', 'wiring', '.github segment'],

    // Docs
    ['README.md', 'docs', 'README prefix'],
    ['server/docs/architecture.md', 'docs', 'docs segment'],
    ['docs/guide.txt', 'docs', 'docs segment'],
    ['README', 'docs', 'README prefix, no extension'],
    ['CHANGELOG.md', 'docs', 'CHANGELOG prefix'],
    ['LICENSE', 'docs', 'LICENSE basename'],

    // Core
    ['src/config.ts', 'core', '*.config.* does not match'],
    ['src/middleware/ratelimit.ts', 'core', 'no rule matches'],
    ['src/testing.ts', 'core', 'exact segment only, not a substring'],
    ['src/tests-utils/a.ts', 'core', 'exact segment only, not a substring'],
    ['docs-site/app.ts', 'core', 'exact segment only, not a substring'],
    ['src/build-info.ts', 'core', 'exact segment only, not a substring'],
    ['notes.mdx', 'core', 'not .md suffix'],
    ['server/src/vendor/shared/contracts/brief.ts', 'core', 'D12: vendor/ is not a boilerplate rule'],

    // D11/D12 (plan-verifier gaps)
    ['package.json', 'wiring', 'D11: dependency/script change is a decision'],
    ['client/package.json', 'wiring', 'D11 at depth'],
    ['client/next-env.d.ts', 'boilerplate', 'D12'],
    ['src/types/global.d.ts', 'boilerplate', 'D12'],
    ['lib/index.d.ts', 'boilerplate', 'D12: boilerplate is evaluated before wiring'],
  ] as const)('%s -> %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('SMART_DIFF_ROLE_ORDER is the declared display order and covers every role', () => {
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect([...SMART_DIFF_ROLE_ORDER].sort()).toEqual([...SmartDiffRole.options].sort());
  });

  it('is pure: calling it twice with the same path gives the same result', () => {
    const path = 'src/a.test.ts';
    expect(classifyFile(path)).toBe(classifyFile(path));
  });
});

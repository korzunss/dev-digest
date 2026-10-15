import { describe, it, expect } from 'vitest';
import { generateWorkflow, shipWorkflow, validateWorkflow } from '../src/modules/ci/workflow.js';

const opts = { triggers: ['opened', 'synchronize'] as ('opened' | 'synchronize' | 'reopened')[], postAs: 'github_review' as const };
const gen = () => generateWorkflow(opts);
const check = (text: string, o = opts) => validateWorkflow(text, o);
const invariants = (text: string, o = opts) => check(text, o).errors.map((e) => e.invariant);
const SHA = 'a'.repeat(40);
const NODE = 'actions/setup-node@3d3c42e5aac5ba805825da76410c181273ba90b1';
// An extra step inserted before the runner step.
const beforeRunner = (step: string): string => gen().replace('      - name: Run DevDigest review', `${step}\n      - name: Run DevDigest review`);
const withStep = (step: string): string => gen().replace('      - name: Upload result', `${step}\n      - name: Upload result`);

describe('generateWorkflow', () => {
  it('validates its own output clean', () => {
    expect(validateWorkflow(gen(), opts)).toEqual({ errors: [], warnings: [] });
  });

  it('maps trigger chips to types and post-as to env', () => {
    const w = generateWorkflow({ triggers: ['reopened', 'opened'], postAs: 'none' });
    expect(w).toContain('types: [reopened, opened]');
    expect(w).toContain('DEVDIGEST_POST_AS: none');
    expect(validateWorkflow(w, { triggers: ['reopened', 'opened'], postAs: 'none' }).errors).toEqual([]);
  });

  it('keeps the AC-71 skip guard and no expression in run', () => {
    const w = gen();
    expect(w).toContain('::notice::DevDigest runner not on the base branch yet');
    expect(w).toContain('DEVDIGEST_CONFIG_DIR: base/.devdigest');
    expect(w).toContain('DEVDIGEST_WORKDIR: head');
  });
});

describe('validateWorkflow: YAML', () => {
  it('reports a YAML error with its line', () => {
    const r = check('name: x\non: [\n  pull_request');
    expect(r.errors[0]).toMatchObject({ invariant: 'yaml' });
    expect(r.errors[0]!.line).toBeGreaterThan(0);
  });

  it('refuses a non-mapping document', () => {
    expect(invariants('- a\n- b\n')).toContain('yaml');
  });
});

describe('validateWorkflow: the three editable fields (AC-17)', () => {
  it('accepts a renamed workflow', () => {
    expect(check(gen().replace('name: DevDigest review', 'name: My own review')).errors).toEqual([]);
  });

  it('accepts a changed timeout', () => {
    expect(check(gen().replace('timeout-minutes: 20', 'timeout-minutes: 45')).errors).toEqual([]);
    expect(check(gen().replace('timeout-minutes: 20', 'timeout-minutes: 360')).errors).toEqual([]);
    expect(check(gen().replace('timeout-minutes: 20', 'timeout-minutes: 1')).errors).toEqual([]);
  });

  it('accepts an absent timeout', () => {
    expect(check(gen().replace('    timeout-minutes: 20\n', '')).errors).toEqual([]);
  });

  it.each(['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'])('accepts runs-on %s', (ro) => {
    expect(check(gen().replace('runs-on: ubuntu-latest', `runs-on: ${ro}`)).errors).toEqual([]);
  });

  it('accepts all three edited at once', () => {
    const text = gen()
      .replace('name: DevDigest review', 'name: X')
      .replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-22.04')
      .replace('timeout-minutes: 20', 'timeout-minutes: 5');
    expect(check(text).errors).toEqual([]);
  });

  it.each(['macos-latest', 'self-hosted', '[ubuntu-latest, self-hosted]', "${{ github.head_ref }}"])(
    'refuses runs-on %s and lists the allowed values (AC-56)',
    (ro) => {
      const r = check(gen().replace('runs-on: ubuntu-latest', `runs-on: ${ro}`));
      const e = r.errors.find((x) => x.invariant === 'runs_on');
      expect(e?.message).toContain('ubuntu-latest, ubuntu-24.04, ubuntu-22.04');
      expect(e?.line).toBeGreaterThan(0);
    },
  );

  it.each(['0', '361', '1.5', '-3', '"20"', "${{ github.run_id }}", 'null'])(
    'refuses timeout-minutes %s and names the bounds (AC-56)',
    (tm) => {
      const r = check(gen().replace('timeout-minutes: 20', `timeout-minutes: ${tm}`));
      const e = r.errors.find((x) => x.invariant === 'timeout_minutes');
      expect(e?.message).toContain('1 to 360');
    },
  );

  it('refuses an empty or non-string name', () => {
    expect(invariants(gen().replace('name: DevDigest review', 'name: ""'))).toContain('name');
    expect(invariants(gen().replace('name: DevDigest review', 'name: [a]'))).toContain('name');
    expect(invariants(gen().replace('name: DevDigest review', "name: '${{ secrets.X }}'"))).toContain('name');
    expect(invariants(gen().replace('name: DevDigest review', `name: ${'x'.repeat(101)}`))).toContain('name');
  });
});

describe('validateWorkflow: everything else must equal the generated workflow (AC-19)', () => {
  it('names the first differing path', () => {
    const r = check(gen().replace('DEVDIGEST_POST_AS: github_review', 'DEVDIGEST_POST_AS: none'));
    const e = r.errors.find((x) => x.invariant === 'differs_from_generated');
    expect(e?.message).toContain('jobs.review.steps[3].env.DEVDIGEST_POST_AS');
    expect(e?.line).toBeGreaterThan(0);
  });

  it('refuses changed triggers (Configure owns them)', () => {
    expect(invariants(gen().replace('types: [opened, synchronize]', 'types: [opened]'))).toContain('differs_from_generated');
  });

  it.each([
    ['string form', 'on: pull_request_target'],
    ['array form', 'on: [pull_request_target]'],
    ['pull_request plus workflow_run', 'on: [pull_request, workflow_run]'],
  ])('a pull_request_target / extra trigger in %s is refused', (_n, onLine) => {
    const text = gen().replace(/on:\n {2}pull_request:\n {4}types: \[[^\]]*\]\n/, `${onLine}\n`);
    expect(text).not.toBe(gen());
    expect(invariants(text)).toContain('differs_from_generated');
  });

  it.each([
    ['write-all string', 'permissions: write-all'],
    ['an extra id-token scope', 'permissions:\n  contents: read\n  pull-requests: write\n  id-token: write'],
    ['no block', ''],
  ])('workflow permissions with %s are refused', (_n, perms) => {
    const text = gen().replace(/permissions:\n {2}contents: read\n {2}pull-requests: write\n/, perms ? `${perms}\n` : '');
    expect(text).not.toBe(gen());
    expect(invariants(text)).toContain('differs_from_generated');
  });

  it('a job-level permissions block is refused', () => {
    expect(invariants(gen().replace('    timeout-minutes: 20', '    permissions: write-all\n    timeout-minutes: 20'))).toContain('differs_from_generated');
  });

  it('a job-level reusable workflow call (with secrets: inherit) is refused', () => {
    const text = gen().replace('    timeout-minutes: 20', `    uses: evil/repo/.github/workflows/x.yml@${SHA}\n    secrets: inherit\n    timeout-minutes: 20`);
    expect(invariants(text)).toContain('differs_from_generated');
  });

  it.each([
    ['a branch ref', '@main'],
    ['a different sha', `@${'b'.repeat(40)}`],
  ])('a re-pinned checkout (%s) is refused', (_n, ref) => {
    expect(invariants(gen().replace(/actions\/checkout@[0-9a-f]{40}/, `actions/checkout${ref}`))).toContain('differs_from_generated');
  });

  it('a docker:// action in place of a pinned one is refused', () => {
    expect(invariants(gen().replace(/actions\/setup-node@[0-9a-f]{40}/, 'docker://alpine:3'))).toContain('differs_from_generated');
  });

  it('a renamed step is refused', () => {
    expect(invariants(gen().replace('Set up Node', 'Node please'))).toContain('differs_from_generated');
  });

  it('a changed runner step is refused', () => {
    expect(invariants(gen().replace('          DEVDIGEST_WORKDIR: head', '          DEVDIGEST_WORKDIR: head\n          X: 1'))).toContain('differs_from_generated');
    expect(invariants(gen().replace('node base/.devdigest/runner/index.js', 'node head/evil.js'))).toContain('differs_from_generated');
  });

  it('refuses persist-credentials: true, a head-only base checkout and a changed ref/path', () => {
    expect(invariants(gen().replace('          path: base\n          persist-credentials: false', '          path: base\n          persist-credentials: true'))).toContain('differs_from_generated');
    expect(invariants(gen().replace(/base\.sha/g, 'head.sha'))).toContain('differs_from_generated');
    expect(invariants(gen().replace('path: base', 'path: other'))).toContain('differs_from_generated');
  });

  it('accepts no unknown top-level key', () => {
    expect(invariants(gen() + 'concurrency: x\n')).toContain('differs_from_generated');
  });
});

// Trust boundary: each vector below must stay refused (SF1/SF2/SF3).
describe('validateWorkflow: bypass vectors', () => {
  it.each([
    ['workflow env NODE_OPTIONS', () => gen() + 'env:\n  NODE_OPTIONS: --import=data:text/javascript,fetch\n'],
    [
      'job env NODE_OPTIONS',
      () => gen().replace('    timeout-minutes: 20', '    timeout-minutes: 20\n    env:\n      NODE_OPTIONS: --import=data:text/javascript,fetch'),
    ],
    ['a run step before the runner', () => beforeRunner('      - run: echo x > base/.devdigest/runner/index.js')],
    [
      'an extra checkout into base',
      () => beforeRunner(`      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n          path: base\n          persist-credentials: false`),
    ],
    [
      'a foreign repository checkout',
      () => beforeRunner(`      - uses: actions/checkout@${SHA}\n        with:\n          repository: attacker/x\n          path: base\n          persist-credentials: false`),
    ],
    ['a job container', () => gen().replace('    timeout-minutes: 20', '    container: attacker/img\n    timeout-minutes: 20')],
    ['workflow defaults', () => gen() + 'defaults:\n  run:\n    shell: bash\n'],
    ['an extra job', () => gen() + '  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'],
  ])('%s is refused', (_n, make) => {
    expect(invariants(make())).toContain('differs_from_generated');
  });

  it.each([
    ['an env var', '      - run: echo hi\n        env:\n          K: ${{ secrets.AWS_KEY }}'],
    ['a with value', `      - uses: ${NODE}\n        with:\n          x: \${{ secrets.AWS_KEY }}`],
    ['toJSON(secrets)', '      - run: echo hi\n        env:\n          K: ${{ toJSON(secrets) }}'],
    ['upper-case bracket access', "      - run: echo hi\n        env:\n          K: ${{ SECRETS['X'] }}"],
    ['the runner secret on another step', '      - run: echo hi\n        env:\n          K: ${{ secrets.OPENROUTER_API_KEY }}'],
    ['PR title in env', '      - run: echo hi\n        env:\n          T: ${{ github.event.pull_request.title }}'],
    ['PR head_ref in shell', '      - run: echo hi\n        shell: bash ${{ github.head_ref }} {0}'],
    ['GITHUB_ENV write', '      - run: echo "PATH=x" >> "$GITHUB_ENV"'],
    ['a local action', '      - uses: ./head/.github/actions/evil'],
    ['an unlisted pinned action', `      - uses: evil/action@${SHA}`],
  ])('an extra step with %s is refused', (_n, step) => {
    expect(invariants(withStep(step))).toContain('differs_from_generated');
    expect(invariants(beforeRunner(step))).toContain('differs_from_generated');
  });

  it('PR-controlled data in the generated run step is refused', () => {
    const w = gen().replace('node base/.devdigest/runner/index.js', 'echo ${{ github.event.pull_request.title }}');
    expect(invariants(w)).toContain('differs_from_generated');
    expect(invariants(gen().replace('ref: ${{ github.event.pull_request.head.sha }}', 'ref: ${{ github.head_ref }}'))).toContain('differs_from_generated');
  });

  it('a workflow-level secret reference is refused', () => {
    expect(invariants(gen() + 'env:\n  K: ${{ secrets.X }}\n')).toContain('differs_from_generated');
  });

  it('a duplicated key cannot smuggle a second value in', () => {
    const text = gen().replace('    timeout-minutes: 20', '    timeout-minutes: 20\n    timeout-minutes: 21');
    expect(check(text).errors.length).toBeGreaterThan(0);
  });
});

describe('validateWorkflow: parse-level hardening (H1)', () => {
  it('refuses an alias used as a mapping key', () => {
    const text = gen().replace('permissions:', 'x: &a evil\n*a : y\npermissions:');
    expect(check(text).errors.length).toBeGreaterThan(0);
  });
  it('refuses any alias value', () => {
    const text = gen().replace('permissions:', 'x: &a evil\ny: *a\npermissions:');
    expect(invariants(text)).toContain('yaml');
  });
  it('refuses a quoted key', () => {
    const text = gen().replace('    timeout-minutes: 20', '    "timeout-minutes": 20');
    expect(invariants(text)).toContain('yaml');
  });
});

describe('shipWorkflow (H1)', () => {
  it('an unedited submission ships as the generated text (name JSON-quoted)', () => {
    expect(shipWorkflow(gen(), opts)).toBe(gen().replace('name: DevDigest review', 'name: "DevDigest review"'));
  });
  it('equals generateWorkflow plus the three fields, and re-validates clean', () => {
    const edited = gen()
      .replace('name: DevDigest review', '# note\nname:   "My: review #1"   # trailing')
      .replace('ubuntu-latest', 'ubuntu-24.04')
      .replace('timeout-minutes: 20', 'timeout-minutes:   45');
    expect(check(edited).errors).toEqual([]);
    const shipped = shipWorkflow(edited, opts);
    expect(shipped).toBe(
      gen()
        .replace('name: DevDigest review', 'name: "My: review #1"')
        .replace('ubuntu-latest', 'ubuntu-24.04')
        .replace('timeout-minutes: 20', 'timeout-minutes: 45'),
    );
    expect(check(shipped).errors).toEqual([]);
  });
  it('restores the generated timeout-minutes when the submission removed it', () => {
    const shipped = shipWorkflow(gen().replace('    timeout-minutes: 20\n', ''), opts);
    expect(shipped).toContain('    timeout-minutes: 20\n');
    expect(check(shipped).errors).toEqual([]);
  });
});

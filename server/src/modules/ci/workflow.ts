import { LineCounter, isAlias, isPair, isScalar, parseDocument, visit, Scalar } from 'yaml';
import type { CiPostAs, CiTrigger, CiWorkflowCheck } from '@devdigest/shared';
import { ACTION_PINS, ARTIFACT_FILE, ARTIFACT_NAME } from './constants.js';

/**
 * Workflow generator + validator (pure). The generated workflow keeps the
 * AC-16 security invariants. `validateWorkflow` is the server-side enforcement
 * point (AC-17/AC-19/AC-56): a submitted workflow must equal the generated one
 * except for three fields, so no edit can change what runs with the secrets.
 */

export interface WorkflowOptions {
  triggers: CiTrigger[];
  postAs: CiPostAs;
}

type Issue = CiWorkflowCheck['errors'][number];

// `${{ … }}` is written with plain quotes on purpose: a template literal would
// try to interpolate it.
const BASE_SHA = '${{ github.event.pull_request.base.sha }}';
const HEAD_SHA = '${{ github.event.pull_request.head.sha }}';

const RUN_STEP = [
  'if [ ! -f base/.devdigest/runner/index.js ]; then',
  '  echo "::notice::DevDigest runner not on the base branch yet; skipping"',
  '  exit 0',
  'fi',
  'node base/.devdigest/runner/index.js',
];

export function generateWorkflow(opts: WorkflowOptions): string {
  const { checkout, setupNode, uploadArtifact } = ACTION_PINS;
  const lines = [
    'name: DevDigest review',
    'on:',
    '  pull_request:',
    `    types: [${opts.triggers.join(', ')}]`,
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 20',
    '    steps:',
    '      - name: Checkout base (runner, manifest, skills, memory)',
    `        uses: actions/checkout@${checkout.sha} # ${checkout.tag}`,
    '        with:',
    `          ref: ${BASE_SHA}`,
    '          path: base',
    '          persist-credentials: false',
    '      - name: Checkout head (diff only)',
    `        uses: actions/checkout@${checkout.sha} # ${checkout.tag}`,
    '        with:',
    `          ref: ${HEAD_SHA}`,
    '          path: head',
    '          fetch-depth: 0',
    '          persist-credentials: false',
    '      - name: Set up Node',
    `        uses: actions/setup-node@${setupNode.sha} # ${setupNode.tag}`,
    '        with:',
    "          node-version: '22'",
    '      - name: Run DevDigest review',
    '        env:',
    '          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}',
    '          GITHUB_TOKEN: ${{ github.token }}',
    `          DEVDIGEST_POST_AS: ${opts.postAs}`,
    '          DEVDIGEST_CONFIG_DIR: base/.devdigest',
    '          DEVDIGEST_WORKDIR: head',
    '        run: |',
    ...RUN_STEP.map((l) => `          ${l}`),
    '      - name: Upload result',
    '        if: always()',
    `        uses: actions/upload-artifact@${uploadArtifact.sha} # ${uploadArtifact.tag}`,
    '        with:',
    `          name: ${ARTIFACT_NAME}`,
    `          path: ${ARTIFACT_FILE}`,
    '          if-no-files-found: ignore',
    '          retention-days: 30',
    '',
  ];
  return lines.join('\n');
}

export const ALLOWED_RUNS_ON = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'] as const;
export const TIMEOUT_MIN = 1;
export const TIMEOUT_MAX = 360;

type Path = (string | number)[];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

const pathLabel = (path: Path): string =>
  path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '');

/** Path of the first difference between two parsed documents, or null when deep-equal. */
function firstDifference(expected: unknown, actual: unknown, path: Path = []): Path | null {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      if (i >= expected.length || i >= actual.length) return [...path, i];
      const d = firstDifference(expected[i], actual[i], [...path, i]);
      if (d) return d;
    }
    return null;
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = [...Object.keys(expected), ...Object.keys(actual).filter((k) => !Object.hasOwn(expected, k))];
    for (const k of keys) {
      if (!Object.hasOwn(expected, k) || !Object.hasOwn(actual, k)) return [...path, k];
      const d = firstDifference(expected[k], actual[k], [...path, k]);
      if (d) return d;
    }
    return null;
  }
  return Object.is(expected, actual) ? null : path;
}

export function validateWorkflow(text: string, opts: WorkflowOptions): CiWorkflowCheck {
  const errors: Issue[] = [];
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });

  const nodeLine = (node: unknown): number | undefined => {
    const offset = (node as { range?: [number, number, number] | null } | null)?.range?.[0];
    return offset === undefined ? undefined : lc.linePos(offset).line;
  };

  if (doc.errors.length > 0) {
    for (const e of doc.errors) {
      errors.push({
        invariant: 'yaml',
        message: e.message.split('\n')[0] ?? 'Invalid YAML',
        line: e.linePos?.[0]?.line,
      });
    }
    return { errors, warnings: [] };
  }

  // Parse-level hardening: no aliases anywhere and only plain string scalar
  // keys, so two parsers cannot disagree about which key wins.
  visit(doc, {
    Alias(_k, node) {
      errors.push({ invariant: 'yaml', message: 'YAML aliases are not allowed in the workflow', line: nodeLine(node) });
      return visit.SKIP;
    },
    Pair(_k, pair) {
      const key = pair.key;
      if (isAlias(key)) return; // reported by the Alias visitor
      if (!isScalar(key) || typeof key.value !== 'string' || key.type !== Scalar.PLAIN) {
        errors.push({ invariant: 'yaml', message: 'Workflow keys must be plain text', line: nodeLine(key) });
      }
    },
  });
  if (errors.length > 0) return { errors, warnings: [] };

  // Line of the deepest node that exists on the way to `path`.
  const lineAt = (path: Path): number | undefined => {
    for (let n = path.length; n >= 0; n--) {
      const node = doc.getIn(path.slice(0, n), true) as { range?: [number, number, number] | null } | undefined;
      const offset = node?.range?.[0];
      if (offset !== undefined) return lc.linePos(offset).line;
    }
    return undefined;
  };
  const err = (invariant: string, message: string, path: Path) =>
    errors.push({ invariant, message, line: lineAt(path) });

  const js = doc.toJS() as unknown;
  if (!isPlainObject(js)) {
    err('yaml', 'The workflow must be a YAML mapping', []);
    return { errors, warnings: [] };
  }

  const expected = parseDocument(generateWorkflow(opts)).toJS() as Record<string, unknown>;
  const submitted: Record<string, unknown> = { ...js };

  // The three editable fields are checked on their own and then normalised, so
  // everything else is compared byte-for-value against the generated workflow.
  if (Object.hasOwn(js, 'name')) {
    // A plain label only: no `${{ }}` and a sane length (defence in depth —
    // GitHub does not evaluate expressions in the workflow `name`).
    const name = js['name'];
    if (typeof name !== 'string' || name.trim() === '' || name.length > 100 || name.includes('${{')) {
      err('name', 'The workflow "name" must be plain text of 1–100 characters, without ${{ }} expressions', ['name']);
    }
    submitted['name'] = expected['name'];
  }
  const jobs = js['jobs'];
  const expectedReview = (expected['jobs'] as Record<string, Record<string, unknown>>)['review']!;
  const review = isPlainObject(jobs) && isPlainObject(jobs['review']) ? jobs['review'] : null;
  if (review && isPlainObject(jobs)) {
    const normalised: Record<string, unknown> = { ...review };
    if (Object.hasOwn(review, 'runs-on')) {
      const ro = review['runs-on'];
      if (typeof ro !== 'string' || !(ALLOWED_RUNS_ON as readonly string[]).includes(ro)) {
        err(
          'runs_on',
          `"runs-on" must be one of: ${ALLOWED_RUNS_ON.join(', ')}`,
          ['jobs', 'review', 'runs-on'],
        );
      }
      normalised['runs-on'] = expectedReview['runs-on'];
    }
    if (Object.hasOwn(review, 'timeout-minutes')) {
      const tm = review['timeout-minutes'];
      if (typeof tm !== 'number' || !Number.isInteger(tm) || tm < TIMEOUT_MIN || tm > TIMEOUT_MAX) {
        err(
          'timeout_minutes',
          `"timeout-minutes" must be an integer from ${TIMEOUT_MIN} to ${TIMEOUT_MAX}`,
          ['jobs', 'review', 'timeout-minutes'],
        );
      }
      normalised['timeout-minutes'] = expectedReview['timeout-minutes'];
    } else {
      // Absent is allowed: shipWorkflow restores the generated value (20).
      delete expectedReview['timeout-minutes'];
    }
    submitted['jobs'] = { ...jobs, review: normalised };
  }

  const diff = firstDifference(expected, submitted);
  if (diff) {
    const label = pathLabel(diff);
    err(
      'differs_from_generated',
      `"${label}" differs from the generated workflow. Only the workflow name, the review job's timeout-minutes and runs-on can be edited here; triggers and "Post results as" are set in Configure.`,
      diff,
    );
  }
  return { errors, warnings: [] };
}

/**
 * The text that is actually committed or zipped (AC-17/AC-19). Never the
 * submitted text: it is regenerated with `generateWorkflow` and only the three
 * validated fields are patched in, so comments, whitespace or parser quirks in
 * the submission cannot reach the repository. Call after `validateWorkflow`
 * returned no errors. An absent `timeout-minutes`, `name` or `runs-on` keeps the
 * generated value (so a removed timeout ships as 20, never GitHub's 360).
 */
export function shipWorkflow(submitted: string, opts: WorkflowOptions): string {
  const js = parseDocument(submitted).toJS() as unknown;
  const generated = generateWorkflow(opts);
  if (!isPlainObject(js)) return generated;
  const jobs = js['jobs'];
  const review = isPlainObject(jobs) && isPlainObject(jobs['review']) ? jobs['review'] : {};
  return generated
    .split('\n')
    .flatMap((line) => {
      if (line.startsWith('name: ') && typeof js['name'] === 'string') {
        // A JSON string is a valid YAML double-quoted scalar; U+2028/9 are escaped too.
        return [`name: ${JSON.stringify(js['name']).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}`];
      }
      if (line === '    runs-on: ubuntu-latest' && typeof review['runs-on'] === 'string') {
        return [`    runs-on: ${review['runs-on']}`];
      }
      if (line === '    timeout-minutes: 20') {
        const tm = review['timeout-minutes'];
        // A removed timeout falls back to the generated 20, never GitHub's 360-minute default.
        return typeof tm === 'number' ? [`    timeout-minutes: ${tm}`] : [line];
      }
      return [line];
    })
    .join('\n');
}

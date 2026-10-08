// Behavioural grader for the zod skill evals (evals.json).
// Usage: tsx check.mts <eval-id> <path-to-generated-file>
// Imports the generated module, runs fixed inputs through it, prints JSON
// [{ text, passed, evidence }] on stdout. Never throws: a crash is a failed check.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

type Check = { text: string; passed: boolean; evidence: string };
const out: Check[] = [];
const check = (text: string, fn: () => [boolean, string]) => {
  try {
    const [passed, evidence] = fn();
    out.push({ text, passed, evidence });
  } catch (e) {
    out.push({ text, passed: false, evidence: `threw: ${(e as Error).message}`.slice(0, 300) });
  }
};
const j = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Date ? `Date(${x.toISOString()})` : x));

const [evalId, file] = process.argv.slice(2);
const src = readFileSync(file, 'utf8');
let m: any;
try {
  m = await import(pathToFileURL(file).href);
} catch (e) {
  m = {};
  out.push({ text: 'Module loads', passed: false, evidence: `import failed: ${(e as Error).message}`.slice(0, 300) });
}

if (evalId === '1') {
  const Q = m.ListReviewsQuery;
  const B = m.UpdateAgentBody;
  check('Query: includeArchived="false" parses to boolean false (no z.coerce.boolean trap)', () => {
    const r = Q.safeParse({ includeArchived: 'false' });
    return [r.success && r.data.includeArchived === false, j(r.success ? r.data : r.error.issues)];
  });
  check('Query: includeArchived="true" → true, absent → false', () => {
    const a = Q.safeParse({ includeArchived: 'true' });
    const b = Q.safeParse({});
    return [a.success && a.data.includeArchived === true && b.success && b.data.includeArchived === false, j([a.data, b.data])];
  });
  check('Query: page/limit coerced from strings, defaults 1/20 applied', () => {
    const a = Q.safeParse({ page: '2', limit: '50' });
    const b = Q.safeParse({});
    const ok = a.success && a.data.page === 2 && a.data.limit === 50 && b.success && b.data.page === 1 && b.data.limit === 20;
    return [ok, j([a.data, b.data])];
  });
  check('Query: limit=500 and page=0 rejected', () => {
    const a = Q.safeParse({ limit: '500' });
    const b = Q.safeParse({ page: '0' });
    return [!a.success && !b.success, j([a.success, b.success])];
  });
  check('Query: status "open,closed" → ["open","closed"]; "open,foo" rejected', () => {
    const a = Q.safeParse({ status: 'open,closed' });
    const b = Q.safeParse({ status: 'open,foo' });
    const ok = a.success && j(a.data.status) === j(['open', 'closed']) && !b.success;
    return [ok, j([a.success ? a.data.status : a.error.issues, b.success])];
  });
  check('Query: since "2026-01-01" → Date; "not-a-date" rejected', () => {
    const a = Q.safeParse({ since: '2026-01-01' });
    const b = Q.safeParse({ since: 'not-a-date' });
    return [a.success && a.data.since instanceof Date && !b.success, j([a.success ? a.data.since : a.error.issues, b.success])];
  });
  check('PATCH: empty body {} rejected', () => {
    const r = B.safeParse({});
    return [!r.success, j(r.success)];
  });
  check('PATCH: unknown key rejected ({ enabled: true, foo: 1 })', () => {
    const r = B.safeParse({ enabled: true, foo: 1 });
    return [!r.success, j(r.success ? r.data : 'rejected')];
  });
  check('PATCH: single valid field accepted; name is trimmed', () => {
    const a = B.safeParse({ enabled: false });
    const b = B.safeParse({ name: '  Bot  ' });
    return [a.success && b.success && b.data.name === 'Bot', j([a.success, b.success ? b.data : b.error.issues])];
  });
  check('PATCH: temperature 3, 11 tags, whitespace-only name all rejected', () => {
    const r = [{ temperature: 3 }, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, { name: '   ' }].map((x) => B.safeParse(x).success);
    return [r.every((s) => !s), j(r)];
  });
  check('formatZodError reports every failing field (temperature AND tags)', () => {
    const r = B.safeParse({ temperature: 9, tags: [''] });
    if (r.success) return [false, 'body unexpectedly valid'];
    const f = m.formatZodError(r.error);
    const keys = Object.keys(f.fieldErrors ?? {});
    return [keys.includes('temperature') && keys.some((k) => k.startsWith('tags')), j(f)];
  });
  check('Both schema types are exported and derived with z.infer/z.output (not hand-written)', () => {
    const derived = (name: string) =>
      new RegExp(`export\\s+type\\s+\\w+\\s*=\\s*z\\.(infer|output)<\\s*typeof\\s+${name}\\s*>`).test(src);
    const q = derived('ListReviewsQuery');
    const b = derived('UpdateAgentBody');
    return [q && b, `ListReviewsQuery=${q} UpdateAgentBody=${b}`];
  });
}

if (evalId === '2') {
  const p = (s: string) => m.parseFindings(s);
  const line = { kind: 'line', severity: 'warning', title: 'Null deref', file: 'a.ts', line: 3, endLine: 5 };
  const fileF = { kind: 'file', severity: 'SUGGESTION', title: 'Split file', file: 'b.ts' };
  const gen = { kind: 'general', severity: 'Critical', title: 'No tests' };
  check('Plain JSON array of 3 valid findings → 3 findings, dropped 0', () => {
    const r = p(JSON.stringify([line, fileF, gen]));
    return [r.findings.length === 3 && r.dropped === 0, j(r)];
  });
  check('```json fenced output is unwrapped and parsed', () => {
    const r = p('Here you go:\n```json\n' + JSON.stringify([gen]) + '\n```\n');
    return [r.findings.length === 1, j(r)];
  });
  check('Severity normalised case-insensitively (warning/Critical → WARNING/CRITICAL)', () => {
    const r = p(JSON.stringify([line, gen]));
    return [r.findings[0]?.severity === 'WARNING' && r.findings[1]?.severity === 'CRITICAL', j(r.findings.map((f: any) => f.severity))];
  });
  check('Unknown severity "major" is dropped', () => {
    const r = p(JSON.stringify([{ ...gen, severity: 'major' }, fileF]));
    return [r.findings.length === 1 && r.dropped === 1, j(r)];
  });
  check('endLine < line is dropped; endLine absent is kept', () => {
    const r = p(JSON.stringify([{ ...line, line: 9, endLine: 2 }, { ...line, endLine: undefined }]));
    return [r.findings.length === 1 && r.dropped === 1, j(r)];
  });
  check('kind:"line" without line, line 0, or line 1.5 → dropped', () => {
    const { line: _l, ...noLine } = line;
    const r = p(JSON.stringify([noLine, { ...line, line: 0, endLine: undefined }, { ...line, line: 1.5, endLine: undefined }]));
    return [r.findings.length === 0 && r.dropped === 3, j(r)];
  });
  check('Mixed batch keeps valid ones: [valid, invalid, valid] → 2 kept, dropped 1', () => {
    const r = p(JSON.stringify([line, { kind: 'file', severity: 'WARNING', title: '' }, gen]));
    return [r.findings.length === 2 && r.dropped === 1, j(r)];
  });
  check('Garbage / non-array / null / empty string never throw and yield { findings: [], dropped: 0 }', () => {
    const inputs = ['not json at all', '{"kind":"general"}', 'null', '', '```json\n{oops\n```'];
    const rs = inputs.map((s) => p(s));
    return [rs.every((r) => r.findings.length === 0 && r.dropped === 0), j(rs)];
  });
  check('Narrowing works: a parsed "line" finding exposes line, a "general" one has no file', () => {
    const r = p(JSON.stringify([line, gen]));
    return [r.findings[0]?.line === 3 && !('file' in (r.findings[1] ?? {})), j(r.findings)];
  });
  check('Uses z.discriminatedUnion on "kind"', () => {
    const ok = /discriminatedUnion\(\s*['"]kind['"]/.test(src);
    return [ok, ok ? 'found' : 'not found'];
  });
  check('Finding type derived with z.infer/z.output (no hand-written interface)', () => {
    const derived = /z\.(infer|output)<\s*typeof\s+Finding/.test(src);
    return [derived, derived ? 'found' : 'not found'];
  });
}

console.log(JSON.stringify(out));

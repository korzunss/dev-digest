// flags.mjs - no-LLM threshold flags F1-F5 for one plan, plus `repeat:` lines for
// flags that another plan raised too. Reads .sdd/usage.jsonl (numbers only) and the
// "## Verification log" sections of docs/plans/[0-9]*.md. Called by `sdd.sh flags`.
// Exit 0 on every data problem, 2 on bad arguments.
import fs from 'node:fs';
import path from 'node:path';

const USAGE = 'usage: flags.mjs --root <dir> --plan <plan.md>';
const args = process.argv.slice(2);
let root = null;
let planArg = null;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--root' && args[i + 1]) root = args[i + 1];
  else if (args[i] === '--plan' && args[i + 1]) planArg = args[i + 1];
  else {
    console.error(USAGE);
    process.exit(2);
  }
}
if (!root || !planArg) {
  console.error(USAGE);
  process.exit(2);
}
const planNum = /^(\d+)-/.exec(path.basename(planArg));
if (!planNum) {
  console.error('flags: plan file name must start with NN-');
  process.exit(2);
}
const thisPlan = planNum[1];

// F1 metric: input-equivalent "weighted tokens" (close to cost ratios; a raw sum
// would mostly track cache reads). One constant, printed in every F1 line.
const W = { input: 1, cache_creation: 1.25, cache_read: 0.1, output: 5 };
const METRIC = 'weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output';
const F1_FACTOR = 2;
const F1_MIN_OTHER_PLANS = 3;

const weighted = (r) =>
  W.input * (+r.input || 0) +
  W.cache_creation * (+r.cache_creation || 0) +
  W.cache_read * (+r.cache_read || 0) +
  W.output * (+r.output || 0);

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---- usage rows ------------------------------------------------------------
let rows = null;
try {
  rows = fs
    .readFileSync(path.join(root, '.sdd', 'usage.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter((r) => r && typeof r === 'object' && typeof r.plan === 'string' && typeof r.stage === 'string');
} catch {
  rows = null;
}
if (rows === null) console.log('flags: no usage data');

// ---- verification logs -----------------------------------------------------
const plansDir = path.join(root, 'docs', 'plans');
const logs = new Map(); // NN -> [text after the date]
let names = [];
try { names = fs.readdirSync(plansDir).sort(); } catch { names = []; }
for (const f of names) {
  const m = /^(\d+)-.*\.md$/.exec(f);
  if (!m) continue;
  let text;
  try { text = fs.readFileSync(path.join(plansDir, f), 'utf8'); } catch { continue; }
  const lines = [];
  let inLog = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { inLog = line.trim() === '## Verification log'; continue; }
    if (!inLog) continue;
    const lm = /^- \S+ (.*)$/.exec(line);
    if (lm) lines.push(lm[1]);
  }
  logs.set(m[1], lines);
}
if (!logs.has(thisPlan)) {
  try { fs.readFileSync(path.resolve(root, planArg), 'utf8'); } catch {
    console.error('flags: no such plan: ' + planArg);
    process.exit(2);
  }
  logs.set(thisPlan, []);
}

// ---- stage totals per plan (F1) --------------------------------------------
const totals = new Map(); // stage -> Map(plan -> weighted tokens)
for (const r of rows || []) {
  if (!totals.has(r.stage)) totals.set(r.stage, new Map());
  const byPlan = totals.get(r.stage);
  byPlan.set(r.plan, (byPlan.get(r.plan) || 0) + weighted(r));
}

// flags of one plan -> [{id, detail}]
function flagsOf(plan) {
  const out = [];
  const lines = logs.get(plan) || [];
  for (const [stage, byPlan] of [...totals.entries()].sort()) {
    if (!byPlan.has(plan)) continue;
    const others = [...byPlan.entries()].filter(([p]) => p !== plan).map(([, v]) => v);
    if (others.length < F1_MIN_OTHER_PLANS) continue;
    const med = median(others);
    const mine = byPlan.get(plan);
    if (med > 0 && mine > F1_FACTOR * med) {
      out.push({ id: 'F1', detail: `stage=${stage} ${METRIC} ${Math.round(mine)} median=${Math.round(med)} over ${others.length} plans` });
    }
  }
  if (lines.some((t) => t.startsWith('review iteration 3'))) {
    out.push({ id: 'F2', detail: 'review iteration 3 logged' });
  }
  const unknown = lines.filter((t) => t.startsWith('handback: unknown')).length;
  if (unknown) out.push({ id: 'F3', detail: `handback unknown x${unknown}` });
  const resumes = lines.filter((t) => t.startsWith('resume:')).length;
  if (resumes) {
    const ids = new Map(); // stage|type -> Set(agent ids)
    const tok = new Map(); // stage|type -> weighted tokens
    for (const r of rows || []) {
      if (r.plan !== plan) continue;
      const k = r.stage + '|' + r.agent_type;
      if (!ids.has(k)) ids.set(k, new Set());
      ids.get(k).add(r.agent_id);
      tok.set(k, (tok.get(k) || 0) + weighted(r));
    }
    let multi = 0;
    for (const [k, s] of ids) if (s.size > 1) multi += tok.get(k);
    out.push({ id: 'F4', detail: `resume x${resumes} multi_agent_stage_weighted_tokens=${Math.round(multi)}` });
  }
  const fails = lines.filter((t) => t.startsWith('plan-lint: fail') || t.startsWith('status-check: fail')).length;
  if (fails) out.push({ id: 'F5', detail: `guard failures x${fails}` });
  return out;
}

const mine = flagsOf(thisPlan);
const otherFlags = new Map(); // plan -> Set(flag ids)
for (const p of logs.keys()) {
  if (p !== thisPlan) otherFlags.set(p, new Set(flagsOf(p).map((f) => f.id)));
}
let repeats = 0;
for (const f of mine) console.log(`flag: ${f.id} plan=${thisPlan} ${f.detail}`);
for (const id of [...new Set(mine.map((f) => f.id))]) {
  const plans = [thisPlan, ...[...otherFlags].filter(([, s]) => s.has(id)).map(([p]) => p)].sort();
  if (plans.length > 1) {
    repeats++;
    console.log(`repeat: ${id} plans=${plans.join(',')}`);
  }
}
console.log(`flags: ${mine.length} flag(s), ${repeats} repeat(s)`);

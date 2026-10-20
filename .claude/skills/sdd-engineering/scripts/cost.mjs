// cost.mjs - per-stage cost table for one plan, no model. Reads .sdd/usage.jsonl
// (numbers and ids/timestamps only). Called by `sdd.sh cost`.
// Exit 0 on every data problem, 2 on bad arguments.
import fs from 'node:fs';
import path from 'node:path';
import { METRIC, num, weighted } from './usage-weights.mjs';

const USAGE = 'usage: cost.mjs --root <dir> --plan <plan.md>';
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
try {
  if (!fs.statSync(root).isDirectory()) throw new Error('not a directory');
} catch {
  console.error('cost: --root must be an existing directory');
  process.exit(2);
}
if (
  path.isAbsolute(planArg) ||
  planArg.split(/[\\/]/).includes('..') ||
  !/^docs\/plans\/\d+-[^/]+\.md$/.test(planArg)
) {
  console.error('cost: plan must be docs/plans/NN-*.md');
  process.exit(2);
}
const planNum = /^(\d+)-/.exec(path.basename(planArg));
if (!planNum) {
  console.error('cost: plan file name must start with NN-');
  process.exit(2);
}
const thisPlan = planNum[1];

let all = null;
try {
  all = fs
    .readFileSync(path.join(root, '.sdd', 'usage.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter((r) => r && typeof r === 'object');
} catch {
  all = null;
}
if (all === null) {
  console.log('cost: no usage data');
  process.exit(0);
}

const planRows = all.filter((r) => r.plan === thisPlan && typeof r.stage === 'string');
if (!planRows.length) {
  console.log(`cost: no rows for plan ${thisPlan}`);
  process.exit(0);
}

const dur = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

// a timed row has both timestamps parseable and last >= first
const timeOf = (r) => {
  const a = Date.parse(r.first_ts);
  const b = Date.parse(r.last_ts);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? [a, b] : null;
};

// length of the union of [a, b] intervals
const unionMs = (ivs) => {
  const s = [...ivs].sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curA = null;
  let curB = null;
  for (const [a, b] of s) {
    if (curA === null) { curA = a; curB = b; continue; }
    if (a <= curB) { if (b > curB) curB = b; continue; }
    total += curB - curA;
    curA = a;
    curB = b;
  }
  if (curA !== null) total += curB - curA;
  return total;
};

const stages = new Map();
for (const r of planRows) {
  if (!stages.has(r.stage)) stages.set(r.stage, []);
  stages.get(r.stage).push(r);
}
const total = planRows.reduce((s, r) => s + weighted(r), 0);

const stat = [...stages.entries()].map(([stage, rs]) => {
  const w = rs.reduce((s, r) => s + weighted(r), 0);
  const cr = rs.reduce((s, r) => s + num(r.cache_read), 0);
  const den = rs.reduce((s, r) => s + num(r.input) + num(r.cache_read) + num(r.cache_creation), 0);
  const ivs = rs.map(timeOf).filter(Boolean);
  return {
    stage,
    runs: rs.length,
    agents: new Set(rs.map((r) => r.agent_id)).size,
    w,
    cache: den > 0 ? (100 * cr / den).toFixed(1) + '%' : 'n/a',
    busyMs: ivs.length ? unionMs(ivs) : null,
  };
});
stat.sort((a, b) => b.w - a.w || (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : 0));

console.log(`cost: plan=${thisPlan} ${METRIC}`);
console.log('| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const s of stat) {
  const share = total > 0 ? (100 * s.w / total).toFixed(1) + '%' : 'n/a';
  console.log(`| ${s.stage} | ${s.runs} | ${s.agents} | ${Math.round(s.w)} | ${share} | ${s.cache} | ${s.busyMs === null ? 'n/a' : dur(s.busyMs)} |`);
}
console.log(`cost: total ${Math.round(total)} weighted tokens, ${planRows.length} runs, ${new Set(planRows.map((r) => r.agent_id)).size} agents`);

const timed = planRows.map(timeOf).filter(Boolean);
let winStart = null;
let winEnd = null;
if (timed.length) {
  winStart = Math.min(...timed.map((t) => t[0]));
  winEnd = Math.max(...timed.map((t) => t[1]));
  const busy = unionMs(timed);
  const sumSpans = timed.reduce((s, t) => s + (t[1] - t[0]), 0);
  console.log(`cost: window ${dur(winEnd - winStart)}`);
  console.log(`cost: busy ${dur(busy)}, parallelism ${busy > 0 ? (sumSpans / busy).toFixed(2) : 'n/a'}`);
  const timedStages = stat.filter((s) => s.busyMs !== null).sort((a, b) => b.busyMs - a.busyMs || (a.stage < b.stage ? -1 : 1));
  console.log(`cost: critical path ${timedStages[0].stage} ${dur(timedStages[0].busyMs)}`);
} else {
  console.log('cost: window n/a');
  console.log('cost: busy n/a, parallelism n/a');
  console.log('cost: critical path n/a');
}

// rows without plan/stage from the plan's own sessions
const sessions = new Set(planRows.map((r) => r.session_id).filter((s) => typeof s === 'string'));
let nullRows = all.filter((r) => r.plan === null && typeof r.session_id === 'string' && sessions.has(r.session_id));
let untimed = 0;
const counted = [];
for (const r of nullRows) {
  const t = timeOf(r);
  if (!t) { untimed++; continue; }
  if (winStart === null || (t[0] <= winEnd && t[1] >= winStart)) counted.push(r);
}
const uw = counted.reduce((s, r) => s + weighted(r), 0);
console.log(`cost: unattributed ${counted.length} runs, ${new Set(counted.map((r) => r.agent_id)).size} agents, ${Math.round(uw)} weighted tokens (sessions ${sessions.size}, untimed ${untimed} not counted)`);
console.log('cost: main-session tokens not included');

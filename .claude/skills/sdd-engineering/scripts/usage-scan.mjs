// usage-scan.mjs - sums subagent token usage per (session, agent, plan, stage)
// into .sdd/usage.jsonl. Reads only message.id, message.model, message.usage.*
// and timestamp from the transcripts; never prints or stores message content.
// Called by `sdd.sh usage-scan`. Exit 0 on every data problem, 2 on bad arguments.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
let root = null;
let onlySession = null;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--root' && args[i + 1]) root = args[i + 1];
  else if (args[i] === '--session' && args[i + 1]) onlySession = args[i + 1];
  else {
    console.error('usage: usage-scan.mjs --root <dir> [--session <id>]');
    process.exit(2);
  }
}
if (!root) {
  console.error('usage: usage-scan.mjs --root <dir> [--session <id>]');
  process.exit(2);
}
const ID_RE = /^[A-Za-z0-9]+$/;
const SESSION_RE = /^[A-Za-z0-9_-]+$/;
if (onlySession !== null && !SESSION_RE.test(onlySession)) {
  console.error('usage-scan: bad --session');
  process.exit(2);
}

function transcriptsDir() {
  if (process.env.SDD_TRANSCRIPTS_DIR) return process.env.SDD_TRANSCRIPTS_DIR;
  const cfg = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(cfg, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
}

function isRealDir(p) {
  try { return fs.lstatSync(p).isDirectory(); } catch { return false; }
}
function isRealFile(p) {
  try { return fs.lstatSync(p).isFile(); } catch { return false; }
}
function listDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

// ---- agent lines: id -> [{plan, stage, type, time}] ----------------------
const AGENT_RE = /^- \S+ agent: (\S+) ([A-Za-z0-9]+) ([a-z][a-z-]*) (\S+)\s*$/;
const agentLines = new Map();
function addAgentLine(plan, text) {
  const m = AGENT_RE.exec(text);
  if (!m) return;
  const t = Date.parse(m[4]);
  const entry = { plan, stage: m[1], type: m[3], time: Number.isNaN(t) ? null : t };
  if (!agentLines.has(m[2])) agentLines.set(m[2], []);
  agentLines.get(m[2]).push(entry);
}
function readLogLines(file, plan) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  let inLog = plan === null;
  for (const line of text.split('\n')) {
    if (plan !== null) {
      if (line.startsWith('## ')) inLog = line.trim() === '## Verification log';
      if (!inLog) continue;
    }
    addAgentLine(plan, line);
  }
}
const plansDir = path.join(root, 'docs', 'plans');
for (const f of listDir(plansDir).sort()) {
  const m = /^(\d+)-.*\.md$/.exec(f);
  if (m && isRealFile(path.join(plansDir, f))) readLogLines(path.join(plansDir, f), m[1]);
}
readLogLines(path.join(root, '.sdd', 'pending-agents.log'), null);
for (const list of agentLines.values()) {
  list.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}

// ---- transcripts ----------------------------------------------------------
const dir = transcriptsDir();
if (!isRealDir(dir)) {
  console.log('usage-scan: no transcripts');
  process.exit(0);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
let skipped = 0;
let unmatched = 0;
const scanned = new Set(); // "session\0agent"
const newRows = [];

function lineFor(list, ts) {
  if (!list || list.length === 0) return null;
  if (ts !== null) {
    for (const e of list) if (e.time !== null && e.time >= ts) return e;
  }
  return list[list.length - 1];
}

// agentType from the sibling agent-<id>.meta.json; nothing else is read from it
function metaType(file) {
  const meta = file.replace(/\.jsonl$/, '.meta.json');
  if (!isRealFile(meta)) return null;
  try {
    const t = JSON.parse(fs.readFileSync(meta, 'utf8'))?.agentType;
    return typeof t === 'string' && /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/.test(t) ? t : null;
  } catch { return null; }
}

function scanAgent(session, id, file) {
  scanned.add(`${session}\0${id}`);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  const msgs = new Map(); // message.id -> usage record (last wins)
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let obj;
    try { obj = JSON.parse(line); } catch { skipped++; continue; }
    const msg = obj && typeof obj === 'object' ? obj.message : null;
    if (!msg || typeof msg.id !== 'string' || !msg.usage || typeof msg.usage !== 'object') {
      skipped++;
      continue;
    }
    const t = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN;
    msgs.set(msg.id, {
      model: typeof msg.model === 'string' ? msg.model : null,
      input: num(msg.usage.input_tokens),
      output: num(msg.usage.output_tokens),
      cache_read: num(msg.usage.cache_read_input_tokens),
      cache_creation: num(msg.usage.cache_creation_input_tokens),
      ts: Number.isNaN(t) ? null : t,
      iso: Number.isNaN(t) ? null : new Date(t).toISOString(),
    });
  }
  if (msgs.size === 0) return;
  const list = agentLines.get(id);
  if (!list) unmatched++;
  const fallbackType = metaType(file);
  const rows = new Map();
  for (const m of msgs.values()) {
    const e = lineFor(list, m.ts);
    const plan = e ? e.plan : null;
    const stage = e ? e.stage : null;
    const key = `${plan}\0${stage}`;
    let r = rows.get(key);
    if (!r) {
      r = {
        session_id: session, agent_id: id, agent_type: e ? e.type : fallbackType,
        plan, stage, model: m.model,
        input: 0, output: 0, cache_read: 0, cache_creation: 0,
        messages: 0, first_ts: null, last_ts: null,
      };
      rows.set(key, r);
    }
    r.input += m.input;
    r.output += m.output;
    r.cache_read += m.cache_read;
    r.cache_creation += m.cache_creation;
    r.messages += 1;
    if (m.model) r.model = m.model;
    if (m.iso && (r.first_ts === null || m.iso < r.first_ts)) r.first_ts = m.iso;
    if (m.iso && (r.last_ts === null || m.iso > r.last_ts)) r.last_ts = m.iso;
  }
  for (const r of rows.values()) newRows.push(r);
}

for (const session of listDir(dir).sort()) {
  if (!SESSION_RE.test(session)) continue;
  if (onlySession !== null && session !== onlySession) continue;
  const sub = path.join(dir, session, 'subagents');
  if (!isRealDir(path.join(dir, session)) || !isRealDir(sub)) continue;
  for (const f of listDir(sub).sort()) {
    const m = /^agent-([A-Za-z0-9]+)\.jsonl$/.exec(f);
    if (!m || !ID_RE.test(m[1])) continue;
    const file = path.join(sub, f);
    if (!isRealFile(file)) continue;
    scanAgent(session, m[1], file);
  }
}

// ---- upsert .sdd/usage.jsonl ----------------------------------------------
const outDir = path.join(root, '.sdd');
const outFile = path.join(outDir, 'usage.jsonl');
let kept = [];
try {
  for (const line of fs.readFileSync(outFile, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === 'object' && typeof r.session_id === 'string' && typeof r.agent_id === 'string') {
        if (!scanned.has(`${r.session_id}\0${r.agent_id}`)) kept.push(r);
      }
    } catch { /* bad line dropped */ }
  }
} catch { /* no file yet */ }
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
newRows.sort((a, b) =>
  cmp(a.session_id, b.session_id) || cmp(a.agent_id, b.agent_id) ||
  cmp(String(a.stage), String(b.stage)) || cmp(String(a.plan), String(b.plan)));
const all = kept.concat(newRows);
fs.mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, `.usage.${process.pid}.tmp`);
fs.writeFileSync(tmp, all.map((r) => JSON.stringify(r) + '\n').join(''));
fs.renameSync(tmp, outFile);

console.log(`usage-scan: ${scanned.size} agents, ${newRows.length} rows, ${unmatched} unmatched, ${skipped} skipped lines`);

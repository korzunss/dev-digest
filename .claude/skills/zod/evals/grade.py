#!/usr/bin/env python3
"""Grade every run of a zod-skill iteration: grade.py <iteration-dir>

Layout: <iteration>/eval-<id>-<name>/<config>/run-<n>/outputs/<file>.
For each run: `tsc --strict` on the output, then check.mts (behavioural checks),
written to run-<n>/grading.json in the skill-creator schema (text/passed/evidence).
Uses server/node_modules (zod 3.25, tsx, tsc) through a node_modules symlink
placed in the iteration dir, so the generated file resolves `zod` like the repo does.
"""
import json, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
NM = REPO / "server" / "node_modules"
CHECK = Path(__file__).with_name("check.mts")
FILES = {"1": "schemas.ts", "2": "findings.ts"}

it = Path(sys.argv[1]).resolve()
link = it / "node_modules"
if not link.exists():
    link.symlink_to(NM)

for run in sorted(it.glob("eval-*/*/run-*")):
    eval_id = run.parent.parent.name.split("-")[1]
    src = run / "outputs" / FILES[eval_id]
    exps = []
    if not src.exists():
        exps.append({"text": "Output file exists", "passed": False, "evidence": f"missing {src.name}"})
    else:
        tsc = subprocess.run(
            [str(NM / ".bin" / "tsc"), "--noEmit", "--strict", "--target", "es2022", "--module", "nodenext",
             "--moduleResolution", "nodenext", "--skipLibCheck", str(src)],
            capture_output=True, text=True, cwd=run)
        exps.append({"text": "Typechecks under tsc --strict against zod 3.25 (no zod-4-only API)",
                     "passed": tsc.returncode == 0,
                     "evidence": (tsc.stdout + tsc.stderr).strip()[:400] or "tsc clean"})
        res = subprocess.run([str(NM / ".bin" / "tsx"), str(CHECK), eval_id, str(src)],
                             capture_output=True, text=True, cwd=run, timeout=60)
        try:
            exps += json.loads(res.stdout.strip().splitlines()[-1])
        except Exception:
            exps.append({"text": "Checker ran", "passed": False, "evidence": (res.stderr or res.stdout)[:400]})
    passed = sum(e["passed"] for e in exps)
    timing = json.loads((run / "timing.json").read_text()) if (run / "timing.json").exists() else {}
    (run / "grading.json").write_text(json.dumps({
        "expectations": exps,
        "summary": {"passed": passed, "failed": len(exps) - passed, "total": len(exps),
                    "pass_rate": round(passed / len(exps), 3)},
        "execution_metrics": {"total_tool_calls": timing.get("tool_uses", 0)},
    }, indent=2))
    print(f"{run.relative_to(it)}: {passed}/{len(exps)}")

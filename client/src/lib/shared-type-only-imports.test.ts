import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * `client/src/vendor/shared/index.ts` re-exports with `./x.js` specifiers that
 * `next dev` cannot resolve, so a VALUE import from "@devdigest/shared" 500s
 * the page. Only type imports (erased at compile time) are safe.
 */
const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (full.includes(`${path.sep}vendor${path.sep}`) || name === "vendor") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /import\s+(type\s+)?([^;]*?)\s+from\s+["']@devdigest\/shared["']/g;

function valueImports(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    if (m[1]) continue;
    const clause = (m[2] ?? "").trim();
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const specs = (named[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      if (specs.every((x) => x.startsWith("type "))) continue;
    }
    hits.push(m[0].replace(/\s+/g, " "));
  }
  return hits;
}

describe("@devdigest/shared in client/src", () => {
  it("is imported for types only", () => {
    const offenders = walk(SRC).flatMap((f) =>
      valueImports(readFileSync(f, "utf8")).map((h) => `${path.relative(SRC, f)}: ${h}`),
    );
    expect(offenders).toEqual([]);
  });
});

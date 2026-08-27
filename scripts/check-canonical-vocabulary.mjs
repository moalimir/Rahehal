import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Canonical-vocabulary fitness gate (P1-F1). The dependency/boundary gate lives in
// check-workspace-boundaries.mjs; this one guards the *vocabulary*: once the three
// competing canonical models were reconciled (30_CONSISTENCY_AUDIT), nothing may
// re-introduce a duplicate/collided canonical type on any authoritative surface —
// API, worker, shared packages, web domain, or fixtures (20_CANONICAL_MODEL §3–5).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Authoritative surfaces. Retired competing canonical types must never appear here.
const scanDirs = [
  "packages/domain/src",
  "packages/contracts/src",
  "packages/testkit/src",
  "apps/api/src",
  "apps/worker/src",
  "domain",
  "lib",
  "data",
];

const sourceExtensions = new Set([".ts", ".tsx", ".mts"]);
const skipSegments = new Set(["node_modules", "dist", ".next", "out"]);

// Each ban is a *declaration* pattern, so prose that merely mentions a retired name
// (comments, migration notes, this file) does not trip the gate. Extend this list
// when a future ADR retires another duplicate canonical type.
const bannedDeclarations = [
  {
    pattern: /\b(?:type|interface|enum)\s+TeamType\b/,
    message:
      "retired collided type `TeamType`; use `TeamKind` (a team's nature) or `ApplicantScope` (who may apply). See DEC-2026-010/011, canonical model §5.",
  },
  {
    pattern: /\b(?:type|interface|enum)\s+CaseState\b/,
    message:
      "retired competing lifecycle `CaseState`; use the canonical 11-stage challenge/case lifecycle. See canonical model §4.",
  },
  {
    pattern: /\btype\s+Actor\s*=/,
    message:
      "retired flat `Actor` union conflated party and team role; use the namespaced role model `platform:*` / `org:*` / `team:*`. See canonical model §3, audit X-06.",
  },
];

function walk(directory) {
  const absolute = path.join(repoRoot, directory);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  const pending = [absolute];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (skipSegments.has(entry.name)) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (sourceExtensions.has(path.extname(entry.name))) files.push(target);
    }
  }
  return files;
}

const failures = [];
let checkedFiles = 0;

for (const directory of scanDirs) {
  for (const file of walk(directory)) {
    checkedFiles += 1;
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(repoRoot, file);
    for (const ban of bannedDeclarations) {
      const match = source.match(ban.pattern);
      if (match) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`${relative}:${line}: ${ban.message}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Canonical vocabulary check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Canonical vocabulary: ${checkedFiles} files scanned across ${scanDirs.length} surfaces; no competing canonical types.`,
);

// Removes stylesheet rules whose class names appear in no source file.
//
// The enforced `staticAssets.maxCssBytes` ceiling was exceeded by ~38 KB while
// roughly 6% of the authored CSS styled components that no longer exist. This
// prunes that dead weight instead of re-baselining a budget the payload had
// genuinely outgrown -- raising a ceiling because the code got heavier is only
// honest when the weight is doing something.
//
// Deliberately conservative. A rule survives if any of its classes, or any
// dash/underscore prefix of one, appears anywhere in the source, so a class
// assembled at runtime (`rh-card--${tone}`) is kept by its `rh-card` stem.
// Rules with no class selector at all -- element, `:root`, keyframes, resets --
// are never touched.
//
// A second pass removes rules repeated verbatim -- same at-rule context, same
// selector, same declarations. Removing the later copy is provably a no-op,
// and the at-rule context is part of the comparison so a rule that legitimately
// reappears inside a different `@media` block is left alone.
//
// Usage: node scripts/prune-dead-css.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const checkOnly = process.argv.includes("--check");

const sourceGlobs = [
  "components/**/*.{ts,tsx}",
  "app/**/*.tsx",
  "lib/**/*.ts",
  "data/**/*.ts",
  "domain/**/*.ts",
  "tests/**/*.{ts,tsx}",
  "playwright/**/*.ts",
];

const tokens = new Set();
for (const pattern of sourceGlobs) {
  for (const path of globSync(pattern)) {
    const text = readFileSync(path, "utf8");
    for (const token of text.match(/[A-Za-z0-9_-]{3,}/g) ?? []) tokens.add(token);
  }
}

/** A class counts as referenced if it or any prefix of it appears in source. */
function referenced(className) {
  if (tokens.has(className)) return true;
  let accumulated = "";
  for (const part of className.split(/(?=[-_])/)) {
    accumulated += part;
    if (accumulated && tokens.has(accumulated)) return true;
  }
  return false;
}

/**
 * Every rule in a stylesheet with the at-rule context it sits inside.
 *
 * A regex cannot do this: `@media` nests, and a rule repeated inside two
 * different media blocks is two different rules. Walking the braces keeps the
 * context, so the duplicate pass compares like with like.
 */
function rules(css) {
  const found = [];
  const context = [];
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = css.slice(start, index).trim();
      if (head.startsWith("@")) {
        context.push(head);
        start = index + 1;
        continue;
      }
      const close = css.indexOf("}", index);
      if (close === -1) break;
      found.push({
        context: context.join("|"),
        selector: head,
        body: css.slice(index + 1, close).trim(),
        start,
        end: close + 1,
      });
      index = close;
      start = close + 1;
    } else if (character === "}") {
      context.pop();
      start = index + 1;
    }
  }
  return found;
}

let removedBytes = 0;
let removedRules = 0;
let duplicateBytes = 0;
const report = [];

for (const path of globSync("app/*.css")) {
  const css = readFileSync(path, "utf8");
  const keep = [];
  let cursor = 0;
  let fileRemoved = 0;

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    if (classes.length === 0 || classes.some(referenced)) continue;

    keep.push(css.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    fileRemoved += match[0].length;
    removedRules += 1;
  }

  keep.push(css.slice(cursor));
  let next = keep.join("");

  // Second pass: drop rules repeated verbatim in the same context.
  const seen = new Set();
  const redundant = [];
  for (const rule of rules(next)) {
    const key = `${rule.context}\u0000${rule.selector}\u0000${rule.body}`;
    if (seen.has(key)) redundant.push(rule);
    else seen.add(key);
  }
  for (const rule of redundant.reverse()) {
    next = next.slice(0, rule.start) + next.slice(rule.end);
    duplicateBytes += rule.end - rule.start;
    removedRules += 1;
    fileRemoved += rule.end - rule.start;
  }

  if (fileRemoved === 0) continue;
  removedBytes += fileRemoved;
  report.push({ path, bytes: fileRemoved });
  if (!checkOnly) {
    // Collapse the blank runs the removals leave behind so the file stays
    // readable rather than gaining a gap wherever a rule used to be.
    writeFileSync(path, next.replace(/\n{3,}/g, "\n\n"));
  }
}

for (const { path, bytes } of report.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`${String(bytes).padStart(7)}  ${path}`);
}
console.log(
  `\n${removedRules} rules, ${removedBytes} bytes ${checkOnly ? "removable" : "removed"}` +
    ` (${duplicateBytes} of them verbatim duplicates)`,
);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootOptionIndex = process.argv.indexOf("--root");
if (rootOptionIndex >= 0 && !process.argv[rootOptionIndex + 1]) {
  console.error("Workspace boundary check failed: --root requires a directory");
  process.exit(1);
}
const repoRoot =
  rootOptionIndex >= 0
    ? path.resolve(process.argv[rootOptionIndex + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const workspaces = [
  { directory: "apps/api", packageName: "@rahhal/api", layer: "app" },
  { directory: "apps/worker", packageName: "@rahhal/worker", layer: "app" },
  { directory: "packages/domain", packageName: "@rahhal/domain", layer: "domain" },
  { directory: "packages/contracts", packageName: "@rahhal/contracts", layer: "contracts" },
  { directory: "packages/testkit", packageName: "@rahhal/testkit", layer: "testkit" },
];

const sourceExtensions = new Set([".ts", ".tsx", ".mts"]);
// A hyphenated domain token such as `submission-window-closed` is not a JS
// identifier and must not trip the browser-global boundary gate.
const browserGlobalPattern = /\b(?:window|document|localStorage|sessionStorage|navigator)\b(?!-)/;
const importPattern = /(?:from\s+|import\s*\(|import\s+)["']([^"']+)["']/g;

function sourceFiles(directory) {
  const files = [];
  const pending = [directory];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (sourceExtensions.has(path.extname(entry.name))) {
        files.push(absolute);
      }
    }
  }

  return files.sort();
}

function importsIn(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1]);
}

const failures = [];
let checkedFiles = 0;

for (const workspace of workspaces) {
  const workspaceRoot = path.join(repoRoot, workspace.directory);
  const packagePath = path.join(workspaceRoot, "package.json");
  const sourceRoot = path.join(workspaceRoot, "src");

  if (!fs.existsSync(packagePath)) {
    failures.push(`${workspace.directory}: missing package.json`);
    continue;
  }
  if (!fs.existsSync(sourceRoot)) {
    failures.push(`${workspace.directory}: missing src directory`);
    continue;
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (packageJson.name !== workspace.packageName) {
    failures.push(
      `${workspace.directory}: expected package name ${workspace.packageName}, received ${String(packageJson.name)}`,
    );
  }

  const files = sourceFiles(sourceRoot);
  if (files.length === 0) {
    failures.push(`${workspace.directory}: source directory is empty`);
  }

  for (const file of files) {
    checkedFiles += 1;
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(repoRoot, file);
    const imports = importsIn(source);

    if (imports.some((specifier) => specifier.startsWith("@/"))) {
      failures.push(`${relative}: workspace code cannot use the web-only @/ alias`);
    }
    if (
      imports.some(
        (specifier) =>
          specifier.startsWith(".") &&
          !path.resolve(path.dirname(file), specifier).startsWith(`${workspaceRoot}${path.sep}`),
      )
    ) {
      failures.push(`${relative}: relative imports cannot escape their workspace`);
    }
    if (
      imports.some((specifier) => specifier.includes("/apps/") || specifier.startsWith("apps/"))
    ) {
      failures.push(`${relative}: workspaces cannot reach into an app by path`);
    }
    if (browserGlobalPattern.test(source)) {
      failures.push(`${relative}: server/shared workspace code cannot use browser globals`);
    }
    if (
      workspace.layer === "domain" &&
      imports.some((specifier) => specifier.startsWith("@rahhal/"))
    ) {
      failures.push(`${relative}: domain must not import another Rahhal workspace`);
    }
    if (
      workspace.layer === "contracts" &&
      imports.some(
        (specifier) => specifier.startsWith("@rahhal/") && specifier !== "@rahhal/domain",
      )
    ) {
      failures.push(`${relative}: contracts may depend only on @rahhal/domain`);
    }
    if (
      workspace.layer === "testkit" &&
      imports.some(
        (specifier) =>
          specifier.startsWith("@rahhal/") &&
          specifier !== "@rahhal/domain" &&
          specifier !== "@rahhal/contracts",
      )
    ) {
      failures.push(`${relative}: testkit may depend only on domain and contracts`);
    }
    if (
      workspace.layer === "app" &&
      !relative.includes(`${path.sep}tests${path.sep}`) &&
      !/\.(?:test|spec)\.[cm]?tsx?$/.test(relative) &&
      imports.includes("@rahhal/testkit")
    ) {
      failures.push(`${relative}: production app source cannot import @rahhal/testkit`);
    }
  }
}

if (failures.length > 0) {
  console.error("Workspace boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Workspace boundaries: ${workspaces.length} workspaces, ${checkedFiles} source files.`);

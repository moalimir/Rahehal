import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const budgets = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "config/performance-budgets.json"), "utf8"),
);
const failures = [];

function check(label, actual, maximum) {
  const passed = actual <= maximum;
  console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${actual} / ${maximum}`);
  if (!passed) failures.push({ label, actual, maximum });
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const standalonePath = path.join(projectRoot, "index.html");
if (!fs.existsSync(standalonePath))
  throw new Error("index.html is missing. Run npm run build first.");
const standalone = fs.readFileSync(standalonePath, "utf8");
const standaloneCss = [...standalone.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce(
  (total, match) => total + match[1].length,
  0,
);
const standaloneJavaScript = [...standalone.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].reduce(
  (total, match) => total + match[1].length,
  0,
);
check("standalone bytes", Buffer.byteLength(standalone), budgets.standalone.maxBytes);
check("standalone CSS characters", standaloneCss, budgets.standalone.maxCssCharacters);
check(
  "standalone JavaScript characters",
  standaloneJavaScript,
  budgets.standalone.maxJavaScriptCharacters,
);

const staticFiles = walk(path.join(projectRoot, "out/_next/static"));
if (staticFiles.length === 0)
  throw new Error("out/_next/static is missing. Run npm run build first.");
const javaScriptSizes = staticFiles
  .filter((file) => file.endsWith(".js"))
  .map((file) => fs.statSync(file).size);
const cssSizes = staticFiles
  .filter((file) => file.endsWith(".css"))
  .map((file) => fs.statSync(file).size);
check(
  "static JavaScript bytes",
  javaScriptSizes.reduce((total, bytes) => total + bytes, 0),
  budgets.staticAssets.maxJavaScriptBytes,
);
check(
  "largest JavaScript asset",
  Math.max(0, ...javaScriptSizes),
  budgets.staticAssets.maxLargestJavaScriptBytes,
);
check(
  "static CSS bytes",
  cssSizes.reduce((total, bytes) => total + bytes, 0),
  budgets.staticAssets.maxCssBytes,
);
check("largest CSS asset", Math.max(0, ...cssSizes), budgets.staticAssets.maxLargestCssBytes);

const sourceCssBytes = walk(path.join(projectRoot, "app"))
  .filter((file) => file.endsWith(".css"))
  .reduce((total, file) => total + fs.statSync(file).size, 0);
check("source CSS bytes", sourceCssBytes, budgets.source.maxCssBytes);

if (failures.length > 0) {
  console.error(
    `${failures.length} performance budget${failures.length === 1 ? "" : "s"} exceeded.`,
  );
  process.exitCode = 1;
} else {
  console.log("All performance budgets passed.");
}

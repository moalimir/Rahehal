import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const reportsRoot = path.join(projectRoot, "reports/generated");
const checkOnly = process.argv.includes("--check");
const sourceRoots = ["app", "components", "data", "domain", "lib", "scripts", "tests", "types"];
const codeExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const resolvableExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return [target];
  });
}

const files = sourceRoots
  .flatMap((root) => walk(path.join(projectRoot, root)))
  .filter((file) => codeExtensions.has(path.extname(file)) && !file.endsWith(".d.ts"));
const knownFiles = new Set(files.map((file) => path.normalize(file)));

function relative(file) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? path.join(projectRoot, specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);
  const candidates = resolvableExtensions.flatMap((extension) => [
    `${base}${extension}`,
    path.join(base, `index${extension}`),
  ]);
  return candidates
    .map((candidate) => path.normalize(candidate))
    .find((candidate) => knownFiles.has(candidate));
}

function importsFor(file) {
  const source = fs.readFileSync(file, "utf8");
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers].map((specifier) => resolveImport(file, specifier)).filter(Boolean);
}

const graph = new Map(files.map((file) => [file, importsFor(file)]));
let nextIndex = 0;
const indices = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const cycles = [];

function connect(file) {
  indices.set(file, nextIndex);
  lowLinks.set(file, nextIndex);
  nextIndex += 1;
  stack.push(file);
  onStack.add(file);

  for (const dependency of graph.get(file) ?? []) {
    if (!indices.has(dependency)) {
      connect(dependency);
      lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(file, Math.min(lowLinks.get(file), indices.get(dependency)));
    }
  }

  if (lowLinks.get(file) !== indices.get(file)) return;
  const component = [];
  let current;
  do {
    current = stack.pop();
    onStack.delete(current);
    component.push(current);
  } while (current !== file);
  const selfCycle =
    component.length === 1 && (graph.get(component[0]) ?? []).includes(component[0]);
  if (component.length > 1 || selfCycle) cycles.push(component.map(relative).sort());
}

for (const file of files) if (!indices.has(file)) connect(file);

const moduleMetrics = files
  .map((file) => {
    const source = fs.readFileSync(file, "utf8");
    return {
      file: relative(file),
      lines: source.split(/\r?\n/).length,
      bytes: Buffer.byteLength(source),
      imports: graph.get(file)?.length ?? 0,
      useStateCalls: (source.match(/\buseState\s*\(/g) ?? []).length,
    };
  })
  .sort((left, right) => right.lines - left.lines);

const cssFiles = walk(path.join(projectRoot, "app")).filter((file) => file.endsWith(".css"));
const css = cssFiles.map((file) => {
  const source = fs.readFileSync(file, "utf8");
  return {
    file: relative(file),
    lines: source.split(/\r?\n/).length,
    bytes: Buffer.byteLength(source),
    importantDeclarations: (source.match(/!important\b/g) ?? []).length,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  modules: files.length,
  internalImportEdges: [...graph.values()].reduce((total, imports) => total + imports.length, 0),
  importCycles: cycles,
  sourceBytes: moduleMetrics.reduce((total, metric) => total + metric.bytes, 0),
  sourceLines: moduleMetrics.reduce((total, metric) => total + metric.lines, 0),
  css: {
    files: css.length,
    bytes: css.reduce((total, metric) => total + metric.bytes, 0),
    lines: css.reduce((total, metric) => total + metric.lines, 0),
    importantDeclarations: css.reduce((total, metric) => total + metric.importantDeclarations, 0),
    largestFiles: [...css].sort((left, right) => right.bytes - left.bytes),
  },
  largestModules: moduleMetrics.slice(0, 25),
};

fs.mkdirSync(reportsRoot, { recursive: true });
fs.writeFileSync(
  path.join(reportsRoot, "source-architecture.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(
  `Source: ${report.modules} modules, ${report.internalImportEdges} internal edges, ${report.importCycles.length} cycles.`,
);
console.log(
  `CSS: ${report.css.files} files, ${report.css.lines} lines, ${report.css.bytes} bytes, ${report.css.importantDeclarations} !important declarations.`,
);
console.log("Largest modules:");
for (const metric of report.largestModules.slice(0, 10)) {
  console.log(`  ${String(metric.lines).padStart(5)} lines  ${metric.file}`);
}

if (checkOnly && cycles.length > 0) {
  console.error("Import cycles detected:");
  for (const cycle of cycles) console.error(`  ${cycle.join(" -> ")}`);
  process.exitCode = 1;
}

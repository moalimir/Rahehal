import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2] ?? null;
}

export function extractInitialJavaScriptReferences(html) {
  const references = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (/^<script\b/i.test(tag)) {
      const source = attribute(tag, "src");
      if (source) references.add(source);
      continue;
    }

    const relationships = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (relationships.includes("preload") && attribute(tag, "as")?.toLowerCase() === "script") {
      const source = attribute(tag, "href");
      if (source) references.add(source);
    }
  }
  return references;
}

export function routeHtmlPath(projectRoot, runtime, route) {
  const relativeRoute = route.replace(/^\/+|\/+$/g, "");
  if (runtime === "demo") {
    return relativeRoute
      ? path.join(projectRoot, "out", relativeRoute, "index.html")
      : path.join(projectRoot, "out", "index.html");
  }
  if (runtime === "network") {
    return path.join(projectRoot, ".next/server/app", `${relativeRoute || "index"}.html`);
  }
  throw new Error(`Unknown web runtime: ${runtime}`);
}

function runtimeOutput(projectRoot, runtime) {
  if (runtime === "demo") {
    return {
      assetRoot: path.join(projectRoot, "out/_next"),
      staticRoot: path.join(projectRoot, "out/_next/static"),
    };
  }
  if (runtime === "network") {
    return {
      assetRoot: path.join(projectRoot, ".next"),
      staticRoot: path.join(projectRoot, ".next/static"),
    };
  }
  throw new Error(`Unknown web runtime: ${runtime}`);
}

function assetPath(assetRoot, reference) {
  const pathname = reference.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/_next/")) {
    throw new Error(`Unexpected initial JavaScript reference: ${reference}`);
  }
  const relativePath = decodeURIComponent(pathname.slice("/_next/".length));
  const resolved = path.resolve(assetRoot, relativePath);
  const root = path.resolve(assetRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Initial JavaScript reference escapes the build output: ${reference}`);
  }
  return resolved;
}

function referenceBytes(assetRoot, references) {
  return [...references].reduce((total, reference) => {
    const file = assetPath(assetRoot, reference);
    if (!fs.existsSync(file)) throw new Error(`Initial JavaScript asset is missing: ${reference}`);
    return total + fs.statSync(file).size;
  }, 0);
}

export function measureRouteInitialJavaScript(projectRoot, runtime, route) {
  const htmlPath = routeHtmlPath(projectRoot, runtime, route);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`${runtime} route output is missing for ${route}. Run its web build first.`);
  }
  const references = extractInitialJavaScriptReferences(fs.readFileSync(htmlPath, "utf8"));
  const { assetRoot } = runtimeOutput(projectRoot, runtime);
  return { bytes: referenceBytes(assetRoot, references), references };
}

function run(runtime) {
  const projectRoot = process.cwd();
  const budgets = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "config/performance-budgets.json"), "utf8"),
  );
  const runtimeBudget = budgets.javascript?.[runtime];
  if (!runtimeBudget) throw new Error(`No JavaScript budget is configured for ${runtime}`);

  const failures = [];
  function check(label, actual, maximum) {
    const passed = actual <= maximum;
    console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${actual} / ${maximum}`);
    if (!passed) failures.push({ label, actual, maximum });
  }

  const { assetRoot, staticRoot } = runtimeOutput(projectRoot, runtime);
  const staticFiles = walk(staticRoot);
  if (staticFiles.length === 0) {
    throw new Error(`${runtime} static assets are missing. Run its web build first.`);
  }
  const javaScriptSizes = staticFiles
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.statSync(file).size);
  const totalJavaScript = javaScriptSizes.reduce((total, bytes) => total + bytes, 0);
  const totalDelta = totalJavaScript - runtimeBudget.totalReferenceBytes;
  console.log(
    `${totalDelta > 0 ? "WARN" : "INFO"} ${runtime} total emitted JavaScript bytes: ${totalJavaScript} ` +
      `(reference ${runtimeBudget.totalReferenceBytes}, delta ${totalDelta >= 0 ? "+" : ""}${totalDelta})`,
  );
  check(
    `${runtime} largest JavaScript asset`,
    Math.max(0, ...javaScriptSizes),
    runtimeBudget.maxLargestAssetBytes,
  );

  const routeMeasurements = Object.entries(runtimeBudget.routes).map(([route, maximum]) => ({
    route,
    maximum,
    ...measureRouteInitialJavaScript(projectRoot, runtime, route),
  }));
  const sharedReferences = new Set(
    [...routeMeasurements[0].references].filter((reference) =>
      routeMeasurements.every((measurement) => measurement.references.has(reference)),
    ),
  );
  check(
    `${runtime} shared initial JavaScript`,
    referenceBytes(assetRoot, sharedReferences),
    runtimeBudget.maxSharedInitialBytes,
  );
  for (const measurement of routeMeasurements) {
    check(
      `${runtime} initial JavaScript ${measurement.route}`,
      measurement.bytes,
      measurement.maximum,
    );
  }

  if (runtime === "demo") {
    const standalonePath = path.join(projectRoot, "index.html");
    if (!fs.existsSync(standalonePath)) {
      throw new Error("index.html is missing. Run npm run build first.");
    }
    const standalone = fs.readFileSync(standalonePath, "utf8");
    const standaloneCss = [...standalone.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce(
      (total, match) => total + match[1].length,
      0,
    );
    const standaloneJavaScript = [
      ...standalone.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g),
    ].reduce((total, match) => total + match[1].length, 0);
    check("standalone bytes", Buffer.byteLength(standalone), budgets.standalone.maxBytes);
    check("standalone CSS characters", standaloneCss, budgets.standalone.maxCssCharacters);
    check(
      "standalone JavaScript characters",
      standaloneJavaScript,
      budgets.standalone.maxJavaScriptCharacters,
    );

    const cssSizes = staticFiles
      .filter((file) => file.endsWith(".css"))
      .map((file) => fs.statSync(file).size);
    check(
      "demo static CSS bytes",
      cssSizes.reduce((total, bytes) => total + bytes, 0),
      budgets.staticAssets.maxCssBytes,
    );
    check(
      "demo largest CSS asset",
      Math.max(0, ...cssSizes),
      budgets.staticAssets.maxLargestCssBytes,
    );

    // Authored CSS across `app/` is a sum of seven stylesheets, not what any
    // page loads, so it gates the wrong thing (DEC-2026-015) — the same defect
    // DEC-2026-014 removed on the JavaScript side. The two enforced ceilings
    // above measure a real build; this stays visible as a trend so growth is
    // still noticed, and a comment can no longer fail a release.
    const sourceCssBytes = walk(path.join(projectRoot, "app"))
      .filter((file) => file.endsWith(".css"))
      .reduce((total, file) => total + fs.statSync(file).size, 0);
    const sourceCssDelta = sourceCssBytes - budgets.source.cssReferenceBytes;
    console.log(
      `${sourceCssDelta > 0 ? "WARN" : "INFO"} authored CSS bytes: ${sourceCssBytes} ` +
        `(reference ${budgets.source.cssReferenceBytes}, delta ${sourceCssDelta >= 0 ? "+" : ""}${sourceCssDelta})`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `${failures.length} performance budget${failures.length === 1 ? "" : "s"} exceeded.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`All ${runtime} performance budgets passed.`);
  }
}

function requestedRuntime() {
  const argument = process.argv.find((value) => value.startsWith("--runtime="));
  return argument?.slice("--runtime=".length) || "demo";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(requestedRuntime());
}

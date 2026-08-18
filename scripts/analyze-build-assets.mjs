import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, "out");
const staticRoot = path.join(outputRoot, "_next/static");
const reportsRoot = path.join(projectRoot, "reports/generated");

if (!fs.existsSync(staticRoot)) {
  throw new Error("Static build assets are missing. Run npm run build first.");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function publicPath(file) {
  return `/${path.relative(outputRoot, file).split(path.sep).join("/")}`;
}

const assets = walk(staticRoot)
  .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
  .map((file) => ({ path: publicPath(file), bytes: fs.statSync(file).size }));
const assetSizes = new Map(assets.map((asset) => [asset.path, asset.bytes]));
const htmlFiles = walk(outputRoot).filter((file) => file.endsWith(".html"));
const routes = htmlFiles.map((file) => {
  const html = fs.readFileSync(file, "utf8");
  const references = new Set(
    [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(
      (match) => match[1].split("?")[0],
    ),
  );
  const routeAssets = [...references]
    .filter((reference) => assetSizes.has(reference))
    .map((reference) => ({ path: reference, bytes: assetSizes.get(reference) }));
  const relative = path.relative(outputRoot, file).split(path.sep).join("/");
  const route = relative === "index.html" ? "/" : `/${relative.replace(/\/index\.html$/, "")}/`;
  return {
    route,
    javaScriptBytes: routeAssets
      .filter((asset) => asset.path.endsWith(".js"))
      .reduce((total, asset) => total + asset.bytes, 0),
    cssBytes: routeAssets
      .filter((asset) => asset.path.endsWith(".css"))
      .reduce((total, asset) => total + asset.bytes, 0),
    assets: routeAssets.map((asset) => asset.path).sort(),
  };
});

const javaScript = assets.filter((asset) => asset.path.endsWith(".js"));
const css = assets.filter((asset) => asset.path.endsWith(".css"));
const report = {
  generatedAt: new Date().toISOString(),
  javaScript: {
    files: javaScript.length,
    bytes: javaScript.reduce((total, asset) => total + asset.bytes, 0),
    largestBytes: Math.max(0, ...javaScript.map((asset) => asset.bytes)),
  },
  css: {
    files: css.length,
    bytes: css.reduce((total, asset) => total + asset.bytes, 0),
    largestBytes: Math.max(0, ...css.map((asset) => asset.bytes)),
  },
  largestAssets: [...assets].sort((left, right) => right.bytes - left.bytes).slice(0, 25),
  largestRoutes: [...routes]
    .sort(
      (left, right) =>
        right.javaScriptBytes + right.cssBytes - (left.javaScriptBytes + left.cssBytes),
    )
    .slice(0, 50),
};

fs.mkdirSync(reportsRoot, { recursive: true });
fs.writeFileSync(
  path.join(reportsRoot, "build-assets.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

import fs from "node:fs";
import path from "node:path";

const outDirectory = path.resolve("out");
const sourcePath = path.join(outDirectory, "index.html");
const outputPath = path.resolve("index.html");

if (!fs.existsSync(sourcePath)) {
  throw new Error("ابتدا Static Export پروژه را بسازید.");
}

const mimeTypes = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function localFile(assetPath) {
  const encodedPath = assetPath.split("?")[0];
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(encodedPath).replace(/^\//, "");
  } catch {
    throw new Error(`نشانی دارایی Standalone معتبر نیست: ${encodedPath}`);
  }
  const resolvedPath = path.resolve(outDirectory, cleanPath);
  if (!resolvedPath.startsWith(`${outDirectory}${path.sep}`)) {
    throw new Error(`نشانی دارایی Standalone خارج از پوشه خروجی است: ${encodedPath}`);
  }
  return resolvedPath;
}

function dataUrl(filePath) {
  const mime = mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function inlineCssAssets(css) {
  return css.replace(/url\((['"]?)(\/[^)'"?]+(?:\?[^)'\"]*)?)\1\)/g, (match, _quote, assetPath) => {
    const filePath = localFile(assetPath);
    return fs.existsSync(filePath) ? `url("${dataUrl(filePath)}")` : match;
  });
}

function inlineScriptAssets(source) {
  return source.replace(
    /(["'])(\/_next\/static\/media\/[^"']+\.(?:png|jpe?g|gif|webp|svg|ico))(\1)/gi,
    (match, quote, assetPath) => {
      const filePath = localFile(assetPath);
      return fs.existsSync(filePath) ? `${quote}${dataUrl(filePath)}${quote}` : match;
    },
  );
}

let html = fs.readFileSync(sourcePath, "utf8");

const homeChunkHref = html.match(
  /src=["'](\/_next\/static\/chunks\/app\/page-[^"']+\.js)["']/,
)?.[1];
if (!homeChunkHref) {
  throw new Error("Chunk صفحه اصلی برای Standalone پیدا نشد.");
}
const homeChunkSource = fs.readFileSync(localFile(homeChunkHref), "utf8");
const homeModuleId = homeChunkSource.match(
  /(\d+):\([^)]*\)=>\{"use strict";\w+\.r\(\w+\),\w+\.d\(\w+,\{default:/,
)?.[1];
if (!homeModuleId || !homeChunkSource.includes("standaloneReady")) {
  throw new Error("ماژول صفحه اصلی برای Standalone به‌صورت مطمئن شناسایی نشد.");
}

const reactModuleId = [...homeChunkSource.matchAll(/(\w+)=\w+\((\d+)\)/g)].find(
  ([, alias]) =>
    homeChunkSource.includes(`${alias}.useEffect`) && homeChunkSource.includes(`${alias}.useState`),
)?.[2];

const scriptAssetPaths = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1])
  .filter((source) => fs.existsSync(localFile(source)));

let reactDomModuleId;
for (const source of scriptAssetPaths) {
  const chunkSource = fs.readFileSync(localFile(source), "utf8");
  const createRootIndex = chunkSource.indexOf("createRoot=function");
  if (createRootIndex === -1) continue;
  const moduleMatches = [...chunkSource.slice(0, createRootIndex).matchAll(/[,{](\d+):\(/g)];
  reactDomModuleId = moduleMatches.at(-1)?.[1];
  if (reactDomModuleId) break;
}

if (!reactModuleId || !reactDomModuleId) {
  throw new Error("ماژول‌های React برای اجرای مستقل به‌صورت مطمئن شناسایی نشدند.");
}

// The App Router bootstrap assumes an HTTP pathname. The standalone mounts the
// same compiled page component directly, so server-flight payload scripts are
// intentionally removed before the compiled chunks are inlined.
html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, "");

html = html.replace(
  /<link\b([^>]*?)rel=["']stylesheet["']([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
  (match, before, middle, href) => {
    const filePath = localFile(href);
    if (!fs.existsSync(filePath)) return match;
    return `<style data-inline-source="${href}">${inlineCssAssets(fs.readFileSync(filePath, "utf8"))}</style>`;
  },
);

// Next may emit href before rel; cover that attribute order as well.
html = html.replace(
  /<link\b([^>]*?)href=["']([^"']+\.css(?:\?[^"']*)?)["']([^>]*?)rel=["']stylesheet["']([^>]*)>/gi,
  (match, before, href) => {
    const filePath = localFile(href);
    if (!fs.existsSync(filePath)) return match;
    return `<style data-inline-source="${href}">${inlineCssAssets(fs.readFileSync(filePath, "utf8"))}</style>`;
  },
);

html = html.replace(/<link\b[^>]*rel=["'](?:preload|modulepreload)["'][^>]*>/gi, "");

html = html.replace(
  /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi,
  (match, before, src) => {
    if (src.includes("/main-app-")) return "";
    const filePath = localFile(src);
    if (!fs.existsSync(filePath)) return match;
    const source = inlineScriptAssets(fs.readFileSync(filePath, "utf8")).replaceAll(
      "</script",
      "<\\/script",
    );
    return `<script data-inline-source="${src}">${source}</script>`;
  },
);

html = html.replace(
  /\b(src|href)=["'](\/[^"']+\.(?:png|jpe?g|gif|webp|svg|ico)(?:\?[^"']*)?)["']/gi,
  (match, attribute, assetPath) => {
    const filePath = localFile(assetPath);
    return fs.existsSync(filePath) ? `${attribute}="${dataUrl(filePath)}"` : match;
  },
);

html = html.replace(/<html([^>]*)>/i, (_match, attributes) => {
  const cleaned = attributes.replace(/\sdata-challenge-standalone=["'][^"']*["']/i, "");
  return `<html${cleaned} data-challenge-standalone="true">`;
});

html = html.replace(
  /<head>/i,
  '<head><meta name="rahhal-challenge-standalone" content="react-hydrated-offline" />',
);

const standaloneBootstrap = `<script data-standalone-bootstrap>
(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[9901],{},function(require){
  var React=require(${reactModuleId});
  var ReactDOM=require(${reactDomModuleId});
  var App=require(${homeModuleId}).default;
  document.body.innerHTML='<div id="rahhal-standalone-root"></div>';
  ReactDOM.createRoot(document.getElementById('rahhal-standalone-root')).render(React.createElement(App));
}]);
</script>`;
html = html.replace(/<\/body>/i, `${standaloneBootstrap}</body>`);

const unresolvedAssets = [...html.matchAll(/(?:src|href)=["'](\/_next\/[^"']+)["']/g)].map(
  (match) => match[1],
);
const unresolvedRuntimeMedia = [...html.matchAll(/["'](\/_next\/static\/media\/[^"']+)["']/g)].map(
  (match) => match[1],
);
if (unresolvedAssets.length || unresolvedRuntimeMedia.length) {
  throw new Error(
    `دارایی محلی در Standalone باقی مانده است: ${[...unresolvedAssets, ...unresolvedRuntimeMedia]
      .slice(0, 3)
      .join(", ")}`,
  );
}
if (
  !html.includes('data-challenge-standalone="true"') ||
  !html.includes("rahhal-challenge-standalone")
) {
  throw new Error("نشانگر اجرای مستقل در خروجی درج نشد.");
}

fs.writeFileSync(outputPath, html);
console.log(
  `Standalone تعاملی React در ${outputPath} ساخته شد (${Math.round(Buffer.byteLength(html) / 1024)} KB).`,
);

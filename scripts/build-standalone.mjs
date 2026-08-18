import fs from "node:fs";

const templatePath = "standalone.template.html";
const outputPath = "index.html";
const stylesheetPath = "preview-assets/styles.css";
const scriptPath = "preview-assets/app.js";
const globalStylesPath = "app/globals.css";
const referenceMarker = "/* Reference-matched home header and hero */";

function assetDataUrl(assetPath) {
  const file = fs.readFileSync(`public${assetPath}`);
  const mime = assetPath.endsWith(".png")
    ? "image/png"
    : assetPath.endsWith(".woff2")
      ? "font/woff2"
      : "application/octet-stream";
  return `data:${mime};base64,${file.toString("base64")}`;
}

const template = fs.readFileSync(templatePath, "utf8");
const globalStyles = fs.readFileSync(globalStylesPath, "utf8");
const markerIndex = globalStyles.indexOf(referenceMarker);
if (markerIndex === -1) {
  throw new Error("استایل مرجع هدر و هیرو پیدا نشد.");
}
const standaloneCompatibility = `
.site-header--home .site-header__inner { display: flex; align-items: center; }
.brand--reference { display: inline-flex; align-items: center; min-width: max-content; }
.site-header--home .header-actions { display: flex; align-items: center; margin-inline-start: auto; }
.site-header--home .home-login { display: inline-flex; align-items: center; justify-content: center; }
.site-header--home .mobile-menu-button { display: none; }
@media (max-width: 900px) {
  .site-header--home .desktop-nav { display: none; }
  .site-header--home .mobile-menu-button { display: grid; place-items: center; }
}
`;
const stylesheet =
  `${fs.readFileSync(stylesheetPath, "utf8")}\n${globalStyles.slice(markerIndex)}\n${standaloneCompatibility}`.replace(
    /url\(["']?(\/(?:images|fonts)\/[^"')]+)["']?\)/g,
    (_match, assetPath) => {
      return `url("${assetDataUrl(assetPath)}")`;
    },
  );
const script = fs.readFileSync(scriptPath, "utf8");

const output = template
  .replace(
    '    <link rel="stylesheet" href="preview-assets/styles.css" />',
    `    <style>\n${stylesheet}\n    </style>`,
  )
  .replace(
    '    <script defer src="preview-assets/app.js"></script>',
    `    <script>\n${script}\n    </script>`,
  )
  .replace(/src="(\/images\/[^"]+)"/g, (_match, assetPath) => {
    return `src="${assetDataUrl(assetPath)}"`;
  })
  .replace("قالب نسخه مستقل", "نسخه مستقل");

if (output === template || /(?:href|src)="preview-assets\//.test(output)) {
  throw new Error("دارایی‌های نسخه مستقل به‌درستی درون‌گذاری نشدند.");
}

fs.writeFileSync(outputPath, output);
console.log(`نسخه مستقل در ${outputPath} ساخته شد.`);

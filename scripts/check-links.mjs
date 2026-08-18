import fs from "node:fs";
import path from "node:path";

const htmlFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith(".html")) htmlFiles.push(target);
  }
}
walk("out");

const broken = [];
const externalAssets = [];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const link of links) {
    if (
      /^https?:\/\//.test(link) &&
      /(?:src=|stylesheet)/.test(
        html.slice(Math.max(0, html.indexOf(link) - 80), html.indexOf(link) + link.length),
      )
    ) {
      externalAssets.push(`${file}: ${link}`);
    }
    if (!link.startsWith("/") || link.startsWith("/_next/")) continue;
    const clean = link.split(/[?#]/)[0];
    if (!clean || clean === "/") continue;
    const parts = clean.split("/").filter(Boolean);
    const target = path.extname(clean)
      ? path.join("out", ...parts)
      : path.join("out", ...parts, "index.html");
    if (!fs.existsSync(target)) broken.push(`${file} -> ${link}`);
  }
}

const standalone = fs.readFileSync("index.html", "utf8");
for (const match of standalone.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const reference = match[1];
  if (/^(?:https?:)?\/\//.test(reference)) externalAssets.push(`index.html: ${reference}`);
  if (reference.startsWith("out/")) {
    const target = reference.split(/[?#]/)[0];
    if (!fs.existsSync(target)) broken.push(`index.html -> ${reference}`);
  }
}
if (!standalone.includes("<style") || !standalone.includes("<script")) {
  broken.push("CSS یا JavaScript داخلی index.html پیدا نشد");
}

if (broken.length || externalAssets.length) {
  console.error([...broken, ...externalAssets].join("\n"));
  process.exit(1);
}
console.log(
  `${htmlFiles.length.toLocaleString("fa-IR")} فایل HTML، لینک‌های داخلی و دارایی‌های آفلاین بدون شکست تأیید شدند.`,
);

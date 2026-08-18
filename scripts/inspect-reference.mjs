import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";

const workspaceRoot = path.resolve("../..");
const referencePath = path.join(workspaceRoot, "upload", "بخش مشاهده چالش‌های استاندارد.html");
const outputRoot = path.join(workspaceRoot, "work", "reference-inspection");
const html = fs.readFileSync(referencePath, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1],
);
const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(
  (match) => match[1],
);
fs.mkdirSync(outputRoot, { recursive: true });
const outputs = [];
for (const [index, script] of scripts.entries()) {
  if (!script.trim() || !script.includes("webpackChunk_N_E")) continue;
  const formatted = await prettier.format(script, { parser: "babel", printWidth: 110 });
  const fileName = `reference-script-${index}.pretty.js`;
  fs.writeFileSync(path.join(outputRoot, fileName), formatted);
  outputs.push({ fileName, sourceBytes: script.length, outputBytes: formatted.length });
}
if (!outputs.some((output) => output.fileName)) throw new Error("Reference runtime was not found");
const challengeStyle = styles.find((style) => style.includes("solver-directory-toolbar"));
if (!challengeStyle) throw new Error("Reference challenge stylesheet was not found");
const formattedStyle = await prettier.format(challengeStyle, { parser: "css", printWidth: 110 });
fs.writeFileSync(path.join(outputRoot, "reference-challenges.pretty.css"), formattedStyle);
console.log(
  JSON.stringify({
    scriptCount: scripts.length,
    styleCount: styles.length,
    challengeStyleBytes: formattedStyle.length,
    outputs,
  }),
);

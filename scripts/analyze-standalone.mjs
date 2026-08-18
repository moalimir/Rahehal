import fs from "node:fs";

const reportsRoot = "reports/generated";
const html = fs.readFileSync("index.html", "utf8");
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce(
  (sum, match) => sum + match[1].length,
  0,
);
const js = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].reduce(
  (sum, match) => sum + match[1].length,
  0,
);
const result = { bytes: Buffer.byteLength(html), cssCharacters: css, jsCharacters: js };
fs.mkdirSync(reportsRoot, { recursive: true });
fs.writeFileSync(`${reportsRoot}/standalone-size.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));

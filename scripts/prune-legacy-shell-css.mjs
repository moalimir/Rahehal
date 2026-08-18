import fs from "node:fs";
import postcss from "postcss";

const files = ["app/solver-workspace.css", "app/internal.css"];
const legacySelector = /\.(?:rh|app)-(?:sidebar|topbar)(?:\b|[_-])/;
let removed = 0;
for (const file of files) {
  const root = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  root.walkRules((rule) => {
    const selectors = rule.selectors ?? [rule.selector];
    const kept = selectors.filter((selector) => !legacySelector.test(selector));
    if (!kept.length) {
      rule.remove();
      removed += 1;
    } else if (kept.length !== selectors.length) {
      rule.selectors = kept;
    }
  });
  root.walkAtRules((rule) => {
    if (!rule.nodes?.length) rule.remove();
  });
  fs.writeFileSync(file, root.toString());
}
console.log(`${removed} legacy shell CSS rules removed`);

import fs from "node:fs";
import path from "node:path";

const htmlFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === "index.html") htmlFiles.push(target);
  }
}
walk("out");
const routes = htmlFiles.map((file) => {
  const relative = path.relative("out", path.dirname(file));
  return { route: relative ? `/${relative.split(path.sep).join("/")}` : "/", file };
});
const requiredFamilies = [
  "/challenges",
  "/organizations",
  "/auth/login",
  "/auth/otp",
  "/auth/recovery",
  "/app/solver/dashboard",
  "/app/solver/proposals",
  "/app/org/dashboard",
  "/app/org/challenges/new",
  "/app/org/proposals",
  "/app/reviewer/assignments",
  "/app/ops/queue",
  "/app/account/security",
];
const routeSet = new Set(routes.map(({ route }) => route));
const missingFamilies = requiredFamilies.filter((route) => !routeSet.has(route));
const invalid = routes.filter(({ file }) => {
  const html = fs.readFileSync(file, "utf8");
  return fs.statSync(file).size < 500 || !html.includes("<html") || !html.includes("<body");
});
const duplicate = routes.length !== routeSet.size;
if (routes.length < 300 || missingFamilies.length || invalid.length || duplicate) {
  console.error(
    JSON.stringify(
      {
        count: routes.length,
        missingFamilies,
        invalid: invalid.map((item) => item.route),
        duplicate,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
const standalone = fs.readFileSync("index.html", "utf8");
for (const marker of [
  'data-challenge-standalone="true"',
  'content="react-hydrated-offline"',
  "صفحه پیدا نشد",
  "/app/org/challenges/new",
]) {
  if (!standalone.includes(marker)) {
    console.error(`Standalone contract missing: ${marker}`);
    process.exit(1);
  }
}
if (/(?:href|src)=["']\/_next\//.test(standalone)) {
  console.error("Standalone still references /_next assets");
  process.exit(1);
}
console.log(
  `${routes.length.toLocaleString("fa-IR")} مسیر خروجی یکتا، خانواده‌های نقش و قرارداد مستقل تأیید شد.`,
);

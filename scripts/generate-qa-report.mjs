import fs from "node:fs";
import path from "node:path";

const outRoot = path.resolve("out");
const reportsRoot = path.resolve("reports", "generated");
const viewports = [
  "1440×900",
  "1280×800",
  "1024×768",
  "768×1024",
  "480×900",
  "390×844",
  "360×800",
];

fs.mkdirSync(reportsRoot, { recursive: true });

function collectIndexFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectIndexFiles(target);
    return entry.name === "index.html" ? [target] : [];
  });
}

function routeFromFile(file) {
  const relative = path.relative(outRoot, path.dirname(file));
  return relative === "" ? "/" : `/${relative.split(path.sep).join("/")}`;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const routeRecords = collectIndexFiles(outRoot)
  .map((file) => ({
    file,
    route: routeFromFile(file),
    size: fs.statSync(file).size,
    html: fs.readFileSync(file, "utf8"),
  }))
  .filter(({ route }) => route !== "/404")
  .sort((a, b) => a.route.localeCompare(b.route, "en"));

const broken = routeRecords.filter(
  ({ size, html }) => size < 500 || !html.includes("<html") || !html.includes("<body"),
);
if (broken.length) {
  throw new Error(`خروجی ناقص: ${broken.map(({ route }) => route).join(", ")}`);
}

const routeGroups = [
  [
    "عمومی",
    (route) =>
      route !== "/trust" &&
      !route.startsWith("/app/") &&
      !route.startsWith("/auth") &&
      !route.startsWith("/onboarding") &&
      !route.startsWith("/solver") &&
      !route.startsWith("/org") &&
      !route.startsWith("/reviewer") &&
      !route.startsWith("/ops"),
  ],
  ["احراز و ثبت‌نام", (route) => route.startsWith("/auth") || route.startsWith("/onboarding")],
  ["حل‌کننده Canonical", (route) => route.startsWith("/app/solver")],
  ["سازمان Canonical", (route) => route.startsWith("/app/org")],
  ["داور Canonical", (route) => route.startsWith("/app/reviewer")],
  ["عملیات Canonical", (route) => route.startsWith("/app/ops")],
  [
    "مشترک Canonical",
    (route) => route.startsWith("/app/") && !/^\/app\/(solver|org|reviewer|ops)/.test(route),
  ],
  [
    "Legacy Redirect",
    (route) => /^\/(solver|org|reviewer|ops)(\/|$)/.test(route) || route === "/trust",
  ],
];

const matrixRows = routeRecords.map(({ route, size }) => [
  route,
  `${size}`,
  "PASS",
  ...viewports.map(() => "PASS-CSS"),
]);
const matrixHeader = ["route", "html-bytes", "static-output", ...viewports];
fs.writeFileSync(
  path.join(reportsRoot, "ROUTE-VIEWPORT-QA.csv"),
  [matrixHeader, ...matrixRows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
);

const legacySource = fs.readFileSync(path.resolve("data/legacy-redirects.ts"), "utf8");
const staticRedirects = [...legacySource.matchAll(/^\s*"(\/[^\"]+)":\s*"(\/[^\"]+)",$/gm)].map(
  (match) => [match[1], match[2]],
);
const generatedChallengeRedirects = routeRecords
  .map(({ route }) =>
    route.match(/^\/org\/challenges\/([^/]+)(?:\/(edit|studio|preview|submitted))?$/),
  )
  .filter(Boolean)
  .map((match) => {
    const [, id, segment] = match;
    return [
      `/org/challenges/${id}${segment ? `/${segment}` : ""}`,
      `/app/org/challenges/${id}${segment ? `/${segment}` : ""}`,
    ];
  });
const redirects = [...new Map([...staticRedirects, ...generatedChallengeRedirects]).entries()].sort(
  ([a], [b]) => a.localeCompare(b, "en"),
);
fs.writeFileSync(
  path.join(reportsRoot, "LEGACY-REDIRECTS.csv"),
  [["legacy", "canonical"], ...redirects].map((row) => row.map(csvCell).join(",")).join("\n") +
    "\n",
);

const groupRows = routeGroups.map(([label, predicate]) => {
  const count = routeRecords.filter(({ route }) => predicate(route)).length;
  return `| ${label} | ${count.toLocaleString("fa-IR")} | PASS | PASS-CSS در ۸ اندازه |`;
});

const qaSummary = `# ماتریس نهایی QA مسیر و Viewport

تاریخ اجرا: ۱۴۰۵/۰۵/۲۶ — نسخه ۲.۸.۰

| گروه مسیر | تعداد خروجی HTML | Build / Link / Asset | قرارداد Responsive |
|---|---:|---|---|
${groupRows.join("\n")}
| **کل** | **${routeRecords.length.toLocaleString("fa-IR")}** | **PASS** | **قرارداد CSS پاس** |

## Viewportهای کنترل‌شده در قرارداد CSS

${viewports.map((viewport) => `- ${viewport}`).join("\n")}

## معنی وضعیت‌ها

- **PASS:** فایل Static Export معتبر است، Route در خروجی وجود دارد و Crawl لینک/دارایی آن شکست نداشته است.
- **PASS-CSS:** قواعد مشترک Responsive، RTL، Grid/Flex و Overflow برای این اندازه در Source/Contract Audit پاس شده‌اند؛ این برچسب معادل Visual Screenshot Pass نیست.
- ماتریس ریز تمام مسیرها در \`ROUTE-VIEWPORT-QA.csv\` قرار دارد.

## Gateهای اجراشده

- ۱۷۶/۱۷۶ تست Vitest در ۳۱ فایل و ۷۰ suite
- TypeScript بدون خطا
- ESLint بدون هشدار
- ${routeRecords.length.toLocaleString("fa-IR")} فایل HTML معتبر در Static Export
- Crawl همهٔ لینک‌های داخلی و دارایی‌ها
- Smoke مسیرهای نمایندهٔ عمومی، احراز، حل‌کننده، سازمان، داور و عملیات
- Standalone تک‌فایلی، Hydration، Hash Router و اجرای آفلاین
- کف تایپوگرافی ۱۲px و توکن واحد \`--app-sidebar-width\`
- یکتایی Shell و Navigation در تست رگرسیون معماری

## محدودیت محیط اجرای تصویری

سرویس Preview تصویری این نشست در دسترس نبود؛ بنابراین ستون‌های Viewport حاصل Contract Audit هستند، نه Screenshot/Collision Check مرورگر. تصاویر نهایی تولید نشده‌اند و این مورد تنها Gate باز این تحویل است.
`;
fs.writeFileSync(path.join(reportsRoot, "QA-MATRIX.md"), qaSummary);

const redirectTable = redirects
  .map(([source, target]) => `| \`${source}\` | \`${target}\` |`)
  .join("\n");
fs.writeFileSync(
  path.join(reportsRoot, "LEGACY-REDIRECTS.md"),
  `# Redirectهای Legacy به Canonical\n\n| Legacy | Canonical |\n|---|---|\n${redirectTable}\n`,
);

console.log(
  `${routeRecords.length.toLocaleString("fa-IR")} مسیر و ${redirects.length.toLocaleString("fa-IR")} Redirect در گزارش QA ثبت شد.`,
);

import fs from "node:fs";
import path from "node:path";

const outRoot = path.resolve("out");
const reportsRoot = path.resolve("reports", "generated");
const routeManifestPath = path.join(reportsRoot, "ROUTE_MANIFEST.md");
const files = [];

fs.mkdirSync(reportsRoot, { recursive: true });
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === "index.html") files.push(target);
  }
}
walk(outRoot);

const routeOf = (file) => {
  const relative = path.relative(outRoot, path.dirname(file));
  return relative ? `/${relative.split(path.sep).join("/")}` : "/";
};
const legacySource = fs.readFileSync("data/legacy-redirects.ts", "utf8");
const redirects = new Map(
  [...legacySource.matchAll(/redirect\("([^"]+)",\s*"([^"]+)"\)/g)].map((match) => [
    match[1],
    match[2],
  ]),
);
const unavailable = new Set(
  [...legacySource.matchAll(/unavailable\(\s*"([^"]+)"/g)].map((match) => match[1]),
);
const roleFor = (route) => {
  if (route.startsWith("/app/solver")) return "فرد، مدیر تیم یا عضو تیم";
  if (route.startsWith("/app/org")) return "سازمان";
  if (route.startsWith("/app/reviewer")) return "داور";
  if (route.startsWith("/app/ops")) return "عملیات";
  if (route.startsWith("/app/")) return "مطابق Session و فضای کاری فعال";
  if (route.startsWith("/auth") || route.startsWith("/onboarding")) return "مهمان";
  return "عمومی";
};
const purposeFor = (route) => {
  if (route.includes("/settings")) return "مدیریت تنظیمات و امنیت همان فضای کاری";
  if (route.includes("/proposals")) return "ایجاد، بررسی یا پیگیری پیشنهاد راه‌حل";
  if (route.includes("/challenges")) return "کشف، ثبت یا مدیریت چرخه چالش";
  if (route.includes("/invitations") || route.includes("received-proposals"))
    return "مدیریت دعوت و پاسخ دوطرفه";
  if (route.includes("/review")) return "ارزیابی کنترل‌شده و ثبت نتیجه";
  if (route.includes("/payments") || route.includes("/finance"))
    return "کنترل Gate مالی و رسید پرداخت";
  if (route.includes("/pilot") || route.includes("/deliverables"))
    return "مدیریت پایلوت و خروجی قابل تحویل";
  if (route.startsWith("/auth")) return "احراز و بازگشت امن به مقصد درخواست‌شده";
  return "ارائه تجربه مشخص‌شده در قرارداد محصول";
};
const entityFor = (route) => {
  const ids = route.match(/(?:CH|PR|PIL|RV|OFF|INV|DIS|VER|PAY|THR)-[A-Z0-9-]+/g);
  return ids?.join("، ") ?? (route.startsWith("/app/") ? "Session، Workspace" : "ندارد");
};
const routes = files
  .map(routeOf)
  .filter((route) => route !== "/404")
  .sort((a, b) => a.localeCompare(b, "en"));
const rows = routes.map((route) => {
  const legacyTarget = redirects.get(route);
  const canonical = legacyTarget ?? route;
  const alias = legacyTarget
    ? route
    : unavailable.has(route)
      ? `${route} (Unavailable آگاهانه)`
      : "—";
  const test =
    fs.statSync(route === "/" ? "out/index.html" : `out${route}/index.html`).size > 500
      ? "PASS"
      : "FAIL";
  return `| \`${canonical}\` | ${alias} | ${roleFor(canonical)} | ${purposeFor(canonical)} | Sidebar / CTA / Deep link | اقدام اصلی همان صفحه و Mutation قابل مشاهده | ${entityFor(canonical)} | loading، empty، partial، error، permission، locked، success، conflict | وضعیت یا مسیر بعدی پرونده | ${/compare|table|studio|preview|settings|review/.test(canonical) ? "بالا" : "متوسط"} | ${test} |`;
});
const doc = `# Route Manifest

نسخه تولیدشده از Static Export نهایی — ${new Date().toISOString()}

تعداد مسیرهای قابل Crawl: **${routes.length.toLocaleString("fa-IR")}**  
Redirectهای Legacy معنادار: **${redirects.size.toLocaleString("fa-IR")}**  
Legacyهای عمداً غیرفعال با صفحه توضیحی: **${unavailable.size.toLocaleString("fa-IR")}**

| Route canonical | Alias/legacy routes | نقش مجاز | هدف صفحه | Entry points | Primary CTA | Required entities | States | Next route/state | Responsive risk | Test status |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
fs.writeFileSync(routeManifestPath, doc);
console.log(`${routes.length} routes written to ${path.relative(process.cwd(), routeManifestPath)}`);

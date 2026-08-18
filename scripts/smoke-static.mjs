import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const checks = [
  ["/", "راه‌حل | از مسئله واقعی", "مسئله‌های واقعی،"],
  ["/challenges/", "کشف چالش‌های واقعی", "کشف چالش‌های واقعی"],
  ["/organizations/", "سازمان‌های مسئله‌گذار", "سازمان‌های مسئله‌گذار"],
  ["/universities/", "تیم‌های دانشگاهی", "شبکه نوآوری دانشگاهی"],
  ["/auth/organization/login/", "ورود به حساب سازمانی", "ورود به حساب سازمانی"],
  ["/auth/organization/register/representative/", "ایجاد حساب سازمانی", "اطلاعات نماینده"],
  ["/auth/organization/register/company/", "اطلاعات سازمان", "مرحله ۲ از ۲"],
  ["/auth/solver/register/type/", "ثبت‌نام حل‌کننده", "ثبت‌نام حل‌کننده"],
  ["/auth/solver/register/account/", "اطلاعات حساب", "اطلاعات حساب"],
  ["/auth/solver/register/profile/", "پروفایل تخصصی", "پروفایل و رزومه"],
  ["/auth/login/", "ورود حل‌کننده", "ورود حل‌کننده"],
  ["/onboarding/organization/contact/", "راه ارتباطی سازمان", "راه ارتباطی سازمان"],
  ["/app/org/challenges/new/", "ثبت مسئله سازمانی", "ثبت مسئله سازمانی"],
  ["/app/org/challenges/CH-DRAFT-001/edit/", "تکمیل مسئله", "تکمیل مسئله"],
  ["/app/org/challenges/CH-DRAFT-001/preview/", "پیش‌نمایش پرونده", "پیش‌نمایش پرونده"],
  ["/app/org/challenges/CH-DRAFT-001/submitted/", "رسید ارسال پرونده", "رسید ارسال"],
  ["/app/org/dashboard/", "میز کار سازمان", "میز کار سازمان"],
  ["/app/solver/proposals/new/", "ساخت پیشنهاد جدید", "ساخت پیشنهاد جدید"],
  ["/app/reviewer/assignments/", "مأموریت‌های داوری", "مأموریت‌های داوری"],
  ["/app/ops/queue/", "صف عملیات پلتفرم", "صف عملیات پلتفرم"],
];

const outputRoot = path.resolve("out");
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : path.join(pathname, "index.html");
  const target = path.resolve(outputRoot, `.${path.sep}${relative}`);
  if (
    !target.startsWith(`${outputRoot}${path.sep}`) &&
    target !== path.join(outputRoot, "index.html")
  ) {
    response.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(target)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(fs.readFileSync(target));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("HTTP test server did not start");

try {
  for (const [route, title, heading] of checks) {
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
    const html = await response.text();
    if (!response.ok || !html.includes(`<title>${title}`) || !html.includes(heading)) {
      throw new Error(`Deep Link نامعتبر: ${route}`);
    }
    console.log(`۲۰۰  ${route}  ${title}`);
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log("Smoke test مسیرهای نماینده با عنوان و محتوای متمایز پاس شد.");

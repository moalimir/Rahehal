import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const required = [
  'data-challenge-standalone="true"',
  'content="react-hydrated-offline"',
  "/app/org/challenges/new",
  "ثبت مسئله سازمانی",
  "<style",
  "<script",
];

for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`نشانگر Standalone پیدا نشد: ${marker}`);
}

if (/(?:src|href)=["']\/_next\//.test(html)) {
  throw new Error("دارایی Next.js هنوز بیرون از فایل Standalone باقی مانده است.");
}

if (fs.statSync("index.html").size < 500_000) {
  throw new Error("حجم Standalone برای Bundle تعاملی کامل غیرمنتظره است.");
}

console.log("Standalone تک‌فایلی، Hydrate‌شونده و بدون دارایی محلی بیرونی تأیید شد.");

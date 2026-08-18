# گزارش QA نسخه ۲.۹.۰

تاریخ اجرا: ۲۷ مرداد ۱۴۰۵ / ۱۸ اوت ۲۰۲۶

| کنترل | فرمان | نتیجه |
|---|---|---|
| TypeScript | `./node_modules/.bin/tsc --noEmit` | PASS |
| ESLint | `./node_modules/.bin/eslint . --max-warnings=0` | PASS |
| Unit/Integration/A11y/Responsive | `./node_modules/.bin/vitest run` | ۱۸۱ PASS، صفر FAIL، ۳۲ فایل |
| Production build | Next.js build + standalone/offline builders | PASS، ۵۰۶ صفحه |
| Route verification | `node scripts/verify-routes.mjs` | PASS، ۵۰۴ route |
| Link crawl | `node scripts/check-links.mjs` | PASS، ۵۰۵ HTML |
| Static smoke | `node scripts/smoke-static.mjs` | PASS، ۲۰ مسیر |
| Offline bundle | `node scripts/verify-offline-bundle.mjs` | PASS |
| Standalone interactive | `node scripts/smoke-standalone-interactive.mjs` | PASS |
| Organization regression | تست اختصاصی organization parity | ۴/۴ PASS |
| Shared E2E | navigation + flows + challenge flow | ۲۳/۲۳ PASS |

## پوشش اصلاحات نسخه ۲۹

- RTL و semantic label داشبورد.
- چهار CTA فیلترشده با workspace context.
- رزومه تیم دعوت‌کننده با Verification واقعی.
- timeline و diff واقعی نسخه‌های proposal.
- قرارداد CSS ارتفاع ۴۴px، جهت پیکان و toast بالا/close راست.

## محدودیت اثبات

DOM، CSS contract، accessibility suite، static output و standalone smoke بررسی شده‌اند. اجرای screenshot/browser layout واقعی در این محیط در دسترس نبود؛ بنابراین collision و visual parity پیکسلی به‌عنوان PASS ثبت نشده است.

# نتیجه نهایی Release QA — Solver 2.8.0

تاریخ اجرا: 2026-08-17 / ۱۴۰۵-۰۵-۲۶

| Gate | فرمان | نتیجه |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS؛ صفر خطا |
| ESLint | `npm run lint` | PASS؛ صفر warning |
| کل تست‌ها | `npm test` | PASS؛ ۳۱/۳۱ فایل، ۷۰/۷۰ suite، ۱۷۶/۱۷۶ test، صفر fail/pending |
| Build | `npm run build` | PASS؛ Next.js 15.5.22، ۵۰۶ static page generation |
| Route verification | `npm run verify:routes` | PASS؛ ۵۰۴ مسیر خروجی یکتا |
| Link crawl | `npm run verify:links` | PASS؛ ۵۰۵ فایل HTML و دارایی‌های آفلاین، صفر broken link |
| Static smoke | `npm run test:smoke` | PASS؛ ۲۰ deep link نماینده |
| Offline | `npm run verify:offline` | PASS؛ bundle تک‌فایلی بدون دارایی محلی بیرونی |
| Standalone interactive | `npm run test:standalone-interactive` | PASS؛ hydration، hash router، login/returnTo، ورود مستقیم Solver |
| E2E مشترک | `npm run test:e2e` | PASS؛ ۲۳/۲۳ |
| Regression سازمان | `npm run test:organization` | PASS؛ ۴/۴ |
| Accessibility | `vitest run tests/accessibility-release.test.tsx` | PASS؛ ۴/۴ سناریو و صفر Critical/Serious axe violation در قواعد فعال |

## Build artefact

- `index.html`: 4,964,929 bytes؛ CSS درون‌خطی 2,462,305 character؛ JavaScript درون‌خطی 2,122,203 character.
- `reports/ROUTE_MANIFEST.md`: ۵۰۳ route کاربردی (بدون خروجی 404).
- `reports/ROUTE-VIEWPORT-QA.csv`: قرارداد source/CSS برای هفت viewport الزامی.

## حدود ادعا

axe در jsdom اجرا شده و rule کنتراست رنگ به‌دلیل نبود layout/canvas غیرفعال است. مرورگر تصویری و screenshot/collision check در این محیط وجود نداشت؛ بنابراین visual pass یا color-contrast pass واقعی ادعا نشده است.

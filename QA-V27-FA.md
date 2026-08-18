# گزارش کنترل کیفیت نسخه ۲.۷

## نتیجه

تمام کنترل‌های انتشار این Batch با موفقیت عبور کردند.

| کنترل | نتیجه |
|---|---:|
| TypeScript | Pass |
| ESLint | Pass |
| تست کامل Vitest | ۲۸ فایل و ۱۴۱ تست Pass |
| Build تولیدی Next.js | Pass؛ ۴۶۶ صفحه Static/SSG |
| Smoke نسخه مستقل | Pass |
| Route verification | ۴۶۴ مسیر یکتا Pass |
| Link و asset verification | ۴۶۵ فایل HTML Pass |
| اندازه Standalone HTML | ۴٬۸۷۲٬۸۱۷ بایت |

## پوشش Regression این تغییر

1. بازشدن رزومه از کارت دعوت‌نامه داشبورد فردی.
2. استفاده صفحه دعوت‌نامه‌ها از همان Dialog مشترک.
3. وجود ساختار مقایسه و انتخاب نسخه پایه در تاریخچه پیشنهاد.
4. ورود مستقیم به تنظیمات با Context فردی.
5. حضور هر پنج بخش تنظیمات در اولین Render.
6. خروج از تنظیمات، ورود به داشبورد و بازشدن مجدد تنظیمات در همان Session.
7. Hydration و ناوبری Hash Router در فایل مستقل.

## فرمان‌های اجراشده

```text
npm run typecheck
npm run lint
npm test
npm run build
node scripts/smoke-standalone-interactive.mjs
node scripts/verify-routes.mjs
node scripts/check-links.mjs
```

## معیار پذیرش

- هیچ خطای TypeScript، Lint، Unit/Component یا Build باقی نماند.
- صفحه تنظیمات پیش از تکمیل Route و Session از حالت پوشیده خارج نمی‌شود.
- Action مشاهده رزومه در هر دو Entry point به یک رفتار و یک UI می‌رسد.
- صفحه تاریخچه به Template قدیمی وابسته نیست.

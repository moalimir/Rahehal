# گزارش تحویل نسخهٔ یکپارچهٔ راه‌حل

## نتیجه

- Route Canonical کشف چالش‌ها: `/challenges/`
- Route جزئیات: `/challenges/[challenge-id-or-slug]/`
- هر دو شکل `/challenges` و `/challenges/` و Query Parameterها به Component واحد
  `ChallengeDiscoveryApp` متصل‌اند؛ نسخهٔ قدیمی از مسیر فعال خارج شده است.
- هدر، Hero، Footer و سکشن‌های نامرتبط نسخهٔ پایه حفظ شده‌اند.

## نقاط ورود متصل‌شده

- «چالش‌ها / کشف چالش‌ها» در هدر
- «مشاهده چالش‌ها» در Hero
- «کشف چالش‌ها» در Footer
- «مشاهده همه پروژه‌ها»
- هر چهار کارت دسته‌بندی با `category` صحیح
- لینک جزئیات هر کارت چالش

## قابلیت‌های منتقل‌شده از نسخهٔ استاندارد

- جست‌وجوی نرمال‌شدهٔ فارسی و فیلترهای اصلی
- Drawer فیلترهای تکمیلی، نمایش فیلترهای فعال و پاک‌کردن آن‌ها
- وضعیت Loading و Empty State
- کارت چالش با سازمان، دسته‌بندی، بودجه، مهلت و وضعیت فعال/پایان‌یافته
- ذخیرهٔ محلی و مقایسهٔ حداکثر سه چالش
- Detail Route واقعی و بازگشت با حفظ Query و انتخاب‌ها
- همگام‌سازی URL با `history.pushState`، Back/Forward و Refresh مستقیم

## فایل‌های اصلی تغییرکرده

- `app/page.tsx`
- `app/[...slug]/page.tsx`
- `app/globals.css`
- `app/challenge-flow.css`
- `app/internal.css`
- `components/landing.tsx`
- `components/challenge-discovery.tsx`
- `components/portal-page.tsx`
- `scripts/build-offline-bundle.mjs`
- `scripts/smoke-standalone-interactive.mjs`
- `tests/challenge-discovery.test.tsx`
- `tests/challenge-responsive.test.ts`
- `tests/e2e-navigation.test.tsx`

## فونت و Assetها

- فونت: Estedad با فایل‌های واقعی وزن‌های ۴۰۰، ۵۰۰، ۶۰۰، ۷۰۰ و ۸۰۰؛
  fallback برابر `Tahoma, sans-serif` و `font-synthesis: none`.
- لوگوهای ایرانسل، دیجی‌کالا، اسنپ و اسنپ‌فود از Sprite اصلی
  `public/images/previous-companies.png` استفاده می‌کنند.
- تصاویر مستقل استخراج‌شده از نواحی تصویری طرح‌های مرجع:
  `process-valve.webp`، `process-lab.webp`، `category-energy.webp`،
  `category-health.webp`، `category-design.webp` و `category-research.webp`.
- همهٔ تصاویر زیر Fold دارای ابعاد مشخص، `object-fit: cover`، Lazy Loading و Alt فارسی‌اند.

## کنترل کیفیت

- Viewportهای بررسی‌شده: ۱۷۲۶×۹۱۱، ۱۵۸۶×۹۹۲، ۱۴۴۰×۹۰۰، ۱۲۸۰×۸۰۰،
  ۱۰۲۴×۷۶۸، ۷۶۸×۱۰۲۴ و ۳۹۰×۸۴۴.
- خروجی Screenshot مستقل دسکتاپ/موبایل، Side-by-Side و Overlay برای هر سه سکشن
  در `qa-final/` موجود است.
- تمام عرض‌های Responsive بدون Scroll افقی صفحه Pass شدند.
- Carousel در موبایل با دکمه، صفحه‌کلید، Scroll/Swipe surface و Pagination واقعی Pass شد.
- Routing واقعی شامل Hero، Header، Footer، دکمهٔ همه پروژه‌ها، چهار دسته، Search،
  Filter، Clear، Detail، Back، Forward، حفظ Query، Refresh و موبایل Pass شد.
- Console Error، Page Error، Asset 404 و Hydration Error در اجرای QA: صفر.

## نتیجهٔ تست‌ها

- TypeScript: Pass
- ESLint با `--max-warnings=0`: Pass
- Vitest: ۱۲ فایل و ۵۵ تست Pass
- Next.js Build: Pass؛ ۳۴۳ صفحهٔ Static تولید شد
- Route verification: ۲۳۵ مسیر Pass
- Link/Asset verification: ۳۴۲ فایل HTML Pass
- Offline verification: Pass
- Static smoke: Pass
- Standalone hydration/interaction smoke: Pass

## اجرا

- توسعه: `npm ci && npm run dev`
- Build: `npm run build`
- Preview خروجی Static: `npm start`
- نسخهٔ تک‌فایلی: بازکردن مستقیم `index-updated.html`

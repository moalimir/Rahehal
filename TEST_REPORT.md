# گزارش نهایی تست و Release Gate

تاریخ اجرا: 2026-08-15 — محیط: Node 24، Next.js 15.5.22، React 19.1.1

## نتیجه نهایی

| Gate | نتیجه | شواهد |
|---|---|---|
| Typecheck | PASS | `tsc --noEmit`؛ صفر خطا |
| Lint | PASS | `eslint . --max-warnings=0` |
| Format | PASS | Prettier روی app/components/data/domain/lib/scripts/tests |
| Unit/Component/Integration | PASS | ۲۷ فایل، ۱۳۷ تست |
| Critical cross-role | PASS | ۶ فایل، ۴۲ تست هدفمند |
| Accessibility automated | PASS | ۳ archetype، صفر Critical/Serious؛ contrast rule در jsdom مستثنا |
| Production build | PASS | ۴۶۶ صفحه static generation |
| Route crawl | PASS | ۴۶۴ مسیر خروجی یکتا |
| Link/asset crawl | PASS | ۴۶۵ HTML؛ صفر لینک/Asset شکسته |
| Representative smoke | PASS | ۲۰ مسیر با عنوان/محتوای متمایز |
| Standalone hydration | PASS | Landing، Challenge، Org، University و Auth |
| Offline contract | PASS | یک فایل، بدون دارایی محلی بیرونی |
| P0/P1 باز | PASS | صفر |

## سه دور Regression

### دور ۱ — Baseline پس از اصلاحات معماری

- `tsc --noEmit`: PASS
- `eslint . --max-warnings=0`: PASS
- Vitest: **۲۶ فایل / ۱۳۴ تست PASS**
- هدف: Router، Entity collision، Session، COI، Offer، Payment و Cross-role mutation.

### دور ۲ — Critical flows و خروجی

- Critical suite: **۶ فایل / ۴۲ تست PASS**
- Route crawl: **۴۶۴ PASS**
- Link/asset crawl: **۴۶۵ HTML PASS**
- Standalone exporter یک نقص URL-encoding در Chunk پویا پیدا کرد؛ `localFile` با decode امن و path containment اصلاح و Build تکرار شد.
- Axe: **۳/۳ archetype PASS**، صفر violation با impact critical/serious.

### دور ۳ — Release candidate نهایی

- Typecheck، Lint، Prettier: PASS
- Vitest: **۲۷ فایل / ۱۳۷ تست PASS**
- Next production build: PASS؛ 466 static pages generated.
- Static/Standalone/Offline smoke: PASS.
- Route manifest: 463 canonical crawl entries + root contract؛ 57 legacy redirect و 13 intentionally unavailable.

## پوشش آزمون

| دسته | فایل‌های شاخص |
|---|---|
| Router/Deep link/returnTo | `e2e-navigation.test.tsx`, `routes.test.ts`, `offline-bundle.test.ts` |
| Challenge org→public/solver | `challenge-flow.test.ts`, `challenge-e2e-ui.test.tsx`, `release-contracts.test.ts` |
| Team/role/membership | `solver-team-experience-v19.test.tsx`, `solver-v24-regressions.test.tsx` |
| Proposal/receipt | `flows.test.ts`, `solver-product-flows-v16.test.tsx` |
| Reviewer/COI | `internal-app.test.tsx`, `release-contracts.test.ts` |
| Payment gates | `release-contracts.test.ts`, `domain.test.ts` |
| Organization parity | `organization-parity-v25.test.tsx` |
| Responsive/RTL/spacing | `challenge-responsive.test.ts`, `page-spacing.test.ts`, `v14-visual-fixes.test.ts` |
| Accessibility | `accessibility-release.test.tsx`, ESLint JSX a11y |
| Standalone | `standalone.test.ts`, smoke/verify scripts |

## Performance و اندازه

| معیار | Baseline | نهایی | تغییر |
|---|---:|---:|---:|
| Standalone HTML | 12,556,228 B | 4,849,531 B | **−61.4٪** |
| CSS inline characters | 7,573,676 | 2,446,310 | **−67.7٪** |
| JS inline characters | ≈3.28 MiB | 2,025,112 | کاهش محسوس |
| Next shared first-load JS | — | 103 kB | code split فعال |
| Home first-load JS | — | 286 kB | route chunk مستقل |
| Dynamic route first-load JS | — | 251 kB | route chunk مستقل |

بهینه‌سازی‌های اصلی: Hero WebP، جداکردن ۱۲ logo از Sprite چندمگابایتی، حذف CSS/selector نسل قدیمی، عدم Inline کردن Asset مصرف‌نشده و code splitting خود Next.

LCP/CLS/INP و Lighthouse score در این محیط با صداقت گزارش نمی‌شوند: Cloud Browser اجازه بازکردن فایل مستقل محلی را نداد و policy استفاده از Browser جایگزین را منع کرد. این سنجه‌ها باید در CI/Preview HTTP اندازه‌گیری شوند. بودجه‌های تعریف‌شده در `PRODUCT_QA_AUDIT.md` باقی است.

## Accessibility

- `axe-core` روی فهرست چالش عمومی، داشبورد سازمان و OTP اجرا شد.
- violation با impact `critical` یا `serious`: **۰**.
- Contrast rule در jsdom غیرفعال بود چون layout/canvas واقعی ندارد؛ tokenهای CTA به رنگ تیره‌تر منتقل و CSS/Visual test شده‌اند.
- Skip link، یک H1، landmarks، label/hint/error، focus visible، Dialog focus trap/return، Escape، inert و scroll lock در سورس/کامپوننت تست شده‌اند.

## Console و Runtime

Smoke مستقل Console error، unhandled rejection و Hydration failure را جمع می‌کند و در صورت وجود Fail می‌شود؛ اجرای نهایی PASS بود. Asset 404 و reference محلی بیرونی نیز صفر بود.

## محدودیت‌های واقعی

1. تست Pixel screenshot «بعد» در این محیط قابل Capture نبود؛ شواهد مرجع، DOM/CSS/RTL/responsive assertions و علت محدودیت در `visual-regression/README.md` ثبت شده است.
2. Mock Backend نسخه‌دار برای Demo است؛ Production باید guard، audit و idempotency را سمت سرور نیز enforce کند.

## Integrity

- Standalone SHA-256: `e388184b990f53a41ff1c69dfe5320e8a5bb97f5b89c2962efa80aac0036d79f`
- Hash ZIP منبع پس از بسته‌بندی در فایل `SHA256SUMS.txt` کنار خروجی‌ها ثبت می‌شود.

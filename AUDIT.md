# ممیزی نسخه ورودی و اجرای تکمیل رحّال

تاریخ ممیزی: ۴ اوت ۲۰۲۶  
ورودی‌ها: ZIP فرانت‌اند، Master Prompt v3 و PRD v1.0

## تشخیص نسخه ورودی

| موضوع                  | وضعیت ورودی                                                                                                 | تصمیم اجراشده                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Stack                  | Next.js 15.5.22، React 19.1.1، TypeScript strict                                                            | حفظ کامل Stack و `output: "export"`                                            |
| Router                 | App Router با catch-all و Static Params                                                                     | حفظ معماری و افزودن کاتالوگ‌های عمومی، Auth، Onboarding و canonical `/app/...` |
| Build                  | ۷۷ صفحه Next و ۷۴ route محصول                                                                               | ۱۹۰ صفحه Next و ۱۸۷ route محصول                                                |
| صفحات داخلی            | چهار پوسته نقش‌محور و ۴۳ تجربه UI، همراه aliasهای قدیمی                                                     | حفظ همه صفحات و افزودن Routeهای استاندارد PRD و امکانات مشترک                  |
| صفحات عمومی            | ۸ route؛ سازمان‌ها، پروفایل سازمان، نحوه کار، صفحات مستقل Guide/Legal و Auth جزئی وجود نداشت                | ۴۴ route عمومی/شروع همکاری با تجربه‌های اختصاصی                                |
| ناوبری لندینگ          | یک Anchor محصولی (`/#how`)، کارت سازمان با مقصد عمومی، دسته‌بندی بدون Query، چند لینک Footer با مقصد تکراری | همه مقصدها واقعی، اختصاصی و ثبت‌شده در `LANDING-LINK-MAP.md`                   |
| انتخاب نقش پیش از ورود | Role Switch نمایشی در Header                                                                                | حذف؛ انتخاب نقش فقط در ثبت‌نام و Workspace واقعی پس از ورود                    |
| حالت‌ها                | Loading، Empty، Offline، Permission، Conflict، Error و Closed                                               | حفظ و تست؛ Validation/Auth/OTP/Onboarding نیز تکمیل شد                         |
| تست                    | ۲۸ آزمون، بدون فرمان مستقل E2E                                                                              | ۳۳ آزمون + فرمان `test:e2e` برای ناوبری لندینگ و ۲۵ سناریوی PRD                |
| Preview                | Static Export کامل و HTML لندینگ آفلاین                                                                     | Static Export کامل؛ HTML آفلاین لندینگ نیز حفظ شده است                         |

## Route Inventory پیش از اجرا

- عمومی: ۸ مسیر؛ `/`، چالش‌ها، دو صفحه نقش، اعتماد، راهنما و Auth کلی؛
- سازمان: ۳۵ مسیر شامل ۲۲ صفحه PRD و aliasهای نسخه قبلی؛
- حل‌کننده: ۱۷ مسیر؛
- داور: ۴ مسیر؛
- عملیات: ۱۰ مسیر؛
- جمع: ۷۴ route محصول.

## شکاف‌های قطعی شناسایی‌شده

1. نبود `/organizations` و پروفایل اختصاصی کارت‌های سازمان؛
2. نبود `/how-it-works` مستقل و استفاده Header از Anchor لندینگ؛
3. نبود صفحات مستقل محرمانگی، IP، داوری، پرداخت/اختلاف، Privacy، Terms و Accessibility؛
4. نبود Routeهای جداگانه Login/Register/OTP/Recovery/Verify؛
5. نبود ۱۶ گام Onboarding پایدار سازمان و حل‌کننده؛
6. نبود canonical routeهای `/app/org`، `/app/solver`، `/app/reviewer`، `/app/ops` و مشترک؛
7. کارت‌های شرکت همگی به `/challenges` و کارت‌های دسته همگی بدون فیلتر به یک مقصد می‌رفتند؛
8. Role Switch عمومی با قاعده PRD ناسازگار بود؛
9. `AUDIT.md` و ماتریس کامل لینک لندینگ در بسته نبود؛
10. مرورگر کنترل‌شده محیط در دسترس نبود؛ بنابراین Visual Browser QA نباید Pass اعلام شود.

## Route Inventory پس از اجرا

| پوسته                    | مسیر                                                                                                       |   تعداد | وضعیت                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ------: | -------------------------- |
| عمومی، Auth و Onboarding | `/`, `/challenges`, `/organizations`, `/how-it-works`, `/guides/*`, `/legal/*`, `/auth/*`, `/onboarding/*` |      ۴۴ | پیاده‌سازی و Static Export |
| سازمان                   | `/org/*` و `/app/org/*` به‌همراه Common shell                                                              |      ۷۴ | پیاده‌سازی و Static Export |
| حل‌کننده                 | `/solver/*` و `/app/solver/*`                                                                              |      ۳۶ | پیاده‌سازی و Static Export |
| داور                     | `/reviewer/*` و `/app/reviewer/*`                                                                          |      ۱۱ | پیاده‌سازی و Static Export |
| عملیات                   | `/ops/*` و `/app/ops/*`                                                                                    |      ۲۲ | پیاده‌سازی و Static Export |
| جمع محصول                | همه پوسته‌ها                                                                                               | **۱۸۷** | Pass در `verify:routes`    |

Build شامل ۱۹۰ صفحه است؛ سه صفحه اضافه مربوط به پوسته خانه و صفحات سیستمی Next هستند.

## قرارداد فنی نهایی

- `data/public-product-routes.ts`: Route Contract صفحات عمومی، Auth و Onboarding؛
- `data/internal-routes.ts`: Route Contract صفحات نقش‌محور، canonical و alias؛
- `app/[...slug]/page.tsx`: منبع Static Params و Resolve route؛
- `components/portal-page.tsx`: تجربه‌های اختصاصی Directory/Profile/Process/Policy/Auth/Onboarding؛
- `components/internal/pages.tsx`: تجربه‌های عملیاتی سازمان، حل‌کننده، داور و عملیات؛
- `scripts/verify-routes.mjs`: کنترل وجود HTML تمام ۱۸۷ route؛
- `scripts/check-links.mjs`: کنترل لینک و Asset تمام ۱۸۹ فایل HTML.

## محدودیت واقعی

Agent preview این محیط به سرویس کنترل‌شده دسترسی نداشت. Build، JSDOM، لینک، route، Static HTML و تعامل‌های اصلی تست شدند؛ اما Screenshot و Visual Browser QA چندعرضی Pass اعلام نشده است.

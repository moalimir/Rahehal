# گزارش تغییرات Release Gate

نسخه ورودی فاقد تاریخچه `.git` بود؛ بنابراین Traceability با شناسه تغییر، فایل‌های منبع، آزمون Regression و Hash خروجی ثبت شده است.

## Router و Navigation

| Change | اصلاح | فایل‌های اصلی | Regression |
|---|---|---|---|
| RT-01 | Router مستقل بدون Flash صفحه Landing و با state resolving | `app/page.tsx` | standalone smoke |
| RT-02 | Unknown route به 404 آگاهانه، نه خانه | `app/not-found.tsx`, `components/route-fallbacks.tsx` | route tests |
| RT-03 | Aliasهای قدیمی به Redirect معنایی یا Unavailable صریح تقسیم شدند | `data/legacy-redirects.ts` | release contracts |
| RT-04 | Query، Hash، modifier key، target، download و file links در Standalone حفظ شدند | `lib/routing/standalone-navigation.ts` | e2e navigation |
| RT-05 | Static params تمام Routeهای canonical را export می‌کند | `app/[...slug]/page.tsx` | verify routes |
| RT-06 | `returnTo` امن، allowlisted و Role-aware شد | `lib/auth/return-to.ts`, `components/portal-page.tsx` | auth/e2e tests |
| RT-07 | `space=individual/team` در فهرست و جزئیات فرصت حفظ شد | `components/challenge-discovery.tsx` | solver v21 |
| RT-08 | منوی داور از RV-204 ثابت جدا و Assignment-contextual شد | `components/internal/pages.tsx`, `data/internal-routes.ts` | internal app |

## داده، State و Cross-role

| Change | اصلاح | فایل‌های اصلی | Regression |
|---|---|---|---|
| DM-01 | رفع collision `CH-1405-021` و canonical کردن عنوان/ناشر | `data/mock.ts`, `data/fixtures/internal.ts`, challenge store | release contracts |
| DM-02 | اصلاح Proposalهای متصل به Challenge اشتباه و تثبیت ID نسخه‌ها | fixtures/routes | domain tests |
| DM-03 | Store چالش v7 با Migration، TTL، corruption handling | `lib/challenges/storage.ts` | challenge flow |
| DM-04 | انتشار سازمان به Catalog عمومی و Solver Projection متصل شد | `lib/challenges/public-catalog.ts` | cross-role contract |
| DM-05 | Direct offer Store مشترک؛ پاسخ دوطرفه و Unknown ID=404 | `lib/offers/store.ts` | org parity |
| DM-06 | Command store نسخه‌دار، idempotent و دارای Audit/Receipt | `lib/services/internal-service.ts` | release contracts |
| DM-07 | هشت State machine با Transition contract | `domain/state-machines.ts` | domain/release tests |
| DM-08 | Gate واقعی پرداخت: پذیرش فنی → تأیید مالی → پردازش → پرداخت | `lib/payments/store.ts` | release contracts |
| DM-09 | Draft پیشنهاد بر اساس Challenge و Workspace تفکیک شد | `components/solver-proposal-wizard.tsx` | proposal regressions |

## Security و Privacy

| Change | اصلاح | فایل‌های اصلی | Regression |
|---|---|---|---|
| SEC-01 | حذف رمز، تکرار رمز، OTP و PII از Storage ثبت‌نام | `components/portal-page.tsx` | e2e navigation |
| SEC-02 | Session versioned با TTL و Route/Action guard | `lib/auth/session.ts`, `components/internal/internal-app.tsx` | release contracts |
| SEC-03 | COI assignment-scoped و Guard برای Deep linkهای حساس داور | `lib/reviews/access.ts`, internal pages | internal app |
| SEC-04 | Upload allowlist، MIME/extension/size و filename sanitation | `lib/validation/upload.ts`, challenge fields | release contracts |
| SEC-05 | QA Harness فقط با env + query flag محافظت‌شده | `lib/qa-harness.ts` | release contracts |

## Design System، UX و Accessibility

| Change | اصلاح | فایل‌های اصلی | Regression |
|---|---|---|---|
| DS-01 | یک Sidebar token با عرض 264px و حذف namespaceهای shell مرده | CSS + prune script | architecture test |
| DS-02 | حذف overflow سراسری و رفع علت عرض/ستون | CSS | responsive/page spacing |
| DS-03 | Registry مرکزی Organization identity + fallback Monogram | organization registry/logo | architecture test |
| DS-04 | Dialog manager: focus trap/return، Escape، inert و scroll lock | `components/a11y/dialog-manager.tsx` | accessibility test |
| DS-05 | Skip link، landmark و focus visible | `app/layout.tsx`, CSS | axe regression |
| DS-06 | CTAهای اصلی با contrast و حداقل سطح لمس 44px | design tokens/CSS | visual tests + axe |
| DS-07 | Glossary فارسی برای معیارنامه، شرط عبور، مرحله اجرایی و رسید | `data/product-glossary.ts`, pages | content review |
| DS-08 | تنظیمات در First render با layout-ready و بدون offset دوبل | solver/org settings | internal tests |
| DS-09 | سه ستون فهرست Challenge هم‌ردیف | challenge CSS/component | solver v21 + responsive |
| DS-10 | Stepper OTP/Recovery با خط فقط بین مراحل | auth CSS/component | auth v20/v14 visual |
| DS-11 | دکمه مشاهده رزومه در دعوت تیمی | solver profile experience | solver v24 |
| DS-12 | نقش مدیر منصوب‌شده توسط Owner قابل بازگردانی است | team membership role UI/store | solver v24 |
| DS-13 | توضیح/نمونه برای معماری و داده/زیرساخت راهکار فنی | proposal wizard | proposal tests |
| DS-14 | Modal ارسال نهایی با Confirm سبز، Cancel و مسیر بعد | shared dialog/proposal | flows |

## Build و Performance

| Change | اصلاح | نتیجه |
|---|---|---|
| PF-01 | Hero PNG به WebP | 1.06MB → 62KB |
| PF-02 | Sprite دانشگاه 2.24MB به ۱۲ WebP مصرفی | مجموع ≈20KB |
| PF-03 | حذف CSS referenceهای Sprite و shell مرده | CSS inline 7.57M → 2.45M نویسه |
| PF-04 | Resolver مسیر Assetهای URL-encoded در Standalone | Chunk پویا inline و offline شد |
| PF-05 | Production static export با 466 page generation | Build PASS |
| PF-06 | Standalone یک‌فایلی Hydrate‌شونده | 12,556,228 → 4,849,531 bytes؛ کاهش 61.4٪ |

## Hash خروجی

- Standalone SHA-256: `e388184b990f53a41ff1c69dfe5320e8a5bb97f5b89c2962efa80aac0036d79f`
- Hash ZIP نهایی پس از بسته‌بندی در `TEST_REPORT.md` ثبت می‌شود.

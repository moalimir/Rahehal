# ممیزی و بازطراحی ماژول مسئله‌ها و چالش‌ها

## مبنای فنی

- Stack حفظ‌شده: Next.js 15، React 19، TypeScript strict و `output: export`.
- لندینگ و سایر پوسته‌ها بازطراحی نشدند؛ CTAهای «ثبت مسئله سازمانی» به Route کانونی موجود متصل ماندند.
- پیاده‌سازی قبلی شش‌مرحله‌ای، Access Gate نمایشی، وضعیت‌های سازمانی گسترده، Progress ساختگی و مسیر `/studio/` از ماژول جدید حذف شد.
- Prototype نقش «کاربر سازمانی واردشده» را فرض می‌کند تا مسیر اصلی به Auth نمایشی وابسته نباشد.

## Source of Truth مسیرها

| کاربرد | Route کانونی |
| --- | --- |
| فهرست | `/app/org/challenges/` |
| شروع و گام اول | `/app/org/challenges/new/` |
| ادامه چهار گام | `/app/org/challenges/:id/edit/?step=1..4` |
| پیش‌نمایش | `/app/org/challenges/:id/preview/` |
| رسید | `/app/org/challenges/:id/submitted/` |
| نمای پرونده | `/app/org/challenges/:id/` |

Resolver در `data/challenge-flow-routes.ts` تنها منبع Route این ماژول است. مسیرهای
`/org/challenges/...` به مسیر متناظر Redirect می‌شوند و `/studio/` و `/overview/`
قدیمی به `/edit/` و نمای پرونده منتقل می‌شوند. Routeها با `flatMap` از شناسه‌های
داده تولید می‌شوند و فایل Route تکراری برای رکوردها وجود ندارد.

## تجربهٔ نهایی

- فهرست: چهار Seed معنادار، تب شمارنده‌دار، جست‌وجو، یک فیلتر وضعیت، Empty State،
  Table دسکتاپ/Card موبایل و حذف پیش‌نویس با Dialog.
- گام ۱: هفت فیلد الزامی، فوریت، فایل اختیاری، تولید شناسه و ثبت فوری در فهرست.
- گام ۲: وضعیت فعلی، پیامد، خروجی، دامنه، محدودیت، امکانات سازمان و Repeater یک تا سه معیار.
- گام ۳: خروجی، مدل جذب، مشارکت‌کنندگان، نوع/شیوه همکاری، زمان و بودجه؛ مبلغ و دعوت‌شوندگان شرطی‌اند.
- گام ۴: سطح نمایش، خلاصه عمومی شرطی، NDA، مالکیت فکری، تماس، تأیید صحت و Accordion حقوقی.
- Preview از همان `ChallengeRecord` می‌خواند؛ ارسال ناقص غیرفعال و هر خطا به گام مربوط پیوند دارد.
- ارسال، State را به `under_review` تغییر می‌دهد؛ رسید و فهرست همان تغییر را نمایش می‌دهند.

## داده و State

- Schema مرکزی: `domain/challenge.ts`.
- وضعیت‌ها: `draft`، `ready`، `under_review`، `needs_changes`، `published` و `closed`.
- Repository: `lib/challenges/storage.ts`.
- Persistence: کلید `rahhal.organization-challenges.v6` در `localStorage`.
- فایل‌ها در Prototype فقط به‌صورت metadata ذخیره می‌شوند.
- Reset غیرمزاحم توسعه: `window.rahhalChallengeDemo.reset()`.
- Validation مشترک فرم و Preview: `lib/challenges/validation.ts`.

## UI و Responsive

- App Shell فشرده ۶۴ پیکسلی، محتوای حداکثر ۱۱۶۰ پیکسل، Header چسبان بدون پوشاندن محتوا.
- فقط document/body اسکرول عمودی دارد؛ `overflow-y` محدود به Dialog است.
- فرم حداکثر دو ستون و در موبایل یک ستون است؛ Stepper زیر ۷۶۸ پیکسل به «گام X از ۴» تبدیل می‌شود.
- Table زیر ۷۶۸ پیکسل به Card تبدیل می‌شود و Action Bar ثابت وجود ندارد.
- Focus visible، Skip link، fieldset/legend، aria-invalid، Dialog focus trap و `prefers-reduced-motion` اعمال شده‌اند.

## Standalone

`index.html` از همان Chunkهای Production React ساخته می‌شود. CSS، JavaScript و فونت‌ها
داخل همان فایل هستند؛ صفحهٔ اصلی کامپایل‌شده مستقیماً mount می‌شود و Hash Router فقط
برای اجرای بدون Server استفاده می‌شود. CTA، فرم، Local Storage، Validation، Preview،
Receipt و List در فایل مستقیم فعال‌اند.

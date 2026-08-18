# ردیابی PRD به فرانت‌اند رحّال

این سند ردیابی نسخهٔ ۱.۰ «Product Source of Truth» به کد جاری است. پوشش به معنای
پیاده‌سازی UX و قرارداد فرانت‌اند با دادهٔ نمایشی است؛ اجرای واقعی احراز، امضا،
پرداخت، اعلان و Audit به Backend نیاز دارد.

## نقش‌ها و پوسته‌ها

| نقش         | پوسته                   | routeهای شاخص                                        | کنترل حیاتی                            |
| ----------- | ----------------------- | ---------------------------------------------------- | -------------------------------------- |
| عمومی       | لندینگ و صفحات اطلاعاتی | `/organizations`، `/how-it-works`، `/trust-security` | بدون افشای دادهٔ محرمانه               |
| شروع همکاری | Auth و Wizard پایدار    | `/auth/*` و `/onboarding/*`                          | returnTo، Validation، Resume و Receipt |
| سازمان      | App Shell سازمان        | `/app/org/*` و aliasهای `/org/*`                     | Gate انتشار، تصمیم و پذیرش             |
| حل‌کننده    | App Shell حل‌کننده      | `/app/solver/*` و aliasهای `/solver/*`               | Eligibility، نسخه و شواهد              |
| داور        | پنل مستقل داور          | `/app/reviewer/*`                                    | اظهار تعارض پیش از امتیاز              |
| عملیات      | مرکز عملیات             | `/app/ops/*`                                         | SLA، Reason Code و audit trail         |

## ماژول‌های M01 تا M18

| ماژول                 | پیاده‌سازی محوری                                            |
| --------------------- | ----------------------------------------------------------- |
| M01 هویت و اعتماد     | `/auth/*`، دو Onboarding، احراز و `/app/ops/verification`   |
| M02 Workspace         | چهار App Shell، تعویض فضای کاری و نقش‌های جدا               |
| M03 Challenge Studio  | intake، triage، استودیوی چهارحوزه‌ای، autosave، diff و Gate |
| M04 کشف و انتشار      | دایرکتوری عمومی، فرصت‌های حل‌کننده و quality gate           |
| M05 Matching          | متخصصان، دعوت، امتیاز تناسب توضیح‌پذیر و ظرفیت              |
| M06 تیم               | تیم و دسترسی سازمان، تیم حل‌کننده، consent و مالکیت         |
| M07 Data Room         | NDA، دسترسی زمان‌مند، watermark و log نمایشی                |
| M08 Submission        | سازنده پیشنهاد، Inbox، نسخه، شواهد و clarification          |
| M09 ارزیابی و تصمیم   | پنل داور، review room، compare و decision room              |
| M10 قرارداد و IP      | مقایسه بند، وضعیت حقوقی و امضا                              |
| M11 مالی              | مالی پرونده، پرداخت حل‌کننده و عملیات پرداخت                |
| M12 پایلوت            | milestone، KPI، تحویل، پذیرش و ریسک                         |
| M13 اعتبار            | reputation حل‌کننده و moderation عملیات                     |
| M14 Analytics و اثر   | dashboard، گزارش، baseline، ROI و close gate                |
| M15 عملیات و پشتیبانی | صف عملیات، اختلاف، پشتیبانی و سلامت سامانه                  |
| M16 یکپارچه‌سازی      | سرویس Mock async، خطا، retry و مرز آمادهٔ API               |
| M17 AI مسئولانه       | Match توضیح‌پذیر؛ تصمیم و eligibility انسانی                |
| M18 بومی‌سازی         | RTL، فارسی، تومان، Bidi، ARIA و reduced motion              |

## فلوهای F01 تا F23

| بازه                        | routeها و شاهد اصلی                                            |
| --------------------------- | -------------------------------------------------------------- |
| F01–F04 فعال‌سازی تا انتشار | `/auth/*`، `/onboarding/*`، intake، Studio و publication gate  |
| F05–F08 دسترسی تا Data Room | challenge detail، opportunities، teams و data room             |
| F09–F12 Q&A تا داوری        | conversations، proposal builder/inbox، reviewer conflict/score |
| F13–F16 تصمیم تا پرداخت     | compare، decision، contract و finance/payments                 |
| F17–F21 پایلوت تا اثر       | pilot، deliverables، impact، history و disputes                |
| F22–F23 scouting و incident | experts، opportunities، ops queue و system health              |

## ۱۵ سناریوی End-to-End

کاتالوگ اجرایی این موارد در `data/flow-coverage.ts` و آزمون متناظر در
`tests/flows.test.ts` نگهداری می‌شود:

1. ثبت مسئله تا پرونده؛
2. احراز و انتشار کنترل‌شده؛
3. تطبیق و دعوت متخصص؛
4. ساخت و ارسال پیشنهاد؛
5. غربال و مقایسه؛
6. اظهار تعارض داور؛
7. امتیاز و ثبت نهایی؛
8. پایش دور داوری؛
9. تصمیم و صورت‌جلسه؛
10. قرارداد و IP؛
11. پایلوت و milestone؛
12. تحویل و پذیرش؛
13. آزادسازی پرداخت؛
14. اندازه‌گیری اثر؛
15. ممیزی و اختلاف.

## ۱۰ سناریوی منفی

Permission نامعتبر، Gate ناقص، تعارض داور، پیشنهاد ناقص، انتخاب کمتر از دو
پیشنهاد، تصمیم بدون دلیل، پرداخت پیش از پذیرش، conflict نسخه، offline و
error/empty در همان کاتالوگ پوشش ثبت شده‌اند. State selector هر پوسته امکان
بازبینی Loading، Empty، Offline، Permission، Conflict، Error و Closed را می‌دهد.

## الزامات غیرعملکردی

- Static Export، trailing slash و دارایی کاملاً محلی؛
- مجوز مرکزی deny-by-default در `domain/product.ts`؛
- state transition مرکزی و Gateهای typed؛
- H1 یکتا، landmark، skip link، focus visible، Dialog با focus trap و Escape؛
- Drawer موبایل، جدول scroll-safe، grid تک‌ستونه در عرض کم و `prefers-reduced-motion`؛
- شناسه و کد فنی با Bidi isolation و متن/مبلغ فارسی؛
- لندینگ تأییدشده با محتوای بصری حفظ شده و فقط مقصد لینک‌ها/semantics ناوبری اصلاح شده است.

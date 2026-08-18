# گزارش کنترل کیفیت نسخه MVP

تاریخ: ۶ اوت ۲۰۲۶  
دامنه: ماژول «مسئله‌ها و چالش‌های سازمانی» و خروجی Static/Standalone

## نتایج نهایی

| کنترل | نتیجه |
| --- | --- |
| `npm run lint` | Pass؛ بدون هشدار |
| `npm run typecheck` | Pass؛ بدون خطا |
| `npm test` | Pass؛ ۱۱ فایل و ۵۲ آزمون |
| `npm run build` | Pass؛ ۳۲۰ صفحه Static تولید شد |
| `npm run test:smoke` | Pass؛ Routeهای نماینده با HTTP 200، Title و H1 |
| `npm run verify:routes` | Pass؛ ۲۳۵ Route فهرست‌شده و فایل مستقل |
| `npm run verify:links` | Pass؛ ۳۱۹ HTML و لینک/Asset داخلی |
| `npm run verify:offline` | Pass؛ بدون Asset بیرونی محلی |
| `npm run test:standalone-interactive` | Pass؛ اجرای مستقیم فایل، Hydration و ورود CTA به فرم |

## سناریوهای اجراشده در آزمون UI

- کلیک CTA و ورود به ثبت اولیه؛
- تکمیل گام اول، تولید `CH-DRAFT-001` و Persistence؛
- تکمیل گام دوم و افزودن معیار موفقیت؛
- مدل خصوصی و نمایش شرطی دعوت‌شوندگان؛
- بودجه مبلغ مشخص و نمایش شرطی مبلغ/واحد؛
- ورود به Preview با خلاصه عمومی ناقص و Block شدن ارسال؛
- بازگشت به گام چهار، اصلاح خطا و فعال‌شدن ارسال؛
- Confirmation Dialog، ارسال، رسید و گذار به `under_review`؛
- بازگشت به فهرست و مشاهده رکورد جدید؛
- جست‌وجو، فیلتر، بازکردن نمای پرونده و خط زمانی؛
- حذف پیش‌نویس Seed با Dialog تأیید؛
- قواعد شرطی، Route resolver، Redirect `/studio/`، Local Storage و Status mapping در آزمون‌های خالص.
- قواعد CSS برای Breakpointهای ۱۰۲۴، ۷۶۸ و ۵۶۰، تبدیل فهرست به Card، تک‌ستونه‌شدن فرم، نبود Action Bar ثابت و محدودبودن `overflow-y` مستقل به Dialog.

## Responsive و اسکرول

CSS برای عرض‌های دسکتاپ، ۱۰۲۴، ۷۶۸ و موبایل زیر ۵۶۰ پیکسل تعریف شده است؛ بنابراین
۳۹۰ و ۳۶۰ پیکسل داخل Breakpoint موبایل قرار می‌گیرند. فرم تک‌ستونه، Stepper خلاصه،
کارت موبایل فهرست و منوی جمع‌شونده در CSS پیاده شده‌اند. هیچ Container اصلی `100vh`
با `overflow-y` ندارد و تنها Dialog اجازه اسکرول عمودی مستقل دارد.

## محدودیت آزمون مرورگر و Screenshot

مرورگر ابری انتخاب و راه‌اندازی شد، اما سیاست URL آن هم `localhost` را با
`ERR_BLOCKED_BY_CLIENT` و هم `file://` را صریحاً مسدود کرد و اجازه استفاده از سطح
مرورگر جایگزین را نیز نداد. بنابراین تست بصری واقعی Viewportهای ۱۴۴۰×۹۰۰،
۱۰۲۴×۷۶۸ و ۳۹۰×۸۴۴ و Screenshot **Pass اعلام نشده‌اند و تصویر ساختگی تولید نشده است**.
به‌جای آن، E2E تعاملی Component، اجرای مستقیم Standalone، HTTP Smoke، DOM، Route،
Link/Asset و CSS responsive اجرا شده‌اند.

## محدودیت‌های واقعی محصول

- Backend وجود ندارد و Persistence دستگاه‌محور است.
- فایل Upload فقط metadata نگه می‌دارد، نه محتوای باینری.
- Static Export برای چهار Seed و هشت شناسه پیش‌نویس از pool داده‌محور Route می‌سازد؛
  در نسخه Backend باید Dynamic Route نامحدود و شناسه سمت سرور جایگزین شود.
- همگام‌سازی چندکاربره، مجوز واقعی و ارسال فایل به سرویس خارج از دامنه این MVP است.

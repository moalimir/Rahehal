# ماتریس نهایی QA مسیر و Viewport

تاریخ اجرا: ۱۴۰۵/۰۵/۲۶ — نسخه ۲.۸.۰

| گروه مسیر | تعداد خروجی HTML | Build / Link / Asset | قرارداد Responsive |
|---|---:|---|---|
| عمومی | ۵۲ | PASS | PASS-CSS در ۸ اندازه |
| احراز و ثبت‌نام | ۲۸ | PASS | PASS-CSS در ۸ اندازه |
| حل‌کننده Canonical | ۹۰ | PASS | PASS-CSS در ۸ اندازه |
| سازمان Canonical | ۱۰۱ | PASS | PASS-CSS در ۸ اندازه |
| داور Canonical | ۱۹ | PASS | PASS-CSS در ۸ اندازه |
| عملیات Canonical | ۲۳ | PASS | PASS-CSS در ۸ اندازه |
| مشترک Canonical | ۱۱ | PASS | PASS-CSS در ۸ اندازه |
| Legacy Redirect | ۱۳۰ | PASS | PASS-CSS در ۸ اندازه |
| **کل** | **۵۰۳** | **PASS** | **قرارداد CSS پاس** |

## Viewportهای کنترل‌شده در قرارداد CSS

- 1440×900
- 1280×800
- 1024×768
- 768×1024
- 480×900
- 390×844
- 360×800

## معنی وضعیت‌ها

- **PASS:** فایل Static Export معتبر است، Route در خروجی وجود دارد و Crawl لینک/دارایی آن شکست نداشته است.
- **PASS-CSS:** قواعد مشترک Responsive، RTL، Grid/Flex و Overflow برای این اندازه در Source/Contract Audit پاس شده‌اند؛ این برچسب معادل Visual Screenshot Pass نیست.
- ماتریس ریز تمام مسیرها در `ROUTE-VIEWPORT-QA.csv` قرار دارد.

## Gateهای اجراشده

- ۱۷۶/۱۷۶ تست Vitest در ۳۱ فایل و ۷۰ suite
- TypeScript بدون خطا
- ESLint بدون هشدار
- ۵۰۳ فایل HTML معتبر در Static Export
- Crawl همهٔ لینک‌های داخلی و دارایی‌ها
- Smoke مسیرهای نمایندهٔ عمومی، احراز، حل‌کننده، سازمان، داور و عملیات
- Standalone تک‌فایلی، Hydration، Hash Router و اجرای آفلاین
- کف تایپوگرافی ۱۲px و توکن واحد `--app-sidebar-width`
- یکتایی Shell و Navigation در تست رگرسیون معماری

## محدودیت محیط اجرای تصویری

سرویس Preview تصویری این نشست در دسترس نبود؛ بنابراین ستون‌های Viewport حاصل Contract Audit هستند، نه Screenshot/Collision Check مرورگر. تصاویر نهایی تولید نشده‌اند و این مورد تنها Gate باز این تحویل است.

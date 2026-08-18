# راهنمای طراحی اپ داخلی رحّال

## زبان بصری

اپ داخلی روی زمینهٔ خنثی `#f4f7fa`، سطح سفید و متن سرمه‌ای ساخته شده است. رنگ
اصلی سازمان آبی، حل‌کننده آبی/فیروزه‌ای، داور بنفش و عملیات سبزآبی است. سبز برای
موفقیت، کهربایی برای نیازمند توجه و قرمز فقط برای خطر یا توقف استفاده می‌شود.

## توکن‌های محوری

| کاربرد     | توکن           | مقدار         |
| ---------- | -------------- | ------------- |
| متن        | `--app-ink`    | `#14243b`     |
| متن ثانویه | `--app-muted`  | `#65748a`     |
| Canvas     | `--app-canvas` | `#f4f7fa`     |
| Border     | `--app-line`   | `#dce4ed`     |
| Action     | `--app-blue`   | وابسته به نقش |
| موفقیت     | `--app-green`  | `#07866f`     |
| هشدار      | `--app-amber`  | `#ad6504`     |
| خطر        | `--app-red`    | `#c1384f`     |

## اجزای پایه

- `Panel`: سطح محتوایی با header، توضیح و action اختیاری؛
- `MetricCard`: عدد، زمینه، روند و رنگ معنایی؛
- `StatusBadge`: متن + رنگ؛ وضعیت هرگز فقط با رنگ منتقل نمی‌شود؛
- `CaseHeader` و `CaseNav`: شناسه، وضعیت، مالک، محرمانگی و مسیر مرحله‌ای؛
- `GateChecklist`: نتیجه و شاهد هر Gate؛
- `ConfirmDialog`: تأیید اقدام حساس، focus trap و Escape؛
- `ReceiptPanel`: رسید، نسخه و قابلیت پیگیری؛
- `StateNotice`: loading/empty/offline/permission/conflict/error/closed.

## الگوهای صفحات عمومی و شروع همکاری

- `OrganizationDirectory/Profile`: جست‌وجو، اعتبار نمونه، سیاست همکاری و فرصت‌های سازمان؛
- `ProcessTimeline`: انتخاب نقش و مرحله‌های Gateمحور نحوه کار؛
- `PolicyLayout`: فهرست محتوای چسبان، مقاله مستقل و CTA مرتبط؛
- `AuthRoute`: Login، Register، OTP، Recovery و Verify با خطای امن؛
- `OnboardingExperience`: Progress، Validation، Draft، Back/Next، Resume و Receipt.

## قواعد RTL و محتوا

- متن و چیدمان اصلی RTL است؛ شناسه، ایمیل و کد با `<bdi>` یا `dir="ltr"` ایزوله
  می‌شود.
- CTA با فعل روشن نوشته می‌شود و اقدام غیرفعال علت قابل‌مشاهده دارد.
- نام‌های نمونه با عبارت «نمونه» مشخص‌اند؛ هیچ داده‌ای به مشتری واقعی نسبت داده
  نمی‌شود.
- تومان با formatter مرکزی و اعداد با locale فارسی نمایش داده می‌شوند.

## Responsive و دسترس‌پذیری

- از ۱۰۲۴ پیکسل، ستون‌ها فشرده و از ۷۶۸ پیکسل Sidebar به Drawer تبدیل می‌شود؛
- در ۴۸۰ پیکسل کارت‌ها تک‌ستونه و Action bar عمودی می‌شود؛
- جدول‌ها container اسکرول دارند و body اسکرول افقی نمی‌گیرد؛
- tap target عملی حداقل ۴۴ پیکسل، focus ring واضح و motion قابل کاهش است؛
- Dialog، Toast، landmark، label، aria-current و aria-disabled معنایی‌اند.

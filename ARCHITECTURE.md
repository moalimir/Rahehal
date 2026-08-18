# معماری فرانت‌اند داخلی رحّال

## جریان کانونی ثبت مسئله سازمانی

- `domain/challenge.ts`: قرارداد کوچک و مرکزی Challenge Record، شش وضعیت MVP، معیار موفقیت، همکاری، بودجه، دسترسی و مالکیت فکری.
- `lib/challenges/storage.ts`: Repository ذخیره محلی، Seedهای معنادار، ایجاد شناسه، Attachment metadata و گذار ارسال.
- `lib/challenges/validation.ts`: قواعد مشترک چهار گام و آمادگی ارسال؛ Preview و فرم از یک Rule set استفاده می‌کنند.
- `components/challenge-flow/*`: App shell فشرده، List، Intake، Edit Wizard، Preview، Submitted و Detail.
- `data/challenge-flow-routes.ts`: تنها Route resolver این فلو و Redirectهای مسیرهای قدیمی.

جزئیات Audit در `CHALLENGE-FLOW-AUDIT.md` ثبت شده است.

## لایه‌ها

1. `data/public-product-routes.ts` قرارداد صفحات عمومی، Auth و Onboarding را نگه می‌دارد.
2. `data/internal-routes.ts` قرارداد route، نقش، تجربه، canonical و alias هر صفحه داخلی را نگه می‌دارد.
3. `app/[...slug]/page.tsx` فقط route را resolve و Static Params را تولید می‌کند.
4. `components/internal/internal-app.tsx` پوستهٔ نقش، ناوبری، state demo و چرخه اقدام
   را مدیریت می‌کند.
5. `components/internal/pages.tsx` تجربه‌های اختصاصی هر مرحله را رندر می‌کند.
6. `domain/product.ts` مجوزها، Gateها و transitionهای قابل‌آزمون را متمرکز می‌کند.
7. `lib/services/internal-service.ts` مرز ناهمگام موفقیت/آفلاین/conflict/error است.

## تصمیم‌های کلیدی

- Routeها data-driven هستند، اما محتوای داخلی هر تجربه به صفحهٔ اختصاصی سپرده شده؛
  بنابراین افزودن route الزاماً به بازگشت قالب عمومی منجر نمی‌شود.
- لندینگ و اپ داخلی CSS جدا دارند. تمام selectorهای جدید زیر `.app-shell` namespaced
  شده‌اند تا نسخهٔ تأییدشدهٔ صفحهٔ اول رگرسیون نگیرد.
- سیاست مجوز deny-by-default است: عضویت فعال، عضویت پرونده، نقش و در اقدام‌های حساس
  2FA باید هم‌زمان معتبر باشند. داور تا اظهار تعارض اجازه Review ندارد.
- transitionهای پرونده لیست سفید دارند و پرش مستقیم بین مرحله‌ها مجاز نیست.
- فعل حساس ابتدا Dialog تأیید را باز می‌کند، سپس Mock Service رسید و correlation id
  تولید می‌کند. جایگزینی سرویس با API به بازنویسی UI نیاز ندارد.

## اتصال Backend

پیاده‌سازی جدید باید قرارداد `performDemoAction` را با client واقعی جایگزین کند و
حالت‌های `offline`، `conflict` و `error` را به خطاهای استاندارد API نگاشت دهد.
Permission واقعی باید در Backend enforce شود؛ کنترل فرانت فقط UX و کاهش خطاست.
شناسه رسید، نسخه و Reason Code باید از پاسخ سرور دریافت شوند.

## Static Export و Standalone

پروژه از Server Component صرفاً برای تولید route استفاده می‌کند و App داخلی در
مرز Client اجرا می‌شود. Server Action، API Route، تصویر remote و fetch زمان Build
وجود ندارد؛ بنابراین تمام مسیرها به HTML مستقل در `out/` تبدیل می‌شوند.

`scripts/build-offline-bundle.mjs` صفحهٔ اصلی و همان Chunkهای کامپایل‌شده React را
داخل `index.html` قرار می‌دهد و Component صفحه را مستقیماً mount می‌کند؛ در نتیجه
نسخهٔ تک‌فایلی پیاده‌سازی جداگانه یا HTML نمایشی نیست. مسیرهای ماژول در این فایل با
Hash مدیریت می‌شوند و داده همچنان در `localStorage` همان مرورگر می‌ماند.

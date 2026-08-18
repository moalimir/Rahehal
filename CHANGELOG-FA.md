# تغییرات نسخه ۲.۹.۰ — اصلاحات بازخورد مدیر محصول

## اعمال شد

- محتوای hero داشبورد در RTL از ابتدای سمت راست قرار گرفت و فضای خالی ناخواسته حذف شد.
- «فضای شخصی/فضای تیم» در hero از ظاهر دکمه خارج و به برچسب context معنایی تبدیل شد.
- چهار کارت «خلاصه وضعیت راه‌حل‌ها» هم‌تراز و وسط‌چین شدند و هر کارت CTA واقعی به فهرست پیشنهادهای فیلترشده دارد.
- ارتفاع و حداقل touch target کنترل‌های تعاملی Solver روی ۴۴ پیکسل یکدست شد، بدون تغییر بخش سازمان و نقش‌های دیگر.
- جهت پیکان «ذخیره و ادامه» در wizard راهکار فنی برای RTL اصلاح شد؛ ذخیره موفق همچنان مرحله بعد را باز می‌کند.
- اعلان‌های عملیات Solver از پایین به بالای viewport منتقل شدند و دکمه بستن در ابتدای RTL (سمت راست) قرار گرفت.
- رزومه تیم دعوت‌کننده از صفحه دعوت‌ها با قالب کامل، داده canonical، دریافت PDF نمونه و وضعیت احراز واقعی باز می‌شود.
- تاریخچه نسخه پیشنهاد با timeline، انتخاب نسخه مبنا و diff واقعی field-level از `ProposalVersion.content` بازسازی شد.

## بررسی و بدون تغییر باقی ماند

- تنظیمات تیم در نسخه ۲.۸ از قبل actionهای «ذخیره تغییرات/انصراف» را در header درست داشت.
- پروفایل canonical فقط یک action region دارد و جریان استاندارد شش‌بخشی، snapshot انصراف، preview عمومی، privacy و upload را از قبل پوشش می‌داد.
- ذخیره و ادامه proposal از قبل mutation و navigation مرحله بعد را در یک handler انجام می‌داد.
- کارت‌های فرصت از قبل spacing و min-height یکسان داشتند و خط جداکننده بی‌دلیل در projection فعلی وجود نداشت.

## تست

- آزمون‌های جدید نسخه ۲۹ برای RTL داشبورد، CTAهای فیلترشده، رزومه دعوت، diff نسخه‌ها، ارتفاع کنترل، جهت پیکان و موقعیت toast اضافه شد.
- انتظارهای قدیمی که metadata نمایشی نسخه‌ها را تثبیت می‌کردند، با assertions مبتنی بر محتوای canonical جایگزین شدند.

---

# تغییرات نسخه ۲.۸.۰ — Solver فردی و تیمی

## افزوده شد

- registry canonical برای یک کاربر، فضای شخصی، سه تیم با دو عضویت active متفاوت، دعوت‌ها، درخواست‌ها، فرصت‌ها، پیشنهادها، offerها و پرونده‌ها.
- workspace switcher واقعی با نمایش جداگانه نام انسان، نام workspace و نقش عضویت.
- repository نسخه‌دار v3، migration امن، receipt/audit، idempotency و همگام‌سازی cross-tab.
- route context واحد برای URL عادی و standalone hash با حفاظت unknown/no-access.
- ساخت تیم، دعوت/درخواست عضویت، roster، role، assignment، suspend/restore/leave/transfer/archive.
- eligibility ساخت‌یافته و workspace-scoped، saved مستقل و filter/sort/page مبتنی بر URL.
- draft/preview/submit/version/revision پیشنهاد از یک source of truth و upload نمونه کامل.
- direct offer با viewed/response draft/response submitted/decline reason و جداسازی recipient workspace.
- پروفایل فرد و تیم، public preview، privacy، snapshot cancel، settings واقعی و verification entity-scoped.
- اعلان‌ها، هاب پرونده، پیام، پایلوت، تحویل، پرداخت، NDA/Data Room، قرارداد، closure و feedback یک‌باره.
- آزمون‌های RBAC، isolation، migration، state machine، accessibility، responsive contract و standalone interactive.

## اصلاح شد

- نام current user دیگر با تغییر workspace عوض نمی‌شود.
- لینک‌های ثابت `TEAM-21` و `PR-104` از actionهای component حذف و routeها data-driven شدند.
- direct offer با مشاهده یا شروع پاسخ accepted/selected نمی‌شود.
- درصدهای تطابق نمایشی از UI Solver حذف و دلیل‌های قابل توضیح جایگزین شدند.
- badge دعوت/درخواست از داده واقعی مشتق می‌شود.
- فایل محرمانه پیش از پذیرش NDA در DOM قرار نمی‌گیرد.
- جدول dashboard و tabهای مدیریت تیم از نظر ARIA اصلاح شدند.
- drawer موبایل focus trap، Escape، focus return، `aria-controls` و touch target ۴۴px دارد.
- smoke ثبت‌نام/ورود و standalone از انتظارهای قدیمی «حساب تیمی» و route ثابت پاک شد.

## سازگاری

- Landing و workspaceهای سازمانی/Reviewer/Ops از نظر محصولی و بصری تغییر نکرده‌اند.
- storeهای قدیمی مشترک سازمان برای backward compatibility حفظ شده‌اند؛ Solver canonical از repository v3 استفاده می‌کند.

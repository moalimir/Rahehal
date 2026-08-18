# ممیزی نهایی محصول و کیفیت

تاریخ: ۱۴۰۵/۰۵/۲۴ — وضعیت Release Gate

سه ممیزی مستقل baseline در `reports/baseline/` نگهداری شده‌اند. یافته‌های تکراری آن‌ها در جدول زیر Normalize شده‌اند. نتیجه نهایی: **هیچ P0 یا P1 بازی باقی نمانده است**.

## دفتر نقص‌ها

| ID | Severity | Role | Route | State | Viewport | شرح | Evidence | Root cause | Fix | Regression test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-001 | P0 | همه | Challenge routes | populated | همه | `CH-1405-021` دو هویت داشت | baseline domain/route | seedهای موازی | canonical store/registry | release-contracts | Fixed |
| QA-002 | P0 | org/solver | Proposal routes | populated | همه | Proposal به Challenge اشتباه متصل بود | baseline domain | رابطه رشته‌ای/seed تکراری | رابطه ID و fixture canonical | domain/flows | Fixed |
| QA-003 | P0 | همه | unknown route | error | همه | مسیر ناشناخته خانه را نشان می‌داد | baseline route | fallback عمومی Router | ProductNotFound + Next notFound | route tests | Fixed |
| QA-004 | P0 | همه | legacy routes | redirect | همه | Redirectهای نامرتبط فلوها را ادغام می‌کرد | baseline route | mapping یک‌بعدی | redirect/unavailable معنایی | release-contracts | Fixed |
| QA-005 | P0 | standalone | deep links | hydration | همه | Router و HTML مستقل stale/flash داشت | baseline route | تشخیص route در effect | resolver واحد + resolving state | standalone smoke | Fixed |
| QA-006 | P0 | guest | register/auth | draft | همه | رمز و PII در Session Storage بود | baseline security | persistence کل فرم | whitelist Draft v2 | e2e-navigation | Fixed |
| QA-007 | P0 | internal | `/app/*` | permission | همه | Route و Action guard قابل اتکا نبود | baseline security | role فقط در UI | session/role/action guard | release-contracts | Fixed |
| QA-008 | P0 | reviewer | score/materials | permission | همه | COI با Deep link دور زده می‌شد | baseline security | guard غیر assignment-scoped | ReviewerProtected + COI store | internal-app | Fixed |
| QA-009 | P0 | همه | action pages | success | همه | Toast بدون Mutation/Receipt | baseline domain/system | demo handler stateless | idempotent command store | release-contracts | Fixed |
| QA-010 | P0 | org/solver | publish/catalog | success | همه | انتشار سازمان در Solver/Public دیده نمی‌شد | baseline domain | storeهای جدا | public-catalog projection | release-contracts | Fixed |
| QA-011 | P0 | org/ops | payment | guarded | همه | Gate پرداخت enforce نمی‌شد | baseline domain | state متنی | payment state store | release-contracts | Fixed |
| QA-012 | P1 | solver/org | offer detail | error | همه | ID ناشناخته به OFF-211 fallback می‌کرد | baseline domain | default fixture | NotFound + fixed ID pool | release-contracts | Fixed |
| QA-013 | P1 | org | auth | redirect | mobile/desktop | `returnTo` سازمان در Standalone گم می‌شد | baseline route | query reader HTTP-only | hash-aware allowlist | e2e-navigation | Fixed |
| QA-014 | P1 | solver | opportunities | navigation | همه | `space` در ناوبری حذف می‌شد | baseline route | لینک‌های بدون context | URL-preserved space | solver-v21 | Fixed |
| QA-015 | P1 | shared | `/app/messages` etc. | permission | همه | صفحات مشترک با shell سازمان باز می‌شد | baseline route | role route به‌جای session | active session role | release-contracts | Fixed |
| QA-016 | P1 | reviewer | assignments | navigation | همه | منو به RV-204 ثابت بود | baseline route | record steps در global nav | nav دامنه‌ای + context record | internal-app | Fixed |
| QA-017 | P1 | auth/public | initial route | hydration | همه | Landing لحظه‌ای قبل route دیده می‌شد | baseline route | default route `/` | route=null تا commit | standalone smoke | Fixed |
| QA-018 | P1 | auth | OTP/recovery | navigation | همه | لینک پشتیبانی `/contact` شکسته بود | baseline route | route تعریف‌نشده | contact canonical | link crawl | Fixed |
| QA-019 | P1 | همه | persistent state | refresh | همه | Storeهای بدون version/migration | baseline domain | local keys پراکنده | version/TTL/migration/event | release-contracts | Fixed |
| QA-020 | P1 | org/solver | direct offer | cross-role | همه | پاسخ دوطرفه همگام نبود | baseline domain | fixtureهای جدا | shared offer store | org parity | Fixed |
| QA-021 | P1 | team owner | members | action | desktop/mobile | مدیر منصوب‌شده قابل تنزل نبود | user evidence | مدیر و Owner یکسان فرض شده | owner-only protection | solver-v24 | Fixed |
| QA-022 | P1 | solver/org | settings | initial render | desktop | صفحه تا Refresh ناقص بود | user evidence | offset/hydration دوگانه | stable layout-ready | internal/solver regressions | Fixed |
| QA-023 | P1 | solver | challenge list | list | desktop | سه ستون یک Challenge هم‌ردیف نبود | user evidence | block alignment مستقل | row grid contract | responsive/solver-v21 | Fixed |
| QA-024 | P1 | guest | OTP/recovery | default | desktop/mobile | خط Stepper بیرون مراحل کشیده می‌شد | user evidence | pseudo-line full width | connector فقط بین items | auth-v20/v14 | Fixed |
| QA-025 | P1 | همه | modal/drawer | keyboard | همه | Focus trap/return یکنواخت نبود | baseline a11y | modalهای مستقل | dialog manager/shared dialog | axe + component tests | Fixed |
| QA-026 | P1 | team | invitations | populated | همه | مشاهده رزومه موجود نبود | user evidence | CTA ناقص | Resume/Profile CTA | solver-v24 | Fixed |
| QA-027 | P1 | solver | challenge detail | file | همه | فایل mock به صفحات نامرتبط می‌رفت | user evidence | anchor جعلی | non-link file row | solver-v23 | Fixed |
| QA-028 | P1 | solver | proposal submit | modal | همه | ارسال نهایی CTA تأیید نداشت | user evidence | modal ناقص | confirm سبز + cancel + next route | flows | Fixed |
| QA-029 | P2 | همه | shell/CSS | default | همه | چند token/shell موازی | baseline system | refactor نیمه‌کاره | unified tokens/shell | architecture | Fixed |
| QA-030 | P2 | همه | layout | responsive | mobile | overflow سراسری ایراد را پنهان می‌کرد | baseline system | global clip | حذف global overflow | responsive tests | Fixed |
| QA-031 | P2 | همه | org identity | populated | همه | logo fallback شبه‌رسمی/ناسازگار | baseline system | asset registry ناقص | registry + monogram neutral | architecture | Fixed |
| QA-032 | P2 | همه | product UI | default | همه | QA selector در UI کاربر بود | baseline system | harness زنده | env+query guarded harness | release-contracts | Fixed |
| QA-033 | P2 | همه | content | populated | همه | اصطلاحات فارسی/انگلیسی متناقض | baseline system | glossary نداشت | glossary + بازنویسی active UI | content regression | Fixed |
| QA-034 | P2 | org/solver | upload | invalid | همه | نوع/MIME/نام فایل امن نبود | security audit | File API خام | upload validation/sanitize | release-contracts | Fixed |
| QA-035 | P2 | standalone | build | production | — | خروجی 12.56MB و CSS 7.57M بود | size baseline | Sprite/CSS مرده | asset extraction/prune | analyze-standalone | Fixed |
| QA-036 | P2 | QA | visual routes | visual | ۹ viewport | Cloud Browser فایل محلی را طبق policy باز نکرد | browser policy result | محیط capture نه محصول | DOM/CSS/axe/viewport suite + baseline evidence | responsive/visual tests | Deferred |
| QA-037 | P2 | security | production | production | — | Mock Store جای Backend authority نیست | architecture review | scope Frontend مستقل | قرارداد آماده API، guard سمت UI | security contract | Deferred |
| QA-038 | P3 | solver | technical solution | form | همه | دو Textarea بدون نمونه بودند | user evidence | hint ناقص | placeholder/hint دقیق | proposal regression | Fixed |
| QA-039 | P3 | solver | solution compose | header | desktop | کارت لوگو/مشخصات سازمان به‌هم‌ریخته بود | user evidence | اندازه/fit ناسازگار | OrganizationIdentity shared | visual/architecture | Fixed |
| QA-040 | P3 | challenge detail | process | RTL | desktop | عدد مرحله سمت چپ دایره بود | user evidence | LTR ordering | RTL logical ordering | v14 visual | Fixed |

## جمع‌بندی Severity

| Severity | کشف‌شده Normalize‌شده | Fixed | Deferred | Open P0/P1 |
|---|---:|---:|---:|---:|
| P0 | ۱۱ | ۱۱ | ۰ | ۰ |
| P1 | ۱۷ | ۱۷ | ۰ | ۰ |
| P2 | ۹ | ۷ | ۲ | — |
| P3 | ۳ | ۳ | ۰ | — |
| مجموع | ۴۰ | ۳۸ | ۲ | ۰ |

## P2های باقی‌مانده

1. **QA-036 — Capture دیداری خودکار در محیط تحویل:** Cloud Browser اجازه بازکردن `file://` را نداد و طبق policy امکان fallback به مرورگر دیگری نبود. برای جلوگیری از ادعای نادرست، Screenshot «بعد» جعل نشده است. Regression دیداری با تست‌های DOM/CSS/RTL/Responsive، axe و baselineهای مرجع پوشش داده شده و باید در CI متصل به Playwright/Chromatic تصویری شود. مالک پیشنهادی: QA Automation.
2. **QA-037 — مرجع امنیتی Backend:** این تحویل Frontend مستقل است. Permission و State transition در UI/Mock Backend enforce شده‌اند، اما Release عمومی باید همان قرارداد را در API و پایگاه داده enforce کند. مالک پیشنهادی: Backend/Security.

## معیار خروج

- P0 باز: **۰**
- P1 باز: **۰**
- Routeهای crawl‌شده: **۴۶۴**
- HTMLهای بررسی‌شده: **۴۶۵**
- لینک/Asset شکسته: **۰**
- تست نهایی: **۱۳۷/۱۳۷ PASS**
- خطای Critical/Serious در axe archetypeهای کلیدی: **۰**
- Hydration/Standalone runtime error در Smoke: **۰**

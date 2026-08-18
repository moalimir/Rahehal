# ممیزی سیستمی طراحی، دسترس‌پذیری، امنیت و متن فارسی — نسخه ۲۵

تاریخ ممیزی: ۱۴۰۵/۰۵/۲۴ (۲۰۲۶-۰۸-۱۵)  
دامنه: سورس `rahhal-frontend-v25-complete` و خروجی مستقل `index.html`  
روش: ممیزی ایستای سورس، شمارش ساختاری CSS/کامپوننت، بررسی قراردادهای تعامل و Storage، تحلیل اندازه خروجی مستقل و نمونه‌برداری خط‌به‌خط از مسیرهای پرریسک. این سند صرفاً ممیزی است و هیچ فایل محصولی در این شاخه توسط این ممیز تغییر نکرده است.

> نکته شواهد: در تحویل بررسی‌شده فایلی با نام `index(8).html` وجود نداشت؛ `index.html` با اندازه ۱۲٬۵۵۶٬۲۲۸ بایت و `index(6).html` با اندازه ۱۱٬۶۱۱٬۶۶۹ بایت موجود بود. `index.html` به‌عنوان آخرین شاهد رفتاری تحلیل شد.

## جمع‌بندی اجرایی

نسخه فعلی از نظر ظاهر، پوشش مسیر و وجود برخی الگوهای خوب مانند Skip Link، `UnifiedShell`، لوگوی canonical و فرم‌های Challenge پیشرفت جدی دارد؛ اما برای انتشار عمومی هنوز قابل دفاع نیست. پنج ریشه بحرانی مشاهده شد: نگهداری رمز عبور در `sessionStorage`، نبود Guard واقعی برای مسیر/اقدام، قابل دورزدن بودن COI/NDA با Deep Link، Actionهای نمایشی بدون Mutation پایدار و برخورد شناسه Challenge در دو Source of Truth. در لایه تجربه نیز ۱۶ Dialog/Drawer با چهار پیاده‌سازی جداگانه، کنترل QA در محصول، Route مستقل با سقوط ناشناخته به Landing، دانلودهای بدون فایل، و چند خانواده Token/CSS موازی وجود دارد.

| شدت | تعداد یافته این ممیزی | وضعیت برای انتشار |
|---|---:|---|
| P0 | ۵ | مانع انتشار |
| P1 | ۱۰ | مانع انتشار |
| P2 | ۱۱ | باید در Refactor سیستمی رفع شود |
| P3 | ۱ | پس از بستن ریشه‌ها |

## شواهد کمّی پایه

| موضوع | مقدار مشاهده‌شده |
|---|---:|
| اندازه `index.html` | ۱۲٬۵۵۶٬۲۲۸ بایت (حدود ۱۱٫۹۸ MiB) |
| محتوای CSS درون‌خطی | ۷٬۵۷۳٬۶۷۶ کاراکتر در ۶ `<style>` |
| بزرگ‌ترین CSS درون‌خطی | ۷٬۲۹۶٬۷۰۱ کاراکتر |
| JavaScript درون‌خطی | حدود ۳٫۲۸ MiB در ۷ Chunk + Bootstrap |
| Data URL | ۱۲۰ رخداد؛ ۹۴ رخداد `base64,` |
| CSS خام سورس | حدود ۵۸۷ KiB در ۷ فایل |
| Rule/Declaration CSS | ۵٬۲۹۴ Rule و ۱۶٬۹۲۹ Declaration |
| `!important` | ۸۱ Declaration |
| کنترل‌های خام در JSX | ۳۲۵ Button، ۱۱۵ Input، ۷۵ Select، ۴۰ Textarea |
| کامپوننت عمومی `Button` | صفر |
| Dialog دارای `role="dialog"` | ۱۶ |
| Registry لوگوی واقعی | ۲۶ سازمان از ۴۸ پروفایل؛ ۲۲ Fallback |

روش شمارش کلاس بدون مرجع لفظی، برای Modifierهای پویا محافظه‌کارانه نیست؛ با این حال وجود کلاس‌های `.rh-sidebar`، `.rh-topbar`، `.app-sidebar` و `.app-topbar` بدون حتی یک مرجع JSX قطعی و مستقل از این محدودیت است.

## فهرست یافته‌ها و اصلاح سیستمی پیشنهادی

| ID | شدت | حوزه | شواهد قطعی | ریشه | اصلاح سیستمی اولویت‌دار | Regression لازم |
|---|---|---|---|---|---|---|
| SYS-SEC-001 | P0 | حریم خصوصی | `components/portal-page.tsx:2348-2388` فیلدهای `password` و `confirmPassword` را در مدل Draft دارد؛ `:2488-2524` کل Draft را JSON کرده و در `sessionStorage['rahhal.solver-registration']` می‌نویسد. | Persistence فرم بدون طبقه‌بندی داده | رمز و تکرار رمز هرگز persist نشوند؛ Persistence whitelist فقط فیلدهای غیرحساس، Schema version + TTL + corruption handling؛ پاک‌سازی در cancel/success؛ تستی که Storage را برای password/token/secret اسکن کند. | P0 auth refresh، storage privacy، corruption و expiry |
| SYS-SEC-002 | P0 | مجوز | `app/[...slug]/page.tsx:64-82` صرفاً براساس Route، `InternalApp` را Render می‌کند؛ Session/AuthZ Provider یا route guard وجود ندارد. `lib/challenges/storage.ts:269-274` صریحاً کاربر سازمانی Demo را مجاز فرض می‌کند. | Role فقط metadata مسیر است، نه Context امنیتی | `SessionContext` و `PolicyEngine` واحد؛ Guard در Route Loader و Action service؛ پاسخ امن 403 بدون افشای وجود Entity؛ Static fixture فقط با QA flag. | دسترسی مستقیم همه deep linkهای Org/Reviewer/Ops با نقش نامجاز |
| SYS-SEC-003 | P0 | NDA/COI | `components/internal/pages.tsx:2720-2772` COI فقط UI محلی همان صفحه است؛ مسیر Score در `:2776` مستقل Render می‌شود و `/app/reviewer/assignments/RV-204/score` مستقیم قابل بازشدن است. Data room نیز با تجربه عمومی و بدون entitlement پایدار قابل ورود است. | Gate بصری جای Action/Resource guard را گرفته | State machine + server/mock-service entitlement برای `COI_CLEARED`, `NDA_ACCEPTED`, `ASSIGNMENT_ACTIVE`؛ هر document resolver و action دوباره policy را بررسی کند. | Deep link Score/Data Room قبل و بعد از Gate؛ refresh و tab جدید |
| SYS-DATA-004 | P0 | هویت Entity | `data/mock.ts:3-17`، `CH-1405-021` را «بازیابی هوشمند آب…/گروه مپنا» می‌داند؛ `lib/challenges/storage.ts:35-53` همان ID را Draft «کاهش مصرف آب…/سایت اصفهان» می‌سازد. | دو Store و Seed مستقل | Entity Store واحد با ID immutable؛ Fixture سازمانی باید ID جدا یا reference به Challenge canonical داشته باشد؛ constraint تست برای یکتایی ID+identity. | Crawl تمام نمایش‌های CH-1405-021 در چهار نقش |
| SYS-ACT-005 | P0 | صحت Action | `lib/services/internal-service.ts:18-61` فقط delay/receipt می‌سازد و هیچ Entity را mutate نمی‌کند؛ `InternalExperience` آن را برای ثبت/تأیید/تصمیم استفاده می‌کند. «موفقیت» پس از refresh از بین می‌رود و مقصد مرتبط تغییر نمی‌کند. | Generic demo action به‌جای Command/Store | Commandهای domain-specific با precondition، idempotency key، mutation، notification و audit؛ Receipt از رکورد ثبت‌شده مشتق شود. `performDemoAction` فقط در QA harness. | Double-submit، refresh، cross-role mutation و audit receipt |
| SYS-ROUTER-006 | P1 | Standalone router | `app/page.tsx:29-67` route را فقط در `useEffect` تشخیص می‌دهد و state اولیه `null` است؛ unknown نیز `null` و Landing می‌شود. `:73-91` همه لینک‌های `/` را بدون بررسی `target`, `download`, modifier key، anchor و external behavior به Hash تبدیل می‌کند. | Router در Event Capture صفحه خانه و قرارداد route نامشخص | Resolver مشترک Source/Standalone؛ مقدار اولیه sync از URL؛ `NotFound` صریح؛ capture فقط primary unmodified same-origin navigation؛ query/hash preservation contract. | unknown 404، Ctrl/Meta/Shift click، target/download، back/forward، returnTo/filter/step |
| SYS-QA-007 | P1 | QA در محصول | `components/internal/internal-app.tsx:198-223` Selector «حالت نمایشی» با loading/empty/offline/permission/conflict/error/closed را در Header تمام صفحات غیر immersive نمایش می‌دهد؛ عبارت در Bundle مستقل نیز حاضر است. | Test harness داخل renderer تولیدی | `StateHarness` جدا با شرط `process.env.NODE_ENV !== 'production' && ?qa=...` یا Story/fixture runner؛ Production component state را از service/store بگیرد. | Assert عدم وجود selector در production و دسترسی آن در QA build |
| SYS-A11Y-008 | P1 | Dialog | ۱۶ Dialog در چهار خانواده وجود دارد. فقط `ConfirmDialog` (`internal/shared.tsx:315-341`) focus trap دارد؛ همان نیز trigger focus return، scroll lock و inert ندارد. Dialogهای solver (`solver-profile-experience.tsx:814...`)، Org (`organization-workspace.tsx:568...`) و Workflow هیچ focus lifecycle مشترک ندارند. | نبود Primitive واحد | `Dialog`/`AlertDialog` canonical با portal، initial focus، trap، Escape policy، focus return، body scroll lock، inert/aria-hidden و label/description ID. overlay close برای action حساس ممنوع. | Keyboard-only برای هر ۱۶ dialog؛ axe aria-dialog-name؛ focus return |
| SYS-A11Y-009 | P1 | Mobile drawer | `components/site-header.tsx:164-210` Drawer عمومی فقط `aria-hidden` و CSS visibility دارد؛ focus trap، Escape، focus return و scroll lock ندارد. Mobile sidebar داخلی trap دارد ولی background را inert نمی‌کند. | Drawer پیاده‌سازی جدا از Dialog primitive | `Drawer` مشترک مبتنی بر همان focus scope؛ opener ref، inert main، Escape، scroll lock، `aria-labelledby`. | 320/390px keyboard + screen reader + zoom 200٪ |
| SYS-A11Y-010 | P1 | فرم | `solver-proposal-wizard.tsx:161-188` خطا را در `<small role=alert>` نشان می‌دهد ولی input child `aria-invalid`/`aria-describedby` ندارد. الگو در `solver-profile-experience.tsx:1000-1105` تکرار شده است. Error summary و انتقال focus نیز سراسری نیست. | Field primitiveهای چندگانه و raw controls | `Field` واحد با generated IDs، hint/error association، `aria-invalid` فقط در خطا، summary با لینک و focus به اولین خطا. | Invalid submit هر فرم P0 با axe و keyboard |
| SYS-A11Y-011 | P1 | کنتراست/لمس | سفید روی `#04adbc` نسبت ۲٫۷۲:۱ و روی `#069eaa` نسبت ۳٫۲۴:۱ دارد؛ در CTAهای ۱۳–۱۴px (`app-shell.css:285-289`, `organization-workspace.css:587-591`) استفاده شده. Close modal solver فقط ۳۲×۳۲ (`solver-workspace.css:6910-6916`) و topbar link ۴۰px (`app-shell.css:275...`) است. | Accent به‌جای semantic interactive token | توکن `action-primary-bg` با contrast ≥4.5، target حداقل 44×44، تست contrast و hit target. | axe color-contrast + محاسبه token + viewport/touch audit |
| SYS-DL-012 | P1 | دانلود | `organization-workspace.tsx:604-610` و `:919-927` Button دریافت PDF بدون handler/href است؛ Resume solver فقط Toast «آماده شد» می‌دهد؛ Proposal PDF به generic `onAction` می‌رود. | CTA نمایشی بدون Document entity | `DocumentDownload` فقط با `documentId`, permission, signed/mock Blob URL و filename؛ اگر فایل نیست disabled با علت روشن، نه success toast. | click download، MIME/signature، نام فایل، permission، unavailable |
| SYS-UP-013 | P1 | Upload امنیتی | Upload احراز در `solver-workflow-experience.tsx` اندازه/پسوند را چک می‌کند؛ اما Challenge upload در `challenge-flow/intake-page.tsx:62-68` و `edit-steps.tsx:55-65` هیچ `accept`، اندازه، MIME یا filename validation ندارد و metadata نام فایل در localStorage می‌ماند. | Validatorهای موردی | `SecureFileInput` واحد: allowlist extension+MIME+magic bytes در backend/mock boundary، size، safe display filename، strip path/control chars، quarantine/status و privacy copy. | polyglot، double extension، oversize، Unicode filename، corrupted file |
| SYS-STATE-014 | P1 | Persistence | کلیدهای unversioned پراکنده‌اند: `rahhal:solver-space`, `received-offer:*`, `received-offer-response:*`, `solver-team-draft`, `proposal:*`, `settings:*`. فقط Challenge Store v6 دارد. Cross-tab listener عمدتاً فقط Challenge است. | هر Feature مالک Storage خود شده | `DemoStore` واحد با schema version، migrations، TTL، validation، reset، storage-event sync و namespace workspace/entity؛ داده حساس ممنوع. | migration n−1، corrupt payload، TTL، cross-tab، individual/team isolation |
| SYS-XROLE-015 | P1 | Cross-role/حریم | Org invite در `organization-workspace.tsx:576-623` فقط state محلی `invited` را تغییر می‌دهد؛ سمت solver seed/LocalStorage جداست. نام شخص در Toast درج می‌شود. | State مشترک ندارد؛ UI optimistic بدون command | Invitation entity/store مشترک و notification policy؛ Toast غیرحساس، audit detail در صفحه مجاز. | ارسال/قبول/رد/لغو در دو نقش + refresh |
| SYS-DS-016 | P2 | Token system | `design-system.css:1-34` توکن canonical تعریف می‌کند؛ `globals.css:1038-1058` دوباره `--color-surface`, `--color-border`, `--radius-card` را override می‌کند. خانواده‌های `--rh-*` (۱۰)، `--challenge-*` (۱۱)، `--org-*` (۶) نیز فعال‌اند. | Migration ناتمام و import-order contract | `tokens.css` واحد؛ role فقط `--accent-*`; mapping موقت با deprecation؛ lint منع تعریف semantic token خارج tokens. | computed-style snapshot توکن‌ها در همه shellها |
| SYS-DS-017 | P2 | Shell/CSS مرده | `.rh-sidebar/.rh-topbar` در `solver-workspace.css:80...` و `:5258...`؛ `.app-sidebar/.app-topbar` در `internal.css:69...` و `:239...` وجود دارند، اما هیچ JSX آن‌ها را Render نمی‌کند؛ Shell واقعی `.unified-*` در `components/app-shell.tsx` است. | Refactor پوسته بدون حذف نسل قبلی | حذف selectors و component leftovers پس از coverage؛ Sidebar width فقط یک token. در literal scan، ۲۱۹ کلاس globals، ۵۳ solver و ۳۹ internal مرجع لفظی ندارند؛ هر مورد قبل حذف با dynamic modifier allowlist بررسی شود. | CSS coverage route crawl؛ صفر selector legacy shell در bundle |
| SYS-DS-018 | P2 | Primitive | ۳۲۵ Button، ۱۱۵ Input، ۷۵ Select و ۴۰ Textarea خام وجود دارد؛ `Button` shared صفر است. Field مشترک فقط در challenge-flow پیاده شده و سایر فلوها الگوهای مستقل دارند. | اشتراک CSS class به‌جای قرارداد component | Primitiveهای Button/IconButton/Field/Select/Textarea/FileUpload/Status/Dialog/Tabs/Table/PageHeader؛ variant محدود و semantic props. | component tests states + visual matrix |
| SYS-DS-019 | P2 | Overflow/Responsive | `design-system.css:43-47` روی `html, body` `overflow-x: clip` می‌گذارد؛ `globals.css:1060-1074` دوباره `body overflow-x:hidden` دارد؛ `.unified-content` نیز clip می‌کند. این سه لایه می‌توانند شکست جدول/کارت را مخفی کنند. | درمان سراسری نشانه به‌جای container containment | حذف global clip/hidden؛ `min-inline-size:0` در grid/flex child؛ `overflow:auto` فقط `.data-table-scroll`; تست `scrollWidth===clientWidth` برای page و جدول استثنا. | ۹ viewport + zoom 200٪ + long Persian/LTR strings |
| SYS-LOGO-020 | P2 | هویت سازمان | `organization-profiles.ts` شامل ۴۸ سازمان است؛ `organization-registry.ts` فقط ۲۶ image record دارد. ۲۲ مورد به `kind:'generated'` می‌روند. Fallback در `challenge-organization-logo.tsx:31-53` SVG چندشکلی شبه‌لوگو تولید می‌کند؛ در عین حال asset واقعی Alibaba روی دیسک موجود ولی ثبت نشده است. | Registry ناقص و fallback برندگونه | Registry مرکزی برای همه assetهای موجود؛ fallback فقط monogram خنثی با نام canonical؛ عدم ساخت نشان شبه‌رسمی؛ تست یکسان بودن name/logo/alt در card/detail/invite. | تمام ۴۸ پروفایل، missing asset، broken image، long name |
| SYS-BRAND-021 | P2 | Logo canonical | `components/brand.tsx` canonical خوب است و تمام JSX فعلی به آن می‌رسد؛ با این حال CSSهای `.legacy-reference-logo`, `.brand__mark`, `.brand--inverse` در globals/solver باقی‌اند. | مهاجرت بصری کامل نشده | حفظ `RahhalLogo` به‌عنوان تنها markup؛ حذف legacy selectors/assets پس از coverage. spelling «راه‌حل» ثابت بماند. | DOM snapshot header/sidebar/footer/auth؛ یک SVG signature |
| SYS-CONT-022 | P2 | فارسی/Glossary | نمونه‌های زنده: `Audit`, `Diff`, `Merge`, `Gate`, `Rubric`, `Blind review`, `Eligibility`, `Milestone`, `Baseline`, `Actual`, `ROI`, `SLA`, `NDA`, `IP`, `KYC/KYB`, `watermark` در `internal/shared.tsx`, `internal/pages.tsx`, `intellectual-property-guide.tsx`. بعضی IDها بدون `dir=ltr`/`bdi` هستند. | متن از fixture/spec فنی مستقیم به UI آمده | Glossary مرکزی + content lint؛ فارسی معیار و توضیح اصطلاح ضروری در اولین استفاده؛ component `TechnicalTerm` و `BidiText`; تاریخ/پول/ID فقط formatter. | snapshot copy، bidi long ID/email، Persian digit/date |
| SYS-CONT-023 | P2 | اعتماد/ادعای Demo | ۴۸ پروفایل شرکت واقعی با اعداد `activeChallenges/closedProjects` تولیدی (`organization-profiles.ts:145-157`) نمایش داده می‌شوند. Footer Disclaimer کلی کافی نیست تا هر کارت به‌عنوان داده واقعی برداشت نشود. | Fixture برند واقعی و KPI ساخته‌شده در یک مدل | داده نمایش را با badge نزدیک context و نام سازمان نمونه/بی‌نام جدا کن؛ برای برند واقعی فقط asset/name بدون ادعای همکاری یا KPI ساختگی. | content scan برای عدد hard-coded در profile/card |
| SYS-A11Y-024 | P2 | Tabs/semantic | بعضی tablistها وجود دارند، اما tabها ID/`aria-controls` و tabpanel `aria-labelledby` ندارند؛ Challenge list tablist اساساً panel مرتبط ندارد. Arrow-key roving tabindex پیاده نشده است. | visual tabs به‌جای APG tabs | اگر صرفاً filter است button group با accessible label؛ اگر tab است APG Tabs کامل با keyboard. | keyboard arrow/home/end و axe relation |
| SYS-PERF-025 | P2 | Standalone | Exporter تمام CSS و Chunkها را inline می‌کند. یک style برابر ۷٫۲۹ MB است؛ `app/page.tsx` همه Portal/Internal/Challenge/Solver را sync import می‌کند، بنابراین standalone home chunk حدود ۱٫66 MB است. دو PNG مرجع ۲٫24 و ۱٫60 MB و hero ۱٫06 MB هستند؛ assetها هم در CSS و هم در compiled JS می‌توانند تکرار شوند. | entry مشترک همه routeها + inlining بدون dependency graph دقیق | standalone entry مستقل با dynamic route loaders؛ CSS route-level؛ تبدیل تصاویر بزرگ به WebP/AVIF responsive؛ dedupe data URL؛ preload فقط font critical؛ گزارش bundle map. | size budget، unused bytes، zero duplicate asset hash، LCP/CLS |
| SYS-QA-026 | P2 | A11y/Visual automation | `axe-core` فقط transitive در lockfile است؛ هیچ تست `axe`, Playwright screenshot, Lighthouse/pa11y یا visual baseline در tests/scripts وجود ندارد. | تست فعلی عمدتاً Vitest/DOM و smoke route است | Playwright + axe per route archetype؛ visual snapshots ۹ viewport برای لیست/جزئیات/auth/shell/dialog؛ keyboard scripts. | CI gate: zero critical axe + approved intentional visual diffs |
| SYS-POL-027 | P3 | متن جزئی | متن «اسکن نمایشی»، `v3`, `Reason KYC-14` و ترکیب‌های فنی در CTA/Status بدون الگوی ثابت دیده می‌شود. | UX writing در component پخش است | Message catalog با tone، action و severity؛ کد فنی داخل `<bdi dir=ltr>` و متن توضیحی فارسی. | copy snapshot + bidi |

## نقاط مثبت قابل حفظ

- `app/layout.tsx:18-24` Skip Link واقعی به `#main-content` دارد و Shell اصلی نیز همان ID را روی `<main>` می‌گذارد.
- `components/brand.tsx` یک SVG واحد با variant/size و نام درست «راه‌حل» فراهم می‌کند؛ باید همان را نگه داشت و CSS legacy را حذف کرد.
- `components/challenge-flow/fields.tsx` نسبت به سایر فرم‌ها قرارداد بهتری برای `aria-describedby`, `aria-invalid`, ErrorSummary و Confirm dialog دارد و می‌تواند مبنای Primitiveهای عمومی شود.
- `components/app-shell.tsx` برای drawer داخلی focus trap، Escape، focus return و scroll lock نسبی دارد؛ انتقال آن به Primitive مشترک بهتر از بازنویسی از صفر است.
- `lib/validation/user-input.ts` و helper `uploadError` نشان می‌دهند مسیر ایجاد Validator مشترک موجود است.
- `OrganizationLogo` از `object-fit:contain` و alt استفاده می‌کند؛ مشکل در registry/fallback است، نه اصل component.

## معماری اصلاح پیشنهادی با ترتیب وابستگی

### Batch 0 — بستن P0 امنیت/داده

1. حذف password از persistence و پاک‌سازی Storageهای موجود با migration فوری.
2. ایجاد `SessionContext + PolicyEngine + CommandBus` برای Route/Action guard.
3. تعریف Entity Store canonical و رفع collision `CH-1405-021`.
4. Gate واقعی NDA/COI در document/action resolver.
5. جایگزینی action demo با commandهای domain-specific و idempotent.

تا پایان این Batch هیچ پولیش بصری نباید به‌عنوان release candidate تلقی شود.

### Batch 1 — قرارداد تعامل و Accessibility

1. استخراج `Dialog`, `AlertDialog`, `Drawer`, `Toast`, `Field`, `FileUpload`, `Tabs`.
2. مهاجرت هر ۱۶ Dialog؛ حذف implementationهای solver/org/public/challenge بعد از تست.
3. اتصال کامل error/hint، error summary و focus management فرم‌ها.
4. اصلاح semantic tabs/filter groups و 44px targets.
5. اصلاح رنگ CTAها با token AA.

### Batch 2 — Token/Shell/CSS

1. `tokens.css` به‌عنوان تنها `:root` semantic؛ role accent فقط scope‌شده.
2. حذف global `overflow-x` و رفع واقعی min-width/grid/table.
3. حذف `.rh-sidebar/.rh-topbar/.app-sidebar/.app-topbar` و legacy Brand CSS.
4. Route-level stylesheet/code splitting؛ فعال‌سازی CSS coverage در crawl.

### Batch 3 — محتوا، هویت و Performance

1. تکمیل ۴۸/۴۸ Registry یا Monogram خنثی؛ حذف generated pseudo-logo.
2. Glossary و message catalog فارسی.
3. حذف KPI/ادعای ساختگی از برند واقعی یا افزودن context demo نزدیک داده.
4. Standalone exporter dependency-aware و بهینه‌سازی تصویر/فونت.

## قرارداد پیشنهادی Dialog مشترک

Primitive باید حداقل این API/رفتار را enforce کند:

- `open`, `onOpenChange`, `title`, `description`, `initialFocusRef`, `returnFocusRef`.
- `closeOnEscape` و `closeOnOutside` به‌صورت پیش‌فرض true؛ برای اقدام حساس outside=false.
- portal روی layer token؛ body scroll lock ref-counted؛ `inert` برای app root پشت.
- focus trap با Shadow DOM-safe focusable query؛ بازگرداندن focus حتی پس از unmount trigger با fallback منطقی.
- `aria-labelledby`/`aria-describedby` اجباری؛ close icon نام دسترس‌پذیر.
- AlertDialog confirm به‌صورت async با pending/disabled/error و جلوگیری از double submit.
- تست مشترک برای Escape، Tab loop، Shift+Tab، return focus، scroll و nested dialog.

## قرارداد پیشنهادی فارسی و اصطلاحات

| متن فعلی | متن معیار پیشنهادی |
|---|---|
| Gate | شرط عبور / کنترل مرحله |
| Eligibility | شرایط مشارکت |
| Rubric | معیارنامه ارزیابی |
| Blind review | داوری بدون نمایش هویت |
| Audit | تاریخچه حسابرسی |
| Receipt | رسید ثبت |
| Diff / Merge | مقایسه تغییرها / ادغام کنترل‌شده |
| Milestone | مرحله اجرایی / نقطه عطف |
| Baseline / Actual | خط مبنا / مقدار تحقق‌یافته |
| ROI | بازده سرمایه‌گذاری (در اولین استفاده) |
| SLA | مهلت خدمت (SLA) در اولین استفاده |
| NDA | توافق‌نامه محرمانگی (NDA) در اولین استفاده |
| IP | مالکیت فکری (IP) در اولین استفاده |
| Workspace | فضای کاری |
| KYC/KYB | احراز هویت فرد/سازمان؛ کد فنی در `<bdi>` |

## بودجه و هدف Performance

Baseline قطعی مستقل ۱۲٬۵۵۶٬۲۲۸ بایت است. پیشنهاد Release Gate:

| لایه | Baseline | هدف مرحله اول |
|---|---:|---:|
| Standalone کل | ۱۱٫۹۸ MiB | کمتر از ۷ MiB بدون حذف قابلیت |
| CSS inline | ۷٫۲۲ MiB | کمتر از ۳ MiB و بدون CSS shell مرده |
| JS inline | حدود ۳٫۲۸ MiB | کمتر از ۲ MiB با route lazy loading |
| تصویر مرجع directory | ۳٫۷ MiB برای دو PNG | responsive WebP/AVIF و بارگذاری فقط در route مصرف‌کننده |
| duplicate asset hash | اندازه‌گیری نشده | صفر |

اندازه standalone ذاتاً از production اولیه بزرگ‌تر است؛ معیار اصلی production باید initial JS/CSS route-specific و Web Vitals باشد. با این حال ۱۲ MiB فعلی عمدتاً نتیجه inlining همه routeها و assetهای مرجع است و اجتناب‌ناپذیر نیست.

## ماتریس تست لازم برای بستن این ممیزی

| محور | صفحات/نمونه | Pass condition |
|---|---|---|
| Security | Reviewer score، data room، org finance، ops verification | direct URL بدون entitlement = 403 امن؛ action نیز reject |
| Storage privacy | همه auth/register flows | هیچ password/token/PII ممنوع در local/session storage |
| Dialog | ۱۶ dialog + دو drawer | focus trap/return، Escape policy، inert، scroll lock |
| Form | auth، proposal، invitation response، challenge wizard | error summary، field association، keyboard completion |
| Responsive | 320, 360, 390, 430, 768, 1024, 1280, 1440, 1920 + 200٪ | page horizontal overflow صفر؛ table فقط wrapper |
| Contrast | CTA/Status/Muted text | WCAG 2.2 AA؛ normal text ≥4.5:1 |
| Download/upload | تمام CTAهای PDF و همه file inputها | فایل واقعی/disabled reason؛ allowlist/size/MIME/name |
| Logo | ۴۸ organization profile + challenge/invite | identity یکسان، asset یا monogram خنثی، alt معتبر |
| Glossary | route crawl full text | اصطلاح معیار، bidi درست، zero unexplained mixed UI term |
| Production hygiene | تمام internal routes | QA selector صفر، console/hydration/asset 404 صفر |
| Performance | production + standalone | bundle map، zero duplicate hash، size budget و Web Vitals ثبت‌شده |

## معیار خروج این حوزه

- `SYS-SEC-001` تا `SYS-ACT-005` بسته و دارای تست منفی/مثبت باشند.
- تمام ۱۶ Dialog/Drawer به Primitive مشترک مهاجرت کرده باشند.
- Selector «حالت نمایشی» در Production DOM/Bundle UI وجود نداشته باشد.
- CSS پوسته‌های `.rh-*`/`.app-*` مرده از Bundle حذف و global overflow workaround برداشته شود.
- ۴۸ هویت سازمان از Registry واحد و بدون لوگوی ساختگی عبور کنند.
- zero critical axe، تمام P0 flowها keyboard-only، و contrast AA ثبت شود.
- هیچ CTA دانلود بدون فایل واقعی یا وضعیت unavailable صریح باقی نماند.
- Standalone جدید همراه breakdown و مقایسه با baseline ۱۲٬۵۵۶٬۲۲۸ بایت تحویل شود.

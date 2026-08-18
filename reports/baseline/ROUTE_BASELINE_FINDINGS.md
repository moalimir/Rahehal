# ممیزی مسیر، ناوبری و قرارداد Standalone

تاریخ Snapshot: `2026-08-15T10:32:48+02:00`

دامنه بررسی: سورس `rahhal-frontend-v25-complete` و خروجی مستقل فعلی `index.html`. این سند فقط گزارش ممیزی است و هیچ فایل محصولی در این بررسی ویرایش نشده است.

## جمع‌بندی اجرایی

قرارداد مسیر محصول هنوز از یک Source of Truth واحد تولید نمی‌شود. در Snapshot حاضر، **۵۳۸ ارجاع ثبت مسیر** در شش Registry/Generator وجود دارد که پس از حذف هم‌پوشانی‌ها به **۴۱۹ مسیر غیرریشه** در `generateStaticParams` و **۴۲۰ Location یکتا با احتساب `/`** می‌رسد. در مقابل، `scripts/verify-routes.mjs` فقط **۲۵۱ مسیر یکتا** را می‌شناسد و **۱۶۹ مسیر** از قرارداد واقعی Static/Runtime را اصلاً راستی‌آزمایی نمی‌کند.

سه ریشه پرریسک باقی مانده است:

1. شناسه `CH-1405-021` در سه Store/Fixture با عنوان، وضعیت و زمینه متفاوت استفاده می‌شود و دو Renderer روی بخشی از مسیرهای همان پرونده با هم رقابت می‌کنند؛ این یک P0 واقعی در هویت Entity و فلو است.
2. `index.html` فعلی قبل از اصلاح Router ساخته شده و با سورس امروز همگام نیست؛ بنابراین Fixهای Not Found، Legacy Unavailable و Click Contract در خروجی قابل تحویل وجود ندارند.
3. Query و Workspace Context قرارداد واحد ندارند. `space`, `returnTo`, filter/sort/layout/step در چند مسیر با refresh، Standalone hash و Back/Forward رفتار متفاوت دارند.

وضعیت TypeScript در Snapshot: `./node_modules/.bin/tsc --noEmit` **Pass**. چهار فایل تست Route/Standalone موجود، ۲۳ تست را Pass کردند؛ بااین‌حال این تست‌ها موارد بحرانی این گزارش را پوشش نمی‌دهند و سبزبودن آن‌ها معیار کفایت Router نیست.

## Inventory قطعی

| منبع | تعداد ثبت | یکتا | توضیح |
|---|---:|---:|---|
| `data/routes.ts` | ۴۴ | ۴۴ | Registry نسل قدیمی/عمومی: ۷ عمومی، ۱۳ حل‌کننده، ۱۶ سازمان، ۸ عملیات |
| `data/public-product-routes.ts` | ۸۷ | ۸۷ | ۴۸ پروفایل سازمان + صفحات عمومی، احراز و Onboarding |
| `data/internal-routes.ts` | ۱۷۲ | ۱۷۲ | ۱۰۳ مسیر `/app/*` و ۶۹ مسیر قدیمی؛ نقش‌ها: سازمان ۷۷، حل‌کننده ۶۲، داور ۱۱، عملیات ۲۲ |
| `data/challenge-flow-routes.ts` | ۱۳۹ | ۱۳۹ | ۲ ریشه، ۷۲ مسیر Canonical برای ۱۲ شناسه و ۶۵ Legacy/redirect |
| `data/legacy-redirects.ts` | ۷۰ | ۷۰ | ۵۹ Redirect و ۱۱ صفحه `unavailable` آگاهانه |
| مسیر عمومی چالش | ۲۵ | ۲۵ | `/challenges` + دوازده slug + دوازده ID |
| صفحه ریشه | ۱ | ۱ | `/` |
| **کل ارجاع** | **۵۳۸** | **۴۲۰ Location** | ۴۱۹ مسیر slugدار + `/`؛ ۱۱۸ ارجاع تکراری بین Registryها |

### هم‌پوشانی‌های مهم

| دو منبع | تعداد هم‌پوشانی | نمونه/پیامد |
|---|---:|---|
| `internalRoutes` و `routeDefinitions` | ۳۷ | دو نسل تعریف برای solver/org/ops |
| `internalRoutes` و `legacyRouteEntries` | ۶۹ | صفحه قدیمی در Bundle می‌ماند ولی Resolver ابتدا Redirect/Unavailable را انتخاب می‌کند |
| `challengeFlowStaticPaths` و `internalRoutes` | ۸ | شامل `/app/org/challenges`, `/new`, و `CH-1405-021/{overview,studio}`؛ Renderer به ترتیب Resolver وابسته است |
| `legacyRouteEntries` و `routeDefinitions` | ۳۸ | داده و UI نسل قدیمی همچنان موازی نگهداری می‌شود |
| `challengeVariants` و `routeDefinitions` | ۲ | `/challenges` و `smart-water-recovery` |

### مسیرهای Runtime/برنامه‌نویسی‌شده

- ۲۰ مسیر `internalRoutes` به‌صورت Generator ساخته می‌شوند و Regex فعلی `verify-routes` آن‌ها را نمی‌بیند: ۳ پاسخ به پیشنهاد مستقیم، ۶ مرحله Wizard پیشنهاد و ۱۱ صفحه فرصت حل‌کننده (فرصت دوازدهم صریح تعریف شده است).
- ۴۸ صفحه سازمان از `organizationProfiles` و slug تولید می‌شود؛ Script فعلی فقط ۴ slug را Hard-code کرده است.
- ۲۴ جزئیات عمومی چالش از ID و slug تولید می‌شود.
- `getLegacyResolution()` هر الگوی `/org/challenges/:id[/edit|studio|preview|submitted]` را می‌پذیرد، حتی اگر `:id` جزو ۱۲ شناسه مجاز `CHALLENGE_ROUTE_IDS` نباشد.
- مهم‌ترین Link Builderها در `components/challenge-discovery.tsx`, `components/solver-dashboard.tsx`, `components/solver-profile-experience.tsx`, `components/solver-proposal-wizard.tsx`, `components/challenge-flow/*` و `components/portal-page.tsx` قرار دارند. این Builderها از قرارداد تایپ‌شده مشترک استفاده نمی‌کنند.

## ترتیب Resolver در Source و Standalone

| اولویت | Source build: `app/[...slug]/page.tsx` | Standalone: `app/page.tsx` |
|---:|---|---|
| ۱ | `getLegacyResolution` | `getLegacyResolution` |
| ۲ | `/challenges*` | `/challenges*` |
| ۳ | `getChallengeFlowRoute` | `getChallengeFlowRoute` |
| ۴ | `getInternalRoute` | `getInternalRoute` |
| ۵ | Public Product / old route definitions | Public Product / old route definitions |
| ۶ | Next `notFound()` | `ProductNotFound` |

اصلاح Source برای Unknown Route و Legacy Unavailable در Snapshot حاضر وجود دارد، اما خروجی `index.html` فعلی این کد را ندارد. همچنین اولویت Challenge Flow پیش از Internal باعث Shadow شدن دو مسیر Canonical پرونده نمونه می‌شود.

## نقص‌های اولویت‌دار

| ID | Severity | نقش/مسیر | شرح و Evidence | Root cause | اصلاح سیستمی و تست Regression |
|---|---|---|---|---|---|
| ROUTE-P0-01 | P0 | سازمان + عمومی، `CH-1405-021` | `data/mock.ts:5-14` این ID را چالش منتشرشده «بازیابی هوشمند آب…» متعلق به مپنا می‌داند؛ `lib/challenges/storage.ts:40-52` همان ID را Draft «کاهش مصرف آب…» در خط ۲ می‌سازد؛ `data/fixtures/internal.ts:1-13` همان ID را در وضعیت داوری نگه می‌دارد. علاوه بر این، `/app/org/challenges/CH-1405-021/{overview,studio}` هم در `challengeFlowStaticPaths` و هم در `internalRoutes` ثبت شده و به علت `app/[...slug]/page.tsx:86-89` Renderer فلو، صفحه Internal را Shadow می‌کند. siblingهایی مثل timeline/proposals از Store دیگری Render می‌شوند. | سه Source of Truth و Resolver precedence به‌جای Entity contract | یک `ChallengeRepository` بر پایه ID بساز؛ Public projection، Org case و Solver opportunity باید projectionهای همان Entity باشند. Registry مسیر فقط Page ID/params بدهد و Renderer بر اساس route ID یکتا انتخاب شود. تست P0: عنوان/ناشر/وضعیت/مرحله `CH-1405-021` را در public detail، solver detail، org overview، timeline و proposals مقایسه کند؛ هر مسیر دقیقاً یک resolver match داشته باشد. |
| ROUTE-P0-02 | P0 | خروجی Standalone | `index.html` با زمان `09:25` و حجم `12,556,228` بایت قدیمی‌تر از Router Source با زمان حدود `10:24` است. متن‌های `این صفحه پیدا نشد`، `مسیر قدیمی` و `در حال بازیابی مسیر` در آن صفر بار وجود دارد، اما `/contact` سه بار دارد. بنابراین Artifact قابل دانلود Fixهای Router فعلی را شامل نمی‌شود. | Build artifact پس از تغییر Source بازتولید و Contract-tested نشده است | هر تحویل باید از Git/source hash Build شود و manifest hash در HTML درج شود. پس از Build، تست واقعی فایل: unknown hash → 404، legacy unavailable → صفحه توضیحی، ctrl/cmd click → بدون interception، back/forward/query. Artifact قدیمی نباید کنار Build جدید به‌عنوان خروجی نهایی باقی بماند. |
| ROUTE-P0-03 | P0 | احراز فرد/تیم، `/auth/recovery` و `/auth/otp` | دو لینک Support در `components/portal-page.tsx:2173` و `:2329` به `/contact` می‌روند؛ چنین Routeی در ۴۲۰ Location معتبر وجود ندارد. این لینک در حساس‌ترین نقطه بازیابی حساب، کاربر را به 404 می‌برد. | Link literal خارج از Route Registry | یا Route واقعی `/contact` با سیاست داده/پشتیبانی بساز، یا لینک را به مقصد موجود و معنادار مانند Help/Support canonical وصل کن. Crawler باید همه literal و generated hrefها را resolve کند و این دو مسیر را در Source و Standalone کلیک کند. |
| ROUTE-P1-01 | P1 | سازمان، OTP با `returnTo` | `AuthRouteExperience` پارامتر را از Hash می‌خواند، اما `components/portal-page.tsx:3124-3128` در Standalone از `window.location.assign(returnTo)` استفاده می‌کند؛ فایل مستقل به path سیستم فایل/سرور می‌رود، نه `#/...`. | چند Helper ناوبری مستقل | فقط یک `navigateInternal(LocationDescriptor)` برای هر دو Build داشته باش. تست: `#/auth/otp?role=organization&returnTo=%2Fapp%2Forg%2Fchallenges%2Fnew` پس از OTP باید همان hash مقصد را باز کند و Query را حفظ کند. |
| ROUTE-P1-02 | P1 | سازمان، ورود و ثبت‌نام | `OrganizationAuthExperience` در `components/portal-page.tsx:1351-1423` اصلاً `returnTo` را نمی‌خواند؛ Login موفق فقط پیام می‌دهد و Navigate نمی‌کند؛ ثبت نماینده و شرکت به مقصدهای ثابت می‌رود و context را حذف می‌کند. | Auth flow جدا از قرارداد بازگشت | یک `AuthContinuation` versioned در URL/session بساز. همه Login/Register/OTP/Onboardingها باید همان returnTo allow-listed را carry کنند. E2E Source/Standalone: شروع از Challenge new → auth → OTP → onboarding → بازگشت دقیق به همان challenge/step. |
| ROUTE-P1-03 | P1 | Onboarding فرد و سازمان | `components/portal-page.tsx:3311-3316` فقط `window.location.search` را می‌خواند؛ در Standalone Query داخل hash است. `returnTo` پس از اولین گام از بین می‌رود. | Query parser متفاوت در هر صفحه | Parser مشترک `readLocationQuery()` را جایگزین تمام `window.location.search/hash.split`ها کن. تست همه ۱۵ گام Onboarding در هر دو Build با refresh/back. |
| ROUTE-P1-04 | P1 | حل‌کننده، `/app/solver/opportunities*` | `ChallengeDirectory` در `components/challenge-discovery.tsx:331-352` URL را از صفر می‌سازد و فقط فیلترهای خودش را می‌گذارد؛ `space=team` حذف می‌شود. لینک‌های داخل Detail مانند `:699`, `:701`, `:705` و Toast `:1003` نیز `space` ندارند. LocalStorage fallback ممکن است در Tab جدید یا Deep link فضای اشتباه را باز کند. | Workspace context جزو Route contract نیست | Query schema هر route باید protected keys مانند `space` و `returnTo` را هنگام merge حفظ کند. همه Link Builderها Route helper بگیرند. تست: Team space → filter → detail → save → back/new-tab؛ در همه مراحل owner/permission تیمی باقی بماند. |
| ROUTE-P1-05 | P1 | فهرست چالش و Directoryها | `ChallengeDirectory` فقط state اولیه را از URL می‌خواند و همه تغییرها را با `replaceState` می‌نویسد؛ listener برای `popstate/hashchange` جهت بازسازی فیلتر ندارد. Organization Directory و University Directory نیز عمدتاً state محلی هستند (`components/portal-page.tsx:742-754` و Directory سازمان). Back/Forward و deep-link فیلتر قابل اتکا نیست. | URL و Component state دو Source of Truth | Query state controller با parse/serialize schema و subscription بساز. تغییرات معنادار filter/sort/page باید history policy مشخص (`push` یا `replace`) داشته باشد. E2E: سه تغییر فیلتر، Back/Forward، Refresh، Standalone hash و URL مستقیم. |
| ROUTE-P1-06 | P1 | Reviewer | Sidebar اصلی در `components/role-shells.tsx:48-85` مراحل یک مأموریت ثابت `RV-204` را به‌عنوان ناوبری جهانی نشان می‌دهد. داور دیگری به پرونده نمونه منحرف می‌شود. | Contextual stage در Global IA | Sidebar داور فقط مقصدهای پایدار مانند Assignments/Notifications/Help داشته باشد؛ conflict/materials/compare/score/submit در subnav پرونده با `assignmentId` فعلی ساخته شوند. تست دو Fixture با ID متفاوت و direct-link. |
| ROUTE-P1-07 | P1 | Reviewer/Ops و صفحات مشترک | Quick links در `components/app-shell.tsx:243-265` برای reviewer/ops به `/app/messages` و `/app/notifications` می‌روند، اما همه ۱۱ مسیر مشترک در `data/internal-routes.ts:1460-1557` با `role: "org"` ثبت شده‌اند؛ بنابراین Shell و Workspace سازمان Render می‌شود. Help هم از `app-shell.tsx:172` همین مشکل را دارد. | Shared route بدون invoking context/role | یا namespace نقش‌محور (`/app/{role}/messages`) یا route مشترک با context الزام‌آور و guard بساز. تست هر shared route از چهار Role باید Shell، permission و breadcrumb همان نقش را نگه دارد. |
| ROUTE-P1-08 | P1 | Legacy dynamic org | `data/legacy-redirects.ts:193-202` هر ID دلخواه را به `/app/org/challenges/:id...` Redirect می‌کند. Source build با `dynamicParams=false` مسیر Legacy ناشناخته را اصلاً pre-render نمی‌کند و 404 می‌دهد؛ Standalone ابتدا Redirect کرده و سپس در مقصد 404 می‌دهد. رفتار و تاریخچه دو Build متفاوت است. | Pattern redirect پیش از entity validation | Legacy pattern باید ID را در Repository resolve کند. ID ناشناخته مستقیماً Not Found/Unavailable یکسان بدهد. Property test با known/unknown/malformed IDs و تمام segmentها. |
| ROUTE-P1-09 | P1 | Legacy semantics | بخش بزرگی از Redirectها اصلاح شده و ۱۱ مسیر به Unavailable آگاهانه تبدیل شده‌اند؛ اما چند نگاشت هنوز معادل معنایی نیستند: `/org/team → /app/org/access` با وجود `/app/org/team`، `/ops/system → /app/ops/settings` با وجود تفاوت System Health و تنظیم Taxonomy، `/ops → /app/ops/queue` با وجود Dashboard جدا، و `/org/challenges/sample/operations → .../overview`. | Alias بر اساس نزدیک‌ترین صفحه، نه Job-to-be-done | هر Legacy entry باید `canonicalRouteId` یا `unavailableReason` داشته باشد و تست semantic mapping بر Job ID اجرا شود؛ نگاشت record-scoped بدون ID واقعی ممنوع. |
| ROUTE-P1-10 | P1 | Router اولیه Standalone | `app/page.tsx:34-41` روی Server به دلیل نبود `document` مقدار `null` و Landing را Render می‌کند، ولی Hydration در فایل مستقل initializer را `resolving` می‌بیند. این تفاوت می‌تواند Hydration mismatch ایجاد کند؛ Artifact فعلی هم هنوز Landing قدیمی را قبل از effect نشان می‌دهد. | Hash فقط در Client قابل خواندن است و initial render contract مشخص نیست | HTML مستقل باید قبل از Hydration یک Boot state ثابت و بدون Landing اشتباه داشته باشد؛ سپس pure resolver اجرا شود. تست باید console hydration errors و First Paint deep-link را بررسی کند، نه فقط DOM نهایی را. |
| ROUTE-P1-11 | P1 | QA route coverage | `scripts/verify-routes.mjs` ۵۱ public literal + ۱۵۲ internal literal + ۴۸ challenge subset را ترکیب و فقط ۲۵۱ مسیر یکتا را می‌سنجد؛ از قرارداد ۴۲۰ Location، **۱۶۹ مورد** غایب‌اند. ۲۰ route generated، ۴۴ پروفایل سازمان، overview/studio و اکثر Legacy/Unavailableها پوشش کامل ندارند. | Script به Regex و آرایه Hard-coded متکی است | Manifest ساختاریافته باید از همان Registry runtime تولید شود؛ test هیچ regex روی TypeScript نداشته باشد. `verify-routes` باید count/identity hash را با generated manifest مقایسه و هر route را در Source و Standalone resolve کند. |
| ROUTE-P2-01 | P2 | معماری/Bundle | ۶۹ مسیر قدیمی در `internalRoutes` و ۳۷ Route قدیمی در `routeDefinitions` هنوز نگهداری و Bundle می‌شوند، هرچند `getLegacyResolution` آن‌ها را قبل از Renderer می‌گیرد. `WorkspaceRoute` قدیمی در `components/portal-page.tsx:3739-3793` نیز به‌همین دلیل عملاً dead است. | مهاجرت نیمه‌تمام؛ Redirect data با legacy UI/data مخلوط | بعد از تست parity، UI/data قدیمی حذف و فقط alias contract کوچک نگه داشته شود. Bundle analyzer باید عدم import Renderer قدیمی را اثبات کند. |
| ROUTE-P2-02 | P2 | Navigation active state | Org Sidebar مسیرهای Experts/Invitations و Team/Access را در یک active item ادغام می‌کند (`components/role-shells.tsx:16-43`). Solver نیز proposals/pilots/payments/messages را زیر یک active item می‌گذارد (`components/solver-shell.tsx:49-57`, `:127-135`). | `matches` برای کم‌کردن آیتم‌ها به‌جای دامنه اطلاعاتی | Active state فقط یک دامنه قابل توضیح داشته باشد؛ subnav یا گروه Expandable برای چند مقصد مستقل استفاده شود. تست active item uniqueness. |
| ROUTE-P2-03 | P2 | Redirect fallback | `components/legacy-redirect.tsx:6-31` Query را در effect حفظ می‌کند، اما fallback `<Link href={target}>` بدون Query است. در شکست JS/Hydration context حذف می‌شود. | Destination در render و effect از دو تابع متفاوت می‌آید | مقصد کامل را server/client-safe از Location contract بساز یا Query را در href اولیه قرار بده. تست JS-disabled/failed-hydration برای legacy URL با `space`, filter و returnTo. |
| ROUTE-P2-04 | P2 | QA report | `scripts/generate-qa-report.mjs:64-69` برای همه viewportها بدون Screenshot یا layout assertion مقدار `PASS-CSS` می‌نویسد. Regex legacy آن در `:76-89` با ساختار helper-based فعلی `redirect(...)`/`unavailable(...)` سازگار نیست. | گزارش از وجود فایل نتیجه تست استنتاج می‌کند | فقط نتیجه ابزار واقعی (screenshot diff، overflow scan، browser navigation) باید Pass تولید کند. Unknown/Not-run صریح باشد. |
| ROUTE-P2-05 | P2 | Performance Standalone | `index.html` فعلی ۱۲٬۵۵۶٬۲۲۸ بایت است: ۶ Style tag با ۷٬۵۷۳٬۳۱۴ بایت CSS، ۸ Script با ۳٬۳۹۷٬۴۳۲ بایت JS، ۵ فونت data و ۹۰ تصویر data. وجود نسل قدیمی Route/Renderer سهم مستقیم در بزرگی Bundle دارد. | همه صفحات و Assetها Inline و dead code مهاجرت‌نیافته | Route-level split در Source، tree-shaking Renderer قدیمی و exporter مبتنی بر dependency graph. پس از Build اندازه و سهم CSS/JS/font/image با baseline مقایسه شود. |

## وضعیت اصلاحات Router موجود در Source

این موارد در Source Snapshot بهبود یافته‌اند، ولی تا Rebuild و Regression Test نباید «تحویل‌شده» محسوب شوند:

- Unknown hash در Standalone به `ProductNotFound` می‌رسد و Source build از `notFound()` استفاده می‌کند.
- `getLegacyResolution` بین Redirect و ۱۱ قابلیت حذف‌شده (`unavailable`) تفکیک می‌کند.
- `shouldHandleStandaloneAnchor` کلیک غیرچپ، modifier key، `target`, `download` و فایل‌ها را intercept نمی‌کند.
- `standalonePathFromHash` path را از Query/anchor جدا می‌کند.
- Query redirect در مسیر effect توسط `LegacyRedirect.targetWithContext` حفظ می‌شود.

Gapهای تست برای همین اصلاحات:

- هیچ تستی Home Router را با hash ناشناخته Render نکرده و 404 را assert نمی‌کند.
- هیچ تستی modifier click، `target=_blank`, `download`, file URL و same-page anchor را روی Shell واقعی اجرا نمی‌کند.
- هیچ تستی ۱۱ `unavailable` را در Source و Standalone مقایسه نمی‌کند.
- `tests/architecture-v13.test.tsx:17-24` فقط یکتایی Redirect و شروع مقصد با `/app` را می‌سنجد؛ semantic equivalence، target existence و unavailable را نمی‌سنجد.
- تست‌های `standalone.test.ts` و `offline-bundle.test.ts` فقط marker/asset استقلال را بررسی می‌کنند و stale artifact را تشخیص نمی‌دهند.

## قرارداد پیشنهادی یکپارچه Route

یک Registry تایپ‌شده باید تنها مرجع تعریف مسیر باشد:

```ts
type RouteContract = {
  id: RouteId;
  pattern: string;
  role: Role | "shared" | "public";
  job: ProductJobId;
  params: ParamSchema;
  query: QuerySchema;
  build: (input: RouteInput) => string;
  resolve: (location: LocationLike, context: SessionContext) => RouteResolution;
  aliases: Array<SemanticAlias | UnavailableAlias>;
};

type RouteResolution =
  | { kind: "page"; routeId: RouteId; params: object; query: object }
  | { kind: "redirect"; to: string; replace: true }
  | { kind: "unavailable"; reason: string; next: string }
  | { kind: "not-found" };
```

الزامات:

1. Source Router، Standalone hash router، Navbar/CTA builder، `generateStaticParams`, `ROUTE_MANIFEST` و Crawler همگی از همین قرارداد تولید شوند.
2. `space`, `returnTo`, `step`, filter/sort/page/layout به‌صورت schema تعریف و merge شوند؛ Component اجازه ساخت دستی URL با string concat نداشته باشد.
3. Alias فقط با `ProductJobId` هم‌ارز Redirect شود؛ قابلیت حذف‌شده `unavailable` بماند و Renderer قدیمی حذف شود.
4. Shared route همیشه Context نقش/Workspace را به‌طور صریح دریافت کند.
5. `resolveLocation` pure باشد و برای Source و Standalone تست مشترک داشته باشد.
6. Entity ID قبل از redirect یا render از Repository یکتا resolve شود.

## ماتریس حداقل Regression موردنیاز

| دسته | سناریوهای اجباری |
|---|---|
| Resolution | هر ۴۲۰ Location؛ trailing slash؛ query/hash؛ unknown؛ malformed dynamic ID |
| Legacy | هر ۵۹ Redirect با Query preservation؛ هر ۱۱ Unavailable؛ semantic Job ID؛ عدم redirect به sample record بدون context |
| Standalone parity | همان Fixtureهای Source برای page/redirect/unavailable/not-found؛ بدون console error یا hydration mismatch |
| Click contract | click، middle click، Ctrl/Cmd/Shift/Alt، `_blank`, `download`, PDF، external، mailto/tel، anchor |
| Query/history | filter/sort/page/layout/step/space/returnTo با refresh و Back/Forward در URL و hash |
| Workspace | تمام Solver links در individual/team؛ new tab؛ localStorage خالی/خراب؛ عدم اختلاط Draft/Permission |
| Auth continuation | solver/org × login/register/OTP/recovery/onboarding × source/standalone |
| Shared pages | Search/Tasks/Calendar/Messages/Notifications/Documents/Help/Account در چهار Role با Shell صحیح |
| Entity consistency | یک ID در Public/Solver/Org/Reviewer/Ops با نام، مالک، لوگو و state transition یکتا |

## شواهد ابزار و نتیجه

- Typecheck مستقیم: **Pass**.
- تست انتخابی: `architecture-v13`, `e2e-navigation`, `standalone`, `offline-bundle`: **۴ فایل، ۲۳ تست Pass**.
- این Passها P0/P1های بالا را رد نمی‌کنند، چون Resolver نهایی، artifact hash، unknown hash، semantic aliases، generated links، Back/Forward و cross-role shared context را نمی‌سنجند.
- `out/` در Snapshot وجود ندارد؛ بنابراین `verify-routes` و Link check روی Static Export فعلی قابل استناد نیستند.

## معیار خروج از این بخش

Route/Navigation فقط زمانی قابل قبول است که:

- Manifest تولیدی دقیقاً با Registry runtime و Static params یک count/hash داشته باشد.
- همه ۴۲۰ Location فعلی یا مقصد معتبر، Redirect معنایی، Unavailable آگاهانه یا Not Found تست‌شده داشته باشند.
- `index.html` از همان Source hash ساخته و تست parity شود.
- هیچ ID collision و هیچ multi-renderer collision باقی نماند.
- `space` و `returnTo` در تمام deep-link/refresh/back/new-tab حفظ شوند.
- `/contact` یا هر لینک خارج Registry صفر باشد.
- هیچ Sidebar/Quick link کاربر را به Workspace یا record ثابتِ نقش دیگر نبرد.


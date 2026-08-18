# مدل یکپارچه موجودیت و وضعیت

نسخه Release Gate — ۱۴۰۵/۰۵/۲۴

## قرارداد هویت

| موجودیت | شناسه نمونه | مالک/رابطه کلیدی | منبع حقیقت در نسخه مستقل |
|---|---|---|---|
| User | `USR-*` | عضویت در Workspace | Session versioned |
| Session | `rahhal.session.v1` | یک Role و Workspace فعال | `lib/auth/session.ts` |
| Workspace | `WS-*` | فرد، تیم یا سازمان | Session + Solver space |
| Organization | `ORG-*` | ناشر Challenge | `data/organization-registry.ts` |
| Team | `TEAM-*` | TeamMembershipها | Solver team store |
| TeamMembership | `TM-*` | User + Team + Role | Team role store |
| Challenge | `CH-*` | Organization | `lib/challenges/storage.ts` |
| Opportunity view | Challenge ID | Projection حل‌کننده/عمومی | `lib/challenges/public-catalog.ts` |
| DirectOffer | `OFF-*` | Organization → Solver/Team | `lib/offers/store.ts` |
| Proposal | `PR-*` | Challenge + Workspace | Proposal workspace store |
| ProposalVersion | `PR-*/v*` | Proposal | Command/receipt projection |
| ReviewAssignment | `RV-*` | Proposal + Reviewer | `data/internal-routes.ts` + COI store |
| ReviewScore | `RV-*/score` | Assignment | Reviewer form state |
| Decision | `DEC-*` | Challenge + Proposal | Product command projection |
| ContractVersion | `CTR-*/v*` | Decision | State machine + command store |
| Pilot | `PIL-*` | Contract + Challenge | Pilot workspace |
| Deliverable | `DLV-*` | Pilot | Technical acceptance gate |
| Payment | `PAY-204` | Contract + Deliverable | `lib/payments/store.ts` |
| Notification | `NTF-*` | Actor/recipient | Side effect contract |
| Conversation/Message | `THR-*` | Case participants | Shared route context |
| Document | `DOC-*` | Case + access policy | Version/access metadata |
| AuditEvent/Receipt | `AUD-*` / `RC-*` | Command + actor + entity | `lib/services/internal-service.ts` |

قواعد اجراشده:

- هر ID فقط یک هویت دارد؛ `CH-1405-021` در همه نماها «بازیابی هوشمند آب در خط شست‌وشوی صنعتی» از «گروه مپنا» است.
- List، Detail، دعوت، پیشنهاد و سازمان از Registry و Store مشترک Projection می‌شوند.
- State از Enum و Transition مشتق می‌شود، نه از متن Badge.
- تاریخ، پول و شناسه در لایه Formatter از داده خام جدا هستند.
- داده نمایشی نسخه‌دار، دارای Migration، TTL و Corruption fallback است.

## قرارداد Persistence

| Store | Schema | دوام | Migration/Recovery | Cross-tab signal |
|---|---:|---|---|---|
| Session | v1 | ۸ ساعت | حذف Session منقضی/خراب | Storage event |
| Organization challenges | v7 | ۹۰ روز | Migration از v6 + seed canonical | `rahhal:challenge-catalog` |
| Direct offers | v1 | پایدار تا Reset داده نمایشی | fallback به seed معتبر | `rahhal:direct-offers` |
| Product commands | v1 | ۲۵۰ فرمان اخیر | Corruption → empty store | `rahhal:product-command` |
| Payments | v1 | پایدار تا Reset | seed امن PAY-204 | `rahhal:payments` |
| Proposal draft | Challenge + Workspace | تا ارسال/Reset | Migration کلید قدیمی | Storage event |
| Reviewer COI | Assignment-scoped v1 | تا تغییر تصمیم | unknown → pending | Storage event |

اطلاعات رمز، تکرار رمز، OTP، نام، ایمیل و تلفن در Draft ثبت‌نام ذخیره نمی‌شوند. Draft ثبت‌نام فقط ساختار حساب، عنوان، تخصص، تجربه و شهر را نگه می‌دارد.

## ماشین‌های وضعیت

پیاده‌سازی مرجع: `domain/state-machines.ts`. هر Transition شامل actor، precondition، side effect، notification، audit و retry policy است.

### ۱. Challenge

| از | اقدام | Actor | شرط | به | پیامد |
|---|---|---|---|---|---|
| draft | ارسال برای بررسی | org | اعتبارسنجی مرحله‌ها | under_review | قفل نسخه + رسید |
| under_review | تأیید آمادگی | ops/org | Gateهای فنی/حقوقی/مالی | ready | اعلان ناشر |
| ready | انتشار | org/ops | نسخه معتبر و Redaction | published | ظاهرشدن در Public و Solver |
| published | شروع ارزیابی | org | پیشنهاد واجد شرایط | evaluating | بازشدن Review |
| evaluating | ثبت تصمیم | org | امتیاز و rationale | decided | اعلان دوطرفه |
| decided | فعال‌سازی قرارداد | org | Approvalهای لازم | contracted | ساخت پرونده قرارداد |
| contracted | آغاز پایلوت | org | قرارداد effective | piloting | ساخت Pilot |
| piloting | بستن | org | خروجی/اثر ثبت‌شده | closed | Audit نهایی |

### ۲. Proposal/Solution

`draft → submitted → locked → eligible → clarification → reviewing → selected/rejected → revision_requested → resubmitted`

- ارسال فقط توسط مالک یا مدیر مجاز Workspace.
- نسخه ارسال‌شده قفل، Receipt ایجاد و در Inbox سازمان Projection می‌شود.
- درخواست شفاف‌سازی اعلان و CTA مرتبط برای همان Proposal ایجاد می‌کند.

### ۳. Direct Offer/Invitation

`pending → accepted | declined | expired | cancelled`

- پذیرش/رد در Store مشترک ثبت و در هر دو نقش هم‌زمان دیده می‌شود.
- ID ناشناخته 404 می‌شود و هرگز به دعوت دیگری fallback نمی‌کند.

### ۴. TeamMembership

`requested | invited → active | rejected | expired` و `active → removed`

- Owner تغییرناپذیر است مگر در فلو انتقال مدیریت.
- مدیری که Owner او را ارتقا داده است دوباره می‌تواند به ویرایشگر یا مشاهده‌گر تنزل یابد.
- حذف مدیر آخر قبل از انتقال مدیریت Block می‌شود.

### ۵. ReviewAssignment

`assigned → coi_pending → accepted | declined → in_progress → submitted → locked` با شاخه `invalidated`.

- Deep link به مدارک، مقایسه، امتیاز یا ثبت نهایی تا COI=clear مسدود است.
- Submit امتیاز را قفل و Receipt ایجاد می‌کند.

### ۶. ContractVersion

`draft → negotiation → approval → signature → effective` با شاخه `rejected/superseded`.

- مالکیت فکری پیشین/ایجادشده و Diff نسخه قبل از امضا نمایش داده می‌شود.

### ۷. Pilot و Deliverable

`planned → active → completed | paused | cancelled` و Deliverable: `draft → submitted → accepted | revision_requested | rejected`.

- پذیرش فنی از تأیید مالی مستقل است.

### ۸. Payment

`triggered → approval → processing → paid → reconciled` با شاخه‌های `hold/failed/refunded`.

- ورود به Approval نیازمند پذیرش فنی است.
- ورود به Processing نیازمند قرارداد effective و تأیید مالی است.
- Paid بدون Finance approval غیرممکن است.
- فرمان‌ها Idempotent هستند و Receipt/Audit تولید می‌کنند.

## قرارداد سازگاری بین نقش‌ها

| رویداد منبع | Projection مقصد | شناسه مشترک | آزمون |
|---|---|---|---|
| سازمان دعوت می‌فرستد | پیشنهادهای دریافتی فرد/تیم | Offer ID | `release-contracts.test.ts` |
| حل‌کننده پاسخ می‌دهد | وضعیت دعوت سازمان | Offer ID | `organization-parity-v25.test.tsx` |
| سازمان Challenge را منتشر می‌کند | Public/Solver catalog | Challenge ID | `release-contracts.test.ts` |
| حل‌کننده Proposal ارسال می‌کند | Inbox سازمان + Receipt | Proposal ID/version | `flows.test.ts` |
| داور COI را تأیید می‌کند | دسترسی score/materials | Assignment ID | `internal-app.test.tsx` |
| داور Submit می‌کند | پیشرفت Review سازمان | Assignment/Proposal ID | `flows.test.ts` |
| خروجی فنی پذیرفته می‌شود | Finance gate | Deliverable/Payment ID | `release-contracts.test.ts` |

## مرز نسخه نمایشی

این نسخه یک Frontend مستقل با Mock Backend نسخه‌دار است. قرارداد Store، Migration، Idempotency، Permission و State Machine برای جایگزینی با API واقعی آماده شده، اما احراز هویت، Audit و پرداخت Production باید در Backend معتبر نیز enforce شوند؛ Local Storage مرجع امنیتی Production نیست.

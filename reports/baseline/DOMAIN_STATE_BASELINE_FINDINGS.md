# ممیزی مدل دامنه، State، Persistence و سازگاری Cross-role

تاریخ ممیزی: ۲۰۲۶-۰۸-۱۵  
دامنه بررسی: سورس `rahhal-frontend-v25-complete`، بدون تغییر در سورس اصلی  
نقش ممیز: Senior Frontend Architect + QA/Test Architect

## نتیجه اجرایی

در وضعیت فعلی، تست‌های موجود سبز هستند اما «سبز بودن» آن‌ها به‌معنای صحت محصول نیست. اجرای پایه زیر موفق بود:

```text
npm test -- --run tests/domain.test.ts tests/challenge-flow.test.ts tests/organization-parity-v25.test.tsx
3 فایل تست / 21 تست: Pass
```

با این حال، تست‌ها عمدتاً وجود متن، Route و تغییر state محلی React را بررسی می‌کنند. هیچ‌کدام یک mutation مشترک را از یک نقش ایجاد و نتیجه همان Entity را در نقش دیگر بازخوانی نمی‌کنند. برای نمونه، تست «تطابق سازمان» پس از ارسال دعوت فقط صفحه دعوت‌های از پیش Seedشده خود سازمان را باز می‌کند (`tests/organization-parity-v25.test.tsx:77-105`) و فلو چرخه پیشنهاد صرفاً وجود Route و عنوان صفحه را می‌سنجد (`tests/organization-parity-v25.test.tsx:107-141`).

خلاصه یافته‌ها:

| Severity | تعداد | وضعیت |
|---|---:|---|
| P0 | 7 | باز؛ مانع انتشار |
| P1 | 12 | باز؛ مانع تجربه قابل اتکا |
| P2 | 6 | باز؛ ریشه کیفیت/نگهداشت |

## یافته‌های P0

### DOM-P0-001 — برخورد قطعی شناسه `CH-1405-021`

**شواهد**

- دیتاست عمومی این شناسه را «بازیابی هوشمند آب در خط شست‌وشوی صنعتی»، متعلق به `mapna` و در وضعیت «دریافت راهکار» تعریف می‌کند: `data/mock.ts:3-17`.
- Repository سازمانی همان شناسه را «کاهش مصرف آب در خط شست‌وشوی صنعتی»، متعلق به کاربر سازمانی ثابت «شرکت آتیه‌ساز» و در وضعیت `draft` تعریف می‌کند: `lib/challenges/storage.ts:37-52` و `domain/challenge.ts:103-108`.
- Fixture داخلی همان شناسه را برای «شرکت نمونه آتیه‌ساز» در مرحله داوری استفاده می‌کند: `data/fixtures/internal.ts:1-14`.
- Workspace سازمان نسخه چهارم مستقلی از همین رکورد دارد: `components/organization-workspace.tsx:28-56`.

**اثر**

یک URL/ID به چند ناشر، عنوان و State متفاوت اشاره می‌کند. نمایش عمومی، Solver، Organization، Reviewer و Ops نمی‌توانند درباره یک Entity واحد توافق کنند. این مورد مطابق تعریف پروژه P0 Entity Collision است.

**اصلاح سیستمی پیشنهادی**

یک `Challenge` canonical در Store مرکزی تعریف و همه View Modelها را با ID به آن متصل کنید. Seedهای `data/mock.ts`، `data/fixtures/internal.ts`، `organizationChallenges` و `lib/challenges/storage.ts` نباید Entity مستقل بسازند. یک validator زمان Build باید Duplicate ID با payload متفاوت را Fail کند.

**Regression**

1. تست `entity-identity-uniqueness` روی همه Seedها؛ یک ID با دو fingerprint متفاوت Build را Fail کند.
2. تست Cross-role که عنوان، organizationId، deadline، status/version شناسه `CH-1405-021` را در Public، Solver، Org، Reviewer و Ops برابر بداند.
3. تست route-by-id و route-by-slug که هر دو به همان Entity برسند.

### DOM-P0-002 — برخورد چندگانه `PR-104` و اتصال Draft به Challenge اشتباه

**شواهد**

- سمت Solver، `PR-104` به `CH-1405-025` نسبت داده شده و عنوانش «بهینه‌سازی مصرف انرژی در خطوط تولید» است: `components/solver-profile-experience.tsx:31-42`؛ در حالی که خود `CH-1405-025` در دیتاست عمومی «تشخیص عیب سطحی قطعات با بینایی ماشین» است: `data/mock.ts:61-72`.
- سمت سازمان، `PR-104` پیشنهاد «تیم نوآب» برای `CH-1405-021`/مسئله آب است: `components/organization-workspace.tsx:101-111` و `data/fixtures/internal.ts:124-135`.
- Wizard ساخت پیشنهاد، مستقل از `proposalId` و Route، همیشه Draft را با کلید `rahhal:proposal:CH-1405-022:${space}` ذخیره می‌کند: `components/solver-proposal-wizard.tsx:565-582`.
- Builder قدیمی نیز یک Store جدا با کلید `rahhal:proposal:PR-104` دارد: `components/internal/pages.tsx:2110-2137`.

**اثر**

ویرایش یک پیشنهاد می‌تواند Draft یک Challenge دیگر را نمایش/بازنویسی کند؛ نسخه ارسالی Solver و نسخه دیده‌شده Org یک Entity نیستند. خطر data loss و تصمیم روی Proposal اشتباه وجود دارد.

**اصلاح سیستمی پیشنهادی**

`Proposal { id, challengeId, ownerWorkspaceId, currentVersionId, state }` و `ProposalVersion` مستقل بسازید. کلید Draft باید حداقل شامل `workspaceId/proposalId/versionId` باشد و challengeId فقط رابطه باشد. تمام Routeها proposalId را resolve و عدم تطابق proposal.challengeId با پرونده را 404/Permission-safe کنند.

**Regression**

- ساخت دو Draft هم‌زمان برای دو Challenge و دو Team؛ عدم آلودگی داده.
- ویرایش مستقیم `/PR-104/edit` و Assert روی `proposal.challengeId` canonical.
- ارسال `PR-104` و بازخوانی همان `versionId/checksum/receiptId` در Inbox سازمان.
- تست collision روی تمام `PR-*`ها.

### DOM-P0-003 — Permission model وجود دارد اما در Runtime استفاده نمی‌شود؛ COI قابل دورزدن است

**شواهد**

- `canPerform` و deny-by-default فقط در `domain/product.ts:27-55` تعریف شده‌اند.
- جست‌وجوی کل سورس نشان می‌دهد `canPerform` و `canTransition` فقط در تست‌ها فراخوانی می‌شوند (`tests/domain.test.ts:10-55`) و هیچ Action/Route Runtime از آن‌ها استفاده نمی‌کند.
- `InternalApp` صرفاً `route.role` را می‌خواند و بدون Session/Actor/Workspace guard صفحه را Render می‌کند: `components/internal/internal-app.tsx:53-72`.
- Routeهای `materials`، `score`، `compare` و `submit` داور مستقل و مستقیم قابل Resolve هستند: `data/internal-routes.ts:1297-1339`.
- state تعارض فقط state محلی صفحه conflict است (`components/internal/pages.tsx:2720-2775`)؛ ورود مستقیم به score بدون عبور از COI محتوای امتیازدهی را نمایش می‌دهد (`components/internal/pages.tsx:2776-2853`).

**اثر**

دورزدن COI/NDA/role از طریق Deep link ممکن است. مخفی کردن CTA نیز Action guard محسوب نمی‌شود.

**اصلاح سیستمی پیشنهادی**

یک `AuthorizationPolicy.evaluate(actor, workspace, resource, action)` واحد در Route loader و Command handler اجرا شود. Reviewer materials/score/submit باید از persisted `ReviewAssignment.state` و `coiDecision` Gate بگیرند. پاسخ Permission نباید وجود Entity محرمانه را افشا کند.

**Regression**

- Matrix تمام Role × Route × Action؛ deny-by-default.
- ورود مستقیم Reviewer به materials/score/submit پیش از COI => صفحه Permission-safe، بدون metadata حل‌کننده.
- COI=conflict => revoke access و ایجاد audit؛ COI=clear => فقط همان assignment باز شود.
- تلاش Action با DOM دستکاری‌شده یا فراخوانی مستقیم command باید Fail شود.

### DOM-P0-004 — انتشار Challenge سازمان به Solver/Public متصل نیست

**شواهد**

- فلو سازمان رکوردها را در `rahhal.organization-challenges.v6` نگه می‌دارد: `lib/challenges/storage.ts:8-17,184-213`.
- فهرست Solver از آرایه static `data/mock.ts` مشتق می‌شود: `components/challenge-discovery.tsx:10-16,132-147` و هرگز `listChallenges()` را نمی‌خواند.
- فهرست سازمان از `useChallengeList()`/LocalStorage می‌خواند: `components/challenge-flow/list-page.tsx:7-10,29-54`.

**اثر**

سناریوی P0 «Org creates/publishes Challenge → Solver sees it» قابل انجام نیست. حتی اگر وضعیت سازمان `published` شود، Solver نسخه دیگری از دنیا را می‌بیند.

**اصلاح سیستمی پیشنهادی**

Repository مرکزی versioned برای همه Challengeها بسازید. Public/Solver selector فقط `published` و visibility-compatible را از همان Store انتخاب کند. Publication باید event و snapshot/version عمومی بسازد، نه تغییر یک آرایه مستقل.

**Regression**

- E2E: Org Draft → approvals → publish → همان ID/slug در Public و Solver.
- Amendment پس از انتشار باید نسخه عمومی جدید و timeline بسازد.
- Invite-only/NDA challenge نباید در فهرست عمومی دیده شود.

### DOM-P0-005 — Actionهای حساس Receipt موفق می‌سازند اما هیچ Mutation واقعی ندارند

**شواهد**

- قرارداد سرویس فقط `action: string` و `mode` می‌گیرد؛ actor، entityId، expectedVersion، payload، reason و idempotency key ندارد: `lib/services/internal-service.ts:1-24`.
- در موفقیت فقط receipt مبتنی بر زمان ساخته می‌شود و هیچ Store/Audit/Notification تغییر نمی‌کند: `lib/services/internal-service.ts:50-63`.
- `execute` صرفاً Receipt و Toast را در state همان Component قرار می‌دهد: `components/internal/internal-app.tsx:129-160`.
- عملیات تصمیم، پذیرش تحویل، تأیید مالی و ثبت نهایی داوری همگی از همین مسیر عبور می‌کنند: `components/internal/pages.tsx:1420-1427,1686-1692,1776-1781,2892-2897`.
- Receipt با refresh از بین می‌رود و در `auditEvents` append نمی‌شود.

**اثر**

محصول می‌تواند «تصمیم/پرداخت/داوری ثبت شد» نشان دهد در حالی که Entity و طرف مقابل هیچ تغییری نکرده‌اند. این مورد برای تصمیم و پرداخت P0 است.

**اصلاح سیستمی پیشنهادی**

یک Command Bus/Reducer اتمیک بسازید:

```ts
type Command = {
  commandId: string; idempotencyKey: string;
  actorId: string; workspaceId: string;
  entityType: EntityType; entityId: string;
  action: Action; expectedVersion: number; payload: unknown;
}
type CommandResult = {
  entityVersion: number; events: AuditEvent[];
  notifications: Notification[]; receipt: Receipt;
}
```

Mutation، Audit، Notification و Receipt باید در یک transaction محلی/Mock Backend ثبت شوند؛ UI نتیجه را از Store بازخوانی کند.

**Regression**

- هر Action حساس: precondition، pending/disabled، success mutation، error/retry، receipt/audit، refresh.
- اجرای دو بار command با idempotencyKey یکسان => یک event/record.
- conflict روی expectedVersion => عدم mutation و حفظ ورودی.
- تست Cross-role پس از mutation، نه فقط Toast.

### DOM-P0-006 — Gateهای پذیرش فنی و مالی enforce نمی‌شوند

**شواهد**

- جدول Finance وضعیت‌ها را از literal string می‌سازد و Action «تأیید مالی» به generic `onAction` می‌رود: `components/internal/pages.tsx:1704-1781`.
- `caseTransitions` هیچ State جدا برای Deliverable acceptance/Finance approval/Payment ندارد: `domain/product.ts:15-25,106-121`.
- `performDemoAction` برای عبارت پرداخت بدون بررسی deliverable/contract/authorization receipt موفق می‌دهد: `lib/services/internal-service.ts:21-63`.
- Paymentهای Solver و Mock هویت یکسان ولی داده متفاوت دارند؛ برای مثال `PAY-5012` در Mock «پاداش فینالیست آب‌نگر/۲۵۰م» است (`data/mock.ts:367-375`) اما در Solver «مرحله اول پایلوت» با خلاصه پرداخت‌شده ۴۲۰م است (`components/solver-workflow-experience.tsx:378-409`).

**اثر**

خطر نمایش یا ثبت پرداخت اشتباه/زودهنگام و receipt ناسازگار بین نقش‌ها وجود دارد.

**اصلاح سیستمی پیشنهادی**

Payment را به `contractId`, `milestoneId`, `deliverableId`, `technicalAcceptanceId`, `financeApprovalId` متصل کنید. Transition به `processing` فقط وقتی هر دو Gate مستقل معتبرند مجاز باشد. Amount عدد خام/واحد پول canonical باشد.

**Regression**

- payment قبل از technical acceptance => BLOCKED.
- technical acceptance بدون finance approval => payment همچنان blocked.
- duplicate callback/idempotency و retry/failure/hold/refund/reconcile.
- مقدار، عنوان، status و receipt هر `PAY-*` در Org/Solver/Ops برابر.

### DOM-P0-007 — Deep link ناشناخته دعوت به اولین Entity سقوط می‌کند

**شواهد**

`ReceivedOfferResponsePage` برای offerId ناشناخته به `receivedProposalSeed[0]` fallback می‌کند: `components/solver-profile-experience.tsx:871-873`. Router هر مسیر `/app/solver/received-proposals/*` را به همین تجربه می‌فرستد: `components/internal/internal-app.tsx:90-108`.

**اثر**

لینک خراب یا دستکاری‌شده به‌جای 404/Permission-safe، اطلاعات و فرم `OFF-211` را نمایش می‌دهد و می‌تواند پاسخ را روی Entity اشتباه ذخیره کند.

**اصلاح سیستمی پیشنهادی**

Resolver باید نتیجه `found | not-found | forbidden` بدهد؛ هیچ fallback entity مجاز نیست. Repository باید ownerWorkspace و visibility را قبل از برگشت Entity کنترل کند.

**Regression**

- offerId ناشناخته => 404 آگاهانه.
- offerId متعلق به workspace دیگر => Permission-safe بدون افشای وجود.
- شناسه معتبر => دقیقاً همان Offer و storage namespace.

## یافته‌های P1

### DOM-P1-001 — دعوت همکاری سازمان و پیشنهاد دریافتی Solver دو Store مستقل‌اند

- Org دعوت را فقط به state آرایه `invited` اضافه و Toast «در سمت حل‌کننده قابل مشاهده است» نشان می‌دهد: `components/organization-workspace.tsx:364-369,547-560`.
- Org history یک آرایه محلی دیگر از `INV-*` دارد: `components/organization-workspace.tsx:376-388`.
- Solver Direct Offerها `OFF-211/OFF-219/OFF-226` از Seed مستقل‌اند: `components/solver-profile-experience.tsx:562-597`.
- هیچ دعوت تازه‌ای به فهرست Org یا Solver افزوده نمی‌شود؛ refresh همه چیز را برمی‌گرداند.

**Fix:** Entity واحد `DirectOffer` با actor/recipient workspace، challengeId، role، scope، deadline، disclosure و state machine.  
**Regression:** Org create → Solver pending; Solver accept/decline → همان ID و status در Org، Notification و Audit.

### DOM-P1-002 — شناسه `INV-301` برای دو مفهوم/هویت متفاوت استفاده شده است

- Org آن را دعوت همکاری برای «تیم نوآب» و مسئله آب می‌داند: `components/organization-workspace.tsx:377-388`.
- Solver آن را دعوت عضویت تیم «تیم نوآوران انرژی» از طرف سارا محمدی می‌داند: `components/solver-profile-experience.tsx:89-101`.

**Fix:** Namespace و Entity type صریح (`DO-*` برای DirectOffer، `TINV-*` برای TeamInvitation) یا ID globally unique با type discriminator.  
**Regression:** global-ID registry uniqueness و type-safe resolver.

### DOM-P1-003 — پاسخ دعوت و عضویت تیم فقط state محلی است و پس از Refresh از بین می‌رود

- رد Direct Offer persist نمی‌شود؛ restoration فقط مقدار exact `accepted` را می‌خواند: `components/solver-profile-experience.tsx:599-621,813-865`.
- Team membership request accept/reject فقط `useState` است: `components/solver-profile-experience.tsx:2137-2184`.
- دعوت‌های تیمی فرد نیز فقط `useState` هستند: `components/solver-profile-experience.tsx:2491-2514`.
- Dashboard دعوت شخصی آرایه/state جدا دارد: `components/solver-dashboard.tsx:427-464`.

**Fix:** `TeamMembership` و `TeamInvitation` در Store واحد با history و activation handshake.  
**Regression:** accept/reject + refresh + طرف مقابل + removed member permission revoke.

### DOM-P1-004 — Challenge transition و validation در Repository enforce نمی‌شود

- `submitChallenge` بدون `isRecordReady` هر record را `under_review` می‌کند: `lib/challenges/storage.ts:242-245`.
- `updateRecordStatus` هر Status را بدون Transition/Actor/Gate می‌پذیرد: `lib/challenges/storage.ts:247-249`.
- ماشین `caseTransitions` جداست و به Repository متصل نیست: `domain/product.ts:106-121`.

**Fix:** Transition service واحد با `assertCanTransition`, validation, actor, expectedVersion و side effects.  
**Regression:** تمام transitionهای مجاز/نامجاز، submit ناقص، resubmit، closed/amendment، role checks.

### DOM-P1-005 — هشت State Machine اجباری عملاً وجود ندارند

تنها دو مدل ناقص وجود دارد: `ChallengeStatus` شش‌حالته (`domain/challenge.ts:1-7`) و `CaseState` ده‌حالته (`domain/product.ts:15-25`) بدون mapping. Proposal/Offer/Membership/Review/Contract/Pilot/Deliverable/Payment عمدتاً با رشته فارسی آزاد نمایش داده می‌شوند. `Submission.status` و `Challenge.status` نیز `string` هستند: `types/index.ts:13-26,68-75`.

**Fix:** enum + transition table per entity؛ Badge/CTA/permission/next step فقط selector همان machine.  
**Regression:** table-driven transition tests شامل actor، precondition، event، notification، retry/rollback.

### DOM-P1-006 — Persistence پراکنده، بدون Schema/Migration/TTL/Account scope است

کلیدها میان فایل‌ها پراکنده‌اند: Challenge v6، saved-per-challenge، proposal-by-challenge/space، proposal-by-id، received-offer، response-by-offer/space، team draft، team roles، settings timestamp و solver-space. شواهد: `lib/challenges/storage.ts:8-17`، `lib/solver/saved-opportunities.ts:1-25`، `components/solver-proposal-wizard.tsx:582-599`، `components/solver-profile-experience.tsx:613-621,889-923,1285-1289,1900-1932,3412-3418`.

کلیدها userId/workspaceId/tenantId و schema envelope ندارند؛ بنابراین ورود کاربر دیگر روی همان مرورگر می‌تواند Draft/پاسخ/نقش کاربر قبلی را ببیند.

**Fix:** یک `rahhal.demo-store.v1` با schemaVersion, seedVersion, revision, accountId, workspaces, entities و migration/validation/quarantine/reset؛ حساسیت داده و TTL مشخص.  
**Regression:** migration N-1، corruption، account switch، workspace switch، TTL، quota/storage-denied، cross-tab.

### DOM-P1-007 — Corruption handling می‌تواند Store را خالی یا Runtime را خراب کند

- parser فقط Array بودن را چک می‌کند و shape را اعتبارسنجی نمی‌کند: `lib/challenges/storage.ts:23-31`.
- اگر JSON خراب باشد ولی seeded marker `true` بماند، `ensureSeedData` داده را ترمیم نمی‌کند: `lib/challenges/storage.ts:191-200`.
- داده Array اما ناقص می‌تواند در sort روی `updatedAt.localeCompare` خطا دهد: `lib/challenges/storage.ts:197-202`.

**Fix:** Runtime schema validation، migration، quarantine کلید خراب، recovery atomic و telemetry محلی.  
**Regression:** invalid JSON، array ناقص، unknown enum، version قدیمی، quota exceeded.

### DOM-P1-008 — Storage failure به اشتباه «ذخیره شد» گزارش می‌شود

- `saveChallenge` وقتی storage قابل استفاده نیست همان record را success برمی‌گرداند: `lib/challenges/storage.ts:209-213`.
- hook سپس saveStatus را `saved` می‌کند: `components/challenge-flow/hooks.ts:40-55`.
- Proposal wizard نیز خطای storage را می‌بلعد ولی پیام «ذخیره شد» نشان می‌دهد: `components/solver-proposal-wizard.tsx:593-605,637-645`.

**Fix:** Result type صریح `persisted | memory-only | failed` و UI متفاوت؛ در memory-only خروج امن/export draft بدهد.  
**Regression:** mock localStorage throw و Assert عدم نمایش «ذخیره شد».

### DOM-P1-009 — Reason اقدام حساس در Dialog جمع می‌شود اما دور ریخته می‌شود

- `ConfirmDialog` reason را در state داخلی می‌گیرد ولی `onConfirm` هیچ آرگومانی ندارد: `components/internal/shared.tsx:292-317,378-410`.
- Caller فقط label را به execute می‌فرستد: `components/internal/internal-app.tsx:262-277`.
- UI با این حال ادعا می‌کند reason در Audit ثبت می‌شود: `components/internal/shared.tsx:393-396`.

**Fix:** `onConfirm({reason})` و reasonCode/justification در Command/Audit/Receipt.  
**Regression:** reason exact در AuditEvent، empty/short blocked، PII redaction policy.

### DOM-P1-010 — Double submit و Idempotency کنترل نمی‌شود

- `performDemoAction` idempotencyKey ندارد و receipt ID از شش رقم انتهای `Date.now()` ساخته می‌شود: `lib/services/internal-service.ts:21-24,57-63`.
- `busy` فقط دکمه Primary header را غیرفعال می‌کند؛ Buttonهای داخل صفحات از آن خبر ندارند: `components/internal/internal-app.tsx:133-160,219-231`.

**Fix:** commandId/idempotencyKey، dedupe ledger، entity version optimistic concurrency، pending state مشترک بر اساس command scope.  
**Regression:** double click، retry پس از timeout، Back/Forward resubmit، دو Tab هم‌زمان.

### DOM-P1-011 — Reviewer assignments و Autosave واقعی نیستند

- Queue از چند reviewer card ساخته می‌شود اما همه CTAها به `RV-204/conflict` می‌روند: `components/internal/pages.tsx:2690-2714`.
- score state در هر mount از `[85,78,90,82]` آغاز می‌شود و متن rationale uncontrolled است؛ «پیش‌نویس ذخیره شد» فقط متن است: `components/internal/pages.tsx:2644-2647,2776-2835`.
- ثبت نهایی state assignment را lock نمی‌کند: `components/internal/pages.tsx:2854-2898`.

**Fix:** ReviewAssignment و ReviewScore per criteria در Store، routes پویا بر اساس assignmentId، COI state persisted، submit atomic lock.  
**Regression:** هر card ID خودش؛ refresh autosave؛ submit lock؛ unauthorized invalidate with reason/audit.

### DOM-P1-012 — عملیات Org مثل Role/Profile/Settings/Download فقط نمایشی‌اند

- تغییر Role سازمان فقط state محلی keyed by **نام** است و Audit/Persistence ندارد: `components/organization-workspace.tsx:1003-1095`.
- پروفایل با uncontrolled `defaultValue` کار می‌کند و Save فقط Toast است: `components/organization-workspace.tsx:1114-1185`.
- Settings کنترل‌های uncontrolled دارد و Save فقط Toast است: `components/organization-workspace.tsx:1222-1385`.
- «خروجی دعوت»، «دریافت رزومه PDF»، «خروجی مالی» و «گزارش PDF» handler/download واقعی ندارند: `components/organization-workspace.tsx:424-426,607-610,876-878,923-927`.

**Fix:** Member ID پایدار، form model/validation، commands واقعی و downloads Blob معتبر یا disabled با توضیح.  
**Regression:** role/profile/settings refresh، Audit actor/reason، download MIME/signature/filename، no-op button crawler.

## یافته‌های P2

### DOM-P2-001 — Organization دو Source of Truth مستقل دارد

`organizationProfiles` فهرست ۴۸تایی با شمارنده‌های تولیدشده الگوریتمی است (`data/organization-profiles.ts:24-162`) و `organizationRegistry` هویت/لوگو/industry دیگری نگه می‌دارد (`data/organization-registry.ts:28-109`). سازمان جاری «آتیه‌ساز» در هیچ‌کدام canonical نیست و در Workspace به‌صورت متن/monogram hard-code شده است (`components/organization-workspace.tsx:1133-1174`).

**Fix:** Organization canonical + Profile projection + central asset registry. KPIها فقط selector داده واقعی demo store.  
**Regression:** slug/id uniqueness، profile/registry parity، challenge publisher identity parity.

### DOM-P2-002 — actor/session با داده پرونده مخلوط شده است

`currentUser` داخل domain challenge یک شخص و سازمان ثابت است (`domain/challenge.ts:96-108`) و هنگام `emptyChallenge` owner/contact را تزریق می‌کند (`lib/challenges/storage.ts:138-180`). Session/Workspace مستقل وجود ندارد.

**Fix:** Domain factory context را به‌صورت ورودی بگیرد؛ `Session`, `User`, `Workspace`, `Membership` Entity مستقل.  
**Regression:** دو account و دو workspace روی یک device؛ owner/contact درست و بدون leakage.

### DOM-P2-003 — وضعیت، تاریخ و پول type-safe نیستند

- `Challenge.status` و `Submission.status/eligibility` رشته آزادند: `types/index.ts:13-26,68-75`.
- برخی مبلغ‌ها number هستند (`data/mock.ts`) و برخی string فارسی/اختصاری (`components/organization-workspace.tsx:101-131,839-868`).
- تاریخ‌ها ترکیبی از ISO، رشته جلالی و relative text هستند.

**Fix:** raw canonical values (`amountMinor`, `currency`, ISO Instant, enum state) + formatter واحد.  
**Regression:** timezone، zero/large amount، LTR IDs، formatting consistency.

### DOM-P2-004 — Stateهای صفحه از متن/Regex استنتاج می‌شوند

`statusTone` با Regex فارسی tone را حدس می‌زند (`components/internal/pages.tsx:39-45`) و چند Component مشابه همین منطق مستقل را دارند. Badge و CTA از Machine selector نمی‌آیند.

**Fix:** state metadata map واحد `{label,tone,allowedActions,next}`.  
**Regression:** exhaustiveness همه enumها و snapshot متنی glossary.

### DOM-P2-005 — Cross-tab sync فقط برای Challenge list ناقص است

تنها `useChallengeList` listener عمومی `storage` دارد (`components/challenge-flow/hooks.ts:10-22`). Proposal، invitation، membership، roles، saved opportunities، settings و notifications cross-tab sync ندارند. Listener Challenge نیز key را filter نمی‌کند.

**Fix:** Store subscription/BroadcastChannel با revision، key scoping و conflict policy.  
**Regression:** دو window، mutation order، stale revision و merge/reload UX.

### DOM-P2-006 — پوشش تست موجود قراردادهای محصول را اثبات نمی‌کند

- `tests/flows.test.ts:6-22` فقط شمارش flow و وجود route را می‌سنجد.
- `tests/organization-parity-v25.test.tsx:77-105` دعوت را cross-role نمی‌خواند.
- lifecycle سازمان صرفاً title route را Assert می‌کند: `tests/organization-parity-v25.test.tsx:107-141`.
- domain test فقط سه حالت Permission و سه transition ساده دارد: `tests/domain.test.ts:10-55`.

**Fix:** Contract/integration/E2E test مبتنی بر Store واقعی و actor contexts.  
**Regression:** مجموعه پیشنهادی بخش بعد.

## معماری اصلاحی پیشنهادی

### ۱. Entity Store واحد

```text
DemoStoreEnvelope
├── schemaVersion / seedVersion / revision
├── sessionId / activeWorkspaceId
├── users / sessions / workspaces / memberships
├── organizations / teams / teamMemberships
├── challenges / proposals / proposalVersions
├── directOffers / reviewAssignments / reviewScores
├── decisions / contractVersions / pilots / deliverables / payments
├── notifications / conversations / documents
└── auditEvents / receipts / processedCommands
```

روابط فقط با ID؛ Viewها selector هستند و هیچ صفحه‌ای آرایه Entity مستقل تعریف نمی‌کند.

### ۲. State Machines حداقل لازم

| Entity | Transitionهای اصلی پیشنهادی |
|---|---|
| Challenge | `draft → triage → formulation → quality_review → approved → published → evaluation → decision → contracting → pilot → impact → closed`؛ بازگشت کنترل‌شده و amendment نسخه‌دار |
| Proposal | `draft → ready → submitted_locked → eligibility_pending → eligible/ineligible → review → clarification_requested → revision_draft → revision_submitted_locked → selected/rejected/withdrawn` |
| DirectOffer | `draft → pending → viewed → accepted/declined/expired/cancelled → response_draft → responded` |
| TeamMembership | `requested/invited → pending → accepted_pending_activation → active → removed` با شاخه rejected/expired/cancelled و transfer مالکیت |
| ReviewAssignment | `assigned → coi_pending → accepted/recused → in_progress → submitted_locked → invalidated` |
| ContractVersion | `draft → negotiation → approval_pending → signature_pending → effective → amended/terminated` |
| Pilot/Deliverable | Pilot: `planned → active → paused/completed/terminated`؛ Deliverable: `draft → submitted → technical_review → accepted/revision_requested/rejected` |
| Payment | `blocked → eligible → approval_pending → processing → paid → reconciled` با شاخه `hold/failed/refund` |

هر transition باید actor، permission، precondition، expectedVersion، side effect، notification، audit، idempotency و retry policy داشته باشد.

### ۳. Persistence contract

- envelope versioned و runtime-validated؛ migration مرحله‌ای و quarantine corruption.
- account/workspace scoping؛ logout/reset امن و TTL برای داده موقت.
- atomic write (`temp → verify → commit`) یا IndexedDB برای فایل/حجم بالاتر.
- subscription یکپارچه برای همان Tab و `storage/BroadcastChannel` برای Tab دیگر.
- LocalStorage فقط Demo adapter؛ Interface Store باید با backend adapter قابل جایگزینی باشد.

## Regression Suite الزامی

### Unit

1. Entity ID uniqueness/fingerprint collision.
2. همه transition tables به‌صورت table-driven، مجاز و نامجاز.
3. Authorization matrix با deny-by-default.
4. schema migration/corruption/TTL/account scoping.
5. formatter تاریخ/مبلغ/ID.
6. idempotency ledger و optimistic conflict.

### Store/Integration

1. Org publish → Solver selector همان Challenge.
2. Org DirectOffer → Solver received → accept/decline → Org updated.
3. Solver submit ProposalVersion → Org inbox همان checksum/receipt/version.
4. Org clarification → Solver notification/CTA → revision submission.
5. Org assign reviewer → reviewer queue؛ COI Gate؛ submit → Org progress.
6. Decision → selected proposal + notifications + contract draft.
7. Technical acceptance و Finance approval مستقل؛ Payment فقط پس از هر دو.
8. Team owner/member role change و immediate permission revoke.
9. refresh/cross-tab/back-forward بدون stale view.

### E2E P0

1. Org create/publish → Public/Solver discover.
2. Solver draft/submit → Org evaluate → Reviewer score → Org decision.
3. Decision → Contract → Pilot → Deliverable → Technical acceptance → Finance approval → Payment/Receipt.
4. DirectOffer round trip با accept/decline/expire/cancel.
5. Team proposal با owner/editor/viewer permissions و انتقال مالکیت.
6. Deep-link غیرمجاز/ناشناخته بدون fallback entity یا metadata leakage.
7. Double submit/retry/conflict/offline recovery.

### Negative/Security

- COI/NDA/permission bypass via URL.
- forged command/action call.
- stale expectedVersion.
- duplicate commandId/idempotencyKey.
- corrupted storage و storage denied/quota.
- account/workspace switching روی یک مرورگر.

## معیار خروج برای این حوزه

این بخش فقط وقتی Pass است که:

1. validator هیچ collision برای ID/رابطه پیدا نکند؛
2. همه Actionهای حساس mutation + Audit + Notification + Receipt اتمیک داشته باشند؛
3. هیچ صفحه‌ای Entity را از Seed محلی مستقل نسازد؛
4. Route و Action guard هر دو از policy واحد استفاده کنند؛
5. هشت State Machine بالا در Runtime enforce شوند؛
6. Cross-role suite واقعاً داده را بین actor contextها round-trip کند؛
7. refresh، account/workspace switch و cross-tab state سازگار بماند؛
8. هیچ P0/P1 این سند باز نماند.


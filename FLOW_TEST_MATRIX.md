# ماتریس تست فلوهای محصول

نسخه Release Gate — نتیجه نهایی

راهنما: **PASS** یعنی Route، پیش‌شرط، CTA، Mutation، Projection مقصد و Refresh/Deep-link متناسب با سطح تست بررسی شده است. جزئیات فرمان‌ها در `TEST_REPORT.md` آمده است.

## سناریوهای P0 اجباری

| # | فلو | Roleها | شواهد اصلی | نتیجه |
|---:|---|---|---|---|
| ۱ | ثبت‌نام فرد → پروفایل → Challenge → Proposal → Receipt | guest/solver | `e2e-navigation`, `flows`, `solver-proposal-wizard` | PASS |
| ۲ | ساخت/انتخاب تیم → نقش عضو → Proposal تیمی | solver/team | `solver-team-experience-v19`, `solver-v24-regressions` | PASS |
| ۳ | سازمان → Challenge جدید → Preview → Submit → Public/Solver | org/ops/solver | `challenge-e2e-ui`, `release-contracts` | PASS |
| ۴ | دعوت سازمان → پاسخ حل‌کننده → وضعیت دوطرفه | org/solver | `organization-parity-v25`, `release-contracts` | PASS |
| ۵ | Proposal → داور → COI → Score → Submit → Decision | org/reviewer | `internal-app`, `flows` | PASS |
| ۶ | Decision → Contract → Pilot → Deliverable → Finance → Payment | org/ops | `release-contracts`, `domain` | PASS |
| ۷ | Refresh و Back/Forward در Wizard بدون از‌دست‌رفتن Draft | org/solver | `challenge-flow`, `e2e-navigation` | PASS |
| ۸ | ورود مستقیم به Deep linkهای Canonical | همه | `verify-routes`, `check-links`, standalone smoke | PASS |
| ۹ | تلاش Role غیرمجاز برای Route/Action حساس | org/solver/reviewer/ops | `release-contracts`, `internal-app` | PASS |
| ۱۰ | موبایل + Keyboard برای Shell، Dialog و فرم اصلی | همه | responsive tests + dialog tests + axe | PASS با محدودیت دیداری ثبت‌شده |

## فلو مهمان تا حل‌کننده فردی

| گام | انتظار | تست/شاهد | نتیجه |
|---|---|---|---|
| Landing → فهرست چالش | Route معتبر، بدون Flash صفحه اشتباه | standalone interactive smoke | PASS |
| Search/Filter/Sort/Grid/List | State در URL، Back/Forward پایدار | `solver-v21-regressions`, `challenge-discovery` | PASS |
| جزئیات Challenge | Publisher/ID/مهلت canonical | `solver-v23-regressions`, entity contract | PASS |
| ذخیره در مهمان/ورود | state پایدار و Context حفظ | saved-opportunities tests | PASS |
| شروع Proposal | `returnTo` allowlisted و Query حفظ | `e2e-navigation`, `release-contracts` | PASS |
| ثبت‌نام/OTP/Recovery | فرم، خطا، Stepper صحیح، عدم ذخیره رمز | auth v20 + e2e navigation | PASS |
| تکمیل پروفایل/رزومه | Validation و Upload امن | solver profile + upload contract | PASS |
| Proposal Wizard | Challenge-scoped draft + autosave | proposal wizard regression | PASS |
| Preview/Submit | Confirm، idempotency، Receipt | flows + internal service | PASS |
| Clarification/Revision | State و CTA متناسب | internal route flows | PASS |

## فلو تیمی

| حوزه | قرارداد | تست/شاهد | نتیجه |
|---|---|---|---|
| Workspace switch | `space=team` در Navigation/Deep link حفظ | `e2e-navigation`, `solver-v21` | PASS |
| تیم‌سازی | Search + تخصص + دانشگاه + همکاری + sort | `solver-team-experience-v19` | PASS |
| درخواست عضویت | رزومه، مشاهده پرونده، پذیرش/رد | `solver-v24-regressions` | PASS |
| دعوت عضو | درخواست و پاسخ stateful | solver product flows | PASS |
| نقش‌ها | Owner ثابت؛ مدیر منصوب‌شده قابل تنزل | `solver-v24-regressions` | PASS |
| مالک Proposal | Workspace و Permission روشن | proposal wizard contract | PASS |
| ارسال نهایی | فقط Role مجاز + Receipt | permission/state tests | PASS |

## فلو سازمان

| حوزه | مسیرهای نمونه | تصمیم/CTA اصلی | تست | نتیجه |
|---|---|---|---|---|
| Dashboard | `/app/org/dashboard` | اقدام‌های نیازمند توجه | internal app | PASS |
| Intake | `/app/org/challenges/new` | ذخیره و ادامه | challenge flow | PASS |
| Triage | `/app/org/challenges/triage` | ارزیابی اولیه مستقل | route/flow crawl | PASS |
| Studio/Edit | `/app/org/challenges/:id/studio` | تکمیل Brief مرحله‌ای | challenge e2e | PASS |
| Preview/Redaction | `/preview` | بررسی انتشار | challenge e2e | PASS |
| Submit/Receipt | `/submitted` | رسید و مسیر بعد | challenge flow | PASS |
| Publication | Public/Solver catalog | Projection یک Challenge | release contracts | PASS |
| Proposal inbox | `/app/org/proposals` | Eligibility/نسخه/شفاف‌سازی | organization parity | PASS |
| Compare/Review | `/:id/compare`, `/:id/review` | مقایسه هم‌سنخ/داوری | internal flows | PASS |
| Decision | `/:id/decision` | ثبت تصمیم با Audit | product command | PASS |
| Contract/Pilot | `/:id/contract`, `/:id/pilot` | نسخه و مرحله اجرایی | domain tests | PASS |
| Deliverables/Finance | `/:id/deliverables`, `/:id/finance` | پذیرش فنی/تأیید مالی جدا | payment gate tests | PASS |
| Team/Access/Profile/Settings | مسیرهای سطح سازمان | Role/امنیت/هویت | organization parity | PASS |

## داور

| سناریو | انتظار | نتیجه |
|---|---|---|
| Queue بدون Assignment ثابت | RV-204/RV-188/RV-172 مستقل | PASS |
| Conflict route | بدون self-block، ثبت COI | PASS |
| Score deep link پیش از COI | Permission denied بدون افشای محتوا | PASS |
| Materials/Compare پس از COI clear | فقط مدارک مجاز | PASS |
| Autosave معیارها | State حفظ می‌شود | PASS |
| Submit | قفل + Receipt | PASS |

## عملیات، قرارداد و پرداخت

| سناریو | پیش‌شرط | نتیجه |
|---|---|---|
| Publication gate | Challenge ready/under_review | PASS |
| Verification case | Role=ops و reason code | PASS |
| Dispute case | دسترسی محدود و Audit | PASS |
| Finance approval | Technical accepted=true | PASS |
| Processing | Contract effective + finance approved | PASS |
| Paid | Processing + finance approved | PASS |
| Idempotent retry | idempotency key تکراری | PASS؛ رکورد duplicate ساخته نشد |

## State coverage

| State | مکانیزم تست | نتیجه |
|---|---|---|
| Loading | component fixtures / RouteResolving | PASS |
| Empty | StateNotice/empty fixture | PASS |
| Populated | fixture/store | PASS |
| Partial | validation and partial draft | PASS |
| Validation error | فرم‌های Auth/Challenge/Proposal | PASS |
| Network/API error | service `offline/error` fixture | PASS |
| Permission denied | Session/Role/COI guards | PASS |
| Locked/read-only | submitted/reviewer routes | PASS |
| Success with receipt | product command + submitted | PASS |
| Stale/conflict | service conflict fixture | PASS |

## سه دور Regression

| دور | دامنه | نتیجه |
|---:|---|---|
| ۱ | Typecheck + Lint + ۲۶ فایل/۱۳۴ تست | PASS |
| ۲ | ۶ فایل Critical E2E/Cross-role، ۴۲ تست + Crawl/Smoke | PASS |
| ۳ | Typecheck + Lint + Format + ۲۷ فایل/۱۳۷ تست + Production/Standalone/Crawl | PASS |

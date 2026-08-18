# نقشه نهایی مسیرهای Solver — نسخه ۲.۸.۰

## قرارداد context

- فردی: `?space=individual&workspaceId=WS-PERSONAL-001`
- تیمی: `?space=team&teamId=TEAM-…&workspaceId=WS-TEAM-…`
- تابع واحد ساخت لینک: `buildSolverHref`؛ خروجی standalone با `buildStandaloneSolverHref` به hash route تبدیل می‌شود.
- مسیر بدون context صریح، آخرین workspace معتبر همان کاربر را می‌خواند. context نامعتبر، تیم ناشناخته و عضویت غیرفعال به‌ترتیب به invalid/not-found/no-access می‌روند و به fixture دیگری fallback نمی‌شوند.
- تغییر workspace در route وابسته به entity به dashboard مقصد می‌رود و `notice=workspace-changed` ثبت می‌کند.

## مسیرهای اصلی

| مقصد | مسیر | مالک رکورد / پارامتر |
|---|---|---|
| داشبورد | `/app/solver/dashboard` | `workspaceId` |
| فهرست فرصت‌ها | `/app/solver/opportunities` | فیلتر، sort، page و view در query |
| جزئیات فرصت | `/app/solver/opportunities/:challengeSlug` | `challengeId` از registry؛ ۱۲ fixture مستقل |
| ذخیره‌شده‌ها | `/app/solver/saved` | `workspaceId` |
| فهرست پیشنهادها | `/app/solver/proposals` | `ownerWorkspaceId`؛ filter/sort/page در query |
| تدوین پیشنهاد | `/app/solver/proposals/new/:step` | `challenge` + `workspaceId`؛ stepهای `summary/technical/execution/team/budget/review` |
| ویرایش/پیش‌نمایش/نسخه‌ها | `/app/solver/proposals/:proposalId/{edit,preview,versions}` | `proposalId → challengeId → ownerWorkspaceId → currentVersionId` |
| پیشنهادهای مستقیم | `/app/solver/received-proposals` | `recipientWorkspaceId` |
| پاسخ پیشنهاد مستقیم | `/app/solver/received-proposals/:offerId/respond` | `offerId + recipientWorkspaceId` |
| تیم‌ها | `/app/solver/teams` | membershipهای کاربر جاری |
| ساخت تیم | `/app/solver/teams/new` | از فضای شخصی؛ draft نسخه‌دار |
| مدیریت تیم | `/app/solver/teams/:teamId` | `teamId + membershipId`؛ fixture و تیم ساخته‌شده |
| تیم‌سازی | `/app/solver/team-building` | workspace فعال |
| دعوت‌ها/درخواست‌ها | `/app/solver/invitations` و `/app/solver/invitations/:invitationId` | recipient user یا teamId |
| پروفایل و preview | `/app/solver/profile` و `/app/solver/profile/preview` | user یا teamId جاری |
| تنظیمات | `/app/solver/settings` | حساب انسانی یا teamId |
| احراز | `/app/solver/verification` | user/team subject + workspaceId |
| اعلان‌ها | `/app/solver/notifications` | recipientWorkspaceId |
| Data Room | `/app/solver/data-room?entity=:challengeId` | grant مرکب `workspaceId + entityId + NDA version` |
| پرونده‌ها | `/app/solver/cases` | `ownerWorkspaceId` |
| هاب پرونده | `/app/solver/cases/:caseId` | caseId + proposalId + contractId |
| پیام/پایلوت/پرداخت/قرارداد | `/app/solver/cases/:caseId/{messages,pilot,payments,contract}` | همان case و permission همان workspace |

## مسیرهای سازگاری

`/app/solver/pilots`، `/app/solver/payments`، `/app/solver/messages` و `/app/solver/reputation` برای سازگاری حفظ شده‌اند و projection هاب پرونده‌های canonical را نشان می‌دهند. مسیرهای legacy قدیمی موجود در `data/legacy-redirects.ts` فقط redirect معنایی به canonical دارند.

تمام teamها، proposalها، direct offerها، invitationها، caseها و challengeهای fixture در زمان ساخت `internalRoutes` به‌صورت data-driven به Static Export اضافه می‌شوند؛ بنابراین `TEAM-34`، `PR-109`، `PR-127`، `OFF-226` و `CASE-138` مسیر مستقل دارند.

# State machine و Storage Solver — نسخه ۲.۸.۰

## زنجیره‌های وضعیت

- Proposal: `draft → submitted → eligibility_review → eligible|ineligible → clarification_requested → clarification_submitted → reviewing → revision_requested → revision_draft → resubmitted → reviewing → selected|rejected`؛ withdrawal فقط با policy رکورد.
- Direct offer: `received → viewed → response_draft → response_submitted → negotiating → selected` و شاخه‌های `declined|expired|cancelled`. مشاهده هیچ‌گاه selected/accepted نمی‌سازد.
- Team invitation: `sent → viewed → accepted|declined|expired|revoked`.
- Membership request: `requested → accepted|rejected|withdrawn|expired`.
- Membership: `requested|invited → active → suspended|removed` و `suspended → active`.
- Verification: `not_started → draft → submitted → under_review → verified|needs_revision|rejected` و `needs_revision → submitted`.
- Contract: `draft → negotiation → approval → signature → effective`؛ نسخه جدید approvalهای نسخه قبلی را پاک و آن نسخه را supersede می‌کند.
- Pilot/Deliverable: `planned → running → deliverable-submitted → accepted|revision|rejected`؛ مدل canonical پرونده وضعیت‌های `planned/active/paused/completed/cancelled` و تحویل `draft/submitted/revision/accepted/rejected` را نگه می‌دارد.
- Case closure: فقط پس از تکمیل case، پذیرش همه deliverableها، پرداخت همه milestoneها و effective بودن قرارداد؛ feedback برای هر case یک‌بار.

## کلیدهای canonical

| کلید | نسخه/Scope | محتوا |
|---|---|---|
| `rahhal.solver.v3.user.USR-SOLVER-001` | v3 + user | registry کامل domain، storeها، receiptها و audit |
| `rahhal.solver.active-workspace.v2.USR-SOLVER-001` | v2 + user | ActiveWorkspace معتبر |
| `rahhal.solver.ui.v1:challenge-layout` | v1 + user UI | grid/list |
| `rahhal.solver.ui.v1:team-creation-draft` | v1 + user | resume wizard ساخت تیم |
| `rahhal.solver.recovery.v1` | recovery log | علت fallback داده خراب |
| session demo مشترک | versioned | هویت ورود و انقضا؛ team credential جدا ندارد |

## migrationهای اجراشده

- `rahhal:saved:<challengeId>` به `savedByWorkspace[WS-PERSONAL-001]` منتقل می‌شود.
- `rahhal:proposal:<challengeId>:individual|team` به `proposalDrafts` با content schema جدید تبدیل می‌شود؛ legacy team به `WS-TEAM-21` نگاشت deterministic دارد.
- `rahhal:solver-team-draft` به Team draft canonical با ID/workspace یکتا منتقل می‌شود.
- `rahhal:solver-space` به envelope فعال v2 و نخستین تیم دارای عضویت active منتقل می‌شود.
- draft ثبت‌نام Solver فقط فیلدهای غیرحساس را در Session Storage نگه می‌دارد و account type قدیمی را به `individual` normalize می‌کند؛ password/confirmation persist نمی‌شوند.
- JSON خراب یا envelope ناسازگار seed canonical را برمی‌گرداند، recovery evidence ثبت می‌کند و هرگز رکورد ناشناخته را به fixture پیش‌فرض resolve نمی‌کند.

Store v3 یک source of truth برای session/workspaces/teams/memberships/invitations/requests/profiles/saved/proposals/versions/offers/responses/notifications/cases/payments/contracts/verification/NDA/settings است. تغییرات با `rahhal:solver-store-change` و `storage` event بین viewها/tabها همگام می‌شوند.

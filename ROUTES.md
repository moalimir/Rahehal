# موجودی Routeهای رحّال

تمام مسیرهای محصول در Build استاتیک HTML مستقل دارند و Routeهای قبلی مرتبط به جریان کانونی Redirect می‌شوند. این سند علاوه بر مسیرهای جدید، موجودی تاریخی سایر پوسته‌ها را نیز نگه می‌دارد.

## مسیرهای کانونی ثبت مسئله سازمانی

- `/app/org/challenges/`
- `/app/org/challenges/new/`
- `/app/org/challenges/:id/`
- `/app/org/challenges/:id/edit/`
- `/app/org/challenges/:id/preview/`
- `/app/org/challenges/:id/submitted/`

مسیرهای `/org/challenges/...` به مسیر کانونی متناظر Redirect می‌شوند؛ `/studio/` نیز به `/edit/` منتقل می‌شود. Query `step=1..4` برای Deep Link گام استفاده می‌شود. Routeها از شناسه‌های Seed و pool پیش‌نویس به‌صورت داده‌محور تولید می‌شوند.

| پوسته                    | تعداد | Prefixهای اصلی                                                                                                            |
| ------------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------- |
| عمومی، Auth و Onboarding |    ۴۴ | `/`, `/challenges`, `/organizations`, `/how-it-works`, `/guides`, `/legal`, `/auth`, `/onboarding`                        |
| سازمان و Common shell    |    ۷۴ | `/org/*`, `/app/org/*`, `/app/search`, `/app/tasks`, `/app/calendar`, `/app/messages`, `/app/documents`, `/app/account/*` |
| حل‌کننده                 |    ۳۶ | `/solver/*`, `/app/solver/*`                                                                                              |
| داور                     |    ۱۱ | `/reviewer/*`, `/app/reviewer/*`                                                                                          |
| عملیات                   |    ۲۲ | `/ops/*`, `/app/ops/*`                                                                                                    |

## مسیرهای عمومی و شروع همکاری

```text
/
/challenges
/challenges/smart-water-recovery
/organizations
/organizations/irancell
/organizations/digikala
/organizations/snapp
/organizations/snappfood
/for-organizations
/for-solvers
/how-it-works
/how-it-works/impact
/trust
/trust-security
/guides
/guides/confidentiality
/guides/intellectual-property
/guides/review-rules
/guides/payments-disputes
/legal/privacy
/legal/terms
/accessibility
/auth
/auth/login
/auth/register
/auth/otp
/auth/recovery
/auth/verify-contact
```

## Onboarding سازمان

```text
/onboarding/organization/contact
/onboarding/organization/company
/onboarding/organization/representative
/onboarding/organization/verification
/onboarding/organization/workspace
/onboarding/organization/invite-team
/onboarding/organization/first-challenge
/onboarding/organization/complete
```

## Onboarding حل‌کننده

```text
/onboarding/solver/contact
/onboarding/solver/type
/onboarding/solver/expertise
/onboarding/solver/portfolio
/onboarding/solver/identity
/onboarding/solver/preferences
/onboarding/solver/recommendations
/onboarding/solver/complete
```

## Canonical سازمان

```text
/app/org/dashboard
/app/org/challenges
/app/org/challenges/new
/app/org/challenges/CH-1405-021
/app/org/challenges/CH-1405-021/edit
/app/org/challenges/CH-1405-021/preview
/app/org/challenges/CH-1405-021/submitted
/app/org/challenges/CH-1405-021/timeline
/app/org/challenges/CH-1405-021/experts
/app/org/challenges/CH-1405-021/proposals
/app/org/challenges/CH-1405-021/proposals/compare
/app/org/challenges/CH-1405-021/review
/app/org/challenges/CH-1405-021/decision
/app/org/challenges/CH-1405-021/contract
/app/org/challenges/CH-1405-021/pilot
/app/org/challenges/CH-1405-021/deliverables
/app/org/challenges/CH-1405-021/documents
/app/org/challenges/CH-1405-021/conversations
/app/org/challenges/CH-1405-021/finance
/app/org/challenges/CH-1405-021/impact
/app/org/challenges/CH-1405-021/history
/app/org/experts
/app/org/invitations
/app/org/proposals
/app/org/pilots
/app/org/contracts-payments
/app/org/reports
/app/org/team
/app/org/access
/app/org/settings
```

## Canonical حل‌کننده

```text
/app/solver/dashboard
/app/solver/opportunities
/app/solver/opportunities/smart-water-recovery
/app/solver/invitations
/app/solver/invitations/INV-204
/app/solver/proposals
/app/solver/proposals/new
/app/solver/proposals/PR-104/edit
/app/solver/proposals/PR-104/preview
/app/solver/proposals/PR-104/versions
/app/solver/teams
/app/solver/teams/TEAM-21
/app/solver/pilots
/app/solver/pilots/PIL-021
/app/solver/messages
/app/solver/payments
/app/solver/profile
/app/solver/verification
/app/solver/settings
```

## Canonical داور

```text
/app/reviewer/assignments
/app/reviewer/assignments/RV-204
/app/reviewer/assignments/RV-204/conflict
/app/reviewer/assignments/RV-204/materials
/app/reviewer/assignments/RV-204/score
/app/reviewer/assignments/RV-204/compare
/app/reviewer/assignments/RV-204/submit
```

## Canonical عملیات

```text
/app/ops/dashboard
/app/ops/queue
/app/ops/verification
/app/ops/verification/KYB-882
/app/ops/publication
/app/ops/publication/CH-1405-021
/app/ops/reviews
/app/ops/disputes
/app/ops/disputes/DSP-204
/app/ops/payments
/app/ops/violations
/app/ops/settings
```

## امکانات مشترک

```text
/app/search
/app/tasks
/app/calendar
/app/messages
/app/messages/THR-204
/app/notifications
/app/documents
/app/help
/app/account
/app/account/security
/app/account/sessions
```

مسیرهای قدیمی `/org/*`، `/solver/*`، `/reviewer/*` و `/ops/*` همچنان در `data/internal-routes.ts` ثبت و در Static Export تولید می‌شوند. منبع قطعی جزئیات `screenId/prdId`، H1، CTA، Role و Experience همان فایل‌های `data/public-product-routes.ts` و `data/internal-routes.ts` است.

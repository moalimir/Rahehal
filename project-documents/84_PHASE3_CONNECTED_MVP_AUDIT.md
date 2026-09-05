# Phase 3 Connected MVP — Frontend Audit & Synchronization Plan

**Added 2026-09-01.** This plan is the route-level companion to [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md) Phase 3 C7–C10. It owns frontend/backend synchronization, session-aware public chrome, live workspace data, truthful navigation, and real-browser certification. [83_UI_UX_AUDIT_PLAN](83_UI_UX_AUDIT_PLAN.md) supplies the visual/accessibility rubric; it does not replace the authority audit here.

## 1. Exit outcome

The connected local MVP (`RAHHAL_WEB_RUNTIME=network`) must support this complete journey with PostgreSQL authority:

1. A new human solver starts with mobile/email, completes a provider-neutral development OTP flow, and activates one durable app identity plus exactly one permanent individual workspace.
2. The human either continues personally or creates a separately owned team workspace with canonical `TeamKind`; neither path creates a team credential, and team verification starts independently at `not_started`.
3. Profile, workspace, team, saved opportunity, proposal draft/version, notification, and active-context data survive reload and API/container restart. Network mode never falls back to fixtures, `localStorage`, `sessionStorage`, or the demo solver repository.
4. An organization publishes a challenge through the already-completed Phase-2 authority; a personal or team workspace discovers it, receives server eligibility, drafts, and submits one locked proposal version.
5. The challenge-owning organization sees that exact version in its live dashboard/inbox/detail, requests clarification, and receives the solver's response. Both sides receive workspace-scoped in-app notifications with authorized deep links.
6. After authentication, public headers, mobile drawers, footers, auth routes, and workspace entry points stop advertising signup/login. Public marketing chrome exposes only a compact role-appropriate panel entry; identity and active-workspace names remain inside authenticated application chrome.

The default static export remains a clearly labeled fixture/offline demo under DEC-2026-006. “Live demo” in this plan means the connected local MVP backed by API/PostgreSQL, never the static export.

## 2. Audit evidence — current tree on 2026-09-01

- The rendered landing page shows organization and solver signup/login calls to action to anonymous visitors. The worktree contains a partial session-aware desktop-header change, but the home solver actions, mobile drawer, footer, authenticated redirects, and `/app` destination are not yet a complete session contract; `/app` is not a registered route.
- The rendered solver login still offers “individual account/team account” tabs, email/mobile plus password, and a separate OTP button. Team has no credential in the canonical model, so the tabs and password-first interaction are misleading.
- `/auth/solver/register/type`, `/account`, and `/profile` use in-memory/`sessionStorage` draft state and finally call the demo solver repository. The account page still collects two app-owned password fields; the final command creates only the demo human/personal context even when team intent was selected.
- `RuntimeProvider` exposes live session, challenge, and governance gateways only. In network mode, `InternalApp` still routes solver pages into `readSolverState()`, local context, and browser repositories.
- `OrganizationWorkspaceExperience` explicitly renders fixture dashboards, proposal rows, notification rows, expert/offers, profile, and settings behind `PreviewDataNotice`. Only the Phase-1/2 challenge authoring/governance/public projection slice is authoritative.
- C1 solver profile/verification and eligibility ports are now composed, typed in runtime schemas/OpenAPI, and executable through the API. The connected solver pages still use browser/demo authority, and proposal commands/queries remain unimplemented until C3–C5.
- C2 team policy and lifecycle ports are now composed, typed in runtime schemas/OpenAPI, and executable through the API. Membership removal/archive already cut server authority immediately; the connected team pages still use browser/demo commands until C9, and C8 still owns the notification projection.
- C7 contact-verification and solver-activation ports are now composed, typed in runtime schemas/OpenAPI, and executable through the API. The development provider covers email/mobile start, resend, verify, expiry, lockout, bounded requests, one-time assertion consumption, returning sign-in, and production refusal. Migration `0019` creates one durable human/individual activation; optional team intent continues through C2. The rendered auth/onboarding pages still require C9 synchronization before they can claim this authority in network mode.
- Solver notifications and organization notifications are fixture/browser-repository projections. The worker is demo-only; there is no authoritative in-app notification read model or read/unread API.
- Anonymous protected-route handling already preserves `returnTo` and renders an explicit session-required state. Phase 3 must retain this behavior and add authenticated-route redirects, expiry recovery, and workspace selection.

## 3. Product and authority rules

- Solver activation is self-service under amended DEC-2026-004. Organization, reviewer, and operations identities remain invite/provisioning-controlled.
- The development OTP implementation is an adapter for the future owner-supplied provider API. It may use a deterministic synthetic code only in local/test configuration, never logs or persists OTP payloads, and refuses production startup. Exact provider endpoint names freeze only after the API is supplied.
- Verified contact, profile readiness, individual/team verification, membership, and challenge eligibility remain separate facts (DEC-2026-016).
- Every page or action visible in connected navigation is either authoritative for the active workspace or explicitly marked unavailable/preview. Core MVP routes may not show fixture counts, fake identities, fake receipts, or fake notifications beneath a live session.
- Later-stage reviewer, decision, contract, pilot, deliverable, payment, impact, and case pages are not pulled into Phase 3 merely because prototype screens exist. Connected navigation hides them or presents an explicit unavailable/preview boundary; it never lets them look live.
- Phase 2 is not reopened. C9 regression-audits its challenge authoring, governance, live-call, and public-projection surfaces as dependencies of the full journey.

## 4. Closing milestone split

| Milestone | Purpose                                                                                                                                    | Exit evidence                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C7**    | Self-service human solver activation, development OTP provider contract, permanent individual workspace, optional resumable team bootstrap | new personal and team-intent users can activate without a pre-seeded account; duplicate/replayed activation creates no duplicate identity/workspace/team           |
| **C8**    | Minimal authoritative workspace summaries and in-app notification read model for Phase-3 events                                            | organization and solver badges, dashboard actions, notification lists, read state, and deep links come from server-owned rows and survive restart                  |
| **C9**    | Full Phase-3 frontend/backend synchronization and route-truthfulness audit using the matrix below                                          | every connected route is classified live/preview/unavailable; every MVP-core route is live and has no browser persistence or fixture fallback                      |
| **C10**   | Real-browser connected MVP certification                                                                                                   | personal and team journeys pass across signup/login, reload, API restart, submission, org receipt, clarification, and notifications, including negative boundaries |

## 5. Route and UI/UX synchronization matrix

### 5.1 Shared public chrome and session routing

| Surface                                                                                                | Current issue                                                                                                                                   | Required Phase-3 behavior                                                                                                                                                                                                                           | Milestone |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/`, `/challenges`, public challenge detail, `/organizations`, `/universities`, marketing/trust/guides | public header/footer continue to advertise signup/login after authentication; current partial change does not cover every desktop/mobile action | anonymous visitors see signup/login; authenticated users see a compact role-appropriate panel entry and sign-out, without person/workspace names in marketing chrome. Workspace identity and switching stay inside authenticated application chrome | C9        |
| `/app`                                                                                                 | referenced as a fallback but no route is registered                                                                                             | add one authenticated workspace resolver: one reachable workspace enters it; multiple reachable workspaces show an explicit chooser; no workspace gives a useful next action; `returnTo` is honored only when authorized                            | C9        |
| all protected routes                                                                                   | anonymous boundary exists; authenticated expiry and wrong-persona recovery are incomplete across page families                                  | loading, anonymous, expired, revoked, wrong-workspace, and no-membership states are consistent and non-enumerating; successful login returns to the safe requested route                                                                            | C9/C10    |
| all authenticated visits to `/auth/*`                                                                  | a signed-in user may still see login/signup                                                                                                     | redirect to safe `returnTo` or `/app`; never create a second session/account accidentally                                                                                                                                                           | C9        |

### 5.2 Solver authentication and onboarding

| Surface                                               | Current issue                                                                            | Required Phase-3 behavior                                                                                                                                                                                                                                    | Milestone |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `/auth/login`                                         | individual/team credential tabs and password-first form conflict with one-human identity | one mobile/email OTP login form; no team-account tab or team password; explain that workspace selection follows login; preserve recovery, expiry, resend, throttling, non-enumerating errors, and safe `returnTo`                                            | C7/C9     |
| `/auth/otp`, `/auth/recovery`, `/auth/verify-contact` | demo code and browser session creation                                                   | provider-adapter states for start/verify/resend/expired/locked/retry; development synthetic code is configuration-gated; success exchanges a server session and clears sensitive form state                                                                  | C7        |
| `/auth/solver/register/type`                          | labels the choice as account type                                                        | relabel as start intent: “continue personally” or “set up a team after personal activation”; both paths create one human identity and permanent individual workspace                                                                                         | C7/C9     |
| `/auth/solver/register/account`                       | collects app-owned password/confirmation and stores only a browser-safe partial draft    | collect minimum contact, obtain provider verification, then commit human activation; no app password fields; errors preserve only allowed non-sensitive draft fields                                                                                         | C7/C9     |
| `/auth/solver/register/profile`                       | writes the demo repository and ignores selected team intent                              | persist individual professional profile; optional team intent continues through a separate C2 bootstrap, persists canonical `TeamKind` plus separate affiliation/supervisor facts, redirects to the created team workspace, and resumes safely after failure | C7/C9     |
| organization auth/registration routes                 | organization login is connected, registration/KYB remains prototype                      | retain connected OIDC login; clearly label organization registration as invite/request/KYB pending rather than pretending self-service authority                                                                                                             | C9        |

### 5.3 Solver workspace

| Surface                                                              | Current issue                                                                                                                           | Required Phase-3 behavior                                                                                                                                                                                             | Milestone |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/app/solver/dashboard`                                              | fixture/browser counts, actions, user and workspace                                                                                     | live active-workspace identity, profile readiness, verification status, saved/draft/submitted counts, nearest deadline, unread notifications, and resumable next actions                                              | C8/C9     |
| `/app/solver/opportunities` and connected record detail              | discovery can read the public projection, but workspace eligibility/context remains browser-owned and the detail path is fixture-shaped | live public projection plus C1 eligibility for the active personal/team workspace; stable connected record path by opaque server ID; save/start actions retain challenge/workspace context                            | C1/C6/C9  |
| `/app/solver/profile`, `/settings`, `/verification`                  | local repository and fixture evidence                                                                                                   | workspace-scoped durable profile/settings/verification state; dashboard/settings summary links to the dedicated workflow; real document upload remains unavailable until G3                                           | C1/C7/C9  |
| `/app/solver/teams`, `/teams/new`, team detail, invitations/requests | local commands and fixture IDs                                                                                                          | C2 server commands/queries, active membership/role policy, canonical IDs, explicit ownership transfer/removal rules, durable switcher, and non-enumerating unknown IDs                                                | C2/C9     |
| `/app/solver/saved`, received offers, team building                  | browser stores                                                                                                                          | C6 authoritative save/unsave and direct-offer response for the active workspace; expiration and sender/recipient boundaries enforced server-side                                                                      | C6/C9     |
| `/app/solver/proposals/new`                                          | six-step browser draft and client eligibility authority                                                                                 | challenge-bound live draft creation/autosave, typed validation/conflict recovery, server eligibility, explicit exact-version terms, safe resume after refresh, and no real file upload before G3                      | C1/C3/C9  |
| proposal list, edit/detail/status/versions                           | fixture IDs and local versions                                                                                                          | live workspace-scoped list; one stable record route by opaque proposal ID; immutable submitted version, receipt, history/diff, clarification/revision actions, and explicit unavailable state for foreign/unknown IDs | C3–C5/C9  |
| `/app/solver/notifications` and proposal clarification thread        | browser notifications                                                                                                                   | live C8 notifications with unread count, mark-read/all-read, safe deep links, and clarification actions that reload the authoritative proposal state                                                                  | C5/C8/C9  |

### 5.4 Organization workspace

| Surface                                                               | Current issue                                                          | Required Phase-3 behavior                                                                                                                                                                                         | Milestone |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Phase-2 challenge list/create/edit/governance/live-call/public detail | already connected but separately tested                                | remain live; share the final session-aware shell; regression pass proves publication becomes discoverable and selectable by the new solver journey                                                                | C9/C10    |
| `/app/org/dashboard`                                                  | only greeting is session-backed; counts/actions/proposals are fixtures | compose a bounded live MVP summary from challenges, received proposals, deadlines, and notifications; no fake KPI or action completion                                                                            | C8/C9     |
| `/app/org/proposals`, challenge proposal inbox, proposal detail       | fixture arrays and fixed challenge/proposal IDs                        | grant-scoped live inbox with challenge/status filters; stable detail route opens the exact locked version, solver/workspace label permitted by policy, receipt/version evidence, and clarification request action | C4/C5/C9  |
| `/app/org/notifications`                                              | local read state and fixture items                                     | live workspace-scoped Phase-3 notification list/badge/read state with authorized proposal deep links                                                                                                              | C8/C9     |
| `/app/org/experts` and `/invitations`                                 | fixture expert rows and local direct-offer store                       | connect only the C6 direct-offer/invitation subset that has authoritative server support; hide matching scores and fixture profiles that are not authoritative                                                    | C6/C9     |
| `/app/org/profile`, `/settings`, `/access`                            | mostly interactive fixtures                                            | show live session/workspace/membership facts; persist only the minimum fields/notification preferences actually delivered in Phase 3; disable or label unsupported KYB, security, retention, and access mutations | C8/C9     |
| contracts, pilots, reports, reviewer/decision/case pages              | later-phase prototypes reachable from connected navigation             | remove from connected MVP navigation or show an explicit “later phase / sample” boundary with no authoritative-looking mutation                                                                                   | C9        |

## 6. Minimal in-app notification contract

C8 adds an in-app notification read model, not external email/SMS delivery. It consumes committed Phase-3 outbox events idempotently and stores only an allowlisted summary, recipient user/workspace scope, event/target IDs, action kind, timestamps, and read state. It never copies proposal content, contact data, credentials, OTPs, file details, or another tenant's metadata.

Minimum events:

- `proposal.submitted` → challenge-owning organization workspace.
- `proposal.clarification.requested` → owning solver workspace and authorized assigned members.
- `proposal.clarification.submitted` and `proposal.resubmitted` → challenge-owning organization workspace.
- `team.invitation.sent` and membership-request decisions → addressed human/team workspace.
- `direct_offer.sent` and offer response/expiry → the other authorized party when C6 is delivered.

Minimum UI/API behavior: bounded list, unread count, mark one/all read, restart persistence, idempotent event consumption, authorized deep link, and non-enumerating denial after membership/grant/session revocation. Email/SMS/push delivery, provider preferences, durable remote-delivery retries, and operated DLQ remain later worker/hardening work.

## 7. Cross-page UX acceptance

- Session chrome never flashes or retains anonymous signup/login controls once authentication resolves. Loading uses a neutral placeholder; it does not guess a persona.
- Switching personal/team/organization workspace refreshes all counts, permissions, URLs, notifications, and queries. Entity-scoped routes return to a safe dashboard if the selected workspace cannot reach the current entity.
- Every mutation shows pending, success receipt, validation, stale conflict/reload, storage retry with the same idempotency key, and revoked/expired-session recovery. Optimistic UI never becomes authority.
- Empty states are derived from empty server results. Unknown IDs never fall back to known fixtures. Service failure never says data was saved locally in network mode.
- Persian/RTL, bidi isolation for opaque IDs, keyboard/focus/dialog behavior, responsive desktop/mobile chrome, reduced motion, error association, and 44×44 targets follow the [83](83_UI_UX_AUDIT_PLAN.md) rubric.
- Core connected routes contain no preview banner because they are live. Any remaining prototype route is visibly and persistently labeled sample/unavailable and cannot perform a real-looking action.

## 8. C10 browser certification scenarios

1. **Personal:** anonymous landing → self-service solver OTP activation → individual profile → published challenge → eligibility → saved opportunity → durable draft → locked submit → organization dashboard/inbox/detail → clarification → solver notification/response → organization notification; reload and API restart preserve every committed state.
2. **Team:** human activation commits first → team bootstrap and owner membership → switch team/personal → unverified team can submit where `verification_required=false`, is blocked with a next action where `true`, then completes the same submit/organization/clarification/notification path.
3. **Session chrome:** after login, desktop header, mobile drawer, footer, `/auth/*`, and `/app` expose no signup/login prompts; public marketing chrome uses only a compact role-appropriate panel entry, while identity/workspace actions stay inside authenticated application chrome. Sign-out clears connected state and protected routes return to session-required.
4. **Negative/security:** ID swap, wrong workspace/role, revoked membership/grant/session, stale version, duplicate idempotency key, OTP replay/expiry/resend/rate limit, team-bootstrap retry, notification deep-link denial, deadline race, API outage, and browser-storage poisoning fail closed with no fixture fallback.
5. **Truthfulness:** route-registry crawl in network mode classifies every route as live, preview, unavailable, or redirect; every route reachable from connected MVP navigation is live and every later-phase route is explicitly bounded.

Minimum final commands are the full frontend release bundle from AGENTS.md plus connected API/PostgreSQL integration, migration down/up/compatibility, focused provider/notification tests, and a new opt-in C10 browser suite against rebuilt Docker images.

## 9. Out of scope for Phase 3

- The final owner-supplied OTP delivery API and production IdP selection; Phase 3 provides the adapter contract and development provider only.
- Real verification evidence upload, malware scanning, and signed reads (G3).
- External notification delivery, durable remote-provider retries, and production DLQ operations.
- Reviewer assignment/COI/scoring, organization decision, contracts, pilot, deliverables, payment, impact, and real case execution (Phases 4–5).
- Open self-service organization registration/KYB; organizations remain controlled onboarding.

## 10. Status

**2026-09-05 — C9 stage 1 landed (gateway foundation).** The slice is staged because it is roughly three times C6-C8 combined and a partial page conversion is worse than none. Stage 1 built the foundation and the audit baseline without converting any page family.

Closed in stage 1:

- `/app` is now a registered route, not a fallback string other surfaces link to hopefully. It resolves one reachable workspace by entering it, several by an explicit chooser, none by a useful next action, and honors `returnTo` only when it belongs to the persona that resolved.
- Session-aware public chrome now covers the mobile drawer and the footer as well as the desktop header, through the same demo-safe boundary, so the partial change section 2 recorded is complete for those surfaces.
- Connected gateways exist for the C1-C8 families and are wired into `RuntimeProvider`, null in demo mode so a demo page shows its preview boundary rather than a gateway that silently answers with fixtures.
- Every registered route is classified: **339 paths — 12 live, 212 preview, 45 unavailable, 70 redirect**, locked by a behavior that fails if a connected MVP route is downgraded or a later-phase surface is marked live.

Still open, and the measure of the remaining stages:

- 33 files still read `localStorage`, `sessionStorage`, or the demo solver repository; no page family has been converted yet.
- The 212 preview routes include the MVP-core solver and organization families that stages 2+ must make live.
- The [83](83_UI_UX_AUDIT_PLAN.md) RTL/a11y/responsive rubric requires owner visual review. AGENTS.md forbids self-certifying visual snapshots, so this gate stays open independently of implementation progress.

| Item                            | Status         |
| ------------------------------- | -------------- |
| Audit baseline and route matrix | `ready`        |
| C1 solver facts/eligibility     | `verification` |
| C2 team backend                 | `verification` |
| C3 proposal draft backend       | `verification` |
| C4–C6 proposal/offers backend   | `verification` |
| C7 activation/OTP scheme        | `verification` |
| C8 summaries/notifications      | `not-started`  |
| C9 frontend synchronization     | `not-started`  |
| C10 browser certification       | `not-started`  |

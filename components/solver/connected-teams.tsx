"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import {
  decideTeamPermission,
  teamRole,
  type TeamKind,
  type TeamNonOwnerRole,
} from "@rahhal/domain";
import type { GatewayResult } from "@/lib/api/result";
import { RecordId } from "@/components/solver/record-identity";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import {
  readTeamView,
  teamFailureNeedsAttention,
  teamFamilyAvailable,
  teamViewScopeLost,
} from "@/lib/workspace/team-view";
import {
  membershipStateLabels,
  teamInvitationStateLabels,
  teamMembershipRequestStateLabels,
  teamStatusLabels,
} from "@/lib/workspace/state-labels";

const nonOwnerRoles: readonly TeamNonOwnerRole[] = [
  teamRole.admin,
  teamRole.proposalManager,
  teamRole.contributor,
  teamRole.viewer,
] as readonly TeamNonOwnerRole[];

type PageNotice = { readonly tone: "success" | "error"; readonly message: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
}

const teamKindLabels: Record<TeamKind, string> = {
  "expert-team": "تیم مستقل",
  company: "شرکت رسمی",
  lab: "آزمایشگاه",
  "academic-group": "گروه دانشگاهی",
};

function TeamEmptyState({
  icon,
  title,
  description,
}: {
  icon: "mail" | "people" | "history";
  title: string;
  description: string;
}) {
  return (
    <div className="rh-team-empty" role="status">
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

/**
 * The connected team surfaces: the active team, its membership and policy, the
 * invitations it sent, the requests addressed to it, and this human's own
 * invitations and requests.
 *
 * Every action here is a C2 server command carrying the exact version it acted
 * on. Affordances are hidden with the canonical `decideTeamPermission` oracle —
 * the same one the server runs — but that is a UX convenience only: the server
 * refuses a command the browser should not have offered, and the receipt the
 * page shows comes from the server, never from a local success assumption.
 */
export function ConnectedTeamsExperience() {
  const runtime = useWebRuntime();
  const router = useRouter();
  const activeWorkspaceKind = runtime.me?.workspaces.find(
    (workspace) => workspace.id === runtime.me?.active_context?.workspace_id,
  )?.kind;
  const read = useMemo(
    () => (gateways: Parameters<typeof readTeamView>[0]) =>
      readTeamView(gateways, activeWorkspaceKind === "team"),
    [activeWorkspaceKind],
  );
  const connected = useConnectedFamily(read, teamViewScopeLost, activeWorkspaceKind);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamKind, setTeamKind] = useState<TeamKind>("expert-team");

  useEffect(() => {
    setCreating(new URLSearchParams(window.location.search).get("create") === "1");
  }, []);

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="تیم‌ها" />;

  const view = connected.state.data;
  const gateways = runtime.workspaceGateways;
  const currentUserId = runtime.me?.user.id ?? null;

  /**
   * Runs one command and reports what the server actually returned.
   *
   * The list re-reads on success rather than patching local state, so what the
   * page shows after a command is the server's answer and not an optimistic
   * guess that a later read would contradict.
   */
  const run = async (command: () => Promise<GatewayResult<unknown>>, success: string) => {
    setPending(true);
    const result = await command();
    setPending(false);
    if (result.ok) {
      setNotice({ tone: "success", message: success });
      connected.refresh();
      return;
    }
    setNotice({ tone: "error", message: result.error.message });
  };

  const team = view.team;
  const membership = team?.members.find((member) => member.user_id === currentUserId) ?? null;

  /**
   * Every team workspace this human belongs to.
   *
   * The page is called "تیم‌ها و همکاری" but listed no teams: it showed the
   * active one's members, or -- from an individual workspace -- nothing at
   * all, so someone who owned two teams saw only invitations. The set is
   * already in `/me`; no second authorization question needs asking.
   */
  /**
   * An invitation that has been accepted, declined or expired is history, not
   * an inbox item. Listing all of them together under "دعوت‌های دریافتی" left
   * a settled invitation sitting at the top with no action, looking like
   * something still waiting on the human.
   */
  const openInvitations = view.incomingInvitations.filter((invitation) =>
    ["sent", "viewed"].includes(invitation.state),
  );
  const settledInvitations = view.incomingInvitations.filter(
    (invitation) => !["sent", "viewed"].includes(invitation.state),
  );
  const openSentInvitations = view.sentInvitations.filter((invitation) =>
    ["sent", "viewed"].includes(invitation.state),
  );
  const openIncomingRequests = view.incomingRequests.filter(
    (request) => request.state === "requested",
  );
  const openOwnRequests = view.ownRequests.filter((request) => request.state === "requested");
  const sentInvitationsAvailable = teamFamilyAvailable(view, "sentInvitations");
  const incomingInvitationsAvailable = teamFamilyAvailable(view, "incomingInvitations");
  const incomingRequestsAvailable = teamFamilyAvailable(view, "requests");
  const ownRequestsAvailable = teamFamilyAvailable(view, "ownRequests");

  const activeWorkspaceId = runtime.me?.active_context?.workspace_id ?? null;
  const myTeams = (runtime.me?.workspaces ?? [])
    .filter((workspace) => workspace.kind === "team")
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      role: runtime.me?.memberships.find(
        (item) => item.workspace_id === workspace.id && item.state === "active",
      )?.role,
      active: workspace.id === activeWorkspaceId,
    }));
  const permission = (action: Parameters<typeof decideTeamPermission>[0]) =>
    team && membership
      ? decideTeamPermission(action, { role: membership.role, policy: team.policy }).allowed
      : false;

  const createTeam = async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await gateways!.team.create({
        name: teamName.trim(),
        teamKind,
        joinMode: "invite-only",
      });
      if (!result.ok) {
        setPending(false);
        setNotice({ tone: "error", message: result.error.message });
        return;
      }
      const refreshed = await runtime.refreshMe();
      if (!refreshed) {
        setPending(false);
        setNotice({
          tone: "error",
          message:
            "تیم ساخته شد، اما فهرست فضاهای کاری تازه نشد. صفحه را بازخوانی کنید؛ نیازی به ساخت دوباره نیست.",
        });
        return;
      }
      const error = await runtime.switchWorkspace(result.data.entity_id);
      if (error) {
        setPending(false);
        setNotice({
          tone: "error",
          message: `تیم ساخته شد، اما ورود به فضای آن انجام نشد: ${error.message}`,
        });
        return;
      }
      router.push("/app/solver/dashboard");
    } catch {
      setPending(false);
      setNotice({
        tone: "error",
        message:
          "ارتباط با سرویس ساخت تیم قطع شد. دوباره تلاش کنید؛ اطلاعات حساب شخصی شما محفوظ است.",
      });
    }
  };

  return (
    <div className="rh-connected-teams-page">
      {notice && (
        <div
          className={`rh-profile-toast ${notice.tone === "error" ? "is-error" : ""}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <Icon name={notice.tone === "error" ? "notification" : "check"} />
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
      {view.failures.filter(teamFailureNeedsAttention).map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label="بخشی از داده تیم">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      {team && membership ? (
        <>
          <header className="rh-card rh-team-management-hero">
            <div className="rh-team-management-hero__main">
              <span className="rh-team-management-hero__icon">
                <Icon name="people" />
              </span>
              <div>
                <small>مدیریت فضای کاری تیم</small>
                <h1>{team.name}</h1>
                <p>اعضا، دعوت‌ها و درخواست‌های ورود این فضای کاری را از همین صفحه مدیریت کنید.</p>
                <div className="rh-team-management-hero__badges" aria-label="وضعیت تیم">
                  <span>{teamStatusLabels[team.status]}</span>
                  <span>{TEAM_ROLE_LABELS[membership.role]}</span>
                  <span>{teamKindLabels[team.team_kind]}</span>
                </div>
              </div>
            </div>
            <dl className="rh-team-management-hero__stats">
              <div>
                <dt>اعضای ثبت‌شده</dt>
                <dd>{team.members.length.toLocaleString("fa-IR")}</dd>
              </div>
              {sentInvitationsAvailable && (
                <div>
                  <dt>دعوت باز</dt>
                  <dd>{openSentInvitations.length.toLocaleString("fa-IR")}</dd>
                </div>
              )}
              {incomingRequestsAvailable && (
                <div>
                  <dt>درخواست تازه</dt>
                  <dd>{openIncomingRequests.length.toLocaleString("fa-IR")}</dd>
                </div>
              )}
            </dl>
            <div className="rh-team-workspace-identity">
              <div>
                <small>شناسه فنی فضای کاری</small>
                <p>برای پشتیبانی یا هماهنگی فنی، این شناسه را کپی کنید.</p>
              </div>
              <RecordId value={team.workspace_id} label="شناسه فضای کاری تیم" />
            </div>
          </header>

          <section className="rh-card rh-team-section rh-team-members" aria-label="اعضای تیم">
            <header className="rh-team-section__head">
              <span className="rh-team-section__icon">
                <Icon name="people" />
              </span>
              <div>
                <h2>اعضا</h2>
                <p>نقش و وضعیت {team.members.length.toLocaleString("fa-IR")} عضو ثبت‌شده</p>
              </div>
            </header>
            <div className="rh-team-section__body rh-team-member-list">
              {team.members.map((member) => (
                <article key={member.id} className="rh-team-member-row">
                  <span className="rh-team-member-row__avatar" aria-hidden="true">
                    {member.display_name.trim().charAt(0) || "؟"}
                  </span>
                  <div className="rh-team-member-row__identity">
                    <h3>{member.display_name}</h3>
                    <p>
                      {TEAM_ROLE_LABELS[member.role]} · {membershipStateLabels[member.state]}
                    </p>
                    <RecordId value={member.id} label="شناسه عضویت" />
                  </div>
                  {permission("change-member-role") && member.role !== teamRole.owner && (
                    <div className="rh-team-row-actions">
                      <label>
                        <span className="sr-only">تغییر نقش {member.display_name}</span>
                        <select
                          disabled={pending}
                          value={member.role}
                          onChange={(event) =>
                            void run(
                              () =>
                                gateways!.team.changeMemberRole(member.id, {
                                  expectedVersion: member.version,
                                  role: event.target.value,
                                  reason: "تغییر نقش از صفحه مدیریت تیم",
                                }),
                              "نقش عضو تغییر کرد",
                            )
                          }
                        >
                          {nonOwnerRoles.map((value) => (
                            <option key={value} value={value}>
                              {TEAM_ROLE_LABELS[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              member.state === "suspended"
                                ? gateways!.team.restoreMember(member.id, {
                                    expectedVersion: member.version,
                                    reason: "بازگرداندن عضو",
                                  })
                                : gateways!.team.suspendMember(member.id, {
                                    expectedVersion: member.version,
                                    reason: "تعلیق موقت عضو",
                                  }),
                            member.state === "suspended" ? "عضو بازگردانده شد" : "عضو تعلیق شد",
                          )
                        }
                      >
                        {member.state === "suspended" ? "بازگرداندن" : "تعلیق"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              gateways!.team.removeMember(member.id, {
                                expectedVersion: member.version,
                                reason: "حذف عضو از تیم",
                              }),
                            "دسترسی عضو لغو شد",
                          )
                        }
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {permission("invite-member") && (
            <TeamInviteForm
              disabled={pending}
              onSubmit={(input) =>
                void run(
                  () => gateways!.team.invite({ expectedVersion: team.version, ...input }),
                  "دعوت ارسال شد",
                )
              }
            />
          )}

          {(sentInvitationsAvailable || incomingRequestsAvailable) && (
            <div className="rh-team-inbox-grid">
              {sentInvitationsAvailable && (
                <section className="rh-card rh-team-section" aria-label="دعوت‌های ارسال‌شده">
                  <header className="rh-team-section__head">
                    <span className="rh-team-section__icon is-mail">
                      <Icon name="mail" />
                    </span>
                    <div>
                      <h2>دعوت‌های ارسال‌شده</h2>
                      <p>
                        {view.sentInvitations.length.toLocaleString("fa-IR")} دعوت در تاریخچه تیم
                      </p>
                    </div>
                  </header>
                  <div className="rh-team-section__body rh-team-activity-list">
                    {view.sentInvitations.map((invitation) => (
                      <article key={invitation.id}>
                        <div>
                          <small>
                            <bdi dir="ltr">{invitation.recipient_email}</bdi>
                          </small>
                          <h3>{TEAM_ROLE_LABELS[invitation.proposed_role]}</h3>
                          <p>
                            {teamInvitationStateLabels[invitation.state]} · تا{" "}
                            {formatDate(invitation.expires_at)}
                          </p>
                        </div>
                        {["sent", "viewed"].includes(invitation.state) &&
                          permission("invite-member") && (
                            <button
                              className="rh-team-text-action is-danger"
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  () =>
                                    gateways!.team.revokeInvitation(invitation.id, {
                                      expectedVersion: invitation.version,
                                      reason: "لغو دعوت از صفحه تیم",
                                    }),
                                  "دعوت لغو شد",
                                )
                              }
                            >
                              لغو دعوت
                            </button>
                          )}
                      </article>
                    ))}
                    {!view.sentInvitations.length && (
                      <TeamEmptyState
                        icon="mail"
                        title="هنوز دعوتی ارسال نشده"
                        description="پس از ارسال دعوت، وضعیت پاسخ آن در همین بخش دیده می‌شود."
                      />
                    )}
                  </div>
                </section>
              )}

              {incomingRequestsAvailable && (
                <section className="rh-card rh-team-section" aria-label="درخواست‌های عضویت">
                  <header className="rh-team-section__head">
                    <span className="rh-team-section__icon is-amber">
                      <Icon name="notification" />
                    </span>
                    <div>
                      <h2>درخواست‌های عضویت</h2>
                      <p>
                        {openIncomingRequests.length.toLocaleString("fa-IR")} درخواست نیازمند بررسی
                      </p>
                    </div>
                  </header>
                  <div className="rh-team-section__body rh-team-activity-list">
                    {view.incomingRequests.map((request) => (
                      <article key={request.id}>
                        <div>
                          <h3>{TEAM_ROLE_LABELS[request.requested_role]}</h3>
                          <p>
                            {teamMembershipRequestStateLabels[request.state]} ·{" "}
                            {request.introduction}
                          </p>
                        </div>
                        {request.state === "requested" &&
                          permission("review-membership-request") && (
                            <div className="rh-team-row-actions">
                              <button
                                className="is-primary"
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  void run(
                                    () =>
                                      gateways!.team.decideRequest(request.id, {
                                        expectedVersion: request.version,
                                        decision: "accept",
                                        assignedRole: request.requested_role,
                                        reason: "پذیرش از صفحه تیم",
                                      }),
                                    "عضویت پذیرفته شد",
                                  )
                                }
                              >
                                پذیرش
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  void run(
                                    () =>
                                      gateways!.team.decideRequest(request.id, {
                                        expectedVersion: request.version,
                                        decision: "reject",
                                        reason: "رد از صفحه تیم",
                                      }),
                                    "درخواست رد شد",
                                  )
                                }
                              >
                                رد
                              </button>
                            </div>
                          )}
                      </article>
                    ))}
                    {!view.incomingRequests.length && (
                      <TeamEmptyState
                        icon="people"
                        title="درخواستی منتظر شما نیست"
                        description="درخواست‌های ورود به این تیم برای بررسی اینجا قرار می‌گیرند."
                      />
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          <section className="rh-card rh-team-danger-zone" aria-label="اقدام‌های تیم">
            <div>
              <span>
                <Icon name="lock" />
              </span>
              <div>
                <h2>مدیریت وضعیت تیم</h2>
                <p>این اقدام‌ها دسترسی یا وضعیت فضای کاری را تغییر می‌دهند.</p>
              </div>
            </div>
            <div className="rh-team-row-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(
                    () =>
                      gateways!.team.leave({
                        expectedVersion: membership.version,
                        reason: "خروج از تیم",
                      }),
                    "از تیم خارج شدید",
                  )
                }
              >
                خروج از تیم
              </button>
              {permission("archive-team") && (
                <button
                  className="is-danger"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      () =>
                        gateways!.team.archive({
                          expectedVersion: team.version,
                          reason: "بایگانی تیم",
                        }),
                      "تیم بایگانی شد",
                    )
                  }
                >
                  بایگانی تیم
                </button>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <header className="rh-card rh-team-directory-hero">
            <div className="rh-team-directory-hero__copy">
              <span className="rh-team-directory-hero__icon">
                <Icon name="people" />
              </span>
              <div>
                <small>همکاری با همان هویت شخصی</small>
                <h1>تیم‌ها و همکاری</h1>
                <p>
                  فضای تیمی خود را بسازید یا دعوت‌های همکاری را پاسخ دهید. هر تیم اعضا، پروفایل و
                  پیشنهادهای مستقل خودش را دارد.
                </p>
              </div>
            </div>
            <div className="rh-team-directory-hero__side">
              <dl>
                <div>
                  <dt>تیم‌های من</dt>
                  <dd>{myTeams.length.toLocaleString("fa-IR")}</dd>
                </div>
                {incomingInvitationsAvailable && (
                  <div>
                    <dt>دعوت باز</dt>
                    <dd>{openInvitations.length.toLocaleString("fa-IR")}</dd>
                  </div>
                )}
              </dl>
              <button
                className="rh-profile-primary"
                type="button"
                aria-expanded={creating}
                aria-controls="connected-team-create"
                onClick={() => {
                  setCreating((value) => !value);
                  setNotice(null);
                }}
              >
                <Icon name={creating ? "close" : "plus"} /> {creating ? "بستن فرم" : "ساخت تیم"}
              </button>
            </div>
          </header>
          {creating && (
            <form
              className="rh-card rh-team-create-card"
              id="connected-team-create"
              onSubmit={(event) => {
                event.preventDefault();
                void createTeam();
              }}
            >
              <header className="rh-team-create-card__head">
                <span>
                  <Icon name="people" />
                </span>
                <div>
                  <small>مرحله بعد از فعال‌سازی شخصی</small>
                  <h2>ساخت فضای کاری تیم</h2>
                  <p>
                    یک نام و نوع برای تیم انتخاب کنید. شما مالک نخست تیم می‌شوید و بعداً اعضا را با
                    نقش مشخص دعوت می‌کنید.
                  </p>
                </div>
              </header>

              <ol className="rh-team-create-steps" aria-label="مسیر شروع تیم">
                <li className="is-complete">
                  <Icon name="check" />
                  <span>
                    <strong>هویت شخصی</strong>
                    <small>فعال و محفوظ</small>
                  </span>
                </li>
                <li className="is-active">
                  <span>۲</span>
                  <span>
                    <strong>ساخت تیم</strong>
                    <small>نام و نوع تیم</small>
                  </span>
                </li>
                <li>
                  <span>۳</span>
                  <span>
                    <strong>تکمیل پروفایل</strong>
                    <small>پس از ورود به تیم</small>
                  </span>
                </li>
              </ol>

              <div className="rh-team-create-fields">
                <label>
                  <span>نام تیم</span>
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    autoFocus
                    autoComplete="organization"
                    value={teamName}
                    onChange={(event) => {
                      setTeamName(event.target.value);
                      setNotice(null);
                    }}
                    placeholder="مثلاً تیم بهینه‌سازی انرژی"
                  />
                  <small>نامی روشن انتخاب کنید که حوزه یا هویت تیم را نشان دهد.</small>
                </label>
                <label>
                  <span>نوع تیم</span>
                  <select
                    value={teamKind}
                    onChange={(event) => setTeamKind(event.target.value as TeamKind)}
                  >
                    <option value="expert-team">تیم مستقل</option>
                    <option value="company">شرکت رسمی</option>
                    <option value="academic-group">گروه دانشگاهی</option>
                    <option value="lab">آزمایشگاه</option>
                  </select>
                  <small>این انتخاب برای معرفی درست تیم در فرصت‌ها استفاده می‌شود.</small>
                </label>
              </div>

              <div className="rh-team-create-policy">
                <Icon name="lock" />
                <div>
                  <strong>عضویت اولیه فقط با دعوت</strong>
                  <p>
                    پس از ساخت، می‌توانید اعضا را دعوت و برای هر نفر نقش و دامنه‌ی همکاری تعیین
                    کنید.
                  </p>
                </div>
              </div>

              <footer className="rh-team-create-actions">
                <button
                  type="button"
                  className="is-secondary"
                  disabled={pending}
                  onClick={() => setCreating(false)}
                >
                  فعلاً نه
                </button>
                <button type="submit" disabled={pending || teamName.trim().length < 3}>
                  {pending ? "در حال ساخت فضای تیم…" : "ساخت تیم و ورود به آن"}
                  {!pending && <Icon name="arrow" />}
                </button>
              </footer>
            </form>
          )}
        </>
      )}

      {myTeams.length > 0 && (
        <section className="rh-card rh-team-section rh-team-spaces" aria-label="تیم‌های من">
          <header className="rh-team-section__head">
            <span className="rh-team-section__icon">
              <Icon name="grid" />
            </span>
            <div>
              <h2>تیم‌های من</h2>
              <p>{myTeams.length.toLocaleString("fa-IR")} فضای تیمی در دسترس شما</p>
            </div>
          </header>
          <div className="rh-team-space-grid">
            {myTeams.map((entry) => (
              <article key={entry.id} className={entry.active ? "is-active" : undefined}>
                <div className="rh-team-space-card__title">
                  <span>
                    <Icon name="people" />
                  </span>
                  <div>
                    <h3>{entry.name}</h3>
                    <p>
                      {(entry.role && entry.role in TEAM_ROLE_LABELS
                        ? TEAM_ROLE_LABELS[entry.role as keyof typeof TEAM_ROLE_LABELS]
                        : "عضو تیم") ?? "عضو تیم"}
                    </p>
                  </div>
                </div>
                <RecordId value={entry.id} label="شناسه فضای کاری تیم" />
                <footer>
                  {entry.active ? (
                    <span className="rh-team-active-label">
                      <Icon name="check" /> فضای کاری فعال
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      // Switching is a server command, so the whole page -- members,
                      // invitations, requests -- re-reads for the new workspace
                      // rather than this list changing under a stale body.
                      onClick={() => void runtime.switchWorkspace(entry.id)}
                    >
                      ورود و مدیریت <Icon name="arrow" />
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      {(incomingInvitationsAvailable || ownRequestsAvailable) && (
        <div className="rh-team-collaboration-grid">
          {incomingInvitationsAvailable && (
            <section className="rh-card rh-team-section" aria-label="دعوت‌های دریافتی من">
              <header className="rh-team-section__head">
                <span className="rh-team-section__icon is-mail">
                  <Icon name="mail" />
                </span>
                <div>
                  <h2>دعوت‌های در انتظار پاسخ</h2>
                  <p>{openInvitations.length.toLocaleString("fa-IR")} دعوت برای هویت شما</p>
                </div>
              </header>
              <div className="rh-team-section__body rh-team-activity-list">
                {openInvitations.map((invitation) => (
                  <article key={invitation.id}>
                    <div>
                      <h3>{invitation.team_name}</h3>
                      <p>
                        {TEAM_ROLE_LABELS[invitation.proposed_role]} ·{" "}
                        {teamInvitationStateLabels[invitation.state]} · تا{" "}
                        {formatDate(invitation.expires_at)}
                      </p>
                    </div>
                    <div className="rh-team-row-actions">
                      <button
                        className="is-primary"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              gateways!.team.respondToInvitation(invitation.id, {
                                expectedVersion: invitation.version,
                                decision: "accept",
                              }),
                            "دعوت پذیرفته شد",
                          )
                        }
                      >
                        پذیرش دعوت
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              gateways!.team.respondToInvitation(invitation.id, {
                                expectedVersion: invitation.version,
                                decision: "decline",
                                reason: "رد دعوت",
                              }),
                            "دعوت رد شد",
                          )
                        }
                      >
                        رد دعوت
                      </button>
                    </div>
                  </article>
                ))}
                {!openInvitations.length && (
                  <TeamEmptyState
                    icon="mail"
                    title="دعوت بی‌پاسخی ندارید"
                    description="هر دعوت تازه همراه با نقش و مهلت پاسخ در این بخش نمایش داده می‌شود."
                  />
                )}
              </div>
            </section>
          )}

          {ownRequestsAvailable && (
            <section className="rh-card rh-team-section" aria-label="درخواست‌های من">
              <header className="rh-team-section__head">
                <span className="rh-team-section__icon is-soft">
                  <Icon name="history" />
                </span>
                <div>
                  <h2>درخواست‌های عضویت من</h2>
                  <p>{openOwnRequests.length.toLocaleString("fa-IR")} درخواست در انتظار پاسخ</p>
                </div>
              </header>
              <div className="rh-team-section__body rh-team-activity-list">
                {view.ownRequests.map((request) => (
                  <article key={request.id}>
                    <div>
                      <h3>{request.team_name}</h3>
                      <p>
                        {TEAM_ROLE_LABELS[request.requested_role]} ·{" "}
                        {teamMembershipRequestStateLabels[request.state]}
                      </p>
                    </div>
                    {request.state === "requested" && (
                      <button
                        className="rh-team-text-action is-danger"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              gateways!.team.withdrawRequest(request.id, {
                                expectedVersion: request.version,
                                reason: "انصراف از درخواست",
                              }),
                            "درخواست پس گرفته شد",
                          )
                        }
                      >
                        انصراف
                      </button>
                    )}
                  </article>
                ))}
                {!view.ownRequests.length && (
                  <TeamEmptyState
                    icon="history"
                    title="درخواستی ثبت نکرده‌اید"
                    description="اگر برای عضویت در تیمی درخواست بدهید، وضعیت آن اینجا پیگیری می‌شود."
                  />
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {incomingInvitationsAvailable && settledInvitations.length > 0 && (
        <section className="rh-card rh-team-section rh-team-history" aria-label="دعوت‌های بسته‌شده">
          <header className="rh-team-section__head">
            <span className="rh-team-section__icon is-soft">
              <Icon name="history" />
            </span>
            <div>
              <h2>دعوت‌های پاسخ‌داده‌شده</h2>
              <p>{settledInvitations.length.toLocaleString("fa-IR")} مورد در تاریخچه همکاری</p>
            </div>
          </header>
          <div className="rh-team-section__body rh-team-activity-list">
            {settledInvitations.map((invitation) => (
              <article key={invitation.id}>
                <h3>{invitation.team_name}</h3>
                <p>
                  {TEAM_ROLE_LABELS[invitation.proposed_role]} ·{" "}
                  {teamInvitationStateLabels[invitation.state]}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TeamInviteForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (input: {
    recipientEmail: string;
    proposedRole: string;
    scope: string;
    message: string;
    commitment: string;
    ipNotice: string;
  }) => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [proposedRole, setProposedRole] = useState<string>(teamRole.contributor);
  const [scope, setScope] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      className="rh-card rh-team-invite-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          recipientEmail,
          proposedRole,
          scope,
          message,
          commitment: "همکاری در پیشنهادهای این تیم",
          ipNotice: "مالکیت فکری خروجی‌ها تابع قرارداد تیم است.",
        });
        setRecipientEmail("");
        setScope("");
        setMessage("");
      }}
    >
      <header className="rh-team-invite-form__head">
        <span>
          <Icon name="plus" />
        </span>
        <div>
          <small>افزودن همکار</small>
          <h2>دعوت عضو تازه</h2>
          <p>نقش و محدوده همکاری را پیش از ارسال برای عضو آینده روشن کنید.</p>
        </div>
      </header>
      <div className="rh-team-invite-form__fields">
        <label className="rh-connected-field">
          <span>رایانامه گیرنده</span>
          <input
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            placeholder="name@example.com"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />
        </label>
        <label className="rh-connected-field">
          <span>نقش پیشنهادی</span>
          <select value={proposedRole} onChange={(event) => setProposedRole(event.target.value)}>
            {nonOwnerRoles.map((value) => (
              <option key={value} value={value}>
                {TEAM_ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="rh-connected-field is-wide">
          <span>دامنه همکاری</span>
          <input
            required
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            placeholder="مثلاً تحلیل داده و تدوین بخش فنی پیشنهاد"
          />
          <small>به‌طور کوتاه مشخص کنید این عضو در چه کاری مشارکت می‌کند.</small>
        </label>
        <label className="rh-connected-field is-wide">
          <span>پیام دعوت</span>
          <textarea
            required
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="هدف همکاری و انتظار تیم را برای مخاطب بنویسید."
          />
        </label>
      </div>
      <footer className="rh-team-invite-form__actions">
        <p>
          <Icon name="lock" /> دعوت فقط برای همین فضای تیمی صادر می‌شود.
        </p>
        <button type="submit" disabled={disabled}>
          <Icon name="mail" /> {disabled ? "در حال ارسال…" : "ارسال دعوت"}
        </button>
      </footer>
    </form>
  );
}

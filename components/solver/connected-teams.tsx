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
import { decideTeamPermission, teamRole, type TeamNonOwnerRole } from "@rahhal/domain";
import type { GatewayResult } from "@/lib/api/result";
import { RecordId } from "@/components/solver/record-identity";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import { readTeamView, teamViewScopeLost } from "@/lib/workspace/team-view";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
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
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamKind, setTeamKind] = useState("expert-team");

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
      setNotice(`${success} · شناسه همبستگی ${result.meta.correlation_id}`);
      connected.refresh();
      return;
    }
    setNotice(result.error.message);
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

  return (
    <>
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="check" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
      {view.failures.map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label="بخشی از داده تیم">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      {team && membership ? (
        <>
          <header className="rh-profile-heading">
            <div>
              <small>
                <bdi dir="ltr">{team.workspace_id}</bdi> · {TEAM_ROLE_LABELS[membership.role]}
              </small>
              <h1>{team.name}</h1>
              <p>
                وضعیت {teamStatusLabels[team.status]} · نسخه {team.version.toLocaleString("fa-IR")}
              </p>
            </div>
          </header>

          <section className="rh-card rh-membership-list" aria-label="اعضای تیم">
            <header>
              <div>
                <h2>اعضا</h2>
                <p>{team.members.length.toLocaleString("fa-IR")} عضو ثبت‌شده</p>
              </div>
            </header>
            {team.members.map((member) => (
              <article key={member.id}>
                <div>
                  <h3>{member.display_name}</h3>
                  <p>
                    {TEAM_ROLE_LABELS[member.role]} · {membershipStateLabels[member.state]}
                  </p>
                  <RecordId value={member.id} label="شناسه عضویت" />
                </div>
                {permission("change-member-role") && member.role !== teamRole.owner && (
                  <div className="rh-profile-actions">
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

          <section className="rh-card rh-membership-list" aria-label="دعوت‌های ارسال‌شده">
            <header>
              <div>
                <h2>دعوت‌های ارسال‌شده</h2>
                <p>{view.sentInvitations.length.toLocaleString("fa-IR")} مورد</p>
              </div>
            </header>
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
                {["sent", "viewed"].includes(invitation.state) && permission("invite-member") && (
                  <button
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
            {!view.sentInvitations.length && <p>هنوز دعوتی ارسال نشده است.</p>}
          </section>

          <section className="rh-card rh-membership-list" aria-label="درخواست‌های عضویت">
            <header>
              <div>
                <h2>درخواست‌های عضویت</h2>
                <p>{view.incomingRequests.length.toLocaleString("fa-IR")} مورد</p>
              </div>
            </header>
            {view.incomingRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <h3>{TEAM_ROLE_LABELS[request.requested_role]}</h3>
                  <p>
                    {teamMembershipRequestStateLabels[request.state]} · {request.introduction}
                  </p>
                </div>
                {request.state === "requested" && permission("review-membership-request") && (
                  <div className="rh-profile-actions">
                    <button
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
            {!view.incomingRequests.length && <p>درخواستی در انتظار بررسی نیست.</p>}
          </section>

          <section className="rh-card rh-profile-actions" aria-label="اقدام‌های تیم">
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
          </section>
        </>
      ) : (
        <>
          <header className="rh-profile-heading">
            <div>
              <h1>تیم‌ها و همکاری</h1>
              <p>
                تیم حساب جداگانه ندارد؛ با همین هویت یک فضای تیمی بسازید و سپس اعضا و پیشنهادهای آن
                را مدیریت کنید.
              </p>
            </div>
            <button
              className="rh-profile-primary"
              type="button"
              onClick={() => setCreating((value) => !value)}
            >
              <Icon name="plus" /> {creating ? "بستن فرم" : "ساخت تیم"}
            </button>
          </header>
          {creating && (
            <form
              className="rh-card rh-profile-filters"
              onSubmit={(event) => {
                event.preventDefault();
                setPending(true);
                setNotice("");
                void gateways!.team
                  .create({ name: teamName.trim(), teamKind, joinMode: "invite-only" })
                  .then(async (result) => {
                    setPending(false);
                    if (!result.ok) {
                      setNotice(result.error.message);
                      return;
                    }
                    setNotice(`تیم ساخته شد · شناسه همبستگی ${result.meta.correlation_id}`);
                    await runtime.refreshMe();
                    const error = await runtime.switchWorkspace(result.data.entity_id);
                    if (!error) router.push("/app/solver/dashboard");
                    else setNotice(error.message);
                  });
              }}
            >
              <h2>ساخت فضای کاری تیم</h2>
              <label>
                <span>نام تیم</span>
                <input
                  required
                  minLength={3}
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                />
              </label>
              <label>
                <span>نوع تیم</span>
                <select value={teamKind} onChange={(event) => setTeamKind(event.target.value)}>
                  <option value="expert-team">تیم تخصصی</option>
                  <option value="academic-group">گروه دانشگاهی</option>
                  <option value="lab">آزمایشگاه</option>
                </select>
              </label>
              <button type="submit" disabled={pending || teamName.trim().length < 3}>
                {pending ? "در حال ساخت…" : "ساخت تیم و ورود به آن"}
              </button>
            </form>
          )}
        </>
      )}

      {myTeams.length > 0 && (
        <section className="rh-card rh-membership-list" aria-label="تیم‌های من">
          <header>
            <div>
              <h2>تیم‌های من</h2>
              <p>{myTeams.length.toLocaleString("fa-IR")} فضای تیمی</p>
            </div>
          </header>
          {myTeams.map((entry) => (
            <article key={entry.id}>
              <div>
                <h3>{entry.name}</h3>
                <p>
                  {(entry.role && entry.role in TEAM_ROLE_LABELS
                    ? TEAM_ROLE_LABELS[entry.role as keyof typeof TEAM_ROLE_LABELS]
                    : "عضو تیم") ?? "عضو تیم"}
                  {entry.active ? " · فضای کاری فعال" : ""}
                </p>
              </div>
              {entry.active ? (
                <span className="rh-status rh-status--info">در حال مدیریت</span>
              ) : (
                <div className="rh-profile-actions">
                  <button
                    type="button"
                    disabled={pending}
                    // Switching is a server command, so the whole page -- members,
                    // invitations, requests -- re-reads for the new workspace
                    // rather than this list changing under a stale body.
                    onClick={() => void runtime.switchWorkspace(entry.id)}
                  >
                    مدیریت این تیم
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <section className="rh-card rh-membership-list" aria-label="دعوت‌های دریافتی من">
        <header>
          <div>
            <h2>دعوت‌های در انتظار پاسخ</h2>
            <p>{openInvitations.length.toLocaleString("fa-IR")} مورد</p>
          </div>
        </header>
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
            {["sent", "viewed"].includes(invitation.state) && (
              <div className="rh-profile-actions">
                <button
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
            )}
          </article>
        ))}
        {!openInvitations.length && <p>دعوت بی‌پاسخی ندارید.</p>}
      </section>

      {settledInvitations.length > 0 && (
        <section className="rh-card rh-membership-list" aria-label="دعوت‌های بسته‌شده">
          <header>
            <div>
              <h2>دعوت‌های پاسخ‌داده‌شده</h2>
              <p>{settledInvitations.length.toLocaleString("fa-IR")} مورد</p>
            </div>
          </header>
          {settledInvitations.map((invitation) => (
            <article key={invitation.id}>
              <div>
                <h3>{invitation.team_name}</h3>
                <p>
                  {TEAM_ROLE_LABELS[invitation.proposed_role]} ·{" "}
                  {teamInvitationStateLabels[invitation.state]}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="rh-card rh-membership-list" aria-label="درخواست‌های من">
        <header>
          <div>
            <h2>درخواست‌های عضویت من</h2>
            <p>{view.ownRequests.length.toLocaleString("fa-IR")} مورد</p>
          </div>
        </header>
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
        {!view.ownRequests.length && <p>درخواستی ثبت نکرده‌اید.</p>}
      </section>
    </>
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
      className="rh-card rh-profile-filters"
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
      <h2>دعوت عضو تازه</h2>
      <label>
        <span>رایانامه گیرنده</span>
        <input
          type="email"
          required
          dir="ltr"
          value={recipientEmail}
          onChange={(event) => setRecipientEmail(event.target.value)}
        />
      </label>
      <label>
        <span>نقش پیشنهادی</span>
        <select value={proposedRole} onChange={(event) => setProposedRole(event.target.value)}>
          {nonOwnerRoles.map((value) => (
            <option key={value} value={value}>
              {TEAM_ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>دامنه همکاری</span>
        <input required value={scope} onChange={(event) => setScope(event.target.value)} />
      </label>
      <label>
        <span>پیام</span>
        <input required value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button type="submit" disabled={disabled}>
        ارسال دعوت
      </button>
    </form>
  );
}

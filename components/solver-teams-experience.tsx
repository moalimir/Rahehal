"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/internal/shared";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { useSolverContext } from "@/components/solver-shell";
import { TeamResumeDialog, type TeamResumeSummary } from "@/components/team-resume-dialog";
import type { SolverState, TeamRole } from "@/domain/solver";
import { teamRole } from "@rahhal/domain";
import { buildSolverHref, workspaceContextForTeam } from "@/lib/solver/context";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import {
  archiveTeam,
  assignTeamMember,
  changeMembershipRole,
  leaveTeam,
  readSolverState,
  removeTeamMembership,
  requestTeamMembership,
  resendTeamInvitation,
  respondToTeamInvitation,
  reviewMembershipRequest,
  revokeTeamInvitation,
  sendTeamInvitation,
  restoreTeamMembership,
  subscribeSolverState,
  suspendTeamMembership,
  teamPermission,
  transferOwnership,
} from "@/lib/solver/repository";

function useStore() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

function userName(state: SolverState, userId: string) {
  return state.users.find((user) => user.id === userId)?.displayName ?? userId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
}

function ReceiptToast({ value, onClose }: { value: string; onClose: () => void }) {
  if (!value) return null;
  return (
    <div className="rh-profile-toast" role="status">
      <Icon name="check" />
      <span>{value}</span>
      <button type="button" onClick={onClose} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  );
}

export function SolverTeamsOverview() {
  const context = useSolverContext();
  const state = useStore();
  if (context.type === "team") return <SolverTeamManagement />;
  const memberships = state.memberships.filter(
    (membership) => membership.userId === state.currentUser.id && membership.state === "active",
  );
  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>{state.currentUser.displayName}</small>
          <h1>تیم‌ها و همکاری</h1>
          <p>هر تیم workspace، اعضا، نقش‌ها، پیشنهادها و تنظیمات مستقل دارد.</p>
        </div>
        <Link
          className="rh-profile-primary"
          href={buildSolverHref("/app/solver/teams/new", context)}
        >
          <Icon name="plus" /> ساخت تیم
        </Link>
      </header>
      <section className="rh-card rh-team-origin-note">
        <Icon name="people" />
        <div>
          <strong>هویت ورود واحد است</strong>
          <p>
            تعویض تیم نام و حساب شما را تغییر نمی‌دهد؛ فقط داده و اختیار workspace فعال عوض می‌شود.
          </p>
        </div>
      </section>
      <section className="rh-saved-grid" aria-label="تیم‌های فعال من">
        {memberships.map((membership) => {
          const team = state.teams.find((candidate) => candidate.id === membership.teamId);
          if (!team) return null;
          const resolution = workspaceContextForTeam(team.id, state);
          if (!resolution.ok) return null;
          const memberCount = state.memberships.filter(
            (item) => item.teamId === team.id && item.state === "active",
          ).length;
          return (
            <article className="rh-card rh-saved-card" key={team.id}>
              <header>
                <span className="rh-saved-card__logo">
                  <Icon name="people" />
                </span>
                <div>
                  <small>
                    <bdi dir="ltr">{team.id}</bdi>
                  </small>
                  <h2>{team.name}</h2>
                  <p>{TEAM_ROLE_LABELS[membership.role]}</p>
                </div>
              </header>
              <dl>
                <div>
                  <dt>اعضای فعال</dt>
                  <dd>{memberCount.toLocaleString("fa-IR")}</dd>
                </div>
                <div>
                  <dt>وضعیت</dt>
                  <dd>{team.status === "active" ? "فعال" : "بایگانی‌شده"}</dd>
                </div>
              </dl>
              <footer>
                <Link href={buildSolverHref(`/app/solver/teams/${team.id}`, resolution.context)}>
                  مدیریت تیم <Icon name="arrow" />
                </Link>
              </footer>
            </article>
          );
        })}
        {!memberships.length && (
          <section className="rh-card rh-profile-empty">
            <Icon name="people" />
            <h2>هنوز عضو تیمی نیستید</h2>
            <p>تیم تازه بسازید یا دعوت و درخواست‌های عضویت را بررسی کنید.</p>
            <Link href={buildSolverHref("/app/solver/invitations", context)}>بررسی همکاری‌ها</Link>
          </section>
        )}
      </section>
    </>
  );
}

type TeamTab = "overview" | "members" | "invites" | "requests" | "permissions" | "activity";

function MemberAssignmentControl({
  memberName,
  disabled,
  proposals,
  cases,
  onAssign,
}: {
  memberName: string;
  disabled: boolean;
  proposals: string[];
  cases: string[];
  onAssign: (target: { type: "proposal" | "case"; id: string }) => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <details>
      <summary>تخصیص به پیشنهاد یا پرونده</summary>
      <label>
        <span className="sr-only">رکورد مقصد برای {memberName}</span>
        <select
          aria-label={`رکورد مقصد برای ${memberName}`}
          value={target}
          disabled={disabled}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">انتخاب رکورد</option>
          {proposals.map((id) => (
            <option key={id} value={`proposal:${id}`}>
              پیشنهاد {id}
            </option>
          ))}
          {cases.map((id) => (
            <option key={id} value={`case:${id}`}>
              پرونده {id}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled || !target}
        onClick={() => {
          const [type, id] = target.split(":") as ["proposal" | "case", string];
          onAssign({ type, id });
          setTarget("");
        }}
      >
        ثبت تخصیص
      </button>
    </details>
  );
}

export function SolverTeamManagement({ initialTab = "overview" }: { initialTab?: TeamTab }) {
  const context = useSolverContext();
  const state = useStore();
  const [tab, setTab] = useState<TeamTab>(initialTab);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{
    kind:
      | "remove"
      | "suspend"
      | "restore"
      | "leave"
      | "transfer"
      | "archive"
      | "role"
      | "request-accept"
      | "request-reject";
    id?: string;
    label: string;
    role?: Exclude<TeamRole, "team:owner">;
  }>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "team:owner">>(teamRole.contributor);
  const [scope, setScope] = useState("");
  const [message, setMessage] = useState("");
  if (context.type !== "team") return null;
  const team = state.teams.find((candidate) => candidate.id === context.teamId);
  const currentMembership = state.memberships.find(
    (membership) => membership.id === context.membershipId && membership.state === "active",
  );
  if (!team) return null;
  if (!currentMembership)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>عضویت فعال نیست</h1>
        <p>این workspace دیگر در فهرست فضاهای فعال شما قرار ندارد.</p>
        <Link
          href={buildSolverHref("/app/solver/dashboard", {
            type: "individual",
            workspaceId: state.personalWorkspace.id,
          })}
        >
          بازگشت به فضای شخصی
        </Link>
      </section>
    );
  const members = state.memberships.filter(
    (membership) =>
      membership.teamId === team.id && ["active", "suspended"].includes(membership.state),
  );
  const invitations = state.invitations.filter((invitation) => invitation.teamId === team.id);
  const requests = state.membershipRequests.filter((request) => request.teamId === team.id);
  const canChangeRole = teamPermission(context, "change-member-role", {}, state);
  const canInvite = teamPermission(context, "invite-member", {}, state);
  const canReview = teamPermission(context, "review-membership-request", {}, state);
  const canArchive = teamPermission(context, "archive-team", {}, state);
  const run = (result: ReturnType<typeof changeMembershipRole>, success: string) =>
    setNotice(result.ok ? `${success} · رسید ${result.receiptId}` : result.message);

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.kind === "remove" && confirm.id)
      run(removeTeamMembership(context, confirm.id), "دسترسی عضو لغو شد");
    if (confirm.kind === "suspend" && confirm.id)
      run(suspendTeamMembership(context, confirm.id), "عضو تعلیق شد");
    if (confirm.kind === "restore" && confirm.id)
      run(restoreTeamMembership(context, confirm.id), "عضو به تیم بازگشت");
    if (confirm.kind === "leave") run(leaveTeam(context), "از تیم خارج شدید");
    if (confirm.kind === "transfer" && confirm.id)
      run(transferOwnership(context, confirm.id), "مالکیت منتقل شد");
    if (confirm.kind === "archive") run(archiveTeam(context), "تیم بایگانی شد");
    if (confirm.kind === "role" && confirm.id && confirm.role)
      run(
        changeMembershipRole(context, confirm.id, confirm.role),
        `نقش ${confirm.label} تغییر کرد`,
      );
    if (confirm.kind === "request-accept" && confirm.id && confirm.role)
      run(
        reviewMembershipRequest(context, confirm.id, "accepted", confirm.role),
        "عضویت پذیرفته شد",
      );
    if (confirm.kind === "request-reject" && confirm.id)
      run(reviewMembershipRequest(context, confirm.id, "rejected"), "درخواست رد شد");
    setConfirm(undefined);
  };

  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>
            <bdi dir="ltr">{team.id}</bdi> · {TEAM_ROLE_LABELS[currentMembership.role]}
          </small>
          <h1>{team.name}</h1>
          <p>اعضا، دعوت‌ها، درخواست‌ها و سیاست‌های این تیم فقط با teamId فعال مدیریت می‌شوند.</p>
        </div>
        <Link
          className="rh-profile-outline"
          href={buildSolverHref("/app/solver/dashboard", context)}
        >
          داشبورد تیم
        </Link>
      </header>
      {currentMembership.role === teamRole.contributor ||
      currentMembership.role === teamRole.viewer ? (
        <aside className="rh-team-authority-note" role="status">
          <Icon name="lock" />
          <div>
            <h2>دسترسی مطالعه</h2>
            <p>
              نقش {TEAM_ROLE_LABELS[currentMembership.role]} اجازه مدیریت عضو یا تنظیمات حساس را
              ندارد. علت محدودیت کنار هر کنترل نمایش داده می‌شود.
            </p>
          </div>
        </aside>
      ) : null}
      <nav className="rh-proposal-tabs" aria-label="بخش‌های مدیریت تیم" role="tablist">
        {(
          [
            ["overview", "نمای کلی"],
            ["members", "اعضا"],
            ["invites", "دعوت‌ها"],
            ["requests", "درخواست‌ها"],
            ["permissions", "نقش و مجوز"],
            ["activity", "فعالیت‌ها"],
          ] as Array<[TeamTab, string]>
        ).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="rh-summary-grid">
          {[
            ["اعضای فعال", members.filter((item) => item.state === "active").length, "people"],
            [
              "دعوت pending",
              invitations.filter((item) => ["sent", "viewed"].includes(item.state)).length,
              "notification",
            ],
            [
              "درخواست عضویت",
              requests.filter((item) => item.state === "requested").length,
              "brief",
            ],
            ["نقش شما", TEAM_ROLE_LABELS[currentMembership.role], "shield"],
          ].map(([label, value, icon]) => (
            <article className="rh-card" key={String(label)}>
              <span>
                <Icon name={icon as "people"} />
              </span>
              <div>
                <small>{label}</small>
                <strong>{typeof value === "number" ? value.toLocaleString("fa-IR") : value}</strong>
              </div>
            </article>
          ))}
        </section>
      )}

      {(tab === "members" || tab === "permissions") && (
        <section className="rh-card rh-membership-list">
          <header>
            <div>
              <h2>اعضا، نقش‌ها و تخصیص‌ها</h2>
              <p>
                مالک فقط با انتقال مالکیت تغییر می‌کند و handler نیز guard آخرین مدیر را enforce
                می‌کند.
              </p>
            </div>
          </header>
          {members.map((membership) => (
            <article key={membership.id}>
              <div className="rh-membership-identity">
                <PersonAvatar
                  name={userName(state, membership.userId)}
                  className="rh-avatar rh-avatar--large"
                />
                <div>
                  <span>
                    <bdi dir="ltr">{membership.id}</bdi>
                  </span>
                  <h3>{userName(state, membership.userId)}</h3>
                  <p>
                    {TEAM_ROLE_LABELS[membership.role]}
                    {membership.state === "suspended" ? " · تعلیق‌شده" : ""}
                  </p>
                  <small>
                    پیشنهادها: {membership.assignedProposalIds.length.toLocaleString("fa-IR")} ·
                    پرونده‌ها: {membership.assignedCaseIds.length.toLocaleString("fa-IR")}
                  </small>
                </div>
              </div>
              {membership.state === "active" && membership.role !== teamRole.viewer && (
                <MemberAssignmentControl
                  memberName={userName(state, membership.userId)}
                  disabled={!canChangeRole.allowed}
                  proposals={state.proposals
                    .filter((item) => item.ownerWorkspaceId === context.workspaceId)
                    .map((item) => item.id)}
                  cases={state.cases
                    .filter((item) => item.ownerWorkspaceId === context.workspaceId)
                    .map((item) => item.id)}
                  onAssign={(target) =>
                    run(
                      assignTeamMember(context, membership.id, target),
                      `${userName(state, membership.userId)} تخصیص یافت`,
                    )
                  }
                />
              )}
              <div className="rh-membership-actions">
                {membership.state === "active" && (
                  <>
                    <label>
                      <span className="sr-only">نقش {userName(state, membership.userId)}</span>
                      <select
                        aria-label={`نقش ${userName(state, membership.userId)}`}
                        value={membership.role}
                        disabled={!canChangeRole.allowed || membership.role === teamRole.owner}
                        title={canChangeRole.allowed ? undefined : canChangeRole.reason}
                        onChange={(event) =>
                          setConfirm({
                            kind: "role",
                            id: membership.id,
                            label: userName(state, membership.userId),
                            role: event.target.value as Exclude<TeamRole, "team:owner">,
                          })
                        }
                      >
                        <option value={teamRole.owner} disabled>
                          مالک تیم
                        </option>
                        <option value={teamRole.admin}>مدیر</option>
                        <option value={teamRole.proposalManager}>مدیر پیشنهاد</option>
                        <option value={teamRole.contributor}>همکار</option>
                        <option value={teamRole.viewer}>مشاهده‌گر</option>
                      </select>
                    </label>
                    {currentMembership.role === teamRole.owner &&
                      membership.id !== currentMembership.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirm({
                              kind: "transfer",
                              id: membership.id,
                              label: userName(state, membership.userId),
                            })
                          }
                        >
                          انتقال مالکیت
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={
                        !canChangeRole.allowed ||
                        membership.role === teamRole.owner ||
                        membership.id === currentMembership.id
                      }
                      onClick={() =>
                        setConfirm({
                          kind: "suspend",
                          id: membership.id,
                          label: userName(state, membership.userId),
                        })
                      }
                    >
                      تعلیق
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={!canChangeRole.allowed || membership.role === teamRole.owner}
                      title={canChangeRole.allowed ? undefined : canChangeRole.reason}
                      onClick={() =>
                        setConfirm({
                          kind: "remove",
                          id: membership.id,
                          label: userName(state, membership.userId),
                        })
                      }
                    >
                      لغو دسترسی
                    </button>
                  </>
                )}
                {membership.state === "suspended" && (
                  <button
                    type="button"
                    disabled={!canChangeRole.allowed}
                    onClick={() =>
                      setConfirm({
                        kind: "restore",
                        id: membership.id,
                        label: userName(state, membership.userId),
                      })
                    }
                  >
                    بازگرداندن عضو
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "invites" && (
        <div className="rh-membership-layout">
          <section className="rh-card rh-membership-list">
            <header>
              <div>
                <h2>دعوت‌های خروجی</h2>
                <p>وضعیت، نقش، scope و تاریخ انقضا برای همین تیم ثبت می‌شود.</p>
              </div>
            </header>
            {invitations.map((invitation) => (
              <article key={invitation.id}>
                <div>
                  <bdi dir="ltr">{invitation.recipientEmail}</bdi>
                  <h3>{TEAM_ROLE_LABELS[invitation.proposedRole]}</h3>
                  <p>{invitation.scope}</p>
                  <small>
                    {invitation.state} · انقضا {formatDate(invitation.expiresAt)}
                  </small>
                </div>
                <div className="rh-membership-actions">
                  <button
                    type="button"
                    disabled={
                      !canInvite.allowed ||
                      !["sent", "viewed", "expired"].includes(invitation.state)
                    }
                    onClick={() =>
                      run(resendTeamInvitation(context, invitation.id), "دعوت دوباره ارسال شد")
                    }
                  >
                    ارسال دوباره
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={!canInvite.allowed || !["sent", "viewed"].includes(invitation.state)}
                    onClick={() => run(revokeTeamInvitation(context, invitation.id), "دعوت لغو شد")}
                  >
                    لغو دعوت
                  </button>
                </div>
              </article>
            ))}
            {!invitations.length && (
              <div className="rh-profile-empty">
                <h2>دعوتی ثبت نشده است</h2>
              </div>
            )}
          </section>
          <aside className="rh-card rh-team-setup-form">
            <h2>دعوت عضو جدید</h2>
            <p>{canInvite.allowed ? `دعوت از طرف ${team.name} ارسال می‌شود.` : canInvite.reason}</p>
            <label>
              ایمیل
              <input dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              نقش
              <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
                <option value={teamRole.admin}>مدیر</option>
                <option value={teamRole.proposalManager}>مدیر پیشنهاد</option>
                <option value={teamRole.contributor}>همکار</option>
                <option value={teamRole.viewer}>مشاهده‌گر</option>
              </select>
            </label>
            <label>
              دامنه دسترسی
              <input value={scope} onChange={(event) => setScope(event.target.value)} />
            </label>
            <label>
              پیام
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
            </label>
            <button
              type="button"
              className="is-primary"
              disabled={!canInvite.allowed}
              onClick={() => {
                const result = sendTeamInvitation(context, {
                  recipientEmail: email,
                  proposedRole: role,
                  scope,
                  message,
                  commitment: "طبق توافق دعوت",
                  ipNotice: "شرایط مالکیت فکری پیش از پذیرش نمایش داده می‌شود.",
                });
                run(result, "دعوت ثبت شد");
                if (result.ok) {
                  setEmail("");
                  setScope("");
                  setMessage("");
                }
              }}
            >
              ارسال دعوت
            </button>
          </aside>
        </div>
      )}

      {tab === "requests" && (
        <section className="rh-card rh-membership-list">
          <header>
            <div>
              <h2>درخواست‌های عضویت</h2>
              <p>پذیرش، membership واقعی می‌سازد و roster و اعلان‌ها را به‌روز می‌کند.</p>
            </div>
          </header>
          {requests
            .filter((request) => request.state === "requested")
            .map((request) => (
              <article key={request.id}>
                <div className="rh-membership-identity">
                  <PersonAvatar
                    name={userName(state, request.requesterUserId)}
                    className="rh-avatar rh-avatar--large"
                  />
                  <div>
                    <span>
                      <bdi dir="ltr">{request.id}</bdi>
                    </span>
                    <h3>{userName(state, request.requesterUserId)}</h3>
                    <p>{request.introduction}</p>
                    <small>
                      <bdi dir="ltr">{request.resumeFileName}</bdi> · {request.availability}
                    </small>
                    <details>
                      <summary>مشاهده پرونده {userName(state, request.requesterUserId)}</summary>
                      <p>
                        {state.users.find((user) => user.id === request.requesterUserId)
                          ?.headline ?? "عنوان حرفه‌ای ثبت نشده"}
                      </p>
                      <p>
                        رزومه نمونه: <bdi dir="ltr">{request.resumeFileName}</bdi>
                      </p>
                      <p>نقش درخواستی: {TEAM_ROLE_LABELS[request.requestedRole]}</p>
                    </details>
                  </div>
                </div>
                <div className="rh-membership-actions">
                  <button
                    type="button"
                    disabled={!canReview.allowed}
                    title={canReview.allowed ? undefined : canReview.reason}
                    onClick={() =>
                      setConfirm({
                        kind: "request-accept",
                        id: request.id,
                        label: userName(state, request.requesterUserId),
                        role: request.requestedRole,
                      })
                    }
                  >
                    پذیرش با نقش {TEAM_ROLE_LABELS[request.requestedRole]}
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={!canReview.allowed}
                    title={canReview.allowed ? undefined : canReview.reason}
                    onClick={() =>
                      setConfirm({
                        kind: "request-reject",
                        id: request.id,
                        label: userName(state, request.requesterUserId),
                      })
                    }
                  >
                    رد درخواست
                  </button>
                </div>
              </article>
            ))}
          {!requests.some((request) => request.state === "requested") && (
            <div className="rh-profile-empty">
              <h2>درخواست pending وجود ندارد</h2>
            </div>
          )}
        </section>
      )}

      {tab === "permissions" && (
        <section className="rh-card rh-team-authority-note">
          <Icon name="shield" />
          <div>
            <h2>سیاست فعال تیم</h2>
            <p>
              ارسال مدیر: {team.policy.adminsCanSubmit ? "مجاز" : "غیرمجاز"} · ارسال مدیر پیشنهاد:{" "}
              {team.policy.proposalManagersCanSubmit ? "مجاز" : "غیرمجاز"} · پیام برای مشاهده‌گر:{" "}
              {team.policy.viewersCanReadMessages ? "مطالعه" : "مسدود"}
            </p>
          </div>
          <Link href={buildSolverHref("/app/solver/settings", context)}>تنظیمات سیاست‌ها</Link>
        </section>
      )}

      {tab === "activity" && (
        <section className="rh-card rh-worklist">
          <header className="rh-worklist__header">
            <div>
              <h2>فعالیت‌های ثبت‌شده</h2>
              <p>رویدادهای دارای receipt همین workspace</p>
            </div>
          </header>
          {state.auditEvents
            .filter((event) => event.workspaceId === context.workspaceId)
            .slice()
            .reverse()
            .map((event) => (
              <article className="rh-work-item" key={event.id}>
                <div>
                  <strong>{event.action}</strong>
                  <small>
                    <bdi dir="ltr">{event.entityId}</bdi>
                  </small>
                </div>
                <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                <bdi dir="ltr">{event.receiptId}</bdi>
              </article>
            ))}
        </section>
      )}

      <section className="rh-card rh-team-authority-note">
        <Icon name="shield" />
        <div>
          <h2>{currentMembership.role === teamRole.owner ? "اقدام‌های مالک" : "عضویت شما"}</h2>
          <p>
            {currentMembership.role === teamRole.owner
              ? canArchive.allowed
                ? "بایگانی تیم با تأیید و رسید انجام می‌شود."
                : canArchive.reason
              : "خروج، دسترسی شما را از همین تیم لغو می‌کند و روی تیم‌های دیگر اثری ندارد."}
          </p>
        </div>
        {currentMembership.role === teamRole.owner ? (
          <button
            type="button"
            className="is-danger"
            disabled={!canArchive.allowed}
            onClick={() => setConfirm({ kind: "archive", label: team.name })}
          >
            بایگانی تیم
          </button>
        ) : (
          <button
            type="button"
            className="is-danger"
            onClick={() => setConfirm({ kind: "leave", label: team.name })}
          >
            خروج از تیم
          </button>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === "transfer"
            ? `انتقال مالکیت به ${confirm.label}`
            : confirm?.kind === "archive"
              ? `بایگانی ${confirm.label}`
              : confirm?.kind === "role"
                ? `تغییر نقش ${confirm.label}`
                : confirm?.kind === "request-accept"
                  ? `پذیرش عضویت ${confirm.label}`
                  : confirm?.kind === "request-reject"
                    ? `رد درخواست ${confirm.label}`
                    : confirm?.kind === "suspend"
                      ? `تعلیق ${confirm.label}`
                      : confirm?.kind === "restore"
                        ? `بازگرداندن ${confirm.label}`
                        : confirm?.kind === "leave"
                          ? `خروج از ${confirm.label}`
                          : `لغو دسترسی ${confirm?.label}`
        }
        description="این اقدام حساس در audit ثبت می‌شود و بلافاصله روی workspace و مجوزها اثر می‌گذارد."
        confirmLabel="تأیید اقدام"
        onCancel={() => setConfirm(undefined)}
        onConfirm={confirmAction}
      />
      <ReceiptToast value={notice} onClose={() => setNotice("")} />
    </>
  );
}

export function SolverInvitationsExperience() {
  const context = useSolverContext();
  const state = useStore();
  const [notice, setNotice] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>();
  const [introduction, setIntroduction] = useState("");
  const [availability, setAvailability] = useState("");
  const [rejecting, setRejecting] = useState<string>();
  const [resumeInvitationId, setResumeInvitationId] = useState<string>();
  if (context.type === "team") return <SolverTeamManagement initialTab="requests" />;
  const incoming = state.invitations.filter(
    (invitation) => invitation.recipientUserId === state.currentUser.id,
  );
  const availableTeams = state.teams.filter(
    (team) =>
      !state.memberships.some(
        (membership) =>
          membership.teamId === team.id &&
          membership.userId === state.currentUser.id &&
          membership.state === "active",
      ),
  );
  const resumeInvitation = incoming.find((invitation) => invitation.id === resumeInvitationId);
  const resumeTeam = state.teams.find((team) => team.id === resumeInvitation?.teamId);
  const resumeProfile = state.teamProfiles.find((profile) => profile.teamId === resumeTeam?.id);
  const resumeVerification = state.verifications.find(
    (record) => record.subjectType === "team" && record.subjectId === resumeTeam?.id,
  );
  const resumeSummary: TeamResumeSummary | undefined =
    resumeInvitation && resumeTeam
      ? {
          team: resumeTeam.name,
          field: resumeProfile?.expertise.join(" و ") || "اطلاعات تخصص در حال تکمیل",
          inviter: userName(state, resumeInvitation.inviterUserId),
          members: `${state.memberships.filter((membership) => membership.teamId === resumeTeam.id && membership.state === "active").length.toLocaleString("fa-IR")} عضو فعال`,
          role: TEAM_ROLE_LABELS[resumeInvitation.proposedRole],
          tags: resumeProfile?.expertise ?? [],
          verified: resumeVerification?.state === "verified",
          verificationLabel:
            resumeVerification?.state === "verified" ? "تیم تأییدشده" : "احراز تیم در حال تکمیل",
        }
      : undefined;
  const respond = (id: string, decision: "accepted" | "declined", reason = "") => {
    const result = respondToTeamInvitation(id, decision, reason);
    setNotice(
      result.ok
        ? `${decision === "accepted" ? "دعوت پذیرفته" : "دعوت رد"} شد · رسید ${result.receiptId}`
        : result.message,
    );
    if (result.ok) {
      setRejecting(undefined);
    }
  };
  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>فضای شخصی {state.currentUser.displayName}</small>
          <h1>دعوت‌ها و درخواست‌های همکاری</h1>
          <p>دعوت ورودی، درخواست عضویت شما و نتیجه هر تصمیم از entityهای مستقل ساخته می‌شوند.</p>
        </div>
      </header>
      <section className="rh-offer-list" aria-label="دعوت‌های ورودی تیم">
        {incoming.map((invitation) => {
          const team = state.teams.find((candidate) => candidate.id === invitation.teamId);
          return (
            <article className="rh-card rh-offer-card" key={invitation.id}>
              <header className="rh-offer-card__header">
                <div>
                  <small>
                    <bdi dir="ltr">{invitation.id}</bdi>
                  </small>
                  <h2>{team?.name}</h2>
                  <p>دعوت‌کننده: {userName(state, invitation.inviterUserId)}</p>
                </div>
                <span className="rh-status rh-status--info">{invitation.state}</span>
              </header>
              <div className="rh-offer-card__body">
                <dl>
                  <div>
                    <dt>نقش پیشنهادی</dt>
                    <dd>{TEAM_ROLE_LABELS[invitation.proposedRole]}</dd>
                  </div>
                  <div>
                    <dt>دامنه</dt>
                    <dd>{invitation.scope}</dd>
                  </div>
                  <div>
                    <dt>تعهد زمانی</dt>
                    <dd>{invitation.commitment}</dd>
                  </div>
                  <div>
                    <dt>انقضا</dt>
                    <dd>{formatDate(invitation.expiresAt)}</dd>
                  </div>
                </dl>
                <p>{invitation.message}</p>
                <aside className="rh-team-origin-note">
                  <Icon name="shield" />
                  <div>
                    <strong>مالکیت فکری</strong>
                    <p>{invitation.ipNotice}</p>
                  </div>
                </aside>
                {invitation.decisionReason && (
                  <p>
                    <strong>دلیل رد:</strong> {invitation.decisionReason}
                  </p>
                )}
              </div>
              <footer className="rh-offer-card__footer">
                {team && (
                  <button
                    type="button"
                    className="rh-profile-outline"
                    onClick={() => setResumeInvitationId(invitation.id)}
                  >
                    <Icon name="eye" /> مشاهده رزومه تیم
                  </button>
                )}
                {["sent", "viewed"].includes(invitation.state) && (
                  <>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => setRejecting(invitation.id)}
                    >
                      رد دعوت
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => respond(invitation.id, "accepted")}
                    >
                      پذیرش دعوت
                    </button>
                  </>
                )}
                {invitation.state === "accepted" &&
                  team &&
                  (() => {
                    const resolution = workspaceContextForTeam(team.id, state);
                    return resolution.ok ? (
                      <Link
                        className="is-primary"
                        href={buildSolverHref("/app/solver/dashboard", resolution.context)}
                      >
                        ورود به تیم
                      </Link>
                    ) : null;
                  })()}
              </footer>
            </article>
          );
        })}
      </section>
      <section className="rh-card rh-team-setup-form">
        <h2>درخواست عضویت در تیم</h2>
        <p>نقش مطلوب، معرفی، رزومه و availability در درخواست واقعی ذخیره می‌شود.</p>
        <label>
          تیم
          <select
            value={selectedTeam ?? ""}
            onChange={(event) => setSelectedTeam(event.target.value)}
          >
            <option value="">انتخاب تیم</option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          معرفی
          <textarea
            value={introduction}
            onChange={(event) => setIntroduction(event.target.value)}
          />
        </label>
        <label>
          ظرفیت همکاری
          <input value={availability} onChange={(event) => setAvailability(event.target.value)} />
        </label>
        <button
          type="button"
          className="is-primary"
          disabled={!selectedTeam}
          onClick={() => {
            if (!selectedTeam) return;
            const result = requestTeamMembership(selectedTeam, {
              requestedRole: teamRole.contributor,
              introduction,
              resumeFileName: state.personalProfiles[0]?.resumeFileName ?? "solver-resume.pdf",
              availability,
            });
            setNotice(
              result.ok ? `درخواست عضویت ثبت شد · رسید ${result.receiptId}` : result.message,
            );
          }}
        >
          ارسال درخواست عضویت
        </button>
      </section>
      <ConfirmDialog
        open={Boolean(rejecting)}
        title="رد دعوت عضویت"
        description="برای اینکه تیم دلیل تصمیم را بداند، توضیح کوتاه و قابل‌پیگیری ثبت کنید."
        confirmLabel="ثبت رد دعوت"
        reasonRequired
        onCancel={() => setRejecting(undefined)}
        onConfirm={(reason) => rejecting && respond(rejecting, "declined", reason)}
      />
      {resumeSummary && (
        <TeamResumeDialog
          resume={resumeSummary}
          onClose={() => setResumeInvitationId(undefined)}
          onDownloaded={() => setNotice("رزومه تیم دریافت شد.")}
        />
      )}
      <ReceiptToast value={notice} onClose={() => setNotice("")} />
    </>
  );
}

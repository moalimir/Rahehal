"use client";

import { useConnectedSolverDashboard } from "@/components/solver/use-connected-dashboard";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import {
  SolverWorkspaceShell,
  useSolverContext,
  useSolverSpace,
  type SolverSpace,
} from "@/components/solver-shell";
import { TeamResumeDialog, type TeamResumeSummary } from "@/components/team-resume-dialog";
import { getChallengePublisher } from "@/data/challenge-publishers";
import { challenges } from "@/data/mock";
import { isOpportunitySaved, setOpportunitySaved } from "@/lib/solver/saved-opportunities";
import type { ActiveWorkspace, SolverState } from "@/domain/solver";
import { teamRole } from "@rahhal/domain";
import { buildSolverHref } from "@/lib/solver/context";
import { profileReadiness } from "@/lib/solver/eligibility";
import {
  activeWorkspaces,
  directOffersForWorkspace,
  notificationsForWorkspace,
  proposalsForWorkspace,
  readSolverState,
  respondToTeamInvitation,
  reviewMembershipRequest,
  subscribeSolverState,
  workspaceProjection,
} from "@/lib/solver/repository";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";

function NetworkArtwork() {
  return (
    <div className="rh-network" aria-hidden="true">
      {[12, 27, 44, 61, 78, 91].map((value, index) => (
        <i
          key={value}
          style={
            { "--x": `${value}%`, "--y": `${18 + ((index * 27) % 65)}%` } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone = value.includes("اصلاح")
    ? "warning"
    : value.includes("بررسی")
      ? "info"
      : value.includes("ارسال")
        ? "success"
        : "neutral";
  return <span className={`rh-status rh-status--${tone}`}>{value}</span>;
}

function ProfileCard({ context, state }: { context: ActiveWorkspace; state: SolverState }) {
  const space = context.type;
  const team = space === "team";
  const activeTeam = team ? state.teams.find((item) => item.id === context.teamId) : undefined;
  const readiness = profileReadiness(state, context);
  const teamProfile = team
    ? state.teamProfiles.find((profile) => profile.teamId === context.teamId)
    : undefined;
  const personalProfile = !team
    ? state.personalProfiles.find((profile) => profile.workspaceId === context.workspaceId)
    : undefined;
  return (
    <section className="rh-card rh-profile-card">
      <div className="rh-profile-card__head">
        <PersonAvatar name={state.currentUser.displayName} className="rh-avatar rh-avatar--large" />
        <div>
          <small>{team ? "پروفایل تیم" : "پروفایل حرفه‌ای"}</small>
          <h2>{activeTeam?.name ?? state.currentUser.displayName}</h2>
          <p>
            {teamProfile?.valueProposition ||
              personalProfile?.headline ||
              state.currentUser.headline}
          </p>
        </div>
      </div>
      <div className="rh-progress-label">
        <span>تکمیل پروفایل: {readiness.toLocaleString("fa-IR")}٪</span>
        <Icon name="check" />
      </div>
      <div className="rh-progress">
        <i style={{ width: `${readiness}%` }} />
      </div>
      <div className="rh-skill-row">
        {(teamProfile?.expertise ?? personalProfile?.skills ?? []).slice(0, 2).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      {team && (
        <p className="rh-team-capacity">
          <Icon name="people" />{" "}
          {state.memberships
            .filter(
              (membership) => membership.teamId === context.teamId && membership.state === "active",
            )
            .length.toLocaleString("fa-IR")}{" "}
          عضو فعال · {teamProfile?.capacity}
        </p>
      )}
      <Link
        className="rh-button rh-button--primary"
        href={buildSolverHref(
          team
            ? `/app/solver/teams/${context.type === "team" ? context.teamId : ""}`
            : "/app/solver/profile",
          context,
        )}
      >
        {team ? "ویرایش پروفایل تیم" : "تکمیل پروفایل"}
      </Link>
    </section>
  );
}

function ActionCard({ context, state }: { context: ActiveWorkspace; state: SolverState }) {
  const space = context.type;
  const team = space === "team";
  const teamName =
    context.type === "team"
      ? state.teams.find((candidate) => candidate.id === context.teamId)?.name
      : undefined;
  const proposals = proposalsForWorkspace(context.workspaceId, state);
  const urgentProposal = proposals.find((proposal) =>
    ["draft", "revision_requested", "revision_draft", "clarification_requested"].includes(
      proposal.state,
    ),
  );
  const requestCount =
    context.type === "team"
      ? state.membershipRequests.filter(
          (request) => request.teamId === context.teamId && request.state === "requested",
        ).length
      : 0;
  const actions = team
    ? [
        ["تکمیل پروفایل و توانمندی تیم", teamName ?? "تیم فعال", "تکمیل پروفایل"],
        [
          "ادامه پیشنهاد نیازمند اقدام",
          urgentProposal?.id ?? "مورد بازی وجود ندارد",
          "ادامه تدوین",
        ],
        [
          "بررسی درخواست‌های عضویت",
          `${requestCount.toLocaleString("fa-IR")} درخواست باز`,
          "بررسی درخواست‌ها",
        ],
      ]
    : [
        [
          "تکمیل پروفایل تخصصی",
          `${profileReadiness(state, context).toLocaleString("fa-IR")}٪ تکمیل`,
          "تکمیل پروفایل",
        ],
        [
          "ادامه پیشنهاد نیازمند اقدام",
          urgentProposal?.id ?? "مورد بازی وجود ندارد",
          "ادامه ویرایش",
        ],
        [
          "بررسی اعلان‌های اقدام‌دار",
          `${notificationsForWorkspace(context.workspaceId, state)
            .filter((item) => item.actionRequired && !item.readAt)
            .length.toLocaleString("fa-IR")} اعلان`,
          "مشاهده اعلان‌ها",
        ],
      ];
  return (
    <section className="rh-card rh-actions-card">
      <h2>اقدام‌های موردنیاز {team ? "تیم" : "شما"}</h2>
      {actions.map(([title, note, action], index) => (
        <article key={title}>
          <span className={`rh-action-icon rh-action-icon--${index}`}>
            <Icon name={index === 0 ? "people" : index === 1 ? "decision" : "history"} />
          </span>
          <div>
            <strong>{title}</strong>
            <small>{note}</small>
          </div>
          <Link
            href={
              index === 0
                ? team
                  ? buildSolverHref(
                      `/app/solver/teams/${context.type === "team" ? context.teamId : ""}`,
                      context,
                    )
                  : buildSolverHref("/app/solver/profile", context)
                : index === 1
                  ? urgentProposal
                    ? buildSolverHref(`/app/solver/proposals/${urgentProposal.id}/edit`, context)
                    : buildSolverHref("/app/solver/proposals", context)
                  : team
                    ? buildSolverHref("/app/solver/invitations", context)
                    : buildSolverHref("/app/solver/notifications", context)
            }
          >
            {action}
          </Link>
        </article>
      ))}
    </section>
  );
}

function OpportunityCards({
  context,
  onFeedback,
}: {
  context: ActiveWorkspace;
  onFeedback: (message: string) => void;
}) {
  const space = context.type;
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useEffect(() => {
    setSavedIds(
      challenges
        .filter((challenge) => isOpportunitySaved(challenge.id, false, context.workspaceId))
        .map((challenge) => challenge.id),
    );
  }, [context.workspaceId]);
  return (
    <section className="rh-card rh-opportunities">
      <header>
        <div>
          <h2>فرصت‌های پیشنهادی برای {space === "team" ? "تیم" : "شما"}</h2>
          <p>بر اساس تخصص‌ها، سابقه و ظرفیت همکاری</p>
        </div>
        <Link href={buildSolverHref("/app/solver/opportunities", context)}>مشاهده همه فرصت‌ها</Link>
      </header>
      <div className="rh-opportunity-grid">
        {challenges
          .slice(space === "team" ? 3 : 0, space === "team" ? 6 : 3)
          .map((challenge, index) => (
            <article key={challenge.id}>
              <button
                type="button"
                className={savedIds.includes(challenge.id) ? "is-saved" : ""}
                aria-pressed={savedIds.includes(challenge.id)}
                aria-label={
                  savedIds.includes(challenge.id)
                    ? `حذف ${challenge.title} از ذخیره‌شده‌ها`
                    : `ذخیره ${challenge.title}`
                }
                onClick={() => {
                  const next = !savedIds.includes(challenge.id);
                  setOpportunitySaved(challenge.id, next, context.workspaceId);
                  setSavedIds((items) =>
                    next
                      ? [...new Set([...items, challenge.id])]
                      : items.filter((id) => id !== challenge.id),
                  );
                  onFeedback(
                    next
                      ? "فرصت ذخیره شد و در فهرست ذخیره‌شده‌ها در دسترس است."
                      : "فرصت از ذخیره‌شده‌ها حذف شد.",
                  );
                }}
              >
                <Icon name="history" />
              </button>
              <ChallengeOrganizationLogo challengeId={challenge.id} />
              <h3>{challenge.title}</h3>
              <p>{getChallengePublisher(challenge.id).name}</p>
              <div className="rh-tag-row">
                {challenge.tags.slice(0, 2).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <small>
                <Icon name="history" /> مهلت: {7 + index * 3} روز
              </small>
              <p className="rh-fit-note">
                <Icon name="check" />{" "}
                {space === "team"
                  ? "متناسب با توانمندی‌های ثبت‌شده تیم"
                  : "مرتبط با تخصص‌های ثبت‌شده شما"}
              </p>
              <Link href={buildSolverHref(`/app/solver/opportunities/${challenge.slug}`, context)}>
                مشاهده فرصت
              </Link>
            </article>
          ))}
      </div>
    </section>
  );
}

function TeamManagement({
  context,
  state,
  onFeedback,
  onChanged,
}: {
  context: Extract<ActiveWorkspace, { type: "team" }>;
  state: SolverState;
  onFeedback: (message: string) => void;
  onChanged: () => void;
}) {
  const pending = state.membershipRequests.filter(
    (request) => request.teamId === context.teamId && request.state === "requested",
  );
  const members = state.memberships.filter(
    (membership) => membership.teamId === context.teamId && membership.state === "active",
  );
  return (
    <div className="rh-team-grid">
      <section className="rh-card rh-invites">
        <header>
          <h2>درخواست‌های پیوستن</h2>
          <span>{pending.length.toLocaleString("fa-IR")} مورد</span>
        </header>
        {pending.map((request, index) => {
          const person = state.users.find((user) => user.id === request.requesterUserId);
          return (
            <article key={request.id}>
              <PersonAvatar
                name={person?.displayName ?? request.requesterUserId}
                className="rh-avatar"
              />
              <div>
                <strong>{person?.displayName ?? request.requesterUserId}</strong>
                <small>
                  {person?.headline} · {request.resumeFileName}
                </small>
              </div>
              <Link href={buildSolverHref("/app/solver/invitations", context)}>مشاهده رزومه</Link>
              {index === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const result = reviewMembershipRequest(
                      context,
                      request.id,
                      "accepted",
                      teamRole.contributor,
                    );
                    onFeedback(
                      result.ok ? "درخواست پذیرفته و عضویت فعال در roster ثبت شد." : result.message,
                    );
                    if (result.ok) onChanged();
                  }}
                >
                  پذیرش
                </button>
              ) : (
                <StatusPill value="نیازمند بررسی" />
              )}
            </article>
          );
        })}
        {!pending.length && (
          <p className="rh-dashboard-empty-line">درخواست بررسی‌نشده‌ای وجود ندارد.</p>
        )}
        <Link href={buildSolverHref("/app/solver/invitations", context)}>
          مشاهده همه درخواست‌ها
        </Link>
      </section>
      <section className="rh-card rh-members">
        <header>
          <h2>اعضای تیم</h2>
          <span>{members.length.toLocaleString("fa-IR")} عضو فعال</span>
        </header>
        {members.map((membership) => {
          const person = state.users.find((user) => user.id === membership.userId);
          return (
            <article key={membership.id}>
              <PersonAvatar name={person?.displayName ?? membership.userId} className="rh-avatar" />
              <div>
                <strong>{person?.displayName ?? membership.userId}</strong>
                <small>{person?.headline ?? "عضو تیم"}</small>
              </div>
              <b>{TEAM_ROLE_LABELS[membership.role]}</b>
            </article>
          );
        })}
        <Link href={buildSolverHref(`/app/solver/teams/${context.teamId}`, context)}>
          مشاهده و مدیریت همه اعضا
        </Link>
      </section>
    </div>
  );
}

export function SolverDashboardExperience({
  embedded = false,
  space: suppliedSpace,
}: {
  embedded?: boolean;
  space?: SolverSpace;
} = {}) {
  const currentSpace = useSolverSpace();
  const hookContext = useSolverContext();
  const space = suppliedSpace ?? currentSpace;
  const [state, setState] = useState(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  const context =
    hookContext.type === space
      ? hookContext
      : space === "team"
        ? (activeWorkspaces(state).find((workspace) => workspace.type === "team") ?? hookContext)
        : ({ type: "individual", workspaceId: state.personalWorkspace.id } as const);
  const team = space === "team";
  const [feedback, setFeedback] = useState("");
  const [personalResumeOpen, setPersonalResumeOpen] = useState(false);
  const projection = workspaceProjection(context.workspaceId, state);
  // Connected runtime: counts come from the server for the active workspace.
  // A family that failed to load contributes null, and the card below shows
  // that explicitly rather than a zero the human would read as real.
  const connected = useConnectedSolverDashboard();
  const liveCounts = connected.state.kind === "ready" ? connected.state.summary.proposals : null;
  const metrics = useMemo(() => {
    const proposals = projection.proposals;
    if (liveCounts) {
      return [
        {
          label: "پیش‌نویس‌ها",
          count: liveCounts.drafts,
          status: "draft",
          cta: "مشاهده پیش‌نویس‌ها",
        },
        {
          label: "ارسال‌شده‌ها",
          count: liveCounts.submitted,
          status: "submitted",
          cta: "مشاهده ارسال‌شده‌ها",
        },
        {
          label: "در حال بررسی",
          count: liveCounts.inReview,
          status: "reviewing",
          cta: "مشاهده موارد در حال بررسی",
        },
        {
          label: "نیازمند اقدام",
          count: liveCounts.needsAction,
          status: "revision_requested",
          cta: "مشاهده موارد نیازمند اقدام",
        },
      ];
    }
    return [
      {
        label: "پیش‌نویس‌ها",
        count: proposals.filter((proposal) => ["draft", "revision_draft"].includes(proposal.state))
          .length,
        status: "draft",
        cta: "مشاهده پیش‌نویس‌ها",
      },
      {
        label: "ارسال‌شده‌ها",
        count: proposals.filter((proposal) =>
          ["submitted", "resubmitted", "clarification_submitted"].includes(proposal.state),
        ).length,
        status: "submitted",
        cta: "مشاهده ارسال‌شده‌ها",
      },
      {
        label: "در حال بررسی",
        count: proposals.filter((proposal) =>
          ["reviewing", "eligibility_review", "eligible"].includes(proposal.state),
        ).length,
        status: "reviewing",
        cta: "مشاهده موارد در حال بررسی",
      },
      {
        label: "نیازمند اقدام",
        count: proposals.filter((proposal) =>
          ["revision_requested", "clarification_requested"].includes(proposal.state),
        ).length,
        status: "revision_requested",
        cta: "مشاهده موارد نیازمند اقدام",
      },
    ];
  }, [liveCounts, projection.proposals]);
  const activeTeam =
    context.type === "team"
      ? state.teams.find((candidate) => candidate.id === context.teamId)
      : undefined;
  const activeMembership =
    context.type === "team"
      ? state.memberships.find((candidate) => candidate.id === context.membershipId)
      : undefined;
  const incomingInvite = state.invitations.find(
    (invitation) =>
      invitation.recipientUserId === state.currentUser.id &&
      ["sent", "viewed"].includes(invitation.state),
  );
  const inviteTeam = incomingInvite
    ? state.teams.find((candidate) => candidate.id === incomingInvite.teamId)
    : undefined;
  const inviteProfile = inviteTeam
    ? state.teamProfiles.find((profile) => profile.teamId === inviteTeam.id)
    : undefined;
  const inviteVerification = inviteTeam
    ? state.verifications.find(
        (record) => record.subjectType === "team" && record.subjectId === inviteTeam.id,
      )
    : undefined;
  const inviter = incomingInvite
    ? state.users.find((user) => user.id === incomingInvite.inviterUserId)
    : undefined;
  const inviteResume: TeamResumeSummary | undefined =
    incomingInvite && inviteTeam
      ? {
          team: inviteTeam.name,
          field: inviteProfile?.expertise.join(" و ") || "اطلاعات تخصص در حال تکمیل",
          inviter: inviter?.displayName ?? incomingInvite.inviterUserId,
          members: `${state.memberships.filter((membership) => membership.teamId === inviteTeam.id && membership.state === "active").length.toLocaleString("fa-IR")} عضو فعال`,
          role: TEAM_ROLE_LABELS[incomingInvite.proposedRole],
          tags: inviteProfile?.expertise ?? [],
          verified: inviteVerification?.state === "verified",
          verificationLabel:
            inviteVerification?.state === "verified" ? "تیم تأییدشده" : "احراز تیم در حال تکمیل",
        }
      : undefined;

  const content = (
    <>
      <section className="rh-dashboard-hero">
        <NetworkArtwork />
        <div>
          <small className="rh-dashboard-hero__context">
            <Icon name={team ? "people" : "user"} />
            {team ? "فضای تیم" : "فضای شخصی"}
          </small>
          <h1>{team ? activeTeam?.name : "برای حل مسئله بعدی آماده‌اید؟"}</h1>
          <p>
            {team
              ? `نقش شما: ${activeMembership ? TEAM_ROLE_LABELS[activeMembership.role] : "بدون دسترسی"} · داده‌های این تیم مستقل است.`
              : `${projection.proposals.length.toLocaleString("fa-IR")} پیشنهاد و ${directOffersForWorkspace(context.workspaceId, state).length.toLocaleString("fa-IR")} پیشنهاد مستقیم در فضای شخصی دارید.`}
          </p>
          <Link
            className="rh-button rh-button--primary"
            href={buildSolverHref("/app/solver/opportunities", context)}
          >
            {team ? "مشاهده فرصت‌های مناسب تیم" : "مشاهده فرصت‌های جدید"}
          </Link>
        </div>
      </section>

      <div className="rh-dashboard-top">
        <ProfileCard context={context} state={state} />
        <ActionCard context={context} state={state} />
      </div>

      <section className="rh-card rh-metrics-card">
        <header>
          <h2>خلاصه وضعیت راه‌حل‌ها</h2>
          <span>{team ? "آمار فضای فعال تیم" : "وضعیت حساب شخصی"}</span>
        </header>
        <div>
          {metrics.map((metric, index) => (
            <article key={metric.label} className={`tone-${index}`}>
              <Icon
                name={
                  index === 0
                    ? "decision"
                    : index === 1
                      ? "arrow"
                      : index === 2
                        ? "search"
                        : "notification"
                }
              />
              <span>{metric.label}</span>
              <strong>{metric.count.toLocaleString("fa-IR")}</strong>
              <Link
                href={buildSolverHref("/app/solver/proposals", context, {
                  status: metric.status,
                })}
              >
                {metric.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rh-card rh-requests">
        <header>
          <div>
            <h2>آخرین درخواست‌ها و راه‌حل‌های {team ? "تیم" : "من"}</h2>
            <p>وضعیت، مهلت و اقدام بعدی هر پرونده</p>
          </div>
          <Link href={buildSolverHref("/app/solver/proposals", context)}>
            مشاهده همه درخواست‌ها
          </Link>
        </header>
        <div className="rh-table" role="table" aria-label="آخرین درخواست‌ها">
          <div role="row" className="rh-table__head">
            <span role="columnheader">عنوان فرصت</span>
            <span role="columnheader">سازمان</span>
            <span role="columnheader">وضعیت</span>
            <span role="columnheader">آخرین به‌روزرسانی</span>
            <span role="columnheader">اقدام بعدی</span>
          </div>
          {projection.proposals.slice(0, 4).map((proposal) => {
            const challenge = challenges.find((item) => item.id === proposal.challengeId);
            if (!challenge) return null;
            const status =
              proposal.state === "revision_requested"
                ? "نیازمند اصلاح"
                : proposal.state === "draft"
                  ? "پیش‌نویس"
                  : proposal.state === "reviewing"
                    ? "در حال بررسی"
                    : proposal.state === "selected"
                      ? "پذیرفته‌شده"
                      : "ارسال‌شده";
            return (
              <div role="row" key={proposal.id}>
                {[
                  challenge.title,
                  getChallengePublisher(challenge.id).name,
                  status,
                  proposal.updatedAt,
                  proposal.state,
                ].map((cell, index) => (
                  <span role="cell" key={`${proposal.id}-${index}`}>
                    {index === 1 ? (
                      <span className="rh-table__organization">
                        <ChallengeOrganizationLogo challengeId={challenge.id} size="small" />
                        <span>{cell}</span>
                      </span>
                    ) : index === 2 ? (
                      <StatusPill value={cell} />
                    ) : index === 4 ? (
                      <Link
                        href={buildSolverHref(
                          `/app/solver/proposals/${proposal.id}/${["draft", "revision_requested", "revision_draft"].includes(proposal.state) ? "edit" : "preview"}`,
                          context,
                        )}
                      >
                        {["draft", "revision_requested", "revision_draft"].includes(proposal.state)
                          ? "ادامه ویرایش"
                          : "مشاهده جزئیات"}
                      </Link>
                    ) : index === 3 ? (
                      new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
                        new Date(cell),
                      )
                    ) : (
                      cell
                    )}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <OpportunityCards context={context} onFeedback={setFeedback} />
      {team && context.type === "team" ? (
        <TeamManagement
          context={context}
          state={state}
          onFeedback={setFeedback}
          onChanged={() => setState(readSolverState())}
        />
      ) : (
        <section className="rh-card rh-personal-invite">
          <header>
            <h2>دعوت‌نامه‌های تیمی</h2>
            <span>{incomingInvite ? "یک دعوت جدید" : "دعوت بازی وجود ندارد"}</span>
          </header>
          {incomingInvite && inviteTeam ? (
            <article>
              <PersonAvatar
                name={inviter?.displayName ?? incomingInvite.inviterUserId}
                className="rh-avatar"
              />
              <div>
                <strong>{inviteTeam.name}</strong>
                <small>
                  دعوت از طرف {inviter?.displayName ?? incomingInvite.inviterUserId} برای نقش{" "}
                  {TEAM_ROLE_LABELS[incomingInvite.proposedRole]}
                </small>
              </div>
              <>
                <button
                  type="button"
                  className="is-resume"
                  onClick={() => setPersonalResumeOpen(true)}
                >
                  <Icon name="eye" /> مشاهده رزومه
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const result = respondToTeamInvitation(incomingInvite.id, "accepted");
                    setFeedback(
                      result.ok
                        ? "دعوت پذیرفته شد و فضای تیم به انتخاب‌گر اضافه شد."
                        : result.message,
                    );
                    if (result.ok) setState(readSolverState());
                  }}
                >
                  پذیرش
                </button>
                <Link
                  className="is-danger"
                  href={buildSolverHref("/app/solver/invitations", context)}
                >
                  بررسی و پاسخ
                </Link>
              </>
            </article>
          ) : (
            <p className="rh-dashboard-empty-line">دعوت عضویت بررسی‌نشده‌ای ندارید.</p>
          )}
        </section>
      )}
      {personalResumeOpen && inviteResume && (
        <TeamResumeDialog
          resume={inviteResume}
          onClose={() => setPersonalResumeOpen(false)}
          onDownloaded={() => setFeedback("رزومه تیم با موفقیت دریافت شد.")}
        />
      )}
      {feedback && (
        <div className="rh-flow-toast" role="status">
          <Icon name="check" />
          <span>{feedback}</span>
          {feedback.includes("فرصت") ? (
            <Link href={buildSolverHref("/app/solver/saved", context)}>مشاهده ذخیره‌شده‌ها</Link>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => setFeedback("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <SolverWorkspaceShell active="dashboard" currentPath="/app/solver/dashboard" space={space}>
      {content}
    </SolverWorkspaceShell>
  );
}

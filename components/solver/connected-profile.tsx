"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { RecordId } from "@/components/solver/record-identity";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type {
  SolverVerificationResource,
  SolverWorkspaceProfileResource,
  TeamResource,
} from "@rahhal/contracts";
import { applicantTypeLabels } from "@/domain/challenge";
import type { GatewayFailure } from "@/lib/api/result";
import { decideTeamPermission, TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";
import type { TeamRole } from "@rahhal/domain";

type SolverProfileView = {
  readonly profile: SolverWorkspaceProfileResource | null;
  readonly verification: SolverVerificationResource | null;
  readonly team: TeamResource | null;
  readonly failures: readonly { readonly family: string; readonly error: GatewayFailure }[];
};

async function readSolverProfileView(gateways: WorkspaceGateways): Promise<SolverProfileView> {
  const profilePromise = gateways.solverProfile.read();
  const verificationPromise = gateways.solverProfile.readVerification();
  const profile = await profilePromise;
  const teamPromise =
    profile.ok && profile.data.workspace_kind === "team" ? gateways.team.read() : null;
  const [verification, team] = await Promise.all([verificationPromise, teamPromise]);
  const failures: { family: string; error: GatewayFailure }[] = [];
  if (!profile.ok) failures.push({ family: "profile", error: profile.error });
  if (!verification.ok) failures.push({ family: "verification", error: verification.error });
  if (team && !team.ok) failures.push({ family: "team", error: team.error });
  return {
    profile: profile.ok ? profile.data : null,
    verification: verification.ok ? verification.data : null,
    team: team?.ok ? team.data : null,
    failures,
  };
}

function profileViewScopeLost(view: SolverProfileView): boolean {
  return (
    view.profile === null &&
    view.verification === null &&
    view.failures.length > 0 &&
    view.failures.every((failure) => failure.error.code === "NO_ACCESS")
  );
}

function list(value: string): string[] {
  return value
    .split(/[،,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const verificationLabels: Record<SolverVerificationResource["state"], string> = {
  not_started: "شروع نشده",
  draft: "پیش‌نویس درخواست",
  submitted: "ارسال‌شده",
  under_review: "در حال بررسی",
  verified: "تأییدشده",
  needs_revision: "نیازمند اصلاح",
  rejected: "ردشده",
  expired: "منقضی‌شده",
};

const profileDateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ProfileNotice = {
  readonly workspaceId: string;
  readonly tone: "success" | "error";
  readonly message: string;
};

function formatProfileDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "زمان ثبت در دسترس نیست"
    : profileDateFormatter.format(date);
}

export function ConnectedSolverProfile({
  verificationOnly = false,
}: {
  verificationOnly?: boolean;
}) {
  const connected = useConnectedFamily(readSolverProfileView, profileViewScopeLost);
  const [notice, setNotice] = useState<ProfileNotice | null>(null);
  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="پروفایل" />;

  const { profile, verification, team, failures } = connected.state.data;
  if (!profile)
    return (
      <ConnectedFamilyError
        error={
          failures.find((failure) => failure.family === "profile")?.error ?? {
            code: "NOT_FOUND",
            message: "پروفایل این فضای کاری در دسترس نیست.",
          }
        }
        label="پروفایل"
      >
        <button type="button" onClick={connected.refresh}>
          تلاش دوباره
        </button>
      </ConnectedFamilyError>
    );

  return (
    <ConnectedSolverProfileForm
      profile={profile}
      verification={verification}
      team={team}
      failures={failures}
      refresh={connected.refresh}
      verificationOnly={verificationOnly}
      notice={notice?.workspaceId === profile.workspace_id ? notice : null}
      setNotice={setNotice}
    />
  );
}

function ConnectedSolverProfileForm({
  profile,
  verification,
  team,
  failures,
  refresh,
  verificationOnly,
  notice,
  setNotice,
}: {
  profile: SolverWorkspaceProfileResource;
  verification: SolverVerificationResource | null;
  team: TeamResource | null;
  failures: SolverProfileView["failures"];
  refresh: () => void;
  verificationOnly: boolean;
  notice: ProfileNotice | null;
  setNotice: (notice: ProfileNotice | null) => void;
}) {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const activeWorkspace = runtime.me?.workspaces.find(
    (workspace) => workspace.id === profile.workspace_id,
  );
  const isTeam = profile.workspace_kind === "team";
  const workspaceName =
    activeWorkspace?.name ?? (isTeam ? "تیم فعال" : (runtime.me?.user.display_name ?? "فضای شخصی"));
  const displayName = isTeam ? workspaceName : runtime.me?.user.display_name || workspaceName;
  const activeMembership = runtime.me?.memberships.find(
    (membership) =>
      membership.workspace_id === profile.workspace_id && membership.state === "active",
  );
  const teamRole = activeMembership?.role.startsWith("team:")
    ? (activeMembership.role as TeamRole)
    : null;
  const editDecision = !isTeam
    ? ({ allowed: true } as const)
    : team && teamRole
      ? decideTeamPermission("edit-team-profile", { role: teamRole, policy: team.policy })
      : ({
          allowed: false,
          reason: "سطح دسترسی شما برای ویرایش این پروفایل مشخص نیست.",
        } as const);
  const canEditProfile = editDecision.allowed;
  const canManageVerification = !isTeam || teamRole === "team:owner" || teamRole === "team:admin";
  const [headline, setHeadline] = useState(profile.headline);
  const [overview, setOverview] = useState(profile.overview);
  const [expertise, setExpertise] = useState(profile.expertise.join("، "));
  const [geography, setGeography] = useState(profile.geography.join("، "));
  const [pending, setPending] = useState(false);
  const readinessIssues = profile.readiness.issues;

  /**
   * A completed profile is something to read, not a form to fill in again.
   *
   * The page only ever rendered the editor, so a solver who had already
   * written their profile came back to four inputs and no sense that anything
   * had been saved -- the same screen they saw before filling it in. An empty
   * profile still opens straight into the form, because there is nothing to
   * show yet and asking for an extra click would be pointless.
   */
  const hasProfile = Boolean(
    profile.headline.trim() ||
      profile.overview.trim() ||
      profile.expertise.length ||
      profile.geography.length,
  );
  const [editing, setEditing] = useState(!hasProfile && canEditProfile);
  const expertiseItems = list(expertise);
  const geographyItems = list(geography);
  const checklist = [
    {
      key: "headline",
      label: isTeam ? "عنوان تخصصی تیم" : "عنوان حرفه‌ای",
      complete: headline.trim().length >= 5,
    },
    {
      key: "overview",
      label: isTeam ? "معرفی کامل تیم" : "معرفی حرفه‌ای",
      complete: overview.trim().length >= 20,
    },
    {
      key: "expertise",
      label: isTeam ? "حوزه‌های تخصص تیم" : "تخصص‌ها",
      complete: expertiseItems.length > 0,
    },
    {
      key: "geography",
      label: "محدوده همکاری",
      complete: geographyItems.length > 0,
    },
  ];
  const completedItems = checklist.filter((item) => item.complete).length;
  const completionPercent = Math.round((completedItems / checklist.length) * 100);
  const dirty =
    headline.trim() !== profile.headline ||
    overview.trim() !== profile.overview ||
    expertiseItems.join("\u0000") !== profile.expertise.join("\u0000") ||
    geographyItems.join("\u0000") !== profile.geography.join("\u0000");

  const resetEditor = () => {
    setHeadline(profile.headline);
    setOverview(profile.overview);
    setExpertise(profile.expertise.join("، "));
    setGeography(profile.geography.join("، "));
    setNotice(null);
  };

  const openEditor = () => {
    resetEditor();
    setEditing(true);
  };

  const runVerification = async () => {
    if (!verification) return;
    setPending(true);
    const result = await gateways.solverProfile.startVerification(verification.version);
    setPending(false);
    setNotice({
      workspaceId: profile.workspace_id,
      tone: result.ok ? "success" : "error",
      message: result.ok ? "درخواست احراز با موفقیت آغاز شد." : result.error.message,
    });
    if (result.ok) refresh();
  };

  const verificationCard = (
    <section
      className={`rh-card rh-connected-profile-verification is-${verification?.state ?? "unavailable"}`}
      aria-labelledby="profile-verification-title"
    >
      <header>
        <span>
          <Icon name={verification?.state === "verified" ? "check" : "shield"} />
        </span>
        <div>
          <small>احراز فضای کاری</small>
          <h2 id="profile-verification-title">
            {verification ? verificationLabels[verification.state] : "در دسترس نیست"}
          </h2>
        </div>
      </header>
      <p>
        احراز هویت راه ارتباطی با احراز این فضای کاری متفاوت است. فقط بعضی فراخوان‌ها برای ارسال
        نهایی به این مرحله نیاز دارند.
      </p>
      {verificationOnly && verification && (
        <dl>
          <div>
            <dt>آخرین به‌روزرسانی</dt>
            <dd>{formatProfileDate(verification.updated_at)}</dd>
          </div>
          <div>
            <dt>نسخه وضعیت</dt>
            <dd>{verification.version.toLocaleString("fa-IR")}</dd>
          </div>
        </dl>
      )}
      {verification?.state === "not_started" && canManageVerification && (
        <button
          className="rh-profile-primary"
          type="button"
          disabled={pending}
          onClick={() => void runVerification()}
        >
          <Icon name="shield" /> {pending ? "در حال شروع…" : "شروع درخواست احراز"}
        </button>
      )}
      {verification?.state === "not_started" && !canManageVerification && (
        <p className="rh-connected-profile-verification__permission">
          شروع احراز برای مالک یا مدیر تیم در دسترس است.
        </p>
      )}
      {!verificationOnly && verification && verification.state !== "not_started" && (
        <Link className="rh-profile-outline" href="/app/solver/verification">
          مشاهده جزئیات احراز
        </Link>
      )}
    </section>
  );

  const readinessCard = (
    <section
      className="rh-card rh-connected-profile-readiness"
      aria-labelledby="profile-readiness-title"
    >
      <header>
        <div>
          <small>آمادگی پروفایل</small>
          <h2 id="profile-readiness-title">
            {completedItems === checklist.length ? "کامل و آماده" : "در حال تکمیل"}
          </h2>
        </div>
        <strong>{completionPercent.toLocaleString("fa-IR")}٪</strong>
      </header>
      <div
        className="rh-connected-profile-readiness__bar"
        role="progressbar"
        aria-label="درصد تکمیل پروفایل"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completionPercent}
      >
        <span style={{ inlineSize: `${completionPercent}%` }} />
      </div>
      <ul>
        {checklist.map((item) => (
          <li className={item.complete ? "is-complete" : ""} key={item.key}>
            <span>
              <Icon name={item.complete ? "check" : "close"} />
            </span>
            {item.label}
          </li>
        ))}
      </ul>
      {!editing && !profile.readiness.ready && canEditProfile && (
        <button type="button" className="rh-profile-outline" onClick={openEditor}>
          تکمیل موارد باقی‌مانده
        </button>
      )}
    </section>
  );

  return (
    <div className="rh-connected-profile-page">
      <header className="rh-connected-profile-hero">
        <div className="rh-connected-profile-hero__identity">
          <span className="rh-connected-profile-hero__avatar">
            <Icon name={isTeam ? "people" : "user"} />
          </span>
          <div>
            <small>
              {verificationOnly
                ? "وضعیت احراز فضای کاری"
                : isTeam
                  ? "پروفایل تیم"
                  : "پروفایل و رزومه"}
            </small>
            <h1>
              {verificationOnly
                ? `احراز ${workspaceName}`
                : isTeam
                  ? workspaceName
                  : "پروفایل حرفه‌ای من"}
            </h1>
            {!verificationOnly && (
              <strong>
                <bdi dir="auto">{displayName}</bdi>
              </strong>
            )}
          </div>
        </div>
        <div className="rh-connected-profile-hero__copy">
          <p>
            {verificationOnly
              ? "وضعیت احراز و اقدام بعدی برای همین فضای کاری نمایش داده می‌شود."
              : isTeam
                ? "توانمندی جمعی، حوزه‌های تخصص و محدوده همکاری تیم را برای سازمان‌ها روشن کنید."
                : "تجربه، تخصص و محدوده همکاری خود را در یک رزومه کوتاه و قابل مرور ارائه کنید."}
          </p>
          {!verificationOnly && (
            <div className="rh-connected-profile-hero__chips">
              <span>{applicantTypeLabels[profile.applicant_type]}</span>
              <span className={profile.readiness.ready ? "is-ready" : ""}>
                {profile.readiness.ready
                  ? "پروفایل کامل است"
                  : `${readinessIssues.length.toLocaleString("fa-IR")} مورد باقی مانده`}
              </span>
              {!canEditProfile && <span>دسترسی فقط مشاهده</span>}
            </div>
          )}
        </div>
      </header>

      {failures.map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label="بخشی از پروفایل">
          <button type="button" onClick={refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      {verificationOnly ? (
        <div className="rh-connected-profile-verification-only">{verificationCard}</div>
      ) : (
        <div className="rh-connected-profile-layout">
          {!editing ? (
            <section
              className="rh-card rh-connected-profile-summary"
              aria-label={hasProfile ? "پروفایل ثبت‌شده" : "پروفایل تیم"}
            >
              <header className="rh-connected-profile-summary__head">
                <div>
                  <small>{isTeam ? "معرفی تخصصی تیم" : "عنوان حرفه‌ای"}</small>
                  <h2>
                    <bdi dir="auto">{profile.headline || "بدون عنوان حرفه‌ای"}</bdi>
                  </h2>
                  <span>{applicantTypeLabels[profile.applicant_type]}</span>
                </div>
                {canEditProfile && (
                  <button type="button" onClick={openEditor}>
                    <Icon name="brief" /> ویرایش پروفایل
                  </button>
                )}
              </header>
              {!canEditProfile && (
                <div className="rh-connected-profile-readonly-note" role="note">
                  <Icon name="lock" />
                  <p>{editDecision.allowed ? "" : editDecision.reason}</p>
                </div>
              )}
              <div className="rh-connected-profile-summary__overview">
                <span className="rh-connected-profile-summary__section-icon">
                  <Icon name="brief" />
                </span>
                <div>
                  <h3>{isTeam ? "درباره تیم" : "درباره من"}</h3>
                  <p>
                    <bdi dir="auto">{profile.overview || "هنوز معرفی حرفه‌ای ثبت نشده است."}</bdi>
                  </p>
                </div>
              </div>
              <div className="rh-connected-profile-summary__details">
                <section>
                  <header>
                    <Icon name="spark" />
                    <h3>{isTeam ? "حوزه‌های تخصص تیم" : "تخصص‌ها"}</h3>
                  </header>
                  {profile.expertise.length ? (
                    <ul className="rh-connected-profile-summary__tags">
                      {profile.expertise.map((item) => (
                        <li key={item}>
                          <bdi dir="auto">{item}</bdi>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>هنوز تخصصی ثبت نشده است.</p>
                  )}
                </section>
                <section>
                  <header>
                    <Icon name="location" />
                    <h3>محدوده همکاری</h3>
                  </header>
                  {profile.geography.length ? (
                    <ul className="rh-connected-profile-summary__locations">
                      {profile.geography.map((item) => (
                        <li key={item}>
                          <bdi dir="auto">{item}</bdi>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>هنوز محدوده‌ای ثبت نشده است.</p>
                  )}
                </section>
              </div>
              <footer>
                <span>آخرین به‌روزرسانی: {formatProfileDate(profile.updated_at)}</span>
                <span>نسخه {profile.version.toLocaleString("fa-IR")}</span>
              </footer>
            </section>
          ) : (
            <form
              className="rh-card rh-connected-profile-form rh-connected-profile-editor"
              onSubmit={(event) => {
                event.preventDefault();
                setPending(true);
                setNotice(null);
                const patch = {
                  headline: headline.trim(),
                  overview: overview.trim(),
                  expertise: expertiseItems,
                  geography: geographyItems,
                };
                void gateways.solverProfile
                  .update({
                    expectedVersion: profile.version,
                    patch,
                  })
                  .then((result) => {
                    setPending(false);
                    setNotice({
                      workspaceId: profile.workspace_id,
                      tone: result.ok ? "success" : "error",
                      message: result.ok
                        ? "تغییرات پروفایل با موفقیت ذخیره شد."
                        : result.error.message,
                    });
                    if (result.ok) {
                      // Back to the read view: the save is what the human came to
                      // do, and leaving them in the editor makes a completed save
                      // look indistinguishable from an unsaved draft.
                      setEditing(false);
                      refresh();
                    }
                  });
              }}
            >
              <header className="rh-connected-profile-editor__head">
                <div>
                  <small>{hasProfile ? "ویرایش اطلاعات ثبت‌شده" : "شروع پروفایل"}</small>
                  <h2>
                    {isTeam
                      ? hasProfile
                        ? "ویرایش پروفایل تیم"
                        : "ساخت پروفایل تیم"
                      : hasProfile
                        ? "ویرایش رزومه حرفه‌ای"
                        : "ساخت رزومه حرفه‌ای"}
                  </h2>
                  <p>
                    {isTeam
                      ? "اطلاعاتی را ثبت کنید که توانایی جمعی تیم را دقیق و قابل ارزیابی نشان دهد."
                      : "در چند بخش کوتاه، تصویر روشنی از تجربه و نوع همکاری موردنظرتان بسازید."}
                  </p>
                </div>
                {hasProfile && <span>نسخه {profile.version.toLocaleString("fa-IR")}</span>}
              </header>
              <div className="rh-connected-profile-form__grid">
                <label className="rh-connected-field">
                  <span>{isTeam ? "عنوان تخصصی تیم" : "عنوان حرفه‌ای"}</span>
                  <input
                    required
                    minLength={5}
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder={
                      isTeam
                        ? "برای نمونه: تیم تحلیل و پایش هوشمند صنعتی"
                        : "برای نمونه: متخصص پایش و تحلیل داده صنعتی"
                    }
                  />
                  <small className="rh-connected-field__meta">
                    <span>
                      {isTeam
                        ? "تمرکز و ارزش اصلی تیم در یک عبارت"
                        : "نقش یا ارزش حرفه‌ای شما در یک عبارت"}
                    </span>
                    <span>{headline.trim().length.toLocaleString("fa-IR")} نویسه</span>
                  </small>
                </label>
                <label className="rh-connected-field">
                  <span>{isTeam ? "حوزه‌های تخصص تیم" : "تخصص‌ها"}</span>
                  <input
                    required
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    placeholder="تحلیل داده، اینترنت اشیا، نگهداری پیش‌بینانه"
                  />
                  <small className="rh-connected-field__meta">
                    <span>هر تخصص را با ویرگول جدا کنید</span>
                    <span>{expertiseItems.length.toLocaleString("fa-IR")} مورد</span>
                  </small>
                </label>
                <label className="rh-connected-field is-wide">
                  <span>{isTeam ? "معرفی تیم" : "درباره من"}</span>
                  <textarea
                    required
                    minLength={20}
                    rows={6}
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                    placeholder={
                      isTeam
                        ? "ترکیب تیم، تجربه مشترک و نوع مسئله‌هایی را که حل می‌کنید توضیح دهید."
                        : "تجربه، توانمندی و نوع مسئله‌هایی را که حل می‌کنید توضیح دهید."
                    }
                  />
                  <small className="rh-connected-field__meta">
                    <span>
                      {isTeam
                        ? "تصویری روشن از توانمندی و رویکرد کاری تیم"
                        : "تصویری روشن از تجربه و رویکرد کاری شما"}
                    </span>
                    <span>{overview.trim().length.toLocaleString("fa-IR")} نویسه</span>
                  </small>
                </label>
                <label className="rh-connected-field is-wide">
                  <span>محدوده همکاری</span>
                  <input
                    required
                    value={geography}
                    onChange={(e) => setGeography(e.target.value)}
                    placeholder="برای نمونه: تهران، اصفهان"
                  />
                  <small className="rh-connected-field__meta">
                    <span>شهرها یا ناحیه‌هایی که امکان همکاری و اجرای پروژه دارید</span>
                    <span>{geographyItems.length.toLocaleString("fa-IR")} مورد</span>
                  </small>
                </label>
              </div>
              <footer className="rh-connected-form-actions">
                <p>
                  {dirty
                    ? "تغییرات ذخیره‌نشده دارید."
                    : hasProfile
                      ? "همه تغییرات ذخیره شده‌اند."
                      : "برای فعال شدن ثبت، چهار بخش پروفایل را کامل کنید."}
                </p>
                <div>
                  {hasProfile && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        // Discard the edits and show what the server still holds.
                        resetEditor();
                        setEditing(false);
                      }}
                    >
                      انصراف
                    </button>
                  )}
                  <button className="rh-profile-primary" type="submit" disabled={pending || !dirty}>
                    <Icon name="check" />{" "}
                    {pending
                      ? "در حال ذخیره…"
                      : hasProfile
                        ? "ذخیره تغییرات"
                        : isTeam
                          ? "ثبت پروفایل تیم"
                          : "ثبت پروفایل"}
                  </button>
                </div>
              </footer>
            </form>
          )}
          <aside className="rh-connected-profile-aside">
            {readinessCard}
            {verificationCard}
          </aside>
        </div>
      )}
      {notice && (
        <div className={`rh-profile-toast is-${notice.tone}`} role="status">
          <Icon name={notice.tone === "success" ? "check" : "notification"} />
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Connected account facts plus honest boundaries for settings not delivered in Phase 3. */
export function ConnectedSolverSettings() {
  const runtime = useWebRuntime();
  const activeWorkspace = runtime.me?.workspaces.find(
    (workspace) => workspace.id === runtime.me?.active_context?.workspace_id,
  );
  const membership = runtime.me?.memberships.find(
    (candidate) => candidate.workspace_id === activeWorkspace?.id && candidate.state === "active",
  );
  const role = membership?.role;
  const roleLabel =
    role === "individual"
      ? "حل‌کننده مستقل"
      : role?.startsWith("team:")
        ? TEAM_ROLE_LABELS[role as TeamRole]
        : "حل‌کننده";

  if (!runtime.me || !activeWorkspace || !membership) {
    return (
      <section className="rh-card rh-profile-empty" role="status">
        <Icon name="lock" />
        <h1>فضای حل‌کننده فعالی پیدا نشد</h1>
      </section>
    );
  }

  return (
    <div className="rh-connected-settings-page">
      <header className="rh-profile-heading rh-connected-page-head">
        <div>
          <small>حساب و فضای کاری فعال</small>
          <h1>{activeWorkspace.kind === "team" ? "تنظیمات تیم" : "تنظیمات حل‌کننده"}</h1>
          <p>وضعیت حساب، فضای فعال و قابلیت‌های قابل مدیریت را یکجا مرور کنید.</p>
        </div>
        <span className="rh-connected-page-head__badge">
          <Icon name={activeWorkspace.kind === "team" ? "people" : "user"} /> {roleLabel}
        </span>
      </header>
      <div className="rh-connected-settings-grid">
        <section className="rh-card rh-connected-settings-card is-account">
          <header className="rh-connected-card-head">
            <span className="rh-connected-card-head__icon">
              <Icon name="user" />
            </span>
            <div>
              <h2>حساب و فضای فعال</h2>
              <p>این اطلاعات از نشست متصل خوانده می‌شود.</p>
            </div>
          </header>
          <dl className="rh-connected-facts-grid">
            <div>
              <dt>نام کاربر</dt>
              <dd>{runtime.me.user.display_name}</dd>
            </div>
            <div>
              <dt>فضای کاری</dt>
              <dd>{activeWorkspace.name}</dd>
            </div>
            <div>
              <dt>نقش فعال</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt>راه ارتباطی</dt>
              <dd dir="ltr">
                {runtime.me.user.primary_email ?? runtime.me.user.primary_phone ?? "ثبت نشده"}
              </dd>
            </div>
          </dl>
          <div className="rh-connected-settings-workspace-id">
            <div>
              <strong>شناسه فضای کاری</strong>
              <p>برای پشتیبانی، گزارش خطا یا هماهنگی فنی از این شناسه استفاده کنید.</p>
            </div>
            <RecordId value={activeWorkspace.id} label="شناسه فضای کاری" />
          </div>
        </section>
        <section className="rh-card rh-connected-settings-card">
          <header className="rh-connected-card-head">
            <span className="rh-connected-card-head__icon is-soft">
              <Icon name="grid" />
            </span>
            <div>
              <h2>ترجیحات محصول</h2>
              <p>تنظیمات فعال در نسخه فعلی</p>
            </div>
          </header>
          <dl className="rh-connected-settings-list">
            <div>
              <dt>زبان و جهت</dt>
              <dd>فارسی · راست‌به‌چپ</dd>
            </div>
            <div>
              <dt>منطقه زمانی</dt>
              <dd>تهران</dd>
            </div>
            <div>
              <dt>اعلان درون‌برنامه‌ای</dt>
              <dd>فعال</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="rh-card rh-connected-verification-card rh-connected-settings-verification">
        <span className="rh-connected-verification-card__icon">
          <Icon name="shield" />
        </span>
        <div>
          <small>مسیر مستقل و متصل</small>
          <strong>احراز فضای کاری مسیر مستقل و متصل دارد.</strong>
          <p>وضعیت احراز را ببینید یا در صورت نیاز درخواست بررسی را آغاز کنید.</p>
        </div>
        <Link className="rh-profile-outline" href="/app/solver/verification">
          <Icon name="eye" /> مشاهده وضعیت احراز
        </Link>
      </section>
      <section className="rh-connected-settings-boundary" role="note">
        <Icon name="lock" />
        <p>
          امنیت نشست، ورود دومرحله‌ای، حریم خصوصی و کانال تحویل اعلان در فاز فعلی قابل تغییر نیستند.
        </p>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type { SolverVerificationResource, SolverWorkspaceProfileResource } from "@rahhal/contracts";
import type { GatewayFailure } from "@/lib/api/result";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";
import type { TeamRole } from "@rahhal/domain";

type SolverProfileView = {
  readonly profile: SolverWorkspaceProfileResource | null;
  readonly verification: SolverVerificationResource | null;
  readonly failures: readonly { readonly family: string; readonly error: GatewayFailure }[];
};

async function readSolverProfileView(gateways: WorkspaceGateways): Promise<SolverProfileView> {
  const [profile, verification] = await Promise.all([
    gateways.solverProfile.read(),
    gateways.solverProfile.readVerification(),
  ]);
  const failures: { family: string; error: GatewayFailure }[] = [];
  if (!profile.ok) failures.push({ family: "profile", error: profile.error });
  if (!verification.ok) failures.push({ family: "verification", error: verification.error });
  return {
    profile: profile.ok ? profile.data : null,
    verification: verification.ok ? verification.data : null,
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

export function ConnectedSolverProfile({
  verificationOnly = false,
}: {
  verificationOnly?: boolean;
}) {
  const connected = useConnectedFamily(readSolverProfileView, profileViewScopeLost);
  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="پروفایل" />;

  const { profile, verification, failures } = connected.state.data;
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
      failures={failures}
      refresh={connected.refresh}
      verificationOnly={verificationOnly}
    />
  );
}

function ConnectedSolverProfileForm({
  profile,
  verification,
  failures,
  refresh,
  verificationOnly,
}: {
  profile: SolverWorkspaceProfileResource;
  verification: SolverVerificationResource | null;
  failures: SolverProfileView["failures"];
  refresh: () => void;
  verificationOnly: boolean;
}) {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const [headline, setHeadline] = useState(profile.headline);
  const [overview, setOverview] = useState(profile.overview);
  const [expertise, setExpertise] = useState(profile.expertise.join("، "));
  const [geography, setGeography] = useState(profile.geography.join("، "));
  const [notice, setNotice] = useState("");
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
  const hasProfile = Boolean(profile.headline.trim() || profile.overview.trim());
  const [editing, setEditing] = useState(!hasProfile);

  const runVerification = async () => {
    if (!verification) return;
    setPending(true);
    const result = await gateways.solverProfile.startVerification(verification.version);
    setPending(false);
    setNotice(
      result.ok
        ? `درخواست احراز آغاز شد · شناسه همبستگی ${result.meta.correlation_id}`
        : result.error.message,
    );
    if (result.ok) refresh();
  };

  return (
    <div className="rh-connected-profile-page">
      <header className="rh-profile-heading rh-connected-page-head">
        <div>
          <small>
            {verificationOnly
              ? "وضعیت احراز فضای کاری"
              : profile.workspace_kind === "team"
                ? "پروفایل تیم"
                : "پروفایل حرفه‌ای"}
          </small>
          <h1>{verificationOnly ? "احراز حل‌کننده" : "پروفایل فضای کاری"}</h1>
          <p>
            {verificationOnly
              ? "وضعیت و اقدام بعدی احراز از فضای کاری فعال خوانده می‌شود."
              : "این اطلاعات مستقیماً از فضای کاری فعال خوانده و همان‌جا ذخیره می‌شود."}
          </p>
        </div>
        {!verificationOnly && (
          <div className="rh-connected-page-head__status" aria-label="وضعیت آمادگی پروفایل">
            <span>{profile.workspace_kind === "team" ? "فضای تیمی" : "فضای شخصی"}</span>
            <strong>
              {profile.readiness.ready
                ? "پروفایل آماده است"
                : `${readinessIssues.length.toLocaleString("fa-IR")} مورد تا آمادگی`}
            </strong>
          </div>
        )}
      </header>

      {failures.map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label="بخشی از پروفایل">
          <button type="button" onClick={refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      {!verificationOnly && hasProfile && !editing && (
        <section className="rh-card rh-connected-profile-summary" aria-label="پروفایل ثبت‌شده">
          <header className="rh-connected-card-head">
            <span className="rh-connected-card-head__icon">
              <Icon name={profile.workspace_kind === "team" ? "people" : "user"} />
            </span>
            <div>
              <h2>{profile.headline || "بدون عنوان حرفه‌ای"}</h2>
              <p>{profile.workspace_kind === "team" ? "پروفایل تیم" : "پروفایل فردی"}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)}>
              <Icon name="brief" /> ویرایش پروفایل
            </button>
          </header>
          <dl className="rh-connected-profile-summary__facts">
            <div>
              <dt>معرفی حرفه‌ای</dt>
              <dd>{profile.overview || "ثبت نشده"}</dd>
            </div>
            <div>
              <dt>تخصص‌ها</dt>
              <dd>
                {profile.expertise.length ? (
                  <ul className="rh-connected-profile-summary__tags">
                    {profile.expertise.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "ثبت نشده"
                )}
              </dd>
            </div>
            <div>
              <dt>محدوده جغرافیایی</dt>
              <dd>
                {profile.geography.length ? (
                  <ul className="rh-connected-profile-summary__tags">
                    {profile.geography.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "ثبت نشده"
                )}
              </dd>
            </div>
          </dl>
          {readinessIssues.length > 0 && (
            <ul className="rh-connected-profile-summary__issues">
              {readinessIssues.map((issue) => (
                <li key={issue.path}>{issue.message}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!verificationOnly && (!hasProfile || editing) && (
        <form
          className="rh-card rh-connected-profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setNotice("");
            void gateways.solverProfile
              .update({
                expectedVersion: profile.version,
                patch: {
                  headline: headline.trim(),
                  overview: overview.trim(),
                  expertise: list(expertise),
                  geography: list(geography),
                },
              })
              .then((result) => {
                setPending(false);
                setNotice(
                  result.ok
                    ? `پروفایل ذخیره شد · شناسه همبستگی ${result.meta.correlation_id}`
                    : result.error.message,
                );
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
          <header className="rh-connected-card-head">
            <span className="rh-connected-card-head__icon">
              <Icon name={profile.workspace_kind === "team" ? "people" : "user"} />
            </span>
            <div>
              <h2>اطلاعات حرفه‌ای</h2>
              <p>معرفی کوتاه و دقیق، پیدا کردن تخصص شما را برای فرصت‌های مناسب آسان‌تر می‌کند.</p>
            </div>
          </header>
          <div className="rh-connected-profile-form__grid">
            <label className="rh-connected-field">
              <span>عنوان حرفه‌ای</span>
              <input
                required
                minLength={5}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="برای نمونه: متخصص پایش و تحلیل داده صنعتی"
              />
              <small>نقش یا ارزش حرفه‌ای شما در یک عبارت کوتاه</small>
            </label>
            <label className="rh-connected-field">
              <span>تخصص‌ها</span>
              <input
                required
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
                placeholder="تحلیل داده، اینترنت اشیا، نگهداری پیش‌بینانه"
              />
              <small>هر تخصص را با ویرگول جدا کنید</small>
            </label>
            <label className="rh-connected-field is-wide">
              <span>معرفی حرفه‌ای</span>
              <textarea
                required
                minLength={20}
                rows={6}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="تجربه، توانمندی و نوع مسئله‌هایی را که حل می‌کنید توضیح دهید."
              />
              <small>یک معرفی روشن از تجربه و رویکرد کاری این فضای حل‌کننده</small>
            </label>
            <label className="rh-connected-field is-wide">
              <span>محدوده جغرافیایی</span>
              <input
                required
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="برای نمونه: تهران، اصفهان"
              />
              <small>شهرها یا ناحیه‌هایی که امکان همکاری و اجرای پروژه دارید</small>
            </label>
          </div>
          <footer className="rh-connected-form-actions">
            <p>پس از ذخیره، آمادگی پروفایل دوباره روی سرور محاسبه می‌شود.</p>
            {hasProfile && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  // Discard the edits and show what the server still holds.
                  setHeadline(profile.headline);
                  setOverview(profile.overview);
                  setExpertise(profile.expertise.join("، "));
                  setGeography(profile.geography.join("، "));
                  setNotice("");
                  setEditing(false);
                }}
              >
                انصراف
              </button>
            )}
            <button className="rh-profile-primary" type="submit" disabled={pending}>
              <Icon name="check" /> {pending ? "در حال ذخیره…" : "ذخیره پروفایل"}
            </button>
          </footer>
        </form>
      )}

      <section className="rh-card rh-connected-verification-card">
        <span className="rh-connected-verification-card__icon">
          <Icon name={verification?.state === "verified" ? "check" : "shield"} />
        </span>
        <div>
          <small>وضعیت احراز فضای کاری</small>
          <strong>{verification ? verificationLabels[verification.state] : "در دسترس نیست"}</strong>
          <p>
            تأیید راه ارتباطی ورود با احراز فضای کاری یکی نیست. فراخوان‌هایی که احراز می‌خواهند تا
            پایان بررسی قابل ارسال نیستند.
          </p>
        </div>
        {verification?.state === "not_started" && (
          <button
            className="rh-profile-primary"
            type="button"
            disabled={pending}
            onClick={() => void runVerification()}
          >
            شروع درخواست احراز
          </button>
        )}
        {!verificationOnly && verification?.state !== "not_started" && (
          <Link className="rh-profile-outline" href="/app/solver/verification">
            مشاهده جزئیات احراز
          </Link>
        )}
      </section>

      {readinessIssues.length > 0 && (
        <section className="rh-card rh-connected-readiness" role="status">
          <header>
            <span>
              <Icon name="spark" />
            </span>
            <div>
              <small>راهنمای تکمیل</small>
              <h2>موارد باقی‌مانده برای آمادگی</h2>
            </div>
          </header>
          <ul>
            {readinessIssues.map((issue) => (
              <li key={issue.path}>{issue.message}</li>
            ))}
          </ul>
        </section>
      )}
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon
            name={notice.includes("ذخیره") || notice.includes("آغاز") ? "check" : "notification"}
          />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
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

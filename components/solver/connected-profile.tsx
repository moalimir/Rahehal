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
    <>
      <header className="rh-profile-heading">
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
      </header>

      {failures.map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label="بخشی از پروفایل">
          <button type="button" onClick={refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      {!verificationOnly && (
        <form
          className="rh-card rh-settings-page"
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
                if (result.ok) refresh();
              });
          }}
        >
          <div className="rh-wizard-fields">
            <label>
              <span>عنوان حرفه‌ای</span>
              <input
                required
                minLength={5}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </label>
            <label>
              <span>معرفی حرفه‌ای</span>
              <textarea
                required
                minLength={20}
                rows={5}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
              />
            </label>
            <label>
              <span>تخصص‌ها</span>
              <input
                required
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
                placeholder="با ویرگول جدا کنید"
              />
            </label>
            <label>
              <span>محدوده جغرافیایی</span>
              <input
                required
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="برای نمونه: تهران، اصفهان"
              />
            </label>
          </div>
          <button className="rh-profile-primary" type="submit" disabled={pending}>
            {pending ? "در حال ذخیره…" : "ذخیره پروفایل"}
          </button>
        </form>
      )}

      <section className="rh-card rh-team-origin-note">
        <Icon name={verification?.state === "verified" ? "check" : "shield"} />
        <div>
          <strong>
            احراز فضای کاری:{" "}
            {verification ? verificationLabels[verification.state] : "در دسترس نیست"}
          </strong>
          <p>
            تأیید راه ارتباطی ورود با احراز فضای کاری یکی نیست. فراخوان‌هایی که احراز می‌خواهند تا
            پایان بررسی قابل ارسال نیستند.
          </p>
        </div>
        {verification?.state === "not_started" && (
          <button type="button" disabled={pending} onClick={() => void runVerification()}>
            شروع درخواست احراز
          </button>
        )}
      </section>

      {profile.readiness.issues.length > 0 && (
        <section className="rh-card rh-profile-empty" role="status">
          <h2>موارد باقی‌مانده برای آمادگی</h2>
          <ul>
            {profile.readiness.issues.map((issue) => (
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
    </>
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
    <div className="rh-settings-page">
      <header className="rh-profile-heading">
        <div>
          <small>حساب و فضای کاری فعال</small>
          <h1>تنظیمات حل‌کننده</h1>
          <p>اطلاعات مرجع نشست نمایش داده می‌شود؛ کنترل نمایشی قابل ذخیره وجود ندارد.</p>
        </div>
      </header>
      <section className="rh-card rh-settings-content">
        <div className="rh-setting-details">
          <p>
            <span>نام کاربر</span>
            <strong>{runtime.me.user.display_name}</strong>
          </p>
          <p>
            <span>فضای کاری</span>
            <strong>{activeWorkspace.name}</strong>
          </p>
          <p>
            <span>نقش فعال</span>
            <strong>{roleLabel}</strong>
          </p>
          <p>
            <span>راه ارتباطی</span>
            <strong dir="ltr">
              {runtime.me.user.primary_email ?? runtime.me.user.primary_phone ?? "ثبت نشده"}
            </strong>
          </p>
          <p>
            <span>زبان و منطقه زمانی</span>
            <strong>فارسی · تهران</strong>
          </p>
        </div>
      </section>
      <section className="rh-card rh-team-origin-note">
        <Icon name="shield" />
        <div>
          <strong>احراز فضای کاری مسیر مستقل و متصل دارد.</strong>
          <p>امنیت نشست، 2FA، حریم خصوصی و کانال تحویل اعلان در فاز فعلی قابل تغییر نیستند.</p>
        </div>
        <Link className="rh-profile-outline" href="/app/solver/verification">
          مشاهده وضعیت احراز
        </Link>
      </section>
    </div>
  );
}

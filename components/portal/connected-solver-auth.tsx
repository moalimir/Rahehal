"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import type { GatewayFailure } from "@/lib/api/result";
import {
  activateSolver,
  resendContactVerification,
  signInWithVerifiedContact,
  startContactVerification,
  verifyContact,
} from "@/lib/auth/contact-session";

/**
 * The connected solver sign-in and activation flow.
 *
 * One human, one OTP: there is no password field and no "team account" tab,
 * because a team has no credential in the canonical model. Workspace selection
 * happens after authentication, at `/app`.
 *
 * Nothing here is written to `localStorage` or `sessionStorage`. The
 * verification token lives in component state for the seconds between
 * verifying a code and exchanging it for a session, and the session itself is
 * an HttpOnly cookie this code cannot read.
 */
type Stage =
  | { readonly kind: "contact" }
  | {
      readonly kind: "code";
      readonly attemptId: string;
      readonly version: number;
      readonly masked: string;
      readonly attemptsRemaining: number;
      readonly resendAvailableAt: string;
    }
  /** Verified, but no activation exists yet, so this human must choose an intent. */
  | { readonly kind: "activate"; readonly verificationToken: string };

const channelLabels = { mobile: "شماره همراه", email: "رایانامه" } as const;

const authSteps = [
  { key: "contact", label: "راه ارتباطی" },
  { key: "code", label: "تأیید تماس" },
  { key: "activate", label: "شروع همکاری" },
] as const;

function stageIndex(stage: Stage): number {
  return authSteps.findIndex((step) => step.key === stage.kind);
}

function stageHeading(stage: Stage): { eyebrow: string; title: string; description: string } {
  if (stage.kind === "code") {
    return {
      eyebrow: "تأیید راه ارتباطی",
      title: "کد تأیید را وارد کنید",
      description: "با تأیید کد، اگر پیش‌تر عضو راه‌حل بوده‌اید مستقیم وارد فضای کاری می‌شوید.",
    };
  }
  if (stage.kind === "activate") {
    return {
      eyebrow: "فعال‌سازی برای اولین بار",
      title: "حضور خود را در راه‌حل بسازید",
      description:
        "ابتدا هویت شخصی شما ساخته می‌شود؛ سپس می‌توانید شخصی ادامه دهید یا یک تیم بسازید.",
    };
  }
  return {
    eyebrow: "ویژه متخصصان و تیم‌ها",
    title: "ورود یا شروع همکاری",
    description:
      "با یک کد یک‌بارمصرف وارد شوید؛ برای شروع به رمز عبور یا حساب جداگانه‌ی تیم نیاز ندارید.",
  };
}

function safeSolverReturnTo(value: string | null, fallback: string): string {
  return value?.startsWith("/app/solver/") && !value.startsWith("/app/solver//") ? value : fallback;
}

function failureMessage(error: GatewayFailure): string {
  if (error.code === "VERIFICATION_LOCKED")
    return "تلاش تأیید بسته شد. یک کد تازه بگیرید و دوباره امتحان کنید.";
  if (error.code === "VERIFICATION_EXPIRED") return "مهلت این کد تمام شده است. کد تازه بگیرید.";
  if (error.code === "RATE_LIMITED") return "درخواست‌ها زیاد بوده است. کمی بعد دوباره تلاش کنید.";
  return error.message;
}

export function ConnectedSolverAuth({
  /** Where to land after a session exists. `/app` resolves the workspace. */
  returnTo = "/app",
}: {
  returnTo?: string;
}) {
  const runtime = useWebRuntime();
  const [channel, setChannel] = useState<"mobile" | "email">("mobile");
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [startIntent, setStartIntent] = useState<"individual" | "team">("individual");
  const [stage, setStage] = useState<Stage>({ kind: "contact" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resolvedReturnTo, setResolvedReturnTo] = useState(returnTo);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    setResolvedReturnTo(safeSolverReturnTo(requested, returnTo));
  }, [returnTo]);

  useEffect(() => {
    if (stage.kind !== "code") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [stage.kind]);

  useEffect(() => {
    if (runtime.sessionStatus === "authenticated") window.location.replace(resolvedReturnTo);
  }, [resolvedReturnTo, runtime.sessionStatus]);

  const enter = (path: string) => {
    // A full navigation, not a client route change: the session arrived as a
    // cookie, and the runtime resolves `/me` fresh on load.
    window.location.assign(path);
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await startContactVerification({ channel, destination: destination.trim() });
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result.error));
      return;
    }
    setNotice(`کد تأیید به ${result.data.masked_destination} فرستاده شد.`);
    setStage({
      kind: "code",
      attemptId: result.data.attempt_id,
      version: result.data.version,
      masked: result.data.masked_destination,
      attemptsRemaining: result.data.attempts_remaining,
      resendAvailableAt: result.data.resend_available_at,
    });
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (stage.kind !== "code") return;
    setPending(true);
    setError(null);
    const verified = await verifyContact(stage.attemptId, {
      expectedVersion: stage.version,
      code: code.trim(),
    });
    if (!verified.ok) {
      setPending(false);
      setError(failureMessage(verified.error));
      return;
    }

    // A returning solver already has an activation, so the exchange succeeds
    // and the session exists. A new one does not, and the same token then
    // carries into activation rather than making them verify twice.
    const signedIn = await signInWithVerifiedContact(verified.data.verificationToken);
    setPending(false);
    if (signedIn.ok) {
      enter(resolvedReturnTo);
      return;
    }
    if (signedIn.error.code !== "ACTIVATION_REQUIRED") {
      setError(failureMessage(signedIn.error));
      return;
    }
    setNotice(null);
    setStage({ kind: "activate", verificationToken: verified.data.verificationToken });
  };

  const resend = async () => {
    if (stage.kind !== "code") return;
    setPending(true);
    setError(null);
    const result = await resendContactVerification(stage.attemptId, stage.version);
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result.error));
      return;
    }
    setNotice(`کد تازه به ${result.data.masked_destination} فرستاده شد.`);
    setStage({
      ...stage,
      version: result.data.version,
      attemptsRemaining: result.data.attempts_remaining,
      resendAvailableAt: result.data.resend_available_at,
    });
  };

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (stage.kind !== "activate") return;
    setPending(true);
    setError(null);
    const result = await activateSolver({
      verificationToken: stage.verificationToken,
      displayName: displayName.trim(),
      startIntent,
    });
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result.error));
      return;
    }
    // Team is only start intent: activation created one individual workspace,
    // and the team is a separate C2 command from inside the application.
    enter(
      result.data.receipt.next_actions.includes("create_team")
        ? "/app/solver/teams?create=1"
        : resolvedReturnTo,
    );
  };

  const resendSeconds =
    stage.kind === "code"
      ? Math.max(0, Math.ceil((Date.parse(stage.resendAvailableAt) - now) / 1_000))
      : 0;
  const currentStep = stageIndex(stage);
  const heading = stageHeading(stage);

  if (runtime.sessionStatus === "authenticated") {
    return (
      <main className="workspace-resolver" id="main-content" dir="rtl" aria-busy="true">
        <h1>در حال ورود به فضای کاری</h1>
        <p>نشست شما فعال است.</p>
      </main>
    );
  }

  return (
    <div className="solver-login-page">
      <header className="organization-auth-header solver-login-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="solver-login-main" id="main-content">
        <section className="solver-login-form-panel">
          <div className="solver-login-card">
            <div className="solver-auth-intro">
              <span className="organization-auth-badge">{heading.eyebrow}</span>
              <h1>{heading.title}</h1>
              <p>{heading.description}</p>
            </div>

            <ol
              className="solver-auth-progress"
              aria-label={`مرحله ${(currentStep + 1).toLocaleString("fa-IR")} از ۳`}
            >
              {authSteps.map((step, index) => (
                <li
                  key={step.key}
                  className={
                    index < currentStep ? "is-complete" : index === currentStep ? "is-active" : ""
                  }
                  aria-current={index === currentStep ? "step" : undefined}
                >
                  <span>
                    {index < currentStep ? (
                      <Icon name="check" />
                    ) : (
                      (index + 1).toLocaleString("fa-IR")
                    )}
                  </span>
                  <small>{step.label}</small>
                </li>
              ))}
            </ol>

            <div className="solver-auth-stage-card">
              {error && (
                <div className="organization-auth-message is-error" role="alert">
                  <Icon name="notification" />
                  <span>{error}</span>
                </div>
              )}
              {notice && !error && (
                <div className="organization-auth-message is-success" role="status">
                  <Icon name="check" />
                  <span>{notice}</span>
                </div>
              )}

              {stage.kind === "contact" && (
                <form onSubmit={start} noValidate>
                  <fieldset className="solver-auth-channel-fieldset">
                    <legend>کد را چگونه دریافت می‌کنید؟</legend>
                    <div className="solver-login-tabs">
                      {(["mobile", "email"] as const).map((value) => (
                        <button
                          type="button"
                          key={value}
                          className={channel === value ? "is-active" : ""}
                          aria-pressed={channel === value}
                          onClick={() => {
                            setChannel(value);
                            setDestination("");
                            setError(null);
                          }}
                        >
                          <Icon name={value === "mobile" ? "key" : "mail"} />
                          {channelLabels[value]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="organization-auth-field">
                    <span>{channelLabels[channel]}</span>
                    <input
                      dir="ltr"
                      required
                      inputMode={channel === "mobile" ? "tel" : "email"}
                      autoComplete={channel === "mobile" ? "tel" : "email"}
                      value={destination}
                      onChange={(event) => {
                        setDestination(event.target.value);
                        setError(null);
                      }}
                      placeholder={channel === "mobile" ? "۰۹۱۲۳۴۵۶۷۸۹" : "name@example.com"}
                    />
                    <small>
                      {channel === "mobile"
                        ? "شماره همراه را با پیش‌شماره ۰۹ وارد کنید."
                        : "رایانامه‌ای را وارد کنید که همیشه به آن دسترسی دارید."}
                    </small>
                  </label>
                  <button
                    className="organization-auth-submit"
                    type="submit"
                    disabled={pending || !destination.trim()}
                  >
                    {pending ? "در حال ارسال کد…" : "دریافت کد و ادامه"}
                    {!pending && <Icon name="arrow" />}
                  </button>
                </form>
              )}

              {stage.kind === "code" && (
                <form onSubmit={submitCode} noValidate>
                  <div className="solver-auth-destination">
                    <span>
                      <Icon name={channel === "mobile" ? "key" : "mail"} />
                    </span>
                    <div>
                      <small>کد پنج‌رقمی ارسال شد به</small>
                      <strong>
                        <bdi dir="ltr">{stage.masked}</bdi>
                      </strong>
                    </div>
                  </div>
                  <label className="organization-auth-field solver-auth-code-field">
                    <span>کد تأیید</span>
                    <input
                      dir="ltr"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={5}
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value);
                        setError(null);
                      }}
                      placeholder="۱۲۳۴۵"
                    />
                  </label>
                  <div className="solver-auth-code-meta">
                    <small>{stage.attemptsRemaining.toLocaleString("fa-IR")} تلاش باقی مانده</small>
                    <button
                      type="button"
                      onClick={() => void resend()}
                      disabled={pending || resendSeconds > 0}
                    >
                      {resendSeconds > 0
                        ? `ارسال دوباره تا ${resendSeconds.toLocaleString("fa-IR")} ثانیه دیگر`
                        : "ارسال دوباره کد"}
                    </button>
                  </div>
                  <button
                    className="organization-auth-submit"
                    type="submit"
                    disabled={pending || !code.trim()}
                  >
                    {pending ? "در حال بررسی…" : "تأیید و ورود"}
                    {!pending && <Icon name="arrow" />}
                  </button>
                  <button
                    className="organization-auth-back"
                    type="button"
                    onClick={() => {
                      setStage({ kind: "contact" });
                      setCode("");
                      setNotice(null);
                      setError(null);
                    }}
                    disabled={pending}
                  >
                    <Icon name="chevron" />
                    تغییر راه ارتباطی
                  </button>
                </form>
              )}

              {stage.kind === "activate" && (
                <form onSubmit={activate} noValidate>
                  <div className="solver-auth-verified-note">
                    <Icon name="check" />
                    <span>راه ارتباطی شما تأیید شد</span>
                  </div>
                  <label className="organization-auth-field">
                    <span>نام و نام خانوادگی</span>
                    <input
                      required
                      autoComplete="name"
                      maxLength={120}
                      value={displayName}
                      onChange={(event) => {
                        setDisplayName(event.target.value);
                        setError(null);
                      }}
                      placeholder="مثلاً سارا احمدی"
                    />
                    <small>
                      این نام در پروفایل حرفه‌ای و کنار پیشنهادهای شما نمایش داده می‌شود.
                    </small>
                  </label>
                  <fieldset className="solver-auth-intent-fieldset">
                    <legend>می‌خواهید از کجا شروع کنید؟</legend>
                    <div className="solver-auth-intent-grid">
                      <button
                        type="button"
                        className={startIntent === "individual" ? "is-active" : ""}
                        aria-pressed={startIntent === "individual"}
                        onClick={() => setStartIntent("individual")}
                      >
                        <span className="solver-auth-intent-icon">
                          <Icon name="user" />
                        </span>
                        <span>
                          <strong>به‌صورت شخصی</strong>
                          <small>پروفایل خود را کامل کنید و مستقل پیشنهاد بدهید.</small>
                        </span>
                        <i aria-hidden="true">
                          <Icon name="check" />
                        </i>
                      </button>
                      <button
                        type="button"
                        className={startIntent === "team" ? "is-active" : ""}
                        aria-pressed={startIntent === "team"}
                        onClick={() => setStartIntent("team")}
                      >
                        <span className="solver-auth-intent-icon">
                          <Icon name="people" />
                        </span>
                        <span>
                          <strong>با ساخت یک تیم</strong>
                          <small>پس از فعال‌سازی، فضای تیمی خود را بسازید.</small>
                        </span>
                        <i aria-hidden="true">
                          <Icon name="check" />
                        </i>
                      </button>
                    </div>
                  </fieldset>
                  <div className="solver-auth-team-clarity">
                    <Icon name="shield" />
                    <p>
                      در هر دو مسیر، فضای شخصی شما همیشه حفظ می‌شود. تیم یک فضای کاری جداست و حساب
                      یا رمز عبور مشترک ندارد.
                    </p>
                  </div>
                  <button
                    className="organization-auth-submit"
                    type="submit"
                    disabled={pending || !displayName.trim()}
                  >
                    {pending
                      ? "در حال فعال‌سازی…"
                      : startIntent === "team"
                        ? "فعال‌سازی و ساخت تیم"
                        : "فعال‌سازی و ورود"}
                    {!pending && <Icon name="arrow" />}
                  </button>
                </form>
              )}
            </div>

            <div className="solver-auth-assurance">
              <Icon name="lock" />
              <p>
                <strong>یک ورود برای همه فضاهای کاری</strong>
                <span>پس از ورود می‌توانید بین فضای شخصی و تیم‌های خود جابه‌جا شوید.</span>
              </p>
            </div>
          </div>
        </section>
        <aside
          className="solver-login-visual"
          role="img"
          aria-label="تیم متخصصان در آزمایشگاه صنعتی در حال توسعه یک راه‌حل"
        >
          <div>
            <span className="solver-login-visual__eyebrow">از مسئله تا اثر</span>
            <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
            <p>
              به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل
              کنید.
            </p>
          </div>
          <ul className="solver-login-visual__facts" aria-label="مزیت‌های همکاری در راه‌حل">
            <li>
              <Icon name="brief" />
              <span>چالش‌های واقعی و شفاف</span>
            </li>
            <li>
              <Icon name="people" />
              <span>همکاری شخصی یا تیمی</span>
            </li>
            <li>
              <Icon name="impact" />
              <span>مسیر روشن تا اجرای راه‌حل</span>
            </li>
          </ul>
        </aside>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Brand } from "@/components/brand";
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
            <span className="organization-auth-badge">پنل متخصصان و تیم‌ها</span>
            <h1>ورود یا ثبت‌نام حل‌گر</h1>
            <p>برای مشاهده چالش‌ها و مدیریت راه‌حل‌های خود، کد یک‌بارمصرف دریافت کنید.</p>

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}
            {notice && !error && (
              <p className="organization-auth-message is-success" role="status">
                {notice}
              </p>
            )}

            {stage.kind === "contact" && (
              <form onSubmit={start} noValidate>
                <div className="solver-login-tabs" role="radiogroup" aria-label="راه ارتباطی">
                  {(["mobile", "email"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={channel === value ? "is-active" : ""}
                      aria-pressed={channel === value}
                      onClick={() => setChannel(value)}
                    >
                      {channelLabels[value]}
                    </button>
                  ))}
                </div>
                <label className="organization-auth-field">
                  <span>{channelLabels[channel]}</span>
                  <input
                    dir="ltr"
                    required
                    inputMode={channel === "mobile" ? "tel" : "email"}
                    autoComplete={channel === "mobile" ? "tel" : "email"}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder={channel === "mobile" ? "۰۹۱۲۳۴۵۶۷۸۹" : "name@example.com"}
                  />
                </label>
                <button
                  className="organization-auth-submit"
                  type="submit"
                  disabled={pending || !destination.trim()}
                >
                  {pending ? "در حال ارسال کد…" : "ارسال کد تأیید"}
                </button>
              </form>
            )}

            {stage.kind === "code" && (
              <form onSubmit={submitCode} noValidate>
                <p>
                  کد پنج‌رقمی فرستاده‌شده به <bdi dir="ltr">{stage.masked}</bdi> را وارد کنید.
                </p>
                <label className="organization-auth-field">
                  <span>کد تأیید</span>
                  <input
                    dir="ltr"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
                <small className="organization-auth-code-note">
                  {stage.attemptsRemaining.toLocaleString("fa-IR")} تلاش باقی مانده است.
                </small>
                <button
                  className="organization-auth-submit"
                  type="submit"
                  disabled={pending || !code.trim()}
                >
                  {pending ? "در حال بررسی…" : "تأیید و ادامه"}
                </button>
                <div className="organization-auth-divider">
                  <span>یا</span>
                </div>
                <button
                  className="organization-auth-secondary"
                  type="button"
                  onClick={() => void resend()}
                  disabled={pending || resendSeconds > 0}
                >
                  {resendSeconds > 0
                    ? `ارسال دوباره تا ${resendSeconds.toLocaleString("fa-IR")} ثانیه دیگر`
                    : "ارسال دوباره کد"}
                </button>
                <button
                  className="organization-auth-back"
                  type="button"
                  onClick={() => {
                    setStage({ kind: "contact" });
                    setCode("");
                    setNotice(null);
                  }}
                  disabled={pending}
                >
                  تغییر راه ارتباطی
                </button>
              </form>
            )}

            {stage.kind === "activate" && (
              <form onSubmit={activate} noValidate>
                <p>
                  این راه ارتباطی تأیید شد و هنوز حسابی به آن متصل نیست. برای ساخت هویت خود ادامه
                  دهید.
                </p>
                <label className="organization-auth-field">
                  <span>نام نمایشی</span>
                  <input
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
                <div className="solver-login-tabs" role="radiogroup" aria-label="شروع کار">
                  <button
                    type="button"
                    className={startIntent === "individual" ? "is-active" : ""}
                    aria-pressed={startIntent === "individual"}
                    onClick={() => setStartIntent("individual")}
                  >
                    ادامه شخصی
                  </button>
                  <button
                    type="button"
                    className={startIntent === "team" ? "is-active" : ""}
                    aria-pressed={startIntent === "team"}
                    onClick={() => setStartIntent("team")}
                  >
                    ساخت تیم پس از آن
                  </button>
                </div>
                <small className="organization-auth-code-note">
                  در هر دو حالت یک هویت انسانی و یک فضای کاری شخصی دائمی ساخته می‌شود. تیم حساب
                  جداگانه ندارد و پس از ورود ساخته می‌شود.
                </small>
                <button
                  className="organization-auth-submit"
                  type="submit"
                  disabled={pending || !displayName.trim()}
                >
                  {pending ? "در حال ساخت…" : "ساخت هویت و ورود"}
                </button>
              </form>
            )}
          </div>
        </section>
        <aside
          className="solver-login-visual"
          role="img"
          aria-label="تیم متخصصان در آزمایشگاه صنعتی در حال توسعه یک راه‌حل"
        >
          <div>
            <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
            <p>
              به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل
              کنید.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

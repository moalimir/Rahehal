"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { useWebRuntime } from "@/components/runtime-provider";
import { workspacesForPersona } from "@/lib/auth/network-session";
import type { AppPersona } from "@/domain/persona";

const oidcLoginCopy: Readonly<
  Record<
    "org" | "reviewer" | "ops",
    {
      readonly badge: string;
      readonly title: string;
      readonly description: string;
      readonly button: string;
    }
  >
> = {
  org: {
    badge: "پنل سازمانی",
    title: "ورود سازمان",
    description:
      "با هویت سازمانی خود وارد شوید تا چالش‌ها، اعضا و راه‌حل‌های دریافتی را در فضای کاری مجاز مدیریت کنید.",
    button: "ادامه برای ورود امن سازمانی",
  },
  reviewer: {
    badge: "پنل داوری",
    title: "ورود داور",
    description:
      "با هویت حرفه‌ای خود وارد شوید تا فقط مأموریت‌های داوری تخصیص‌یافته و مجاز را مشاهده کنید.",
    button: "ادامه برای ورود امن داور",
  },
  ops: {
    badge: "پنل عملیات",
    title: "ورود عملیات",
    description: "با هویت عملیاتی خود وارد شوید تا صف‌های تخصیص و کنترل داوری مجاز را مدیریت کنید.",
    button: "ادامه برای ورود امن عملیات",
  },
};

function oidcPersona(value: string | null): "org" | "reviewer" | "ops" {
  return value === "reviewer" || value === "ops" ? value : "org";
}

export function NetworkOrganizationLogin() {
  const runtime = useWebRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [persona, setPersona] = useState<"org" | "reviewer" | "ops">("org");

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setPersona(oidcPersona(parameters.get("role")));
    const authError = parameters.get("authError");
    if (authError) setError("ورود کامل نشد یا درخواست ورود منقضی شده است؛ دوباره تلاش کنید.");
  }, []);

  const start = async () => {
    setBusy(true);
    setError("");
    const problem = await runtime.startOrganizationLogin();
    if (problem) {
      setBusy(false);
      setError(problem.message);
    }
  };

  const availableWorkspaces = workspacesForPersona(runtime.me, persona as AppPersona);
  const copy = oidcLoginCopy[persona];
  const loading = runtime.sessionStatus === "loading";
  const buttonLabel = busy ? "در حال انتقال…" : loading ? "در حال بررسی نشست…" : copy.button;

  return (
    <div className="organization-auth-page organization-auth-page--login" data-runtime="network">
      <header className="organization-auth-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="organization-auth-main" id="main-content">
        <section className="organization-auth-form-panel">
          <div className="organization-auth-card organization-auth-card--login">
            <span className="organization-auth-badge">{copy.badge}</span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}

            {/* A session is not enough: this shortcut is only true when the
                signed-in human can actually reach an organization workspace.
                Offering it to a solver sent them to a page that refuses them,
                which is the chrome promising what the session cannot do. */}
            {runtime.sessionStatus === "authenticated" && availableWorkspaces.length > 0 ? (
              <Link className="organization-auth-submit" href="/app">
                ورود به فضای کاری
              </Link>
            ) : runtime.sessionStatus === "authenticated" ? (
              <>
                <p className="organization-auth-message" role="status">
                  این نشست به فضای کاری موردنیاز دسترسی ندارد. برای ورود با هویت مناسب، ابتدا از
                  نشست فعلی خارج شوید.
                </p>
                <button
                  type="button"
                  className="organization-auth-submit"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void runtime.signOut().then(() => void start());
                  }}
                >
                  خروج و ورود با هویت سازمانی
                </button>
                <Link className="organization-auth-secondary" href="/app">
                  بازگشت به فضای کاری خودم
                </Link>
              </>
            ) : (
              <button
                type="button"
                className="organization-auth-submit"
                disabled={busy || loading}
                onClick={() => void start()}
              >
                {buttonLabel}
              </button>
            )}

            <p>
              احراز هویت در صفحه ارائه‌دهنده انجام می‌شود؛ راه‌حل گذرواژه شما را دریافت یا نگهداری
              نمی‌کند.
            </p>

            {persona === "org" ? (
              <Link
                className="organization-auth-secondary"
                href="/auth/organization/register/representative"
              >
                شروع همکاری برای سازمان جدید
              </Link>
            ) : null}

            <div className="organization-auth-dev-note">
              <strong>محیط توسعه محلی</strong>
              این نمونه به پایگاه‌داده و ارائه‌دهنده هویت محلی متصل است. حساب‌های مصنوعی فقط در
              راهنمای توسعه محلی نگهداری می‌شوند و در رابط متصل منتشر نمی‌شوند.
            </div>
          </div>
        </section>
        <aside
          className="organization-auth-visual organization-auth-visual--login"
          role="img"
          aria-label="تیم متخصصان سازمانی در فضای صنعتی؛ چالش واقعی، راه‌حل اثرگذار"
        />
      </main>
    </div>
  );
}

export function NetworkOrganizationRegistration() {
  return (
    <div
      className="organization-auth-page organization-auth-page--representative"
      data-runtime="network"
    >
      <header className="organization-auth-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="organization-auth-main" id="main-content">
        <section className="organization-auth-form-panel">
          <div className="organization-auth-card organization-auth-card--representative">
            <span className="organization-auth-badge">پذیرش سازمان‌ها</span>
            <h1>شروع همکاری سازمانی</h1>
            <p>
              ایجاد فضای سازمانی در نسخه متصل، عمومی و فوری نیست. ابتدا نماینده و سازمان بررسی
              می‌شوند؛ سپس دعوت ورود و فضای کاری مجاز فعال می‌شود.
            </p>

            <div className="timeline-panel">
              <ol>
                <li className="done">
                  <span>۱</span>
                  <div>
                    <strong>درخواست همکاری</strong>
                    <small>هماهنگی پایلوت و مشخص‌شدن نماینده سازمان</small>
                  </div>
                </li>
                <li className="current">
                  <span>۲</span>
                  <div>
                    <strong>بررسی سازمان و دسترسی</strong>
                    <small>تأیید نمایندگی، دامنه همکاری و نقش‌های اولیه</small>
                  </div>
                </li>
                <li>
                  <span>۳</span>
                  <div>
                    <strong>دعوت و فعال‌سازی</strong>
                    <small>ورود امن و دسترسی فقط به فضای سازمانی مجاز</small>
                  </div>
                </li>
              </ol>
            </div>

            <Link className="organization-auth-submit" href="/auth/organization/login">
              دعوت‌نامه دارم؛ ورود سازمان
            </Link>
            <p className="organization-auth-switch">
              <Link href="/for-organizations">آشنایی با مسیر همکاری سازمان‌ها</Link>
            </p>
          </div>
        </section>
        <aside
          className="organization-auth-visual organization-auth-visual--representative"
          role="img"
          aria-label="نمایندگان سازمان در حال بررسی مسیر همکاری نوآوری"
        />
      </main>
    </div>
  );
}

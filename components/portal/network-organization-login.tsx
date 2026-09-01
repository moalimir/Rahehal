"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { useWebRuntime } from "@/components/runtime-provider";

export function NetworkOrganizationLogin() {
  const runtime = useWebRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("authError");
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

  const loading = runtime.sessionStatus === "loading";
  const buttonLabel = busy
    ? "در حال انتقال…"
    : loading
      ? "در حال بررسی نشست…"
      : "ادامه برای ورود امن سازمانی";

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
            <span className="organization-auth-badge">پنل سازمانی</span>
            <h1>ورود سازمان</h1>
            <p>
              با هویت سازمانی خود وارد شوید تا چالش‌ها، اعضا و راه‌حل‌های دریافتی را در فضای کاری
              مجاز مدیریت کنید.
            </p>

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}

            {runtime.sessionStatus === "authenticated" ? (
              <Link className="organization-auth-submit" href="/app/org/challenges">
                ورود به فضای سازمانی
              </Link>
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

            <Link
              className="organization-auth-secondary"
              href="/auth/organization/register/representative"
            >
              شروع همکاری برای سازمان جدید
            </Link>

            <details className="organization-auth-dev-note">
              <summary>
                <strong>اطلاعات ورود محیط توسعه</strong>
              </summary>
              <div>
                این محیط به پایگاه‌داده و ارائه‌دهنده هویت محلی متصل است. حساب مصنوعی: ایمیل{" "}
                <code dir="ltr">owner-alpha@synthetic.invalid</code> · گذرواژه{" "}
                <code dir="ltr">rahhal-local-owner</code>
              </div>
            </details>
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

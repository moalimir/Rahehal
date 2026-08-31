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
      : "ورود با ارائه‌دهنده هویت محلی";

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
            <h1>ورود به حساب سازمانی</h1>
            <p>برای مدیریت چالش‌ها و بررسی راه‌حل‌های دریافتی وارد حساب سازمانی خود شوید.</p>

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}

            {runtime.sessionStatus === "authenticated" ? (
              <Link className="organization-auth-submit" href="/app/org/challenges/new">
                ادامه به ثبت مسئله
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

            <div className="organization-auth-dev-note">
              <strong>محیط توسعه محلی</strong>
              این نمونه به پایگاه‌داده و ارائه‌دهنده هویت محلی متصل است. برای ورود می‌توانید از حساب
              مصنوعی زیر استفاده کنید — ایمیل: <code dir="ltr">
                owner-alpha@synthetic.invalid
              </code>{" "}
              · گذرواژه: <code dir="ltr">rahhal-local-owner</code>
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

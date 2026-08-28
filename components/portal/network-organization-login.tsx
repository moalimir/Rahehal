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
            <span className="organization-auth-badge">محیط محلی متصل</span>
            <h1>ورود به حساب سازمانی</h1>
            <p>
              ورود با OIDC محلی انجام می‌شود؛ نشست، عضویت و فضای کاری را سرور بررسی می‌کند.
            </p>
            {error && (
              <div className="form-message form-message--error" role="alert">
                {error}
              </div>
            )}
            {runtime.sessionStatus === "authenticated" ? (
              <Link className="button button--primary" href="/app/org/challenges/new">
                ادامه به ثبت مسئله
              </Link>
            ) : (
              <button
                type="button"
                className="button button--primary"
                disabled={busy || runtime.sessionStatus === "loading"}
                onClick={() => void start()}
              >
                {busy ? "در حال انتقال…" : "ورود با ارائه‌دهنده هویت محلی"}
              </button>
            )}
            <p className="organization-auth-help">
              حساب مصنوعی: <bdi dir="ltr">owner-alpha@synthetic.invalid</bdi> · گذرواژه: {" "}
              <bdi dir="ltr">rahhal-local-owner</bdi>
            </p>
          </div>
        </section>
        <aside
          className="organization-auth-visual organization-auth-visual--login"
          role="img"
          aria-label="ورود امن سازمانی به محیط محلی راه‌حل"
        />
      </main>
    </div>
  );
}

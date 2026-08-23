"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";
import type { LegacyUnavailableResolution } from "@/data/legacy-redirects";
import type { AppPersona } from "@/domain/persona";

export function ProductNotFound({ requestedPath }: { requestedPath?: string }) {
  return (
    <main className="route-fallback" id="main-content">
      <Brand />
      <p className="route-fallback__code" aria-hidden="true">
        ۴۰۴
      </p>
      <h1>این صفحه پیدا نشد</h1>
      <p>
        نشانی واردشده معتبر نیست یا صفحه جابه‌جا شده است. مسیر خراب به صفحه خانه منتقل نمی‌شود تا
        خطا پنهان نماند.
      </p>
      {requestedPath ? (
        <bdi dir="ltr" className="route-fallback__path">
          {requestedPath}
        </bdi>
      ) : null}
      <div className="route-fallback__actions">
        <Link className="app-button app-button--primary" href="/challenges">
          مشاهده چالش‌ها
        </Link>
        <Link className="app-button app-button--secondary" href="/">
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}

export function LegacyUnavailable({ resolution }: { resolution: LegacyUnavailableResolution }) {
  return (
    <main className="route-fallback" id="main-content">
      <Brand />
      <p className="route-fallback__eyebrow">مسیر قدیمی</p>
      <h1>{resolution.title}</h1>
      <p>{resolution.description}</p>
      <bdi dir="ltr" className="route-fallback__path">
        {resolution.source}
      </bdi>
      <div className="route-fallback__actions">
        <Link className="app-button app-button--primary" href={resolution.nextRoute}>
          {resolution.nextLabel}
        </Link>
        <Link className="app-button app-button--secondary" href="/app/help">
          مرکز راهنما
        </Link>
      </div>
    </main>
  );
}

export function RouteResolving() {
  return (
    <main className="route-fallback route-fallback--loading" id="main-content" aria-busy="true">
      <Brand />
      <div className="route-fallback__skeleton" aria-hidden="true" />
      <span className="sr-only">در حال بازیابی مسیر</span>
    </main>
  );
}

export function SessionRequired({ role, returnTo }: { role: AppPersona; returnTo: string }) {
  const loginPath = role === "org" ? "/auth/organization/login" : "/auth/login";
  const roleQuery = role === "solver" || role === "org" ? "" : `&role=${role}`;
  return (
    <main className="route-fallback" id="main-content">
      <Brand />
      <p className="route-fallback__eyebrow">ورود لازم است</p>
      <h1>برای ادامه وارد حساب مجاز شوید</h1>
      <p>این صفحه بخشی از فضای کاری داخلی است و بدون نشست معتبر نمایش داده نمی‌شود.</p>
      <div className="route-fallback__actions">
        <Link
          className="app-button app-button--primary"
          href={`${loginPath}?returnTo=${encodeURIComponent(returnTo)}${roleQuery}`}
        >
          ورود و ادامه
        </Link>
        <Link className="app-button app-button--secondary" href="/">
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}

export function PermissionDenied() {
  return (
    <main className="route-fallback" id="main-content">
      <Brand />
      <p className="route-fallback__eyebrow">دسترسی محدود</p>
      <h1>اجازه مشاهده این صفحه را ندارید</h1>
      <p>برای حفظ محرمانگی، درباره وجود یا جزئیات پرونده اطلاعات بیشتری نمایش داده نمی‌شود.</p>
      <div className="route-fallback__actions">
        <Link className="app-button app-button--primary" href="/app/account">
          بررسی حساب فعال
        </Link>
        <Link className="app-button app-button--secondary" href="/">
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}

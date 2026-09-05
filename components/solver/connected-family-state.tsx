"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icons";
import type { ConnectedState } from "@/components/solver/use-connected";
import type { GatewayFailure } from "@/lib/api/result";

/**
 * The non-ready states of a connected page family, rendered identically
 * everywhere.
 *
 * Each family used to invent its own empty and error screens, which is how a
 * denied read and a genuinely empty workspace end up looking the same. These
 * four blocks keep them distinguishable, and none of them enumerates: a
 * `scope-lost` screen never says whether the records it could not reach exist.
 *
 * Returns `null` for `demo` and `ready`, so a caller renders it above its own
 * content and keeps the demo projection it already had.
 */
export function ConnectedFamilyFallback({
  state,
  /** What the human was trying to see, for the loading announcement. */
  label,
}: {
  state: ConnectedState<unknown>;
  label: string;
}) {
  if (state.kind === "loading") {
    return (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری {label}</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (state.kind === "anonymous") {
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>برای مشاهده {label} وارد فضای کاری شوید</h1>
        <p>این صفحه فقط با نشست معتبر و یک فضای کاری فعال نمایش داده می‌شود.</p>
        <Link href="/app">انتخاب فضای کاری</Link>
      </section>
    );
  }
  if (state.kind === "scope-lost") {
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>{label} برای این فضای کاری در دسترس نیست</h1>
        <p>
          دسترسی این نشست به این بخش برقرار نیست. برای حفظ محرمانگی، درباره وجود یا نبود پرونده‌ها
          اطلاعاتی نمایش داده نمی‌شود.
        </p>
        <Link href="/app">بازگشت و انتخاب فضای کاری</Link>
      </section>
    );
  }
  return null;
}

/**
 * A family that loaded but could not read one part of itself.
 *
 * The rule C9 enforces is that a failed read is never rendered as a zero or an
 * empty list, so the affected card says what failed and offers a retry instead
 * of a number the human would read as real.
 */
export function ConnectedFamilyError({
  error,
  label,
  children,
}: {
  error: GatewayFailure;
  label: string;
  /** The caller's retry control, so this file stays free of handler props. */
  children?: ReactNode;
}) {
  return (
    <section className="rh-card rh-profile-empty" role="status">
      <Icon name="notification" />
      <h2>{label} خوانده نشد</h2>
      <p>{error.message}</p>
      {children}
    </section>
  );
}

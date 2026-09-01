"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SessionAware } from "@/components/site-header-session-boundary";

export function SiteHeader({
  variant = "default",
}: {
  variant?: "default" | "home" | "companies" | "universities";
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const isHome = variant === "home";
  const isCompanies = variant === "companies";
  const isUniversities = variant === "universities";
  const isDirectory = isCompanies || isUniversities;
  const isReference = isHome || isDirectory;
  const navigation = isHome
    ? [
        ["چالش‌ها", "/challenges"],
        ["راهکارها", "/for-solvers"],
        ["درباره ما", "/how-it-works"],
      ]
    : isUniversities
      ? [
          ["خانه", "/"],
          ["چالش‌ها", "/challenges"],
          ["تیم‌های دانشگاهی", "/universities"],
          ["شرکت‌ها", "/organizations"],
        ]
      : isCompanies
        ? [
            ["خانه", "/"],
            ["چالش‌ها", "/challenges"],
            ["شرکت‌ها", "/organizations"],
            ["درباره ما", "/how-it-works"],
          ]
        : [
            ["کشف چالش‌ها", "/challenges"],
            ["سازمان‌ها", "/organizations"],
            ["برای سازمان‌ها", "/for-organizations"],
            ["برای حل‌کنندگان", "/for-solvers"],
            ["نحوه کار", "/how-it-works"],
            ["اعتماد و امنیت", "/trust-security"],
          ];

  useEffect(() => {
    if (!open) return;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key !== "Tab" || !drawer.current) return;
      const focusable = drawer.current.querySelectorAll<HTMLElement>(
        "button, a, [tabindex]:not([tabindex='-1'])",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <header
      className={`site-header ${isReference ? "site-header--home" : ""} ${isDirectory ? "site-header--companies" : ""}`}
    >
      <div className="site-header__inner container">
        <Brand reference={isReference} />
        <nav className="desktop-nav" aria-label="ناوبری اصلی">
          {navigation.map(([label, href]) => (
            <Link
              href={href}
              key={href}
              className={
                (isCompanies && href === "/organizations") ||
                (isUniversities && href === "/universities")
                  ? "is-active"
                  : undefined
              }
              aria-current={
                (isCompanies && href === "/organizations") ||
                (isUniversities && href === "/universities")
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <SessionAware
            fallback={
              <nav
                className="header-login-options header-login-options--audiences"
                aria-label="ورود و شروع همکاری"
              >
                <Link
                  className="header-login-option header-login-option--organization"
                  href="/auth/organization/login"
                  aria-label="ورود یا شروع همکاری سازمانی"
                >
                  <Icon className="audience-entry-icon" name="organization" />
                  سازمان
                </Link>
                <Link
                  className="header-login-option header-login-option--solver"
                  href="/auth/login?role=solver"
                  aria-label="ورود یا ایجاد حساب حل‌کننده"
                >
                  <Icon className="audience-entry-icon" name="solver" />
                  حل‌کننده
                </Link>
              </nav>
            }
          />
          {isDirectory && (
            <Link
              className="button button--secondary button--sm companies-register"
              href="/app/org/challenges/new"
            >
              ثبت مسئله سازمانی
            </Link>
          )}
          {!isReference && (
            <Link
              className="button button--primary button--sm hide-mobile"
              href="/app/org/challenges/new"
            >
              ثبت مسئله
            </Link>
          )}
          <button
            ref={menuButton}
            className="icon-button mobile-menu-button"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="بازکردن منوی اصلی"
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mobile-drawer is-open">
          <button className="drawer-scrim" aria-label="بستن منو" onClick={() => setOpen(false)} />
          <div
            ref={drawer}
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="منوی اصلی"
          >
            <div className="drawer-head">
              <Brand reference={isReference} />
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="بستن منو">
                <Icon name="close" />
              </button>
            </div>
            <nav>
              {(isReference ? navigation : [...navigation, ["راهنما و قوانین", "/guides"]]).map(
                ([label, href]) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)}>
                    {label}
                    <Icon name="chevron" />
                  </Link>
                ),
              )}
            </nav>
            <div className="drawer-actions">
              <Link
                className="button button--secondary header-login-option"
                href="/auth/organization/login"
                onClick={() => setOpen(false)}
                aria-label="ورود یا شروع همکاری سازمانی"
              >
                <Icon className="audience-entry-icon" name="organization" />
                سازمان
              </Link>
              <Link
                className="button button--primary header-login-option"
                href="/auth/login?role=solver"
                onClick={() => setOpen(false)}
                aria-label="ورود یا ایجاد حساب حل‌کننده"
              >
                <Icon className="audience-entry-icon" name="solver" />
                حل‌کننده
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

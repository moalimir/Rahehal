"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";

export type AppShellRole = "solver" | "org" | "reviewer" | "ops";
export type AppNavigationItem = {
  key: string;
  label: string;
  href: string;
  icon:
    | "grid"
    | "brief"
    | "match"
    | "decision"
    | "people"
    | "impact"
    | "shield"
    | "history"
    | "notification";
  matches?: string[];
  badge?: string;
};

type ShellAccount = {
  workspaceLabel: string;
  workspaceName: string;
  userName: string;
  userRole: string;
};

export type AppWorkspaceOption = {
  id: string;
  label: string;
  description: string;
  space: "individual" | "team" | "org" | "platform";
};

function normalizedPath(path: string): string {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return clean || "/";
}

export function longestNavigationMatch(
  items: AppNavigationItem[],
  currentPath: string,
): AppNavigationItem | undefined {
  const current = normalizedPath(currentPath);
  return items
    .flatMap((item) =>
      (item.matches?.length ? item.matches : [item.href]).map((match) => ({
        item,
        match: normalizedPath(match),
      })),
    )
    .filter(({ match }) => current === match || current.startsWith(`${match}/`))
    .sort((a, b) => b.match.length - a.match.length)[0]?.item;
}

export function RoleAppShell({
  role,
  navigation,
  currentPath,
  account,
  children,
  rootClassName = "app-shell",
  contentClassName = "app-content",
  space,
  onSpaceChange,
  workspaceOptions,
  activeWorkspaceId,
  onWorkspaceChange,
  quickLinks,
  unreadCount = 0,
  onSignOut,
}: {
  role: AppShellRole;
  navigation: AppNavigationItem[];
  currentPath: string;
  account: ShellAccount;
  children: ReactNode;
  rootClassName?: string;
  contentClassName?: string;
  space?: "individual" | "team";
  onSpaceChange?: (space: "individual" | "team") => void;
  workspaceOptions?: AppWorkspaceOption[];
  activeWorkspaceId?: string;
  onWorkspaceChange?: (workspaceId: string) => void;
  quickLinks?: { opportunities: string; notifications: string; profile: string };
  unreadCount?: number;
  onSignOut?: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const activeItem = useMemo(
    () => longestNavigationMatch(navigation, currentPath),
    [currentPath, navigation],
  );

  const closeDrawer = (restoreFocus = true) => {
    setDrawerOpen(false);
    if (restoreFocus) window.setTimeout(() => opener.current?.focus(), 0);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!drawerOpen || event.key !== "Tab") return;
    const focusable = sidebar.current?.querySelectorAll<HTMLElement>(
      "a[href],button:not([disabled]),[tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`${rootClassName} unified-shell unified-shell--${role}`} data-space={space}>
      <aside
        id="app-navigation-drawer"
        ref={sidebar}
        className={`unified-sidebar ${drawerOpen ? "is-open" : ""}`}
        aria-label={`ناوبری ${account.workspaceLabel}`}
        onKeyDown={trapFocus}
      >
        <div className="unified-sidebar__brand">
          <Brand inverse />
          <button type="button" onClick={() => closeDrawer()} aria-label="بستن منو">
            <Icon name="close" />
          </button>
        </div>

        <div className="unified-workspace-identity">
          <div>
            <small>{account.workspaceLabel}</small>
            <strong>{account.workspaceName}</strong>
          </div>
        </div>

        <nav aria-label="ناوبری اصلی">
          {navigation.map((item) => {
            const active = activeItem?.key === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={active ? "is-active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => closeDrawer(false)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.badge && <b>{item.badge}</b>}
              </Link>
            );
          })}
        </nav>

        {role !== "solver" && (
          <div className="unified-sidebar__bottom">
            <Link href={role === "org" ? "/app/org/settings" : "/app/help"}>
              <Icon name="shield" />
              <span>راهنما و پشتیبانی</span>
            </Link>
            {onSignOut && (
              <button type="button" className="text-button" onClick={onSignOut}>
                خروج از نشست
              </button>
            )}
            <div className="unified-sidebar__account">
              <PersonAvatar name={account.userName} className="unified-avatar" />
              <div>
                <strong>{account.userName}</strong>
                <small>{account.userRole}</small>
              </div>
            </div>
          </div>
        )}
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="unified-shell__scrim"
          aria-label="بستن منوی ناوبری"
          onClick={() => closeDrawer()}
        />
      )}

      <div className="unified-main">
        <header className="unified-topbar">
          <button
            ref={opener}
            type="button"
            className="unified-topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="app-navigation-drawer"
            aria-label="بازکردن منو"
          >
            <Icon name="menu" />
          </button>

          {workspaceOptions?.length && onWorkspaceChange ? (
            <label className="unified-space-switcher unified-space-switcher--select">
              <span>فضای کاری فعال</span>
              <select
                aria-label="انتخاب فضای کاری"
                value={activeWorkspaceId}
                onChange={(event) => onWorkspaceChange(event.target.value)}
              >
                {workspaceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </select>
            </label>
          ) : role === "solver" && space && onSpaceChange ? (
            <div className="unified-space-switcher" aria-label="انتخاب فضای کاری">
              <span>{space === "team" ? "فضای تیم" : "فضای شخصی"}</span>
              <button
                type="button"
                className={space === "individual" ? "is-active" : ""}
                aria-pressed={space === "individual"}
                onClick={() => onSpaceChange("individual")}
              >
                فردی
              </button>
              <button
                type="button"
                className={space === "team" ? "is-active" : ""}
                aria-pressed={space === "team"}
                onClick={() => onSpaceChange("team")}
              >
                تیمی
              </button>
            </div>
          ) : (
            <nav className="unified-breadcrumb" aria-label="مسیر صفحه">
              <Link href="/">راه‌حل</Link>
              <Icon name="chevron" />
              <span>{account.workspaceLabel}</span>
              {activeItem && (
                <>
                  <Icon name="chevron" />
                  <strong>{activeItem.label}</strong>
                </>
              )}
            </nav>
          )}

          <nav className="unified-topbar__links" aria-label="پیوندهای سریع">
            <Link
              href={
                role === "solver"
                  ? (quickLinks?.opportunities ?? "/app/solver/opportunities")
                  : role === "org"
                    ? "/app/org/proposals"
                    : "/app/messages"
              }
            >
              {role === "solver"
                ? "مشاهده فرصت‌ها"
                : role === "org"
                  ? "مشاهده پیشنهادها"
                  : "پیام‌ها"}
            </Link>
            <Link
              href={
                role === "org"
                  ? "/app/org/notifications"
                  : role === "solver"
                    ? (quickLinks?.notifications ?? "/app/solver/notifications")
                    : "/app/notifications"
              }
              aria-label="اعلان‌ها"
            >
              <Icon name="notification" />
              {unreadCount > 0 && (
                <i
                  aria-hidden="true"
                  title={`${unreadCount.toLocaleString("fa-IR")} اعلان نخوانده`}
                />
              )}
              <span className="sr-only">
                {unreadCount > 0
                  ? `${unreadCount.toLocaleString("fa-IR")} اعلان نخوانده`
                  : "اعلان خوانده‌نشده‌ای نیست"}
              </span>
            </Link>
          </nav>

          {role === "solver" || role === "org" ? (
            <Link
              className="unified-topbar__profile"
              href={
                role === "solver"
                  ? (quickLinks?.profile ?? `/app/solver/profile${space ? `?space=${space}` : ""}`)
                  : "/app/org/profile"
              }
              aria-label={`پروفایل ${account.userName}`}
              title={`پروفایل ${account.userName}`}
            >
              <PersonAvatar name={account.userName} className="unified-avatar" />
              {role === "solver" && (
                <span className="unified-topbar__profile-copy">
                  <strong>{account.userName}</strong>
                  <small>{account.userRole}</small>
                </span>
              )}
            </Link>
          ) : (
            <div className="unified-topbar__account">
              <PersonAvatar name={account.userName} className="unified-avatar" />
              <div>
                <strong>{account.userName}</strong>
                <small>{account.userRole}</small>
              </div>
            </div>
          )}
        </header>
        <main id="main-content" className={`unified-content ${contentClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

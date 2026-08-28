"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChallengeDetailPage } from "@/components/challenge-flow/detail-page";
import { ChallengeEditPage } from "@/components/challenge-flow/edit-page";
import { ChallengeIntakePage } from "@/components/challenge-flow/intake-page";
import { ChallengeListPage } from "@/components/challenge-flow/list-page";
import { ChallengePreviewPage } from "@/components/challenge-flow/preview-page";
import { ChallengeSubmittedPage } from "@/components/challenge-flow/submitted-page";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { OrganizationShell } from "@/components/role-shells";
import { getChallengeFlowRoute, type ChallengeFlowRoute } from "@/data/challenge-flow-routes";
import { navigateChallenge, readStandalonePath } from "@/lib/challenges/navigation";
import { useWebRuntime } from "@/components/runtime-provider";
import { ChallengeShell } from "@/components/challenge-flow/shell";

function ConnectedChallengeBoundary({ children }: { children: ReactNode }) {
  const runtime = useWebRuntime();
  const [switchError, setSwitchError] = useState("");
  const [switching, setSwitching] = useState(false);
  if (runtime.mode === "demo") return children;
  if (runtime.sessionStatus === "loading") {
    return (
      <ChallengeShell title="اتصال به فضای کاری" description="نشست و عضویت فعال بررسی می‌شود.">
        <div className="challenge-loading-state" role="status">
          در حال بررسی نشست…
        </div>
      </ChallengeShell>
    );
  }
  if (runtime.sessionStatus === "anonymous") {
    return (
      <ChallengeShell
        title="ورود سازمانی لازم است"
        description="این بخش به API و پایگاه داده متصل است."
      >
        <section className="challenge-empty-state">
          <h2>برای مدیریت پیش‌نویس وارد شوید</h2>
          <p>هویت، عضویت و فضای کاری در سرور بررسی می‌شود.</p>
          <Link
            className="challenge-button challenge-button--primary"
            href="/auth/organization/login"
          >
            ورود با حساب محلی
          </Link>
        </section>
      </ChallengeShell>
    );
  }
  if (runtime.sessionStatus === "error") {
    return (
      <ChallengeShell
        title="ارتباط با سرویس برقرار نشد"
        description="درخواست به داده نمایشی برنگشت."
      >
        <section className="challenge-empty-state" role="alert">
          <h2>سرویس موقتاً در دسترس نیست</h2>
          <p>{runtime.sessionError?.message}</p>
          <button
            type="button"
            className="challenge-button challenge-button--primary"
            onClick={() => void runtime.refreshMe()}
          >
            تلاش دوباره
          </button>
        </section>
      </ChallengeShell>
    );
  }

  const active = runtime.me?.active_context;
  const organizationWorkspaces =
    runtime.me?.workspaces.filter((workspace) => workspace.kind === "org") ?? [];
  if (!active || active.workspace_kind !== "org") {
    return (
      <ChallengeShell
        title="انتخاب فضای کاری"
        description="دسترسی هر درخواست با عضویت فعال تطبیق می‌شود."
      >
        <section className="challenge-empty-state">
          <h2>یک فضای سازمانی را فعال کنید</h2>
          {organizationWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className="challenge-button challenge-button--primary"
              disabled={switching}
              onClick={() => {
                setSwitching(true);
                setSwitchError("");
                void runtime.switchWorkspace(workspace.id).then((error) => {
                  setSwitching(false);
                  setSwitchError(error?.message ?? "");
                });
              }}
            >
              {workspace.name}
            </button>
          ))}
          {switchError && <p role="alert">{switchError}</p>}
        </section>
      </ChallengeShell>
    );
  }
  return children;
}

export function ChallengeFlowApp({ route: initialRoute }: { route: ChallengeFlowRoute }) {
  const [route, setRoute] = useState(initialRoute);
  useEffect(() => {
    const sync = () => {
      const standalone = readStandalonePath();
      if (!standalone) return;
      const next = getChallengeFlowRoute(standalone.pathname);
      if (next) setRoute(next);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  if (route.kind === "redirect") return <LegacyRedirect target={route.target} />;

  const content =
    route.kind === "new" ? (
      <ChallengeIntakePage />
    ) : route.kind === "list" ? (
      <ChallengeListPage />
    ) : route.kind === "edit" ? (
      <ChallengeEditPage id={route.id} />
    ) : route.kind === "preview" ? (
      <ChallengePreviewPage id={route.id} />
    ) : route.kind === "submitted" ? (
      <ChallengeSubmittedPage id={route.id} />
    ) : (
      <ChallengeDetailPage id={route.id} />
    );

  return (
    <div
      onClickCapture={(event) => {
        if (document.documentElement.dataset.challengeStandalone !== "true") return;
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        const href = anchor?.getAttribute("href") ?? "";
        if (!href.startsWith("/app/org/challenges") && !href.startsWith("/org/challenges")) return;
        event.preventDefault();
        navigateChallenge(href);
      }}
    >
      <OrganizationShell currentPath={route.path}>
        <ConnectedChallengeBoundary>{content}</ConnectedChallengeBoundary>
      </OrganizationShell>
    </div>
  );
}

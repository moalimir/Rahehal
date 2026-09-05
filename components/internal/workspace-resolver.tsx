"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useWebRuntime } from "@/components/runtime-provider";
import { networkInternalSession, personaForWorkspace } from "@/lib/auth/network-session";
import { workspaceHomePath } from "@/lib/routing/workspace-home";

/**
 * `/app` — the one authenticated entry point.
 *
 * Public chrome, deep links, and post-login redirects all need somewhere to
 * send a signed-in human that does not assume which workspace they are in.
 * This resolves that at request time from the server's own membership list:
 *
 * - exactly one reachable workspace: enter it
 * - several: show an explicit chooser rather than guessing
 * - none: say so, with the next action that actually helps
 *
 * A `returnTo` is honored only when it points inside the workspace the human
 * actually resolves to, so a stale or hostile link cannot use this route to
 * reach another persona's surface.
 */
function isSafeReturnTo(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("/app/") && !value.startsWith("/app//");
}

export function WorkspaceResolver() {
  const runtime = useWebRuntime();
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    const parameter = new URLSearchParams(window.location.search).get("returnTo");
    setReturnTo(isSafeReturnTo(parameter) ? parameter : null);
  }, []);

  const session = networkInternalSession(runtime.me);
  const reachable = useMemo(() => {
    const me = runtime.me;
    if (!me) return [];
    return me.workspaces
      .filter((workspace) =>
        me.memberships.some(
          (membership) => membership.workspace_id === workspace.id && membership.state === "active",
        ),
      )
      .map((workspace) => {
        const membership = me.memberships.find(
          (candidate) => candidate.workspace_id === workspace.id && candidate.state === "active",
        );
        return {
          id: workspace.id,
          name: workspace.name,
          kind: workspace.kind,
          persona: personaForWorkspace(workspace.kind, membership?.role ?? "org:member"),
        };
      });
  }, [runtime.me]);

  const destination = useMemo(() => {
    if (!session) return null;
    const home = workspaceHomePath(session.persona);
    // `returnTo` is only followed when it belongs to the persona that actually
    // resolved; otherwise the human lands on their own workspace home.
    if (returnTo && returnTo.startsWith(`/app/${session.persona}/`)) return returnTo;
    return home;
  }, [returnTo, session]);

  useEffect(() => {
    if (destination) window.location.replace(destination);
  }, [destination]);

  /**
   * A signed-in session whose active context is unset, with exactly one
   * reachable workspace.
   *
   * Offering a chooser with a single option, or leaving every page in its
   * anonymous state, would both be wrong for someone who is signed in, so this
   * makes the choice the server would accept anyway and enters it.
   */
  const soleWorkspace =
    runtime.sessionStatus === "authenticated" && !session && reachable.length === 1
      ? reachable[0]!
      : null;

  useEffect(() => {
    if (!soleWorkspace) return;
    void runtime.switchWorkspace(soleWorkspace.id).then((error) => {
      if (!error) window.location.replace(workspaceHomePath(soleWorkspace.persona));
    });
    // `runtime` is recreated whenever the session changes; depending on it here
    // would re-issue the switch command on every refresh it triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleWorkspace?.id, soleWorkspace?.persona]);

  if (runtime.mode !== "network") {
    return (
      <section className="workspace-resolver" dir="rtl">
        <h1>ورود به فضای کاری</h1>
        <p>
          این مسیر در نسخه نمایشی ایستا فعال نیست. برای ورود به فضای کاری، نسخه متصل را اجرا کنید.
        </p>
      </section>
    );
  }

  if (runtime.sessionStatus === "loading") {
    return (
      <section className="workspace-resolver" dir="rtl" aria-busy="true">
        <h1>در حال بررسی نشست</h1>
        <p>لطفاً کمی صبر کنید.</p>
      </section>
    );
  }

  if (runtime.sessionStatus === "anonymous") {
    return (
      <section className="workspace-resolver" dir="rtl">
        <h1>برای ادامه وارد شوید</h1>
        <p>این بخش به نشست فعال نیاز دارد.</p>
        <Link className="challenge-button challenge-button--primary" href="/auth/login">
          ورود
        </Link>
      </section>
    );
  }

  if (runtime.sessionStatus === "error") {
    return (
      <section className="workspace-resolver" dir="rtl" role="alert">
        <h1>دسترسی به نشست ممکن نشد</h1>
        <p>{runtime.sessionError?.message ?? "ارتباط با سرویس برقرار نشد."}</p>
        <button
          className="challenge-button"
          type="button"
          onClick={() => {
            void runtime.refreshMe();
          }}
        >
          تلاش دوباره
        </button>
      </section>
    );
  }

  if (reachable.length === 0) {
    return (
      <section className="workspace-resolver" dir="rtl">
        <h1>فضای کاری فعالی ندارید</h1>
        <p>
          حساب شما هنوز به هیچ فضای کاری فعالی دسترسی ندارد. اگر تازه ثبت‌نام کرده‌اید، فعال‌سازی
          حل‌گر را کامل کنید؛ در غیر این صورت از سازمان خود دعوت بگیرید.
        </p>
        <Link
          className="challenge-button challenge-button--primary"
          href="/auth/solver/register/type"
        >
          شروع فعال‌سازی حل‌گر
        </Link>
      </section>
    );
  }

  // A session whose active context is unset -- an older session, or a sign-in
  // path that did not choose one -- still resolves when there is exactly one
  // reachable workspace. Showing a chooser with a single option, or leaving
  // every page in its anonymous state, would both be wrong for a signed-in
  // human.
  if (soleWorkspace) {
    return (
      <section className="workspace-resolver" dir="rtl" aria-busy="true">
        <h1>در حال ورود به فضای کاری</h1>
        <p>{soleWorkspace.name}</p>
      </section>
    );
  }

  // A session with an active context is already redirecting; anything below is
  // the explicit chooser for a human who can reach more than one workspace.
  if (session && destination) {
    return (
      <section className="workspace-resolver" dir="rtl" aria-busy="true">
        <h1>در حال ورود به فضای کاری</h1>
        <p>{session.workspaceName}</p>
      </section>
    );
  }

  return (
    <section className="workspace-resolver" dir="rtl">
      <h1>فضای کاری را انتخاب کنید</h1>
      <p>حساب شما به بیش از یک فضای کاری دسترسی دارد.</p>
      <ul className="workspace-resolver__list">
        {reachable.map((workspace) => (
          <li key={workspace.id}>
            <button
              className="challenge-button"
              type="button"
              onClick={() => {
                void runtime.switchWorkspace(workspace.id).then((error) => {
                  if (!error) window.location.replace(workspaceHomePath(workspace.persona));
                });
              }}
            >
              {workspace.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

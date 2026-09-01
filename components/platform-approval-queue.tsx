"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PlatformChallengeApprovalQueueResource } from "@rahhal/contracts";
import type { PublicationGate } from "@rahhal/domain";

import { RouteResolving } from "@/components/route-fallbacks";
import { useChallengeGovernance, useWebRuntime } from "@/components/runtime-provider";

const gateLabels: Record<PublicationGate, string> = {
  technical: "فنی",
  legal: "حقوقی",
  finance: "مالی",
  quality: "کیفیت",
};

export function PlatformApprovalQueue() {
  const governance = useChallengeGovernance();
  const runtime = useWebRuntime();
  const [queue, setQueue] = useState<PlatformChallengeApprovalQueueResource | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);

  const active = runtime.me?.active_context;
  const activePlatform = active?.workspace_kind === "platform";
  const load = useCallback(async () => {
    if (!governance || !activePlatform) return;
    const result = await governance.listPendingApprovals();
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    setQueue(result.data);
  }, [activePlatform, governance]);

  useEffect(() => {
    void load();
  }, [load]);

  if (runtime.sessionStatus === "loading") return <RouteResolving />;
  if (runtime.sessionStatus === "anonymous") {
    return (
      <section className="challenge-empty-state">
        <h1>ورود به صف تأیید لازم است</h1>
        <Link
          className="challenge-button challenge-button--primary"
          href="/auth/organization/login"
        >
          ورود با حساب محلی
        </Link>
      </section>
    );
  }
  if (runtime.sessionStatus === "error" || !governance) {
    return (
      <section className="challenge-empty-state" role="alert">
        <h1>صف تأیید در دسترس نیست</h1>
        <p>{runtime.sessionError?.message ?? "اجرای متصل به سرور لازم است."}</p>
      </section>
    );
  }
  if (!activePlatform) {
    const workspaces =
      runtime.me?.workspaces.filter((workspace) => workspace.kind === "platform") ?? [];
    return (
      <section className="challenge-empty-state">
        <h1>فضای کاری راه‌حل را فعال کنید</h1>
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className="challenge-button challenge-button--primary"
            disabled={switching}
            onClick={() => {
              setSwitching(true);
              setError("");
              void runtime.switchWorkspace(workspace.id).then((failure) => {
                setSwitching(false);
                setError(failure?.message ?? "");
              });
            }}
          >
            {workspace.name}
          </button>
        ))}
        {workspaces.length === 0 && <p>عضویت فعال در فضای کاری پلتفرم یافت نشد.</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }
  if (error) return <p role="alert">{error}</p>;
  if (!queue) return <RouteResolving />;

  return (
    <section aria-labelledby="platform-approval-queue-title">
      <h1 id="platform-approval-queue-title">صف بررسی انتشار</h1>
      <p>این صف فقط کارهای غربالگری یا دروازه انتشارِ نقش فعال شما را نمایش می‌دهد.</p>
      {queue.items.length === 0 ? (
        <p className="challenge-empty-state">موردی در انتظار تأیید شما نیست.</p>
      ) : (
        <ul className="challenge-list">
          {queue.items.map((item) => (
            <li key={item.challenge_id}>
              <h2>{item.title}</h2>
              <p>
                {item.category} ·{" "}
                {item.stage === "triage" ? "غربالگری اولیه" : `دروازه ${gateLabels[item.gate]}`}
              </p>
              <Link
                className="challenge-button challenge-button--primary"
                href={`/app/org/challenges/record/governance/?id=${encodeURIComponent(item.challenge_id)}&workspace=${encodeURIComponent(item.workspace_id)}`}
              >
                {item.stage === "triage" ? "بررسی غربالگری" : "بررسی پرونده"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiRoutes,
  type ChallengeEvaluationMutationSuccessEnvelope,
  type ChallengeEvaluationResource,
  type ChallengeEvaluationSuccessEnvelope,
  type OpenChallengeEvaluationBody,
} from "@rahhal/contracts";
import type { EvaluationReadinessBlocker } from "@rahhal/domain";

import { Toast } from "@/components/challenge-flow/fields";
import { ChallengeShell } from "@/components/challenge-flow/shell";
import { useWebRuntime } from "@/components/runtime-provider";
import { idempotencyKey, requestApi } from "@/lib/api/http";
import { challengeHref } from "@/lib/challenges/navigation";

const blockerLabels: Record<EvaluationReadinessBlocker, string> = {
  challenge_not_published: "فراخوان هنوز در مرحله انتشار نیست.",
  submission_window_open: "مهلت دریافت پیشنهاد هنوز بسته نشده است.",
  rubric_missing: "نسخه معیارهای ارزیابی ثبت نشده است.",
  proposal_workflow_unresolved: "رسیدگی به دست‌کم یک پیشنهاد ارسال‌شده هنوز باز است.",
  proposal_roster_unavailable:
    "فهرست کامل ارزیابی در دسترس نیست؛ عملیات باید دسترسی و نسخه‌ها را بررسی کند.",
};

const stageLabels: Record<ChallengeEvaluationResource["stage"], string> = {
  draft: "پیش‌نویس",
  triage: "غربال اولیه",
  formulation: "تدوین",
  approvals: "دروازه‌های انتشار",
  published: "منتشرشده",
  evaluating: "در حال ارزیابی",
  decided: "تصمیم ثبت‌شده",
  contracting: "قرارداد",
  pilot: "پایلوت",
  impact: "سنجش اثر",
  closed: "بسته‌شده",
};

function tehranDate(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
}

export function ChallengeEvaluationPage({ id }: { id: string }) {
  const runtime = useWebRuntime();
  const workspaceId = runtime.me?.active_context?.workspace_id;
  const [evaluation, setEvaluation] = useState<ChallengeEvaluationResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [commandError, setCommandError] = useState("");
  const [toast, setToast] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError("");
    const result = await requestApi<ChallengeEvaluationSuccessEnvelope>(
      apiRoutes.challengeEvaluation.replace("{challengeId}", encodeURIComponent(id)),
      { headers: { "X-Workspace-Id": workspaceId } },
    );
    if (!result.ok) {
      setLoadError(result.error.message);
      setLoading(false);
      return;
    }
    setEvaluation(result.data);
    setCommandError("");
    retry.current = null;
    setLoading(false);
  }, [id, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!workspaceId) {
    return (
      <ChallengeShell title="پرونده ارزیابی">
        <p className="challenge-empty-state">فضای کاری سازمانی فعال پیدا نشد.</p>
      </ChallengeShell>
    );
  }

  if (loading) {
    return (
      <ChallengeShell title="پرونده ارزیابی" id={id}>
        <p className="challenge-loading-state" role="status">
          در حال بررسی آمادگی ارزیابی…
        </p>
      </ChallengeShell>
    );
  }

  if (loadError || !evaluation) {
    return (
      <ChallengeShell title="پرونده ارزیابی" id={id}>
        <section className="challenge-empty-state" role="alert">
          <h2>وضعیت ارزیابی دریافت نشد</h2>
          <p>{loadError || "پاسخ معتبری از سرور دریافت نشد."}</p>
          <button
            type="button"
            className="challenge-button challenge-button--primary"
            onClick={() => void load()}
          >
            تلاش دوباره
          </button>
        </section>
      </ChallengeShell>
    );
  }

  const opened = evaluation.opened_at !== null;

  return (
    <ChallengeShell
      title="پرونده ارزیابی"
      description="با شروع ارزیابی، نسخه دقیق معیارها و همه پیشنهادهای واجد شرایط قفل می‌شود و دریافت یا بازنگری پیشنهاد پایان می‌یابد."
      id={id}
      actions={
        <div className="challenge-evaluation-links">
          {!opened && evaluation.stage === "published" ? (
            <Link
              className="challenge-button challenge-button--secondary"
              href={challengeHref(`/app/org/challenges/${id}/rubric`)}
            >
              ویرایش معیارها
            </Link>
          ) : null}
          <Link
            className="challenge-button challenge-button--secondary"
            href={challengeHref(`/app/org/challenges/${id}`)}
          >
            بازگشت به پرونده
          </Link>
        </div>
      }
    >
      <section
        className="challenge-form-panel challenge-evaluation"
        aria-labelledby="evaluation-status"
      >
        <header className="challenge-form-panel__heading">
          <div>
            <h2 id="evaluation-status">
              {opened ? "فهرست ارزیابی قفل شده است" : "آمادگی شروع ارزیابی"}
            </h2>
            <p>
              برای هر پیشنهاد واجد شرایط، {evaluation.required_reviews.toLocaleString("fa-IR")}{" "}
              بررسی مستقل لازم است.
            </p>
          </div>
          <span className="challenge-status-badge" data-ready={evaluation.ready}>
            {opened ? "قفل‌شده" : evaluation.ready ? "آماده شروع" : "نیازمند اقدام"}
          </span>
        </header>

        <dl className="challenge-evaluation-summary">
          <div>
            <dt>مرحله فراخوان</dt>
            <dd>{stageLabels[evaluation.stage]}</dd>
          </div>
          <div>
            <dt>نسخه فراخوان</dt>
            <dd>
              <bdi dir="ltr">{evaluation.challenge_version_id ?? "—"}</bdi>
            </dd>
          </div>
          <div>
            <dt>نسخه معیارها</dt>
            <dd>
              <bdi dir="ltr">{evaluation.rubric_version_id ?? "ثبت نشده"}</bdi>
            </dd>
          </div>
          <div>
            <dt>پیشنهاد واجد شرایط</dt>
            <dd>{evaluation.qualifying_proposal_count.toLocaleString("fa-IR")}</dd>
          </div>
          <div>
            <dt>گردش‌کار باز</dt>
            <dd>{evaluation.unresolved_proposal_count.toLocaleString("fa-IR")}</dd>
          </div>
        </dl>

        {evaluation.blockers.length ? (
          <section className="challenge-evaluation-blockers" aria-labelledby="evaluation-blockers">
            <h3 id="evaluation-blockers">موارد لازم پیش از شروع</h3>
            <ul>
              {evaluation.blockers.map((blocker) => (
                <li key={blocker}>{blockerLabels[blocker]}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="challenge-evaluation-roster" aria-labelledby="evaluation-roster">
          <div>
            <h3 id="evaluation-roster">فهرست پیشنهادها</h3>
            <p>
              {opened
                ? "این فهرست تغییرناپذیر است."
                : "این پیش‌نمایش هنگام شروع ارزیابی قفل می‌شود."}
            </p>
          </div>
          {evaluation.roster.length ? (
            <ul>
              {evaluation.roster.map((item) => (
                <li key={item.proposal_id}>
                  <strong>
                    <bdi dir="ltr">{item.tracking_code}</bdi>
                  </strong>
                  <span>
                    نسخه <bdi dir="ltr">{item.proposal_version_id}</bdi>
                  </span>
                  <small>
                    وضعیت مبنا:{" "}
                    {item.source_state === "eligible"
                      ? "واجد شرایط"
                      : item.source_state === "reviewing"
                        ? "در حال بررسی"
                        : "بازارسال‌شده"}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="challenge-evaluation-roster__empty">
              پیشنهاد واجد شرایطی برای این فهرست وجود ندارد.
            </p>
          )}
        </section>

        {opened ? (
          <p className="challenge-evaluation-opened">
            ارزیابی در {tehranDate(evaluation.opened_at!)} به وقت تهران آغاز شد.
          </p>
        ) : (
          <form
            className="challenge-evaluation-action"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !evaluation.ready) return;
              const body: OpenChallengeEvaluationBody = { expected_version: evaluation.version };
              const fingerprint = JSON.stringify(body);
              if (!retry.current || retry.current.fingerprint !== fingerprint) {
                retry.current = { fingerprint, key: idempotencyKey("open-evaluation") };
              }
              setBusy(true);
              setCommandError("");
              void requestApi<ChallengeEvaluationMutationSuccessEnvelope>(
                apiRoutes.openChallengeEvaluation.replace("{challengeId}", encodeURIComponent(id)),
                {
                  method: "POST",
                  headers: {
                    "X-Workspace-Id": workspaceId,
                    "Idempotency-Key": retry.current.key,
                  },
                  body: JSON.stringify(body),
                },
              ).then(async (result) => {
                setBusy(false);
                if (!result.ok) {
                  setCommandError(result.error.message);
                  return;
                }
                retry.current = null;
                setToast("فهرست دقیق پیشنهادها قفل شد و ارزیابی آغاز شد.");
                await load();
              });
            }}
          >
            <p>شروع ارزیابی این فهرست و نسخه معیارها را به شواهد تغییرناپذیر تبدیل می‌کند.</p>
            {commandError ? (
              <p className="challenge-rubric-error" role="alert">
                {commandError}
              </p>
            ) : null}
            <button
              type="submit"
              className="challenge-button challenge-button--primary"
              disabled={!evaluation.ready || busy}
            >
              {busy ? "در حال قفل‌کردن…" : "قفل فهرست و شروع ارزیابی"}
            </button>
          </form>
        )}
      </section>
      <Toast message={toast} />
    </ChallengeShell>
  );
}

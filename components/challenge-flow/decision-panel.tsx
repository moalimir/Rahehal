"use client";

import { useEffect, useRef, useState } from "react";
import {
  decisionApiRoutes,
  type BrowserDecisionStepUpStartSuccessEnvelope,
  type ChallengeDecisionResource,
  type MutationSuccessEnvelope,
  type RecordChallengeDecisionBody,
  type SaveDecisionShortlistBody,
} from "@rahhal/contracts";
import type { DecisionOutcome, DecisionReasonCode } from "@rahhal/domain";

import { idempotencyKey, requestApi } from "@/lib/api/http";

const reasonLabels: Record<DecisionReasonCode, string> = {
  best_overall_fit: "بهترین تناسب کلی",
  strategic_fit: "هم‌راستایی راهبردی",
  delivery_confidence: "اطمینان از اجرا",
  risk_adjusted_value: "ارزش متناسب با ریسک",
  no_qualifying_proposal: "نبود پیشنهاد واجد شرایط",
  reviews_inconclusive: "نتیجه نامشخص داوری‌ها",
  budget_or_timing_constraints: "محدودیت بودجه یا زمان",
  risk_too_high: "ریسک بیش از حد",
  other: "دلیل دیگر",
};

const reasonsByOutcome: Record<DecisionOutcome, readonly DecisionReasonCode[]> = {
  selected: [
    "best_overall_fit",
    "strategic_fit",
    "delivery_confidence",
    "risk_adjusted_value",
    "other",
  ],
  no_award: [
    "no_qualifying_proposal",
    "reviews_inconclusive",
    "budget_or_timing_constraints",
    "risk_too_high",
    "other",
  ],
};

const stepUpMessageType = "rahhal:decision-step-up";

type StepUpMessage = {
  readonly type: typeof stepUpMessageType;
  readonly challengeId: string;
  readonly status: "ready" | "failed";
};

function isStepUpMessage(value: unknown): value is StepUpMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === stepUpMessageType &&
    typeof candidate.challengeId === "string" &&
    (candidate.status === "ready" || candidate.status === "failed")
  );
}

function tehranDate(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
}

export function DecisionPanel({
  decision,
  workspaceId,
  onUpdated,
}: {
  decision: ChallengeDecisionResource;
  workspaceId: string;
  onUpdated(message?: string): Promise<void>;
}) {
  const [selectedShortlist, setSelectedShortlist] = useState(
    () => new Set(decision.shortlist?.proposal_versions.map((item) => item.proposal_id) ?? []),
  );
  const [shortlistRationale, setShortlistRationale] = useState(decision.shortlist?.rationale ?? "");
  const [outcome, setOutcome] = useState<DecisionOutcome>(
    decision.proposals.length ? "selected" : "no_award",
  );
  const [selectedProposalId, setSelectedProposalId] = useState(
    decision.shortlist?.proposal_versions[0]?.proposal_id ?? "",
  );
  const [reasonCode, setReasonCode] = useState<DecisionReasonCode>(
    decision.proposals.length ? "best_overall_fit" : "no_qualifying_proposal",
  );
  const [rationale, setRationale] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"shortlist" | "step-up" | "decision" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUpReady, setStepUpReady] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const stepUpWindow = useRef<Window | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("stepUp");
    if (status !== "ready" && status !== "failed") return;
    if (window.opener) {
      window.opener.postMessage(
        {
          type: stepUpMessageType,
          challengeId: decision.challenge_id,
          status,
        } satisfies StepUpMessage,
        window.location.origin,
      );
      window.close();
      return;
    }
    setStepUpReady(status === "ready");
    if (status === "ready") setNotice("ورود تازه تأیید شد؛ تصمیم را در همین صفحه ثبت کنید.");
    else setError("ورود تازه کامل نشد؛ دوباره تلاش کنید.");
  }, [decision.challenge_id]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== stepUpWindow.current ||
        !isStepUpMessage(event.data) ||
        event.data.challengeId !== decision.challenge_id
      ) {
        return;
      }
      stepUpWindow.current = null;
      setBusy(null);
      setStepUpReady(event.data.status === "ready");
      if (event.data.status === "ready") {
        setError("");
        setNotice("ورود تازه تأیید شد؛ اطلاعات فرم حفظ شده است.");
      } else {
        setError("ورود تازه کامل نشد؛ اطلاعات فرم حفظ شد و می‌توانید دوباره تلاش کنید.");
      }
    };
    const closedWindowMonitor = window.setInterval(() => {
      if (stepUpWindow.current?.closed) {
        stepUpWindow.current = null;
        setBusy(null);
      }
    }, 500);
    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(closedWindowMonitor);
      window.removeEventListener("message", onMessage);
      stepUpWindow.current?.close();
      stepUpWindow.current = null;
    };
  }, [decision.challenge_id]);

  const commandKey = (kind: string, body: object) => {
    const fingerprint = `${kind}:${JSON.stringify(body)}`;
    if (!retry.current || retry.current.fingerprint !== fingerprint) {
      retry.current = { fingerprint, key: idempotencyKey(kind) };
    }
    return retry.current.key;
  };

  if (decision.decision) {
    const selected = decision.proposals.find(
      (proposal) => proposal.proposal_id === decision.decision?.selected_proposal_id,
    );
    return (
      <section className="challenge-decision" aria-labelledby="decision-title">
        <header>
          <div>
            <h3 id="decision-title">تصمیم نهایی ثبت شده است</h3>
            <p>{decision.decision.rationale}</p>
          </div>
          <span className="challenge-status-badge" data-ready="true">
            {decision.decision.outcome === "selected" ? "انتخاب انجام شد" : "بدون انتخاب"}
          </span>
        </header>
        <dl className="challenge-decision__summary">
          <div>
            <dt>دلیل</dt>
            <dd>{reasonLabels[decision.decision.reason_code]}</dd>
          </div>
          <div>
            <dt>پیشنهاد منتخب</dt>
            <dd>{selected ? <bdi dir="ltr">{selected.tracking_code}</bdi> : "انتخاب نشده"}</dd>
          </div>
          <div>
            <dt>زمان تصمیم</dt>
            <dd>{tehranDate(decision.decision.decided_at)}</dd>
          </div>
          <div>
            <dt>پرونده همکاری</dt>
            <dd>{decision.case ? <bdi dir="ltr">{decision.case.id}</bdi> : "ایجاد نمی‌شود"}</dd>
          </div>
        </dl>
        <div className="challenge-decision__feedback">
          {decision.proposals.map((proposal) => (
            <article key={proposal.proposal_id}>
              <strong>
                <bdi dir="ltr">{proposal.tracking_code}</bdi>
              </strong>
              <span>{proposal.outcome === "selected" ? "منتخب" : "ردشده"}</span>
              <p>{proposal.feedback}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const shortlistReferences = decision.proposals
    .filter((proposal) => selectedShortlist.has(proposal.proposal_id))
    .map((proposal) => ({
      proposal_id: proposal.proposal_id,
      proposal_version_id: proposal.proposal_version_id,
    }));
  const selectedProposal = decision.proposals.find(
    (proposal) => proposal.proposal_id === selectedProposalId,
  );
  const availableSelected = (decision.shortlist?.proposal_versions ?? [])
    .map((reference) =>
      decision.proposals.find((proposal) => proposal.proposal_id === reference.proposal_id),
    )
    .filter((proposal): proposal is ChallengeDecisionResource["proposals"][number] => !!proposal);
  const feedbackComplete = decision.proposals.every(
    (proposal) => !!feedback[proposal.proposal_id]?.trim(),
  );
  const canRecord =
    decision.review_complete &&
    !!rationale.trim() &&
    feedbackComplete &&
    (outcome === "no_award" || !!selectedProposal);

  return (
    <section className="challenge-decision" aria-labelledby="decision-title">
      <header>
        <div>
          <h3 id="decision-title">کوتاه‌فهرست و تصمیم نهایی</h3>
          <p>کوتاه‌فهرست نسخه‌دار است. تصمیم نهایی به ورود تازه و شواهد دقیق داوری متصل می‌شود.</p>
        </div>
        <span className="challenge-status-badge" data-ready={decision.review_complete}>
          {decision.review_complete ? "آماده تصمیم" : "داوری‌ها کامل نیست"}
        </span>
      </header>

      {decision.proposals.length ? (
        <form
          className="challenge-decision__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!shortlistReferences.length || !shortlistRationale.trim() || busy) return;
            const body: SaveDecisionShortlistBody = {
              expected_version: decision.version,
              challenge_version_id: decision.challenge_version_id,
              rubric_version_id: decision.rubric_version_id,
              proposal_versions: shortlistReferences,
              rationale: shortlistRationale.trim(),
            };
            setBusy("shortlist");
            setError("");
            void requestApi<MutationSuccessEnvelope>(
              decisionApiRoutes.decisionShortlist.replace(
                "{challengeId}",
                encodeURIComponent(decision.challenge_id),
              ),
              {
                method: "POST",
                headers: {
                  "X-Workspace-Id": workspaceId,
                  "Idempotency-Key": commandKey("decision-shortlist", body),
                },
                body: JSON.stringify(body),
              },
            ).then(async (result) => {
              setBusy(null);
              if (!result.ok) {
                setError(result.error.message);
                return;
              }
              retry.current = null;
              await onUpdated("نسخه تازه کوتاه‌فهرست ثبت شد.");
            });
          }}
        >
          <fieldset disabled={!decision.review_complete || busy !== null}>
            <legend>پیشنهادهای کوتاه‌فهرست</legend>
            <div className="challenge-decision__choices">
              {decision.proposals.map((proposal) => (
                <label key={proposal.proposal_id}>
                  <input
                    type="checkbox"
                    checked={selectedShortlist.has(proposal.proposal_id)}
                    onChange={(event) => {
                      const next = new Set(selectedShortlist);
                      if (event.currentTarget.checked) next.add(proposal.proposal_id);
                      else next.delete(proposal.proposal_id);
                      setSelectedShortlist(next);
                    }}
                  />
                  <span>
                    <bdi dir="ltr">{proposal.tracking_code}</bdi> · نسخه{" "}
                    <bdi dir="ltr">{proposal.proposal_version_id}</bdi>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            دلیل کوتاه‌فهرست
            <textarea
              value={shortlistRationale}
              maxLength={10_000}
              required
              onChange={(event) => setShortlistRationale(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="challenge-button challenge-button--secondary"
            disabled={
              !decision.review_complete ||
              !shortlistReferences.length ||
              !shortlistRationale.trim() ||
              busy !== null
            }
          >
            {busy === "shortlist" ? "در حال ثبت…" : "ثبت نسخه کوتاه‌فهرست"}
          </button>
        </form>
      ) : (
        <p className="challenge-evaluation-roster__empty">
          فهرست ارزیابی خالی است؛ فقط تصمیم مستدل بدون انتخاب ثبت می‌شود.
        </p>
      )}

      <form
        className="challenge-decision__form challenge-decision__form--final"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canRecord || !stepUpReady || busy) return;
          const body: RecordChallengeDecisionBody = {
            expected_version: decision.version,
            challenge_version_id: decision.challenge_version_id,
            rubric_version_id: decision.rubric_version_id,
            shortlist_version_id: outcome === "selected" ? (decision.shortlist?.id ?? null) : null,
            outcome,
            selected_proposal_id: outcome === "selected" ? selectedProposal!.proposal_id : null,
            selected_proposal_version_id:
              outcome === "selected" ? selectedProposal!.proposal_version_id : null,
            reason_code: reasonCode,
            rationale: rationale.trim(),
            proposal_feedback: decision.proposals.map((proposal) => ({
              proposal_id: proposal.proposal_id,
              proposal_version_id: proposal.proposal_version_id,
              feedback: feedback[proposal.proposal_id]!.trim(),
            })),
          };
          setBusy("decision");
          setError("");
          void requestApi<MutationSuccessEnvelope>(
            decisionApiRoutes.recordDecision.replace(
              "{challengeId}",
              encodeURIComponent(decision.challenge_id),
            ),
            {
              method: "POST",
              headers: {
                "X-Workspace-Id": workspaceId,
                "Idempotency-Key": commandKey("record-decision", body),
              },
              body: JSON.stringify(body),
            },
          ).then(async (result) => {
            setBusy(null);
            if (!result.ok) {
              if (result.error.code === "STEP_UP_REQUIRED") setStepUpReady(false);
              setError(result.error.message);
              return;
            }
            retry.current = null;
            await onUpdated("تصمیم نهایی و نتیجه همه پیشنهادها ثبت شد.");
          });
        }}
      >
        <h4>ثبت نهایی</h4>
        <label>
          نتیجه
          <select
            value={outcome}
            onChange={(event) => {
              const next = event.target.value as DecisionOutcome;
              setOutcome(next);
              setReasonCode(reasonsByOutcome[next][0]!);
            }}
          >
            {decision.proposals.length ? <option value="selected">انتخاب یک پیشنهاد</option> : null}
            <option value="no_award">بدون انتخاب</option>
          </select>
        </label>
        {outcome === "selected" ? (
          <label>
            پیشنهاد منتخب از آخرین کوتاه‌فهرست
            <select
              value={selectedProposalId}
              required
              onChange={(event) => setSelectedProposalId(event.target.value)}
            >
              <option value="">انتخاب کنید</option>
              {availableSelected.map((proposal) => (
                <option key={proposal.proposal_id} value={proposal.proposal_id}>
                  {proposal.tracking_code}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          کد دلیل
          <select
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as DecisionReasonCode)}
          >
            {reasonsByOutcome[outcome].map((reason) => (
              <option value={reason} key={reason}>
                {reasonLabels[reason]}
              </option>
            ))}
          </select>
        </label>
        <label>
          استدلال نهایی
          <textarea
            value={rationale}
            maxLength={10_000}
            required
            onChange={(event) => setRationale(event.target.value)}
          />
        </label>
        {decision.proposals.map((proposal) => (
          <label key={proposal.proposal_id}>
            بازخورد برای <bdi dir="ltr">{proposal.tracking_code}</bdi>
            <textarea
              value={feedback[proposal.proposal_id] ?? ""}
              maxLength={4_000}
              required
              onChange={(event) =>
                setFeedback((current) => ({
                  ...current,
                  [proposal.proposal_id]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <div className="challenge-decision__actions">
          <button
            type="button"
            className="challenge-button challenge-button--secondary"
            disabled={!decision.review_complete || stepUpReady || busy !== null}
            onClick={() => {
              const popup = window.open(
                "about:blank",
                `rahhal-step-up-${decision.challenge_id}`,
                "popup,width=520,height=720",
              );
              if (!popup) {
                setError("پنجره ورود تازه باز نشد؛ اجازه نمایش پنجره را فعال و دوباره تلاش کنید.");
                return;
              }
              stepUpWindow.current = popup;
              const body = { expected_version: decision.version };
              setBusy("step-up");
              setError("");
              void requestApi<BrowserDecisionStepUpStartSuccessEnvelope>(
                decisionApiRoutes.browserDecisionStepUpStart.replace(
                  "{challengeId}",
                  encodeURIComponent(decision.challenge_id),
                ),
                {
                  method: "POST",
                  headers: {
                    "X-Workspace-Id": workspaceId,
                    "Idempotency-Key": commandKey("decision-step-up", body),
                  },
                  body: JSON.stringify(body),
                },
              ).then((result) => {
                if (!result.ok) {
                  popup.close();
                  stepUpWindow.current = null;
                  setBusy(null);
                  setError(result.error.message);
                  return;
                }
                popup.location.assign(result.data.authorization_url);
              });
            }}
          >
            {busy === "step-up"
              ? "در انتظار ورود تازه…"
              : stepUpReady
                ? "ورود تازه تأیید شد"
                : "ورود تازه برای تصمیم"}
          </button>
          <button
            type="submit"
            className="challenge-button challenge-button--primary"
            disabled={!canRecord || !stepUpReady || busy !== null}
          >
            {busy === "decision" ? "در حال ثبت نهایی…" : "ثبت تصمیم نهایی"}
          </button>
        </div>
        <p className="challenge-decision__hint">
          ورود تازه در یک پنجره جدا انجام می‌شود تا متن تصمیم و بازخوردها حفظ شود. پس از تأیید پنج
          دقیقه فرصت دارید همین تصمیم را ثبت کنید.
        </p>
        {error ? (
          <p className="challenge-rubric-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="challenge-evaluation-opened" role="status">
            {notice}
          </p>
        ) : null}
      </form>
    </section>
  );
}

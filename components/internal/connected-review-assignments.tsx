"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRoutes,
  type MutationSuccessEnvelope,
  type OperationsReviewAssignmentListResource,
  type OperationsReviewAssignmentListSuccessEnvelope,
  type ReviewAssignmentListResource,
  type ReviewAssignmentListSuccessEnvelope,
} from "@rahhal/contracts";

import { Panel, StatusBadge } from "@/components/internal/shared";
import { RouteResolving } from "@/components/route-fallbacks";
import { useWebRuntime } from "@/components/runtime-provider";
import { idempotencyKey, requestApi } from "@/lib/api/http";

const tehranDateTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

function formatTehran(value: string): string {
  return `${tehranDateTime.format(new Date(value))} به وقت تهران`;
}

function defaultDueValue(): string {
  return new Date(Date.now() + 7 * 86_400_000 + 3.5 * 3_600_000).toISOString().slice(0, 16);
}

function tehranInputToIso(value: string): string | null {
  const parsed = new Date(`${value}:00+03:30`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function assignmentStateLabel(state: string): string {
  if (state === "coi-gate") return "در انتظار اظهار تعارض منافع";
  if (state === "cancelled") return "لغوشده";
  return state;
}

export function ConnectedReviewerAssignments() {
  const runtime = useWebRuntime();
  const workspaceId = runtime.me?.active_context?.workspace_id;
  const [queue, setQueue] = useState<ReviewAssignmentListResource | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const result = await requestApi<ReviewAssignmentListSuccessEnvelope>(
      `${apiRoutes.reviewAssignments}?limit=100`,
      { headers: { "x-workspace-id": workspaceId } },
    );
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    setQueue(result.data);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!queue && !error) return <RouteResolving />;
  return (
    <section aria-labelledby="connected-reviewer-assignments-title">
      <h1 id="connected-reviewer-assignments-title">مأموریت‌های داوری من</h1>
      <p>این فهرست از سرور خوانده می‌شود و تا D5 فقط اطلاعات مأموریت را نشان می‌دهد.</p>
      {error && (
        <p className="app-field-error" role="alert">
          {error}
        </p>
      )}
      {queue?.items.length === 0 ? (
        <p className="challenge-empty-state">مأموریت فعالی برای شما ثبت نشده است.</p>
      ) : (
        <div className="app-assignment-list">
          {queue?.items.map((assignment) => (
            <article key={assignment.id}>
              <div>
                <StatusBadge
                  tone={
                    assignment.state === "cancelled"
                      ? "neutral"
                      : assignment.overdue
                        ? "danger"
                        : "warning"
                  }
                >
                  {assignment.state === "cancelled"
                    ? "لغوشده"
                    : assignment.overdue
                      ? "از موعد گذشته"
                      : "فعال"}
                </StatusBadge>
                <bdi>{assignment.id}</bdi>
              </div>
              <h2>{assignmentStateLabel(assignment.state)}</h2>
              <p>
                وضعیت COI:{" "}
                {assignment.coi_status === "pending" ? "ثبت‌نشده" : assignment.coi_status}
              </p>
              <p>{formatTehran(assignment.due_at)}</p>
              <footer>
                <span>نسخه مأموریت {assignment.version.toLocaleString("fa-IR")}</span>
                {assignment.state === "coi-gate" && (
                  <StatusBadge tone="info">اظهار COI در D5</StatusBadge>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type CommandKind = "cancel" | "replace";

export function ConnectedOperationsReviewAssignments() {
  const runtime = useWebRuntime();
  const workspaceId = runtime.me?.active_context?.workspace_id;
  const [data, setData] = useState<OperationsReviewAssignmentListResource | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedProposal, setSelectedProposal] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueValue);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [replacementReviewers, setReplacementReviewers] = useState<Record<string, string>>({});
  const [replacementDueDates, setReplacementDueDates] = useState<Record<string, string>>({});
  const commandKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const result = await requestApi<OperationsReviewAssignmentListSuccessEnvelope>(
      apiRoutes.operationsReviewAssignments,
      { headers: { "x-workspace-id": workspaceId } },
    );
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setData(result.data);
    setSelectedProposal((current) =>
      result.data.evaluation_proposals.some((item) => item.proposal_id === current)
        ? current
        : (result.data.evaluation_proposals[0]?.proposal_id ?? ""),
    );
    setSelectedReviewer((current) =>
      result.data.reviewers.some((item) => item.membership_id === current)
        ? current
        : (result.data.reviewers[0]?.membership_id ?? ""),
    );
    setError("");
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSlot = useMemo(
    () => data?.evaluation_proposals.find((item) => item.proposal_id === selectedProposal),
    [data, selectedProposal],
  );

  const command = useCallback(
    async (key: string, path: string, body: Record<string, unknown>, successMessage: string) => {
      if (!workspaceId) return;
      const requestKey = commandKeys.current.get(key) ?? idempotencyKey("web-review-assignment");
      commandKeys.current.set(key, requestKey);
      setBusy(key);
      setError("");
      setNotice("");
      const result = await requestApi<MutationSuccessEnvelope>(path, {
        method: "POST",
        headers: { "x-workspace-id": workspaceId, "idempotency-key": requestKey },
        body: JSON.stringify(body),
      });
      setBusy("");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      commandKeys.current.delete(key);
      setNotice(`${successMessage} · رسید ${result.data.receipt_id}`);
      await load();
    },
    [load, workspaceId],
  );

  const createAssignment = () => {
    const deadline = tehranInputToIso(dueAt);
    if (!selectedSlot || !selectedReviewer || !deadline) {
      setError("پیشنهاد، داور و موعد معتبر را انتخاب کنید.");
      return;
    }
    void command(
      `review-assignment-create-${selectedSlot.proposal_id}-${selectedReviewer}-${deadline}`,
      apiRoutes.operationsReviewAssignments,
      {
        expected_version: selectedSlot.evaluation_version,
        challenge_id: selectedSlot.challenge_id,
        proposal_id: selectedSlot.proposal_id,
        reviewer_membership_id: selectedReviewer,
        due_at: deadline,
      },
      "مأموریت داوری ثبت شد",
    );
  };

  const updateAssignment = (
    assignment: OperationsReviewAssignmentListResource["assignments"][number],
    kind: CommandKind,
  ) => {
    const reason = reasons[assignment.id]?.trim() ?? "";
    if (!reason) {
      setError("برای لغو یا جایگزینی، دلیل را ثبت کنید.");
      return;
    }
    const replacement = replacementReviewers[assignment.id] ?? "";
    const replacementDue = tehranInputToIso(replacementDueDates[assignment.id] ?? dueAt);
    if (kind === "replace" && (!replacement || !replacementDue)) {
      setError("داور و موعد جایگزین را انتخاب کنید.");
      return;
    }
    const route = (
      kind === "cancel" ? apiRoutes.cancelReviewAssignment : apiRoutes.replaceReviewAssignment
    ).replace("{assignmentId}", assignment.id);
    void command(
      `review-assignment-${kind}-${assignment.id}-${assignment.version}-${reason}-${replacement}`,
      route,
      {
        expected_version: assignment.version,
        reason,
        ...(kind === "replace"
          ? { reviewer_membership_id: replacement, due_at: replacementDue }
          : {}),
      },
      kind === "cancel" ? "مأموریت لغو شد" : "داور جایگزین ثبت شد",
    );
  };

  if (!data && !error) return <RouteResolving />;
  return (
    <section aria-labelledby="connected-operations-reviews-title">
      <h1 id="connected-operations-reviews-title">تخصیص داوران</h1>
      <p>هر پیشنهاد واجد شرایط باید دو مأموریت فعال و مستقل داشته باشد.</p>
      {notice && (
        <p role="status" className="app-status app-status--success">
          <bdi>{notice}</bdi>
        </p>
      )}
      {error && (
        <p role="alert" className="app-field-error">
          {error}
        </p>
      )}
      <Panel title="مأموریت تازه" eyebrow="موعد دلخواه و آینده · بدون سقف بار کاری">
        <div className="app-form-grid">
          <label className="app-field">
            <span>پیشنهاد در فهرست ارزیابی</span>
            <select
              value={selectedProposal}
              onChange={(event) => setSelectedProposal(event.target.value)}
            >
              {data?.evaluation_proposals.map((item) => (
                <option key={item.proposal_id} value={item.proposal_id}>
                  {item.proposal_tracking_code} ·{" "}
                  {item.active_assignment_count.toLocaleString("fa-IR")} از{" "}
                  {item.required_reviews.toLocaleString("fa-IR")} داور
                </option>
              ))}
            </select>
          </label>
          <label className="app-field">
            <span>داور</span>
            <select
              value={selectedReviewer}
              onChange={(event) => setSelectedReviewer(event.target.value)}
            >
              {data?.reviewers.map((reviewer) => (
                <option key={reviewer.membership_id} value={reviewer.membership_id}>
                  {reviewer.display_name} ·{" "}
                  {reviewer.active_assignment_count.toLocaleString("fa-IR")} مأموریت فعال
                </option>
              ))}
            </select>
          </label>
          <label className="app-field">
            <span>موعد به وقت تهران (UTC+3:30)</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
        </div>
        <footer className="app-form-footer">
          <span>
            {selectedSlot
              ? `${selectedSlot.active_assignment_count.toLocaleString("fa-IR")} مأموریت فعال از ${selectedSlot.required_reviews.toLocaleString("fa-IR")}`
              : "پیشنهاد آماده تخصیص وجود ندارد."}
          </span>
          <button
            type="button"
            className="app-button app-button--primary"
            disabled={
              !selectedSlot ||
              selectedSlot.active_assignment_count >= selectedSlot.required_reviews ||
              !selectedReviewer ||
              Boolean(busy)
            }
            onClick={createAssignment}
          >
            ثبت مأموریت
          </button>
        </footer>
      </Panel>

      <Panel title="مأموریت‌های ثبت‌شده" eyebrow="لغو، شواهد قبلی را حفظ می‌کند">
        {data?.assignments.length === 0 ? (
          <p className="challenge-empty-state">هنوز مأموریتی ثبت نشده است.</p>
        ) : (
          <div className="app-assignment-list">
            {data?.assignments.map((assignment) => (
              <article key={assignment.id}>
                <div>
                  <StatusBadge
                    tone={
                      assignment.state === "cancelled"
                        ? "neutral"
                        : assignment.overdue
                          ? "danger"
                          : "info"
                    }
                  >
                    {assignment.state === "cancelled"
                      ? "لغوشده"
                      : assignment.overdue
                        ? "از موعد گذشته"
                        : "فعال"}
                  </StatusBadge>
                  <bdi>{assignment.id}</bdi>
                </div>
                <h2>
                  <bdi>{assignment.proposal_tracking_code}</bdi>
                </h2>
                <p>{assignment.reviewer_display_name}</p>
                <p>{formatTehran(assignment.due_at)}</p>
                {assignment.state === "cancelled" ? (
                  <p>دلیل لغو: {assignment.cancellation_reason}</p>
                ) : (
                  <>
                    <label className="app-field">
                      <span>دلیل لغو یا جایگزینی</span>
                      <textarea
                        rows={3}
                        value={reasons[assignment.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [assignment.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="app-field">
                      <span>داور جایگزین</span>
                      <select
                        value={replacementReviewers[assignment.id] ?? ""}
                        onChange={(event) =>
                          setReplacementReviewers((current) => ({
                            ...current,
                            [assignment.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">انتخاب کنید</option>
                        {data.reviewers
                          .filter(
                            (reviewer) =>
                              reviewer.membership_id !== assignment.reviewer_membership_id,
                          )
                          .map((reviewer) => (
                            <option key={reviewer.membership_id} value={reviewer.membership_id}>
                              {reviewer.display_name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="app-field">
                      <span>موعد جایگزین به وقت تهران (UTC+3:30)</span>
                      <input
                        type="datetime-local"
                        value={replacementDueDates[assignment.id] ?? dueAt}
                        onChange={(event) =>
                          setReplacementDueDates((current) => ({
                            ...current,
                            [assignment.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <footer>
                      <button
                        type="button"
                        className="app-button app-button--secondary"
                        disabled={Boolean(busy)}
                        onClick={() => updateAssignment(assignment, "cancel")}
                      >
                        لغو مأموریت
                      </button>
                      <button
                        type="button"
                        className="app-button app-button--primary"
                        disabled={Boolean(busy)}
                        onClick={() => updateAssignment(assignment, "replace")}
                      >
                        ثبت جایگزین
                      </button>
                    </footer>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}

export function ConnectedReviewAssignments({ view }: { view: "reviewer" | "operations" }) {
  return view === "reviewer" ? (
    <ConnectedReviewerAssignments />
  ) : (
    <ConnectedOperationsReviewAssignments />
  );
}

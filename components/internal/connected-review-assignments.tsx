"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRoutes,
  reviewCoiApiRoutes,
  reviewScoringApiRoutes,
  type MutationSuccessEnvelope,
  type OperationsReviewConflictListResource,
  type OperationsReviewConflictListSuccessEnvelope,
  type OperationsReviewAssignmentListResource,
  type OperationsReviewAssignmentListSuccessEnvelope,
  type ReviewAssignmentResource,
  type ReviewAssignmentListResource,
  type ReviewAssignmentListSuccessEnvelope,
  type ReviewMaterialsResource,
  type ReviewMaterialsSuccessEnvelope,
  type ReviewResource,
  type ReviewSuccessEnvelope,
} from "@rahhal/contracts";
import type { CriterionScore, ReviewCoiRelationshipCategory } from "@rahhal/domain";

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
  if (state === "accepted") return "پذیرفته‌شده و آماده داوری";
  if (state === "draft") return "پیش‌نویس داوری";
  if (state === "submitted") return "ثبت‌شده و در انتظار قفل عملیات";
  if (state === "locked") return "قفل‌شده و کامل";
  if (state === "invalidated") return "باطل‌شده";
  if (state === "cancelled") return "لغوشده";
  return state;
}

const coiCategoryLabels: Readonly<Record<ReviewCoiRelationshipCategory, string>> = {
  employment_affiliation: "رابطه استخدامی یا سازمانی",
  financial_interest: "منفعت مالی",
  close_personal_relationship: "رابطه شخصی نزدیک",
  prior_collaboration: "همکاری در ۲۴ ماه گذشته",
  advisory_role: "نقش مشاوره‌ای",
  other: "سایر موارد",
};

type ReviewMaterialField = keyof ReviewMaterialsResource["proposal_content"];
const reviewMaterialGroups: ReadonlyArray<{
  title: string;
  rows: ReadonlyArray<{ field: ReviewMaterialField; label: string }>;
}> = [
  {
    title: "مسئله و ارزش",
    rows: [
      { field: "title", label: "عنوان پیشنهاد" },
      { field: "problem_statement", label: "بیان مسئله" },
      { field: "value_proposition", label: "ارزش پیشنهادی" },
    ],
  },
  {
    title: "راهکار فنی",
    rows: [
      { field: "technical_approach", label: "رویکرد فنی" },
      { field: "architecture", label: "معماری راهکار" },
      { field: "technologies", label: "فناوری‌ها" },
      { field: "maturity_level", label: "سطح بلوغ راهکار" },
      { field: "data_needs", label: "داده موردنیاز" },
      { field: "ip_status", label: "وضعیت مالکیت فکری" },
    ],
  },
  {
    title: "اجرا و زمان‌بندی",
    rows: [
      { field: "roadmap", label: "نقشه راه" },
      { field: "prototype_weeks", label: "زمان نمونه اولیه" },
      { field: "duration_weeks", label: "زمان اجرا" },
      { field: "dependencies", label: "پیش‌نیازها و وابستگی‌ها" },
      { field: "pilot_location", label: "محل اجرای پایلوت" },
      { field: "start_availability", label: "زمان شروع" },
      { field: "team_availability", label: "میزان در دسترس بودن تیم" },
    ],
  },
  {
    title: "سنجش و ریسک",
    rows: [
      { field: "success_metrics", label: "معیارهای موفقیت" },
      { field: "risks", label: "ریسک‌ها" },
      { field: "mitigation", label: "برنامه کاهش ریسک" },
    ],
  },
];

function reviewMaterialValue(
  content: ReviewMaterialsResource["proposal_content"],
  field: ReviewMaterialField,
): string {
  const value = content[field];
  if (Array.isArray(value)) return value.join("، ") || "ثبت نشده";
  const text = String(value ?? "").trim();
  if (!text) return "ثبت نشده";
  if (field === "prototype_weeks" || field === "duration_weeks") return `${text} هفته`;
  return text;
}

function ReviewScorecard({
  assignment,
  materials,
  review,
  workspaceId,
  reload,
}: {
  assignment: ReviewAssignmentResource;
  materials: ReviewMaterialsResource;
  review: ReviewResource | null;
  workspaceId: string;
  reload: () => Promise<void>;
}) {
  const initialDraft = useCallback(() => {
    const existing = new Map(review?.scores.map((score) => [score.criterion_id, score]));
    return Object.fromEntries(
      materials.rubric_criteria.map((criterion) => {
        const score = existing.get(criterion.id);
        return [
          criterion.id,
          { value: score ? String(score.value) : "", rationale: score?.rationale ?? "" },
        ];
      }),
    ) as Record<string, { value: string; rationale: string }>;
  }, [materials.rubric_criteria, review]);
  const [draft, setDraft] = useState(initialDraft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "submit" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const commandKeys = useRef(new Map<string, string>());

  useEffect(() => {
    setDraft(initialDraft());
    setDirty(false);
  }, [initialDraft]);

  const setField = (criterionId: string, field: "value" | "rationale", value: string) => {
    setDraft((current) => ({
      ...current,
      [criterionId]: { ...current[criterionId]!, [field]: value },
    }));
    setDirty(true);
    setNotice("");
  };
  const enteredScores = (): readonly CriterionScore[] | null => {
    const scores: CriterionScore[] = [];
    for (const criterion of materials.rubric_criteria) {
      const entry = draft[criterion.id]!;
      const started = entry.value !== "" || entry.rationale !== "";
      if (!started) continue;
      if (entry.value === "") return null;
      scores.push({
        criterion_id: criterion.id,
        value: Number(entry.value),
        rationale: entry.rationale,
      });
    }
    return scores;
  };
  const command = async (kind: "save" | "submit", path: string, body: Record<string, unknown>) => {
    const keyName = `${kind}-${assignment.id}-${assignment.version}`;
    const key = commandKeys.current.get(keyName) ?? idempotencyKey(`web-review-${kind}`);
    commandKeys.current.set(keyName, key);
    setBusy(kind);
    setError("");
    const result = await requestApi<MutationSuccessEnvelope>(path, {
      method: "POST",
      headers: { "x-workspace-id": workspaceId, "idempotency-key": key },
      body: JSON.stringify(body),
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    commandKeys.current.delete(keyName);
    setNotice(
      kind === "save"
        ? `پیش‌نویس ذخیره شد · رسید ${result.data.receipt_id}`
        : `داوری نهایی ثبت شد · رسید ${result.data.receipt_id}`,
    );
    await reload();
  };
  const save = () => {
    const scores = enteredScores();
    if (!scores) {
      setError("برای هر معیاری که شروع کرده‌اید، امتیاز ۰ تا ۵ را انتخاب کنید.");
      return;
    }
    void command(
      "save",
      reviewScoringApiRoutes.saveReviewDraft.replace("{assignmentId}", assignment.id),
      { expected_version: assignment.version, scores },
    );
  };
  const submit = () => {
    if (dirty) {
      setError("ابتدا تغییرات پیش‌نویس را ذخیره کنید.");
      return;
    }
    void command(
      "submit",
      reviewScoringApiRoutes.submitReview.replace("{assignmentId}", assignment.id),
      { expected_version: assignment.version },
    );
  };
  const savedComplete =
    review?.scores.length === materials.rubric_criteria.length &&
    review.scores.every((score) => score.rationale.trim().length > 0);
  const previewScores = enteredScores();
  const preview =
    previewScores && previewScores.length === materials.rubric_criteria.length
      ? materials.rubric_criteria.reduce((sum, criterion) => {
          const score = previewScores.find((item) => item.criterion_id === criterion.id);
          return sum + criterion.weight * (score?.value ?? 0);
        }, 0) / 5
      : null;
  const editable = assignment.state === "accepted" || assignment.state === "draft";

  return (
    <section className="app-review-scorecard" aria-labelledby={`scorecard-${assignment.id}`}>
      <h3 id={`scorecard-${assignment.id}`}>امتیازدهی معیارنامه</h3>
      <p>امتیاز هر معیار عدد صحیح از ۰ تا ۵ است و ثبت نهایی برای همه معیارها دلیل می‌خواهد.</p>
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
      {materials.rubric_criteria.map((criterion) => {
        const entry = draft[criterion.id]!;
        return (
          <fieldset key={criterion.id} className="app-review-score-criterion" disabled={!editable}>
            <legend>
              {criterion.label} · وزن {criterion.weight.toLocaleString("fa-IR")}٪
            </legend>
            <label className="app-field">
              <span>امتیاز {criterion.label}</span>
              <select
                value={entry.value}
                onChange={(event) => setField(criterion.id, "value", event.target.value)}
              >
                <option value="">انتخاب کنید</option>
                {[0, 1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString("fa-IR")}
                  </option>
                ))}
              </select>
            </label>
            <label className="app-field">
              <span>دلیل امتیاز {criterion.label}</span>
              <textarea
                rows={4}
                maxLength={4000}
                value={entry.rationale}
                onChange={(event) => setField(criterion.id, "rationale", event.target.value)}
              />
            </label>
          </fieldset>
        );
      })}
      <div className="app-review-score-total" aria-live="polite">
        <strong>
          {review?.weighted_score_tenths !== null && review?.weighted_score_tenths !== undefined
            ? (review.weighted_score_tenths / 10).toLocaleString("fa-IR")
            : preview === null
              ? "—"
              : preview.toLocaleString("fa-IR")}
        </strong>
        <span>امتیاز وزنی از ۱۰۰</span>
      </div>
      {editable ? (
        <footer className="app-form-footer">
          <button
            type="button"
            className="app-button app-button--secondary"
            disabled={Boolean(busy)}
            onClick={save}
          >
            ذخیره پیش‌نویس
          </button>
          <button
            type="button"
            className="app-button app-button--primary"
            disabled={Boolean(busy) || assignment.state !== "draft" || !savedComplete || dirty}
            onClick={submit}
          >
            ثبت نهایی داوری
          </button>
        </footer>
      ) : (
        <p>
          {assignment.state === "submitted"
            ? "داوری ثبت شده و در انتظار قفل صریح عملیات است."
            : "داوری قفل شده و دیگر قابل ویرایش نیست."}
        </p>
      )}
    </section>
  );
}

function ReviewMaterials({
  assignment,
  workspaceId,
  reload,
}: {
  assignment: ReviewAssignmentResource;
  workspaceId: string;
  reload: () => Promise<void>;
}) {
  const [materials, setMaterials] = useState<ReviewMaterialsResource | null>(null);
  const [review, setReview] = useState<ReviewResource | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      !["accepted", "draft", "submitted", "locked"].includes(assignment.state) ||
      assignment.coi_status !== "clear"
    )
      return;
    void Promise.all([
      requestApi<ReviewMaterialsSuccessEnvelope>(
        reviewCoiApiRoutes.reviewAssignmentMaterials.replace("{assignmentId}", assignment.id),
        { headers: { "x-workspace-id": workspaceId } },
      ),
      requestApi<ReviewSuccessEnvelope>(
        reviewScoringApiRoutes.reviewAssignmentReview.replace("{assignmentId}", assignment.id),
        { headers: { "x-workspace-id": workspaceId } },
      ),
    ]).then(([materialsResult, reviewResult]) => {
      if (!materialsResult.ok) setError(materialsResult.error.message);
      else if (!reviewResult.ok) setError(reviewResult.error.message);
      else {
        setMaterials(materialsResult.data);
        setReview(reviewResult.data);
        setError("");
      }
    });
  }, [assignment.coi_status, assignment.id, assignment.state, assignment.version, workspaceId]);

  if (
    !["accepted", "draft", "submitted", "locked"].includes(assignment.state) ||
    assignment.coi_status !== "clear"
  )
    return null;
  if (error)
    return (
      <p className="app-field-error" role="alert">
        {error}
      </p>
    );
  if (!materials) return <p role="status">در حال دریافت نسخه‌های قفل‌شده…</p>;
  return (
    <section aria-label={`مواد داوری ${materials.challenge_title}`}>
      <h3>نسخه‌های قفل‌شده برای داوری</h3>
      <p>
        پیشنهاد <bdi>{materials.proposal_version_id}</bdi> · معیارها{" "}
        <bdi>{materials.rubric_version_id}</bdi>
      </p>
      <p>این نما فقط محتوای فنی و اجرایی مجاز همان نسخه را نشان می‌دهد.</p>
      {reviewMaterialGroups.map((group) => (
        <div className="app-review-material-group" key={group.title}>
          <h4>{group.title}</h4>
          <dl>
            {group.rows.map((row) => (
              <div key={row.field}>
                <dt>{row.label}</dt>
                <dd>{reviewMaterialValue(materials.proposal_content, row.field)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div className="app-review-material-group">
        <h4>معیارهای داوری</h4>
        <ul>
          {materials.rubric_criteria.map((criterion) => (
            <li key={criterion.id}>
              {criterion.label} · وزن {criterion.weight.toLocaleString("fa-IR")}٪ · امتیاز ۰ تا ۵
            </li>
          ))}
        </ul>
      </div>
      <ReviewScorecard
        assignment={assignment}
        materials={materials}
        review={review}
        workspaceId={workspaceId}
        reload={reload}
      />
    </section>
  );
}

function ReviewerAssignmentCard({
  assignment,
  workspaceId,
  reload,
}: {
  assignment: ReviewAssignmentResource;
  workspaceId: string;
  reload: () => Promise<void>;
}) {
  const [decision, setDecision] = useState<"clear" | "conflict">("clear");
  const [categories, setCategories] = useState<ReviewCoiRelationshipCategory[]>([]);
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const commandKey = useRef("");

  const toggleCategory = (category: ReviewCoiRelationshipCategory) =>
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );

  const declare = async () => {
    if (!attested) {
      setError("تأیید صحت اظهار لازم است.");
      return;
    }
    if (decision === "conflict" && (!categories.length || !reason.trim())) {
      setError("برای تعارض، دست‌کم یک رابطه و دلیل را ثبت کنید.");
      return;
    }
    commandKey.current ||= idempotencyKey("web-review-coi");
    setBusy(true);
    setError("");
    const result = await requestApi<MutationSuccessEnvelope>(
      reviewCoiApiRoutes.declareReviewCoi.replace("{assignmentId}", assignment.id),
      {
        method: "POST",
        headers: {
          "x-workspace-id": workspaceId,
          "idempotency-key": commandKey.current,
        },
        body: JSON.stringify({
          expected_version: assignment.version,
          status: decision,
          relationship_categories: decision === "clear" ? [] : categories,
          reason: decision === "clear" ? null : reason.trim(),
          attestation: true,
        }),
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    commandKey.current = "";
    setNotice(decision === "clear" ? "اظهار ثبت شد؛ مواد داوری باز شد." : "تعارض ثبت شد.");
    await reload();
  };

  return (
    <article>
      <div>
        <StatusBadge
          tone={
            assignment.overdue
              ? "danger"
              : assignment.coi_status === "clear"
                ? "success"
                : "warning"
          }
        >
          {assignment.overdue
            ? "از موعد گذشته"
            : assignment.coi_status === "clear"
              ? "COI روشن"
              : "نیازمند اقدام"}
        </StatusBadge>
        <bdi>{assignment.id}</bdi>
      </div>
      <h2>{assignment.pre_coi_packet.challenge_title}</h2>
      <p>{assignment.pre_coi_packet.organization_name}</p>
      <p>{assignmentStateLabel(assignment.state)}</p>
      <p>{formatTehran(assignment.due_at)}</p>
      {notice && (
        <p role="status" className="app-status app-status--success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="app-field-error">
          {error}
        </p>
      )}
      {assignment.coi_status === "pending" && (
        <fieldset className="app-review-coi">
          <legend>اظهار تعارض منافع</legend>
          <p>
            تنها نام سازمان و عنوان چالش نمایش داده شده است. پیش از اظهار، محتوای پیشنهاد و معیارها
            قابل دسترسی نیست.
          </p>
          <label>
            <input
              type="radio"
              name={`coi-${assignment.id}`}
              checked={decision === "clear"}
              onChange={() => setDecision("clear")}
            />
            هیچ رابطه مؤثری ندارم
          </label>
          <label>
            <input
              type="radio"
              name={`coi-${assignment.id}`}
              checked={decision === "conflict"}
              onChange={() => setDecision("conflict")}
            />
            تعارض منافع دارم
          </label>
          {decision === "conflict" && (
            <>
              <div className="app-review-coi-categories">
                {(Object.keys(coiCategoryLabels) as ReviewCoiRelationshipCategory[]).map(
                  (category) => (
                    <label key={category}>
                      <input
                        type="checkbox"
                        checked={categories.includes(category)}
                        onChange={() => toggleCategory(category)}
                      />
                      {coiCategoryLabels[category]}
                    </label>
                  ),
                )}
              </div>
              <label className="app-field">
                <span>شرح تعارض</span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
            صحت این اظهار و بررسی روابط ۲۴ ماه گذشته را تأیید می‌کنم.
          </label>
          <button
            type="button"
            className="app-button app-button--primary"
            disabled={busy}
            onClick={() => void declare()}
          >
            ثبت نهایی اظهار
          </button>
        </fieldset>
      )}
      {assignment.coi_status === "conflict" && (
        <p>تعارض ثبت شده است. مواد بسته مانده و عملیات باید مأموریت را جایگزین کند.</p>
      )}
      <ReviewMaterials assignment={assignment} workspaceId={workspaceId} reload={reload} />
      <footer>
        <span>نسخه مأموریت {assignment.version.toLocaleString("fa-IR")}</span>
      </footer>
    </article>
  );
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
      <p>مواد هر مأموریت فقط پس از اظهار روشن و پذیرش سروری همان مأموریت باز می‌شود.</p>
      {error && (
        <p className="app-field-error" role="alert">
          {error}
        </p>
      )}
      {queue?.items.length === 0 ? (
        <p className="challenge-empty-state">مأموریت فعالی برای شما ثبت نشده است.</p>
      ) : (
        <div className="app-assignment-list app-reviewer-assignment-list">
          {queue?.items.map((assignment) => (
            <ReviewerAssignmentCard
              key={assignment.id}
              assignment={assignment}
              workspaceId={workspaceId!}
              reload={load}
            />
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
  const [conflicts, setConflicts] = useState<OperationsReviewConflictListResource | null>(null);
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
    const [assignmentResult, conflictResult] = await Promise.all([
      requestApi<OperationsReviewAssignmentListSuccessEnvelope>(
        apiRoutes.operationsReviewAssignments,
        { headers: { "x-workspace-id": workspaceId } },
      ),
      requestApi<OperationsReviewConflictListSuccessEnvelope>(
        reviewCoiApiRoutes.operationsReviewConflicts,
        { headers: { "x-workspace-id": workspaceId } },
      ),
    ]);
    if (!assignmentResult.ok) {
      setError(assignmentResult.error.message);
      return;
    }
    if (!conflictResult.ok) {
      setError(conflictResult.error.message);
      return;
    }
    setData(assignmentResult.data);
    setConflicts(conflictResult.data);
    setSelectedProposal((current) =>
      assignmentResult.data.evaluation_proposals.some((item) => item.proposal_id === current)
        ? current
        : (assignmentResult.data.evaluation_proposals[0]?.proposal_id ?? ""),
    );
    setSelectedReviewer((current) =>
      assignmentResult.data.reviewers.some((item) => item.membership_id === current)
        ? current
        : (assignmentResult.data.reviewers[0]?.membership_id ?? ""),
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

  const transitionReview = (
    assignment: OperationsReviewAssignmentListResource["assignments"][number],
    kind: "lock" | "invalidate",
  ) => {
    const reason = reasons[assignment.id]?.trim() ?? "";
    if (!reason) {
      setError(kind === "lock" ? "دلیل قفل را ثبت کنید." : "دلیل ابطال را ثبت کنید.");
      return;
    }
    const route = (
      kind === "lock" ? reviewScoringApiRoutes.lockReview : reviewScoringApiRoutes.invalidateReview
    ).replace("{assignmentId}", assignment.id);
    void command(
      `review-${kind}-${assignment.id}-${assignment.version}-${reason}`,
      route,
      { expected_version: assignment.version, reason },
      kind === "lock" ? "داوری قفل شد" : "داوری باطل شد و جایگزین لازم است",
    );
  };

  if ((!data || !conflicts) && !error) return <RouteResolving />;
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
      <Panel title="صف تعارض منافع" eyebrow="فقط لغو یا جایگزینی؛ بدون دسترسی به پیشنهاد">
        {conflicts?.items.length === 0 ? (
          <p className="challenge-empty-state">تعارض ثبت‌شده‌ای در صف نیست.</p>
        ) : (
          <div className="app-assignment-list">
            {conflicts?.items.map((conflict) => (
              <article key={conflict.assignment_id}>
                <div>
                  <StatusBadge tone="danger">نیازمند جایگزینی</StatusBadge>
                  <bdi>{conflict.assignment_id}</bdi>
                </div>
                <h3>{conflict.challenge_title}</h3>
                <p>
                  {conflict.organization_name} · {conflict.reviewer_display_name}
                </p>
                <p>
                  {conflict.relationship_categories
                    .map((category) => coiCategoryLabels[category])
                    .join("، ")}
                </p>
                <p>{conflict.reason}</p>
                <p>{formatTehran(conflict.declared_at)}</p>
              </article>
            ))}
          </div>
        )}
      </Panel>
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
                        : assignment.state === "invalidated"
                          ? "danger"
                          : assignment.state === "locked"
                            ? "success"
                            : assignment.overdue
                              ? "danger"
                              : "info"
                    }
                  >
                    {assignment.state === "cancelled"
                      ? "لغوشده"
                      : assignment.state === "invalidated"
                        ? "باطل‌شده"
                        : assignment.state === "locked"
                          ? "قفل‌شده"
                          : assignment.state === "submitted"
                            ? "آماده قفل"
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
                ) : assignment.state === "submitted" ? (
                  <>
                    <p>
                      امتیاز وزنی:{" "}
                      {assignment.review_summary?.weighted_score_tenths === null ||
                      assignment.review_summary?.weighted_score_tenths === undefined
                        ? "—"
                        : (assignment.review_summary.weighted_score_tenths / 10).toLocaleString(
                            "fa-IR",
                          ) + " از ۱۰۰"}
                    </p>
                    <label className="app-field">
                      <span>دلیل قفل</span>
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
                    <button
                      type="button"
                      className="app-button app-button--primary"
                      disabled={Boolean(busy)}
                      onClick={() => transitionReview(assignment, "lock")}
                    >
                      قفل داوری
                    </button>
                  </>
                ) : assignment.state === "locked" ? (
                  <>
                    <p>
                      امتیاز وزنی{" "}
                      {(
                        (assignment.review_summary?.weighted_score_tenths ?? 0) / 10
                      ).toLocaleString("fa-IR")}{" "}
                      از ۱۰۰ · این داوری در شمارش کامل بودن معتبر است.
                    </p>
                    <p>دلیل قفل: {assignment.review_summary?.lock_reason}</p>
                    <label className="app-field">
                      <span>دلیل ابطال</span>
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
                    <button
                      type="button"
                      className="app-button app-button--secondary"
                      disabled={Boolean(busy)}
                      onClick={() => transitionReview(assignment, "invalidate")}
                    >
                      ابطال داوری
                    </button>
                  </>
                ) : assignment.state === "invalidated" ? (
                  <>
                    <p>دلیل ابطال: {assignment.review_summary?.invalidation_reason}</p>
                    <p>داوری باطل‌شده حفظ شده است و برای تکمیل ارزیابی باید داور تازه تعیین شود.</p>
                    <label className="app-field">
                      <span>دلیل جایگزینی</span>
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
                    <button
                      type="button"
                      className="app-button app-button--primary"
                      disabled={Boolean(busy)}
                      onClick={() => updateAssignment(assignment, "replace")}
                    >
                      ثبت جایگزین
                    </button>
                  </>
                ) : (
                  <>
                    {assignment.state === "accepted" && (
                      <p>داور تعارضی اعلام نکرده و مأموریت را پذیرفته است.</p>
                    )}
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

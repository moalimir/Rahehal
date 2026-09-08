"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRoutes,
  type ChallengeSuccessEnvelope,
  type CreateRubricVersionBody,
  type RubricMutationSuccessEnvelope,
  type RubricSuccessEnvelope,
} from "@rahhal/contracts";
import { validateRubricCriteria, type RubricCriterion } from "@rahhal/domain";

import { Toast } from "@/components/challenge-flow/fields";
import { ChallengeShell } from "@/components/challenge-flow/shell";
import { useWebRuntime } from "@/components/runtime-provider";
import { idempotencyKey, requestApi } from "@/lib/api/http";
import { challengeHref } from "@/lib/challenges/navigation";

type EditableCriterion = {
  readonly id: string;
  readonly label: string;
  readonly weight: string;
};

const initialCriterion = (): EditableCriterion => ({
  id: "criterion_1",
  label: "",
  weight: "100",
});

function nextCriterionId(criteria: readonly EditableCriterion[]): string {
  const existing = new Set(criteria.map(({ id }) => id));
  for (let index = 1; index <= 20; index += 1) {
    const id = `criterion_${index}`;
    if (!existing.has(id)) return id;
  }
  return `criterion_${Date.now().toString(36)}`;
}

function editableCriteria(criteria: readonly RubricCriterion[]): EditableCriterion[] {
  return criteria.map(({ id, label, weight }) => ({ id, label, weight: String(weight) }));
}

function commandCriteria(criteria: readonly EditableCriterion[]): RubricCriterion[] {
  return criteria.map(({ id, label, weight }) => ({
    id,
    label: label.trim(),
    weight: Number(weight),
    min: 0,
    max: 5,
  }));
}

function validationMessage(criteria: readonly RubricCriterion[]): string {
  const issues = validateRubricCriteria(criteria);
  if (!issues.length) return "";
  if (issues.some(({ code }) => code === "weight_total")) {
    return "جمع وزن معیارها باید دقیقاً ۱۰۰ درصد باشد.";
  }
  if (issues.some(({ path }) => path.endsWith(".label"))) {
    return "برای همه معیارها یک عنوان کوتاه وارد کنید.";
  }
  if (issues.some(({ path }) => path.endsWith(".weight"))) {
    return "وزن هر معیار باید یک عدد صحیح از ۱ تا ۱۰۰ باشد.";
  }
  return "تعریف معیارها معتبر نیست. شناسه‌ها باید یکتا باشند و حداکثر ۲۰ معیار مجاز است.";
}

export function ChallengeRubricPage({ id }: { id: string }) {
  const runtime = useWebRuntime();
  const workspaceId = runtime.me?.active_context?.workspace_id;
  const [criteria, setCriteria] = useState<EditableCriterion[]>([initialCriterion()]);
  const [challengeVersionId, setChallengeVersionId] = useState("");
  const [version, setVersion] = useState(0);
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError("");
    const headers = { "X-Workspace-Id": workspaceId };
    const challengePath = apiRoutes.challengeById.replace("{challengeId}", encodeURIComponent(id));
    const rubricPath = apiRoutes.challengeRubric.replace("{challengeId}", encodeURIComponent(id));
    const [challenge, rubric] = await Promise.all([
      requestApi<ChallengeSuccessEnvelope>(challengePath, { headers }),
      requestApi<RubricSuccessEnvelope>(rubricPath, { headers }),
    ]);
    if (!challenge.ok) {
      setLoadError(challenge.error.message);
      setLoading(false);
      return;
    }
    if (!rubric.ok) {
      setLoadError(rubric.error.message);
      setLoading(false);
      return;
    }
    if (challenge.data.stage !== "published" || !challenge.data.published_version_id) {
      setLoadError("تعریف معیار فقط برای فراخوان منتشرشده و پیش از شروع ارزیابی امکان‌پذیر است.");
      setLoading(false);
      return;
    }
    setChallengeVersionId(challenge.data.published_version_id);
    setVersion(rubric.data?.version ?? 0);
    setCreatedAt(rubric.data?.created_at ?? "");
    setCriteria(rubric.data ? editableCriteria(rubric.data.criteria) : [initialCriterion()]);
    setFormError("");
    retry.current = null;
    setLoading(false);
  }, [id, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const weightTotal = useMemo(
    () => criteria.reduce((total, criterion) => total + (Number(criterion.weight) || 0), 0),
    [criteria],
  );

  if (!workspaceId) {
    return (
      <ChallengeShell title="معیارهای ارزیابی">
        <p className="challenge-empty-state">فضای کاری سازمانی فعال پیدا نشد.</p>
      </ChallengeShell>
    );
  }

  if (loading) {
    return (
      <ChallengeShell title="معیارهای ارزیابی" id={id}>
        <p className="challenge-loading-state" role="status">
          در حال دریافت نسخه معیارها…
        </p>
      </ChallengeShell>
    );
  }

  if (loadError) {
    return (
      <ChallengeShell title="معیارهای ارزیابی" id={id}>
        <section className="challenge-empty-state" role="alert">
          <h2>نسخه معیارها دریافت نشد</h2>
          <p>{loadError}</p>
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

  return (
    <ChallengeShell
      title="معیارهای ارزیابی"
      description="وزن معیارها روی نسخه منتشرشده فراخوان قفل می‌شود و مبنای همه بررسی‌های مستقل خواهد بود."
      id={id}
      actions={
        <Link
          className="challenge-button challenge-button--secondary"
          href={challengeHref(`/app/org/challenges/${id}`)}
        >
          بازگشت به پرونده
        </Link>
      }
    >
      <form
        className="challenge-form-panel challenge-rubric"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const prepared = commandCriteria(criteria);
          const error = validationMessage(prepared);
          if (error) {
            setFormError(error);
            return;
          }
          const body: CreateRubricVersionBody = {
            expected_version: version,
            challenge_version_id:
              challengeVersionId as CreateRubricVersionBody["challenge_version_id"],
            criteria: prepared,
          };
          const fingerprint = JSON.stringify(body);
          if (!retry.current || retry.current.fingerprint !== fingerprint) {
            retry.current = { fingerprint, key: idempotencyKey("rubric-version") };
          }
          setBusy(true);
          setFormError("");
          void requestApi<RubricMutationSuccessEnvelope>(
            apiRoutes.createRubricVersion.replace("{challengeId}", encodeURIComponent(id)),
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
              setFormError(result.error.message);
              return;
            }
            retry.current = null;
            setToast(`نسخه ${result.meta.entity_version.toLocaleString("fa-IR")} معیارها ثبت شد.`);
            await load();
          });
        }}
      >
        <header className="challenge-form-panel__heading">
          <div>
            <h2>روبریک نسخه {version.toLocaleString("fa-IR")}</h2>
            <p>
              امتیاز هر معیار عدد صحیح ۰ تا ۵ است و بررسی‌کننده باید برای هر امتیاز دلیل ثبت کند.
            </p>
          </div>
          <span>
            نسخه فراخوان: <bdi dir="ltr">{challengeVersionId}</bdi>
          </span>
        </header>

        <div className="challenge-rubric-summary" aria-live="polite">
          <span>تعداد معیار: {criteria.length.toLocaleString("fa-IR")}</span>
          <strong data-complete={weightTotal === 100}>
            جمع وزن: {weightTotal.toLocaleString("fa-IR")}٪
          </strong>
          {createdAt ? <span>این صفحه آخرین نسخه ثبت‌شده را نشان می‌دهد.</span> : null}
        </div>

        <div className="challenge-rubric-list">
          {criteria.map((criterion, index) => {
            const labelId = `rubric-label-${criterion.id}`;
            const weightId = `rubric-weight-${criterion.id}`;
            return (
              <fieldset className="challenge-rubric-row" key={criterion.id}>
                <legend>معیار {(index + 1).toLocaleString("fa-IR")}</legend>
                <label className="challenge-field" htmlFor={labelId}>
                  <span className="challenge-field__label">عنوان معیار</span>
                  <input
                    id={labelId}
                    value={criterion.label}
                    maxLength={160}
                    required
                    disabled={busy}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item) =>
                          item.id === criterion.id ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="challenge-field" htmlFor={weightId}>
                  <span className="challenge-field__label">وزن (درصد)</span>
                  <input
                    id={weightId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    value={criterion.weight}
                    required
                    disabled={busy}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item) =>
                          item.id === criterion.id ? { ...item, weight: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <div className="challenge-rubric-row__scale">
                  <span>دامنه امتیاز</span>
                  <strong>۰ تا ۵</strong>
                  <small>
                    شناسه: <bdi dir="ltr">{criterion.id}</bdi>
                  </small>
                </div>
                <button
                  type="button"
                  className="challenge-button challenge-button--danger challenge-button--small"
                  disabled={criteria.length === 1 || busy}
                  aria-label={`حذف معیار ${criterion.label || (index + 1).toLocaleString("fa-IR")}`}
                  onClick={() =>
                    setCriteria((current) =>
                      current.filter(({ id: itemId }) => itemId !== criterion.id),
                    )
                  }
                >
                  حذف
                </button>
              </fieldset>
            );
          })}
        </div>

        {formError ? (
          <p className="challenge-rubric-error" role="alert">
            {formError}
          </p>
        ) : null}

        <footer className="challenge-rubric-actions">
          <button
            type="button"
            className="challenge-button challenge-button--secondary"
            disabled={criteria.length >= 20 || busy}
            onClick={() =>
              setCriteria((current) => [
                ...current,
                { id: nextCriterionId(current), label: "", weight: "" },
              ])
            }
          >
            افزودن معیار
          </button>
          <button
            type="submit"
            className="challenge-button challenge-button--primary"
            disabled={busy}
          >
            {busy ? "در حال ثبت…" : version ? "ثبت نسخه تازه" : "ثبت نخستین نسخه"}
          </button>
        </footer>
      </form>
      <Toast message={toast} />
    </ChallengeShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/internal/shared";
import { StepFields } from "@/components/solver-proposal/step-fields";
import {
  fromRepositoryContent,
  initialDraft,
  steps,
  toRepositoryContent,
  validateStep,
  type DraftErrors,
  type DraftField,
  type ProposalDraft,
  type ProposalStep,
} from "@/components/solver-proposal/model";
import { useSolverContext, type SolverSpace } from "@/components/solver-shell";
import { challenges } from "@/data/mock";
import { getChallengePublisher } from "@/data/challenge-publishers";
import type { MutationReceipt } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules, evaluateEligibility } from "@/lib/solver/eligibility";
import {
  activeWorkspaces,
  proposalById,
  readProposalDraft,
  readSolverState,
  saveProposalDraft,
  submitProposal,
  teamPermission,
} from "@/lib/solver/repository";

export function SolverProposalWizard({
  path,
  space,
  onSubmit,
}: {
  path: string;
  space: SolverSpace;
  onSubmit: () => void;
}) {
  const hookContext = useSolverContext();
  const initialState = readSolverState();
  const context =
    hookContext.type === space
      ? hookContext
      : space === "team"
        ? (activeWorkspaces(initialState).find((workspace) => workspace.type === "team") ??
          hookContext)
        : ({ type: "individual", workspaceId: initialState.personalWorkspace.id } as const);
  const routeStep = path.split("/").filter(Boolean).at(-1) as ProposalStep | undefined;
  const activeStep = steps.some((item) => item.key === routeStep) ? routeStep! : "summary";
  const activeIndex = steps.findIndex((item) => item.key === activeStep);
  const [draft, setDraft] = useState<ProposalDraft>(initialDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveState, setSaveState] = useState("ذخیره خودکار فعال است");
  const [notice, setNotice] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">(
    "idle",
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<MutationReceipt | null>(null);
  const routeProposalId = path.match(/^\/app\/solver\/proposals\/(PR-[^/]+)\//)?.[1];
  const routeProposal = routeProposalId
    ? proposalById(routeProposalId, context.workspaceId, initialState)
    : undefined;
  const [challengeId, setChallengeId] = useState("CH-1405-022");
  const selectedChallenge = challenges.find((challenge) => challenge.id === challengeId);
  const selectedPublisher = selectedChallenge
    ? getChallengePublisher(selectedChallenge.id)
    : undefined;

  useEffect(() => {
    const query =
      document.documentElement.dataset.challengeStandalone === "true"
        ? (window.location.hash.split("?")[1] ?? "")
        : window.location.search.slice(1);
    const requested = new URLSearchParams(query).get("challenge");
    if (routeProposal) {
      setChallengeId(routeProposal.challengeId);
      return;
    }
    if (!requested) return;
    const resolved = challenges.find(
      (challenge) => challenge.slug === requested || challenge.id === requested,
    );
    setChallengeId(resolved?.id ?? "__NOT_FOUND__");
  }, [routeProposal]);

  useEffect(() => {
    if (!selectedChallenge) return;
    setDraft(initialDraft);
    const saved = readProposalDraft(selectedChallenge.id, context.workspaceId);
    if (saved) {
      setDraft(fromRepositoryContent(saved.content));
      setEvidenceName(saved.content.attachmentNames[0] ?? "");
      setUploadState(saved.content.attachmentNames.length ? "success" : "idle");
    }
  }, [context.workspaceId, selectedChallenge]);

  const update = <K extends DraftField>(field: K, value: ProposalDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (selectedChallenge)
        saveProposalDraft(
          selectedChallenge.id,
          context.workspaceId,
          toRepositoryContent(next, evidenceName),
        );
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveState("در حال ذخیره…");
    window.setTimeout(() => setSaveState("ذخیره شد · همین حالا"), 260);
  };

  const completedSteps = useMemo(
    () =>
      steps
        .slice(0, 5)
        .map(
          (item) =>
            Object.keys(validateStep(item.key as Exclude<ProposalStep, "review">, draft)).length ===
            0,
        ),
    [draft],
  );
  const completeness = Math.round(
    (completedSteps.filter(Boolean).length / 6) * 100 + (draft.accuracyConfirmed ? 100 / 6 : 0),
  );

  const navigate = (nextPath: string) => {
    if (!selectedChallenge) return;
    const href = buildSolverHref(nextPath, context, { challenge: selectedChallenge.id });
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = href;
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    window.location.assign(href);
  };

  const saveDraft = () => {
    if (!selectedChallenge) return;
    const result = saveProposalDraft(
      selectedChallenge.id,
      context.workspaceId,
      toRepositoryContent(draft, evidenceName),
    );
    setSaveState(result.ok ? "ذخیره شد · همین حالا" : "خطا در ذخیره");
    setNotice(
      result.ok
        ? "پیش‌نویس ذخیره شد و از فهرست پیشنهادهای همین فضای کاری قابل ادامه است."
        : result.message,
    );
  };

  const continueFlow = () => {
    if (activeStep === "review") return;
    const nextErrors = validateStep(activeStep, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setNotice("برای ادامه، خطاهای مشخص‌شده در همین مرحله را اصلاح کنید.");
      document
        .querySelector<HTMLElement>(".rh-wizard-error")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    saveDraft();
    navigate(`/app/solver/proposals/new/${steps[activeIndex + 1].key}`);
  };

  const submit = () => {
    if (!selectedChallenge) return;
    const allErrors = steps.slice(0, 5).map((item) => ({
      key: item.key,
      errors: validateStep(item.key as Exclude<ProposalStep, "review">, draft),
    }));
    const firstInvalid = allErrors.find((item) => Object.keys(item.errors).length);
    if (firstInvalid) {
      setNotice(
        `پیشنهاد هنوز آماده ارسال نیست؛ ابتدا مرحله «${steps.find((item) => item.key === firstInvalid.key)?.label}» را کامل کنید.`,
      );
      return;
    }
    if (!draft.accuracyConfirmed) {
      setErrors({ accuracyConfirmed: "پیش از ارسال، صحت اطلاعات و اختیار ارسال را تأیید کنید." });
      setNotice("تأیید نهایی صحت اطلاعات برای ارسال الزامی است.");
      return;
    }
    const latestState = readSolverState();
    const latestEligibility = evaluateEligibility(
      challengeEligibilityRules[selectedChallenge.id],
      latestState,
      context,
    );
    if (latestEligibility.status !== "eligible") {
      setNotice(`ارسال متوقف شد: ${latestEligibility.reasons.join(" ")}`);
      return;
    }
    const latestPermission = teamPermission(context, "submit-proposal", {}, latestState);
    if (!latestPermission.allowed) {
      setNotice(latestPermission.reason);
      return;
    }
    setErrors({});
    setConfirmationOpen(true);
  };

  const onEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadState("error");
      setUploadProgress(0);
      setNotice("حجم فایل رزومه یا سابقه باید حداکثر ۱۰ مگابایت باشد.");
      event.target.value = "";
      return;
    }
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      setUploadState("error");
      setUploadProgress(0);
      setNotice("فرمت فایل رزومه یا سابقه باید PDF، DOC یا DOCX باشد.");
      event.target.value = "";
      return;
    }
    setUploadState("uploading");
    setUploadProgress(25);
    setNotice("فایل در حال بررسی و بارگذاری نمونه است…");
    window.setTimeout(() => {
      setEvidenceName(file.name);
      setUploadState("success");
      setUploadProgress(100);
      if (selectedChallenge)
        saveProposalDraft(
          selectedChallenge.id,
          context.workspaceId,
          toRepositoryContent(draft, file.name),
        );
      setNotice("فایل سابقه با موفقیت به پیش‌نویس پیوست شد.");
    }, 300);
  };

  if (!selectedChallenge || !selectedPublisher)
    return (
      <section className="rh-empty">
        <h1>فرصت یا پیشنهاد پیدا نشد</h1>
        <p>شناسه درخواست‌شده در این فضای کاری وجود ندارد.</p>
        <Link href={buildSolverHref("/app/solver/proposals", context)}>بازگشت به پیشنهادها</Link>
      </section>
    );
  const currentState = readSolverState();
  const activeTeam =
    context.type === "team"
      ? currentState.teams.find((team) => team.id === context.teamId)
      : undefined;
  const activeMembership =
    context.type === "team"
      ? currentState.memberships.find((membership) => membership.id === context.membershipId)
      : undefined;
  const workspaceName = activeTeam?.name ?? currentState.personalWorkspace.name;
  const eligibility = evaluateEligibility(
    challengeEligibilityRules[selectedChallenge.id],
    currentState,
    context,
  );
  const submitPermission = teamPermission(context, "submit-proposal", {}, currentState);

  return (
    <div className="rh-solution-wizard">
      <header className="rh-wizard-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href={buildSolverHref("/app/solver/opportunities", context)}>
              چالش‌ها و فرصت‌ها
            </Link>
            <Icon name="chevron" />
            <span>{selectedChallenge.title}</span>
          </nav>
          <h1>تدوین راه‌حل</h1>
          <p>
            <Icon name="check" /> {saveState}
          </p>
        </div>
        <section className="rh-wizard-challenge">
          <div className="rh-wizard-challenge__logo">
            <ChallengeOrganizationLogo challengeId={selectedChallenge.id} size="medium" />
          </div>
          <div className="rh-wizard-challenge__meta">
            <small>{selectedChallenge.title}</small>
            <strong>{selectedPublisher.name}</strong>
            <span>
              <bdi dir="ltr">{selectedChallenge.id}</bdi> · مهلت ارسال:{" "}
              {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
                new Date(selectedChallenge.deadline),
              )}
            </span>
          </div>
          <Link
            href={buildSolverHref(`/app/solver/opportunities/${selectedChallenge.slug}`, context)}
          >
            مشاهده جزئیات چالش
          </Link>
        </section>
      </header>

      <ol className="rh-wizard-stepper" aria-label={`مرحله ${activeIndex + 1} از ۶`}>
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={
              index === activeIndex
                ? "is-active"
                : completedSteps[index]
                  ? "is-complete"
                  : index < activeIndex
                    ? "is-past"
                    : ""
            }
          >
            <button type="button" onClick={() => navigate(`/app/solver/proposals/new/${step.key}`)}>
              <b>
                {completedSteps[index] ? (
                  <Icon name="check" />
                ) : (
                  (index + 1).toLocaleString("fa-IR")
                )}
              </b>
              <span>
                {step.label}
                <small>{step.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rh-wizard-layout">
        <aside className="rh-wizard-sidebar">
          <section className="rh-card">
            <h2>وضعیت پیش‌نویس</h2>
            <div
              className="rh-wizard-progress"
              style={{ "--progress": `${completeness}%` } as React.CSSProperties}
            >
              <strong>{completeness.toLocaleString("fa-IR")}٪</strong>
              <small>تکمیل</small>
            </div>
            <ul>
              {steps.slice(0, 5).map((step, index) => (
                <li key={step.key} className={completedSteps[index] ? "is-complete" : ""}>
                  <Icon name={completedSteps[index] ? "check" : "history"} />
                  {step.label}
                </li>
              ))}
            </ul>
            <span>
              <Icon name="history" /> آخرین ذخیره: همین حالا
            </span>
          </section>
          <section className="rh-card">
            <h2>ارسال از طرف</h2>
            <div className="rh-wizard-sender">
              <span>
                <Icon name={space === "team" ? "people" : "brief"} />
              </span>
              <div>
                <strong>{workspaceName}</strong>
                <small>
                  {activeMembership
                    ? `نقش: ${activeMembership.role}`
                    : currentState.currentUser.headline}
                </small>
              </div>
            </div>
            <Link href={buildSolverHref("/app/solver/profile", context)}>
              بررسی پروفایل و آمادگی
            </Link>
            <p
              className={eligibility.status === "eligible" ? "rh-eligible" : "rh-eligibility-error"}
            >
              <Icon name={eligibility.status === "eligible" ? "check" : "notification"} />
              {eligibility.reasons[0]}
            </p>
            {!submitPermission.allowed && (
              <p className="rh-eligibility-error" role="note">
                {submitPermission.reason}
              </p>
            )}
          </section>
          <section className="rh-card rh-wizard-guide">
            <h2>راهنمای این مرحله</h2>
            <p>{steps[activeIndex].hint} برای ارزیابی اولیه سازمان استفاده می‌شود.</p>
            <span>
              <Icon name="lock" /> اطلاعات تا پیش از ارسال نهایی محرمانه است.
            </span>
          </section>
        </aside>

        <main className="rh-card rh-wizard-editor">
          <header>
            <div>
              <span>{(activeIndex + 1).toLocaleString("fa-IR")}</span>
              <div>
                <h2>{steps[activeIndex].label}</h2>
                <p>{steps[activeIndex].hint} را روشن، قابل سنجش و بدون اطلاعات محرمانه ثبت کنید.</p>
              </div>
            </div>
            <small>فیلدهای ستاره‌دار الزامی‌اند.</small>
          </header>
          {activeStep !== "review" ? (
            <div className="rh-wizard-fields">
              <StepFields
                step={activeStep}
                draft={draft}
                errors={errors}
                update={update}
                space={space}
                evidenceName={evidenceName}
                onEvidence={onEvidence}
                workspaceName={workspaceName}
                profileHref={buildSolverHref("/app/solver/profile", context)}
              />
              {activeStep === "team" && uploadState !== "idle" && (
                <div className={`rh-wizard-notice is-${uploadState}`} role="status">
                  <Icon name={uploadState === "success" ? "check" : "notification"} />
                  <span>
                    {uploadState === "uploading"
                      ? "بارگذاری نمونه در حال انجام است"
                      : uploadState === "success"
                        ? `فایل ${evidenceName} آماده است.`
                        : "بارگذاری فایل ناموفق بود؛ فایل معتبر دیگری انتخاب کنید."}
                  </span>
                  {uploadState === "uploading" && (
                    <progress
                      aria-label="پیشرفت بارگذاری پیوست پیشنهاد"
                      max={100}
                      value={uploadProgress}
                    >
                      {uploadProgress}%
                    </progress>
                  )}
                  {uploadState === "error" && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadState("idle");
                        setUploadProgress(0);
                      }}
                    >
                      تلاش دوباره
                    </button>
                  )}
                  {uploadState === "success" && (
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceName("");
                        setUploadState("idle");
                        setUploadProgress(0);
                        if (selectedChallenge)
                          saveProposalDraft(
                            selectedChallenge.id,
                            context.workspaceId,
                            toRepositoryContent(draft, ""),
                          );
                      }}
                    >
                      حذف فایل
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rh-wizard-review">
              <section>
                <h3>آمادگی بخش‌ها</h3>
                {steps.slice(0, 5).map((step, index) => (
                  <article
                    key={step.key}
                    className={completedSteps[index] ? "is-ready" : "is-blocked"}
                  >
                    <span>
                      <Icon name={completedSteps[index] ? "check" : "notification"} />
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>
                        {completedSteps[index]
                          ? "کامل و آماده ارسال"
                          : "دارای فیلد ناقص یا نامعتبر"}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/solver/proposals/new/${step.key}`)}
                    >
                      بازبینی
                    </button>
                  </article>
                ))}
              </section>
              <section>
                <h3>خلاصه ارسال</h3>
                <dl>
                  <div>
                    <dt>عنوان راه‌حل</dt>
                    <dd>{draft.title || "تکمیل نشده"}</dd>
                  </div>
                  <div>
                    <dt>مجری</dt>
                    <dd>{workspaceName}</dd>
                  </div>
                  <div>
                    <dt>زمان اجرا</dt>
                    <dd>{draft.durationWeeks ? `${draft.durationWeeks} هفته` : "تکمیل نشده"}</dd>
                  </div>
                  <div>
                    <dt>بودجه پیشنهادی</dt>
                    <dd>
                      {draft.requestedBudget ? `${draft.requestedBudget} تومان` : "تکمیل نشده"}
                    </dd>
                  </div>
                </dl>
                <label className="rh-wizard-consent">
                  <input
                    type="checkbox"
                    checked={draft.accuracyConfirmed}
                    onChange={(event) => update("accuracyConfirmed", event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات، رضایت اعضای معرفی‌شده و اختیار ارسال از طرف این فضا را تأیید
                    می‌کنم.
                  </span>
                  {errors.accuracyConfirmed && (
                    <small role="alert">{errors.accuracyConfirmed}</small>
                  )}
                </label>
                <div className="rh-wizard-submit-note">
                  <Icon name="lock" />
                  <p>
                    <strong>پس از ارسال چه می‌شود؟</strong>
                    <span>
                      نسخه فعلی قفل و رسید ارسال صادر می‌شود. سازمان می‌تواند درخواست شفاف‌سازی
                      بدهد؛ اصل نسخه حذف یا بازنویسی نخواهد شد.
                    </span>
                  </p>
                </div>
              </section>
            </div>
          )}
          {notice && (
            <div className="rh-wizard-notice" role="status">
              <Icon
                name={
                  notice.includes("الزامی") ||
                  notice.includes("اصلاح") ||
                  notice.includes("حداکثر") ||
                  notice.includes("فرمت")
                    ? "notification"
                    : "check"
                }
              />
              <span>{notice}</span>
              <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}>
                <Icon name="close" />
              </button>
            </div>
          )}
        </main>
      </div>

      <footer className="rh-wizard-actions">
        <Link
          href={buildSolverHref(`/app/solver/opportunities/${selectedChallenge.slug}`, context)}
        >
          بازگشت به چالش
        </Link>
        <button type="button" onClick={saveDraft}>
          <Icon name="download" /> ذخیره پیش‌نویس
        </button>
        <div>
          {activeIndex > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/app/solver/proposals/new/${steps[activeIndex - 1].key}`)}
            >
              مرحله قبل
            </button>
          )}
          <button
            className="is-primary"
            type="button"
            onClick={activeStep === "review" ? submit : continueFlow}
            disabled={
              activeStep === "review" &&
              (eligibility.status !== "eligible" || !submitPermission.allowed)
            }
            title={
              activeStep === "review" && eligibility.status !== "eligible"
                ? eligibility.reasons.join(" ")
                : activeStep === "review" && !submitPermission.allowed
                  ? submitPermission.reason
                  : undefined
            }
          >
            {activeStep === "review"
              ? "ارسال نهایی راه‌حل"
              : `ذخیره و ادامه: ${steps[activeIndex + 1].label}`}
            <Icon
              className={activeStep === "review" ? undefined : "rh-wizard-next-icon"}
              name={activeStep === "review" ? "check" : "arrow"}
            />
          </button>
        </div>
      </footer>
      {submissionReceipt && (
        <section
          className="rh-card rh-wizard-receipt"
          role="status"
          aria-label="رسید ارسال پیشنهاد"
        >
          <Icon name="check" />
          <div>
            <h2>پیشنهاد با موفقیت ثبت شد</h2>
            <p>
              شناسه پیشنهاد <bdi dir="ltr">{submissionReceipt.entityId}</bdi> در فضای «
              {workspaceName}» برای چالش <bdi dir="ltr">{selectedChallenge.id}</bdi> قفل شد.
            </p>
            <dl>
              <div>
                <dt>شماره رسید</dt>
                <dd>
                  <bdi dir="ltr">{submissionReceipt.receiptId}</bdi>
                </dd>
              </div>
              <div>
                <dt>زمان ثبت</dt>
                <dd>
                  {new Intl.DateTimeFormat("fa-IR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(submissionReceipt.timestamp))}
                </dd>
              </div>
            </dl>
            <Link
              href={buildSolverHref(
                `/app/solver/proposals/${submissionReceipt.entityId}/preview`,
                context,
              )}
            >
              مشاهده پیشنهاد ثبت‌شده
            </Link>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={confirmationOpen}
        title="ارسال نهایی پیشنهاد؟"
        description={`نسخه فعلی برای ${workspaceName} قفل می‌شود و پس از ثبت فقط از مسیر اصلاح یا نسخه جدید قابل تغییر است.`}
        confirmLabel="تأیید و ارسال"
        variant="submission"
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={() => {
          saveProposalDraft(
            selectedChallenge.id,
            context.workspaceId,
            toRepositoryContent(draft, evidenceName),
          );
          const result = submitProposal(
            context,
            selectedChallenge.id,
            `submit:${context.workspaceId}:${selectedChallenge.id}`,
          );
          setConfirmationOpen(false);
          if (!result.ok) {
            setNotice(result.message);
            return;
          }
          setSubmissionReceipt(result);
          setNotice("نسخه پیشنهاد قفل شد و فهرست، داشبورد و اعلان‌ها به‌روزرسانی شدند.");
          onSubmit();
        }}
      />
    </div>
  );
}

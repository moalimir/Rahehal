"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import type {
  EligibilityDecisionResource,
  ProposalContentResource,
  ProposalResource,
} from "@rahhal/contracts";
import { majorAmountToMinor, minorAmountToMajor } from "@/lib/challenges/model";
import { RecordId } from "@/components/solver/record-identity";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import { proposalHref, readProposalRecordId } from "@/lib/workspace/proposal-navigation";
import { idempotencyKey } from "@/lib/api/http";
import type { GatewayFailure } from "@/lib/api/result";
import type { ProposalGateway } from "@/lib/workspace/gateways";

function parseRecordId(): string | null {
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  return readProposalRecordId(query);
}

type TextField = Exclude<
  {
    [Key in keyof ProposalContentResource]: ProposalContentResource[Key] extends string
      ? Key
      : never;
  }[keyof ProposalContentResource],
  "budget_currency"
>;

const proposalFieldSections: readonly {
  readonly title: string;
  readonly description: string;
  readonly icon: "spark" | "trend" | "people" | "decision";
  readonly fields: readonly (readonly [string, TextField])[];
}[] = [
  {
    title: "راهکار و ارزش پیشنهادی",
    description: "مسئله را با زبان خودتان صورت‌بندی کنید و منطق راهکار را روشن بنویسید.",
    icon: "spark",
    fields: [
      ["درک مسئله", "problem_statement"],
      ["ارزش پیشنهادی", "value_proposition"],
      ["رویکرد فنی", "technical_approach"],
      ["معماری راهکار", "architecture"],
      ["داده‌ها و دسترسی‌های موردنیاز", "data_needs"],
    ],
  },
  {
    title: "اجرا، سنجش و ریسک",
    description: "مسیر تحویل، معیار موفقیت و ریسک‌های اصلی اجرا را مشخص کنید.",
    icon: "trend",
    fields: [
      ["سنجه‌های موفقیت", "success_metrics"],
      ["نقشه راه", "roadmap"],
      ["وابستگی‌ها", "dependencies"],
      ["ریسک‌ها", "risks"],
      ["برنامه کاهش ریسک", "mitigation"],
    ],
  },
  {
    title: "تیم و تجربه",
    description: "ترکیب تیم و سابقه مرتبط با این مسئله را برای سازمان توضیح دهید.",
    icon: "people",
    fields: [
      ["ترکیب تیم", "team_summary"],
      ["تجربه مرتبط", "relevant_experience"],
    ],
  },
  {
    title: "برآورد بودجه",
    description: "این مبلغ یک برآورد اولیه است؛ جزئیات همکاری پس از انتخاب توافق می‌شود.",
    icon: "decision",
    fields: [["مبنای بودجه", "budget_rationale"]],
  },
] as const;

const requiredTextFields = new Set<TextField>([
  "problem_statement",
  "value_proposition",
  "technical_approach",
  "success_metrics",
]);

const fullWidthTextFields = new Set<TextField>([
  ...requiredTextFields,
  "architecture",
  "data_needs",
  "roadmap",
  "team_summary",
  "relevant_experience",
  "budget_rationale",
]);

export function ConnectedProposalEditor() {
  const runtime = useWebRuntime();
  // A workspace switch must never carry confidential draft state into another context.
  return <ProposalEditor key={runtime.me?.active_context?.workspace_id ?? "none"} />;
}

function ProposalEditor() {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const workspaceId = runtime.me?.active_context?.workspace_id;
  const [proposalId, setProposalId] = useState<string | null | undefined>(undefined);
  const [proposal, setProposal] = useState<ProposalResource | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityDecisionResource | null>(null);
  const [draft, setDraft] = useState<ProposalContentResource | null>(null);
  const [clarificationResponse, setClarificationResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<NonNullable<GatewayFailure["fields"]>>([]);
  const [savedDraft, setSavedDraft] = useState<ProposalContentResource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertainSubmit, setUncertainSubmit] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const version = useRef(0);
  const pendingSave = useRef<Parameters<ProposalGateway["patch"]>[1] | null>(null);
  const pendingSubmit = useRef<
    (Parameters<ProposalGateway["submit"]>[1] & { revisionRequestId?: string }) | null
  >(null);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(savedDraft);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!notice || noticeIsError) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, noticeIsError]);

  useEffect(() => {
    if (!dirty && !pending && !uncertainSubmit) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !link ||
        link.getAttribute("target") === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (!window.confirm("تغییرات ذخیره‌نشده یا درخواست ناتمام دارید. از صفحه خارج می‌شوید؟")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const switchWorkspace = (event: Event) => {
      const select = event.target;
      if (
        !(select instanceof HTMLSelectElement) ||
        !select.matches(".unified-space-switcher select")
      )
        return;
      if (!window.confirm("پیش‌نویس ذخیره‌نشده یا درخواست ناتمام دارید. فضای کاری عوض شود؟")) {
        select.value = workspaceId ?? "";
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    document.addEventListener("change", switchWorkspace, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
      document.removeEventListener("change", switchWorkspace, true);
    };
  }, [dirty, pending, uncertainSubmit, workspaceId]);

  useEffect(() => {
    if (destination) window.location.assign(destination);
  }, [destination]);

  useEffect(() => setProposalId(parseRecordId()), []);

  const load = useCallback(async () => {
    if (!proposalId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const record = await gateways.proposals.get(proposalId);
    if (!mounted.current) return;
    if (!record.ok) {
      setLoading(false);
      setProposal(null);
      setNotice(record.error.message);
      setNoticeIsError(true);
      return;
    }
    const decision = await gateways.solverProfile.evaluateEligibility(record.data.challenge_id);
    if (!mounted.current) return;
    setLoading(false);
    setProposal(record.data);
    setDraft(record.data.content);
    setSavedDraft(record.data.content);
    version.current = record.data.version;
    setEligibility(decision.ok ? decision.data : null);
    if (!decision.ok) {
      setNotice(decision.error.message);
      setNoticeIsError(true);
    }
  }, [gateways, proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (proposalId === undefined || loading)
    return (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال خواندن پیش‌نویس</span>
        <div className="route-fallback__skeleton" />
      </section>
    );
  if (!proposalId || !proposal || !draft)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>پیشنهاد در دسترس نیست</h1>
        <p>{notice || "شناسه معتبر پیشنهاد مشخص نشده است."}</p>
        <Link href="/app/solver/proposals">بازگشت به پیشنهادها</Link>
      </section>
    );

  const editable = proposal.state === "draft" || proposal.state === "revision_draft";
  const openClarification = proposal.clarifications.find((item) => item.state === "requested");
  const openRevision = proposal.revision_requests.find((item) => item.state === "requested");
  const activeRevision = proposal.revision_requests.find((item) => item.state === "in_progress");
  const set = <Key extends keyof ProposalContentResource>(
    key: Key,
    value: ProposalContentResource[Key],
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  const reportFailure = (error: GatewayFailure) => {
    setNoticeIsError(true);
    setFieldErrors(error.fields ?? []);
    setNotice(
      [
        error.message,
        error.code === "CONFLICT"
          ? "متن شما حفظ شده؛ نسخه سرور را در پنجره‌ای جدا بررسی کنید. بازخوانی این صفحه متن ذخیره‌نشده را پاک می‌کند."
          : "متن شما در این صفحه حفظ شده است.",
      ].join(" · "),
    );
  };

  const saveDraft = async () => {
    // Replay an ambiguous write with the SAME key and payload before saving newer edits.
    const command = pendingSave.current ?? {
      expectedVersion: version.current,
      patch: draft,
      commandKey: idempotencyKey("proposal-patch"),
    };
    pendingSave.current = command;
    const result = await gateways.proposals.patch(proposal.id, command);
    if (!mounted.current) return false;
    if (!result.ok) {
      if (result.error.code !== "STORAGE") pendingSave.current = null;
      reportFailure(result.error);
      return false;
    }
    if (result.meta.entity_version === undefined) {
      reportFailure({ code: "STORAGE", message: "نسخه رسید ذخیره مشخص نیست؛ دوباره تلاش کنید." });
      return false;
    }
    pendingSave.current = null;
    version.current = result.meta.entity_version;
    const saved = command.patch as ProposalContentResource;
    setSavedDraft(saved);
    setProposal((current) =>
      current ? { ...current, version: version.current, content: saved } : current,
    );
    if (JSON.stringify(saved) !== JSON.stringify(draft)) return saveDraft();
    return true;
  };

  const persist = async (send: boolean) => {
    if (busy.current || (!send && uncertainSubmit)) return;
    busy.current = true;
    setPending(true);
    setSubmitting(send);
    setNotice("");
    setNoticeIsError(false);
    setFieldErrors([]);
    try {
      if (!pendingSubmit.current && !(await saveDraft())) return;
      if (!mounted.current) return;
      if (send) {
        if (!pendingSubmit.current) {
          if (eligibility?.status !== "eligible") {
            reportFailure({
              code: "INVALID_STATE",
              message: "شرایط ارسال این فضای کاری هنوز کامل نیست.",
            });
            return;
          }
          pendingSubmit.current = {
            expectedVersion: version.current,
            acceptedChallengeVersionId: eligibility.evaluated_against_version_id,
            commandKey: idempotencyKey("proposal-submit"),
            ...(proposal.state === "revision_draft" && activeRevision
              ? { revisionRequestId: activeRevision.id }
              : {}),
          };
        }
        const command = pendingSubmit.current;
        const result = command.revisionRequestId
          ? await gateways.proposals.resubmit(proposal.id, {
              ...command,
              revisionRequestId: command.revisionRequestId,
            })
          : await gateways.proposals.submit(proposal.id, command);
        if (!mounted.current) return;
        if (!result.ok) {
          setUncertainSubmit(result.error.code === "STORAGE");
          if (result.error.code !== "STORAGE") pendingSubmit.current = null;
          reportFailure(result.error);
          return;
        }
        pendingSubmit.current = null;
        setUncertainSubmit(false);
        // React removes the leave guard before the full navigation.
        setPending(false);
        setSubmitting(false);
        setDestination(proposalHref(`/app/solver/proposals/${proposal.id}/preview`));
        return;
      }
      const record = await gateways.proposals.get(proposal.id);
      if (!mounted.current) return;
      // A refresh is metadata, never a reason to replace the human's current text.
      if (record.ok && record.data.version === version.current) setProposal(record.data);
      setNotice(
        record.ok
          ? "نسخه پیش‌نویس ذخیره شد."
          : "نسخه ذخیره شد؛ دریافت وضعیت تازه انجام نشد. متن شما حفظ شده است.",
      );
      setNoticeIsError(!record.ok);
    } catch {
      setUncertainSubmit(!!pendingSubmit.current);
      reportFailure({
        code: "STORAGE",
        message: "ارتباط قطع شد؛ برای ادامه همان اقدام را دوباره بزنید.",
      });
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="rh-connected-proposal-editor">
      <header className="rh-profile-heading rh-connected-page-head rh-connected-proposal-head">
        <div>
          <small className="rh-connected-proposal-head__id">
            {proposal.tracking_code ? (
              <bdi dir="ltr">{proposal.tracking_code}</bdi>
            ) : (
              "پیش‌نویس ارسال‌نشده"
            )}{" "}
            · نسخه {proposal.version.toLocaleString("fa-IR")}
          </small>
          <h1>{editable ? "تدوین پیشنهاد" : "اقدام روی پیشنهاد"}</h1>
          <p>ارسال نهایی ابتدا تغییرات شما را ذخیره و سپس همان نسخه را قفل می‌کند.</p>
          <RecordId value={proposal.id} label="شناسه پیشنهاد" />
        </div>
        <Link
          className="rh-profile-outline"
          href={proposalHref(`/app/solver/proposals/${proposal.id}/preview`)}
          target="_blank"
          rel="noopener"
        >
          <Icon name="eye" /> مشاهده نسخه سرور در پنجره جدید
        </Link>
      </header>

      <section className="rh-connected-proposal-meta" aria-label="وضعیت پیشنهاد">
        <div>
          <small>وضعیت پرونده</small>
          <strong>{proposalStateLabels[proposal.state]}</strong>
        </div>
        <div>
          <small>نسخه فعال</small>
          <strong>{proposal.version.toLocaleString("fa-IR")}</strong>
        </div>
        <div>
          <small>آمادگی محتوا</small>
          <strong>{dirty ? "تغییرات ذخیره‌نشده" : "ذخیره‌شده روی سرور"}</strong>
        </div>
        <div>
          <small>شرایط فراخوان</small>
          <strong>{eligibility?.status === "eligible" ? "تأییدشده" : "نیازمند بررسی"}</strong>
        </div>
      </section>

      {fieldErrors.length > 0 && (
        <section
          className="rh-card rh-connected-readiness"
          role="alert"
          aria-label="موارد نیازمند اصلاح"
        >
          <h2>این موارد را اصلاح و دوباره ارسال کنید</h2>
          <ul>
            {fieldErrors.map((error) => (
              <li key={error.path}>{error.message}</li>
            ))}
          </ul>
        </section>
      )}

      {proposal.state === "clarification_requested" && openClarification && (
        <section className="rh-card rh-solver-flow-card rh-connected-flow-card">
          <h2>پاسخ به شفاف‌سازی</h2>
          <p>{openClarification.question}</p>
          <label>
            <span>پاسخ شما</span>
            <textarea
              rows={5}
              minLength={10}
              disabled={pending}
              value={clarificationResponse}
              onChange={(e) => setClarificationResponse(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending || clarificationResponse.trim().length < 10}
            onClick={() => {
              setPending(true);
              void gateways.proposals
                .submitClarification(proposal.id, {
                  expectedVersion: proposal.version,
                  clarificationId: openClarification.id,
                  response: clarificationResponse.trim(),
                })
                .then(async (result) => {
                  setPending(false);
                  setNoticeIsError(!result.ok);
                  setNotice(
                    result.ok
                      ? `پاسخ ثبت شد · شناسه همبستگی ${result.meta.correlation_id}`
                      : result.error.message,
                  );
                  if (result.ok) await load();
                });
            }}
          >
            ثبت پاسخ شفاف‌سازی
          </button>
        </section>
      )}

      {proposal.state === "revision_requested" && openRevision && (
        <section className="rh-card rh-solver-flow-card rh-connected-flow-card">
          <h2>درخواست اصلاح</h2>
          <p>{openRevision.scope}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void gateways.proposals
                .startRevision(proposal.id, {
                  expectedVersion: proposal.version,
                  revisionRequestId: openRevision.id,
                })
                .then(async (result) => {
                  setPending(false);
                  setNoticeIsError(!result.ok);
                  setNotice(
                    result.ok
                      ? `نسخه اصلاحی باز شد · شناسه همبستگی ${result.meta.correlation_id}`
                      : result.error.message,
                  );
                  if (result.ok) await load();
                });
            }}
          >
            شروع نسخه اصلاحی
          </button>
        </section>
      )}

      {editable && (
        <form
          className="rh-card rh-connected-proposal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void persist(false);
          }}
        >
          <header className="rh-connected-proposal-form__head">
            <div>
              <span>
                <Icon name="brief" />
              </span>
              <div>
                <small>نسخه قابل ویرایش</small>
                <h2>اطلاعات پیشنهاد</h2>
                <p>هر بخش را دقیق و قابل ارزیابی تکمیل کنید؛ فیلدهای ستاره‌دار الزامی‌اند.</p>
              </div>
            </div>
            <span className={!dirty && proposal.readiness.ready ? "is-ready" : "is-incomplete"}>
              {dirty || proposal.readiness.evaluated_version !== proposal.version
                ? "نیازمند بررسی سرور"
                : proposal.readiness.ready
                  ? "آماده ارسال"
                  : "پیش‌نویس ناقص"}
            </span>
          </header>

          <fieldset
            className="rh-connected-proposal-section"
            disabled={submitting || uncertainSubmit}
          >
            <legend>
              <span>
                <Icon name="brief" />
              </span>
              <span>
                <strong>مشخصات پایه</strong>
                <small>عنوان، بلوغ و زمان پیشنهادی راهکار</small>
              </span>
            </legend>
            <div className="rh-connected-proposal-section__grid">
              <label className="rh-connected-field is-wide">
                <span>عنوان پیشنهاد *</span>
                <input
                  required
                  minLength={5}
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="یک عنوان روشن و نتیجه‌محور"
                />
              </label>
              <label className="rh-connected-field">
                <span>مرحله بلوغ</span>
                <input
                  value={draft.maturity_level}
                  onChange={(e) => set("maturity_level", e.target.value)}
                  placeholder="برای نمونه: نمونه اولیه آزمایشگاهی"
                />
              </label>
              <label className="rh-connected-field">
                <span>زمان نمونه اولیه (هفته) *</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  required
                  value={draft.prototype_weeks}
                  onChange={(e) => set("prototype_weeks", e.target.value)}
                />
              </label>
              <label className="rh-connected-field">
                <span>مدت اجرا (هفته) *</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  required
                  value={draft.duration_weeks}
                  onChange={(e) => set("duration_weeks", e.target.value)}
                />
              </label>
              <label className="rh-connected-field is-wide">
                <span>وضعیت مالکیت فکری *</span>
                <input
                  required
                  value={draft.ip_status}
                  onChange={(e) => set("ip_status", e.target.value)}
                  placeholder="مالکیت، مجوزها یا محدودیت‌های موجود"
                />
              </label>
            </div>
          </fieldset>

          {proposalFieldSections.map((section) => (
            <fieldset
              className="rh-connected-proposal-section"
              key={section.title}
              disabled={submitting || uncertainSubmit}
            >
              <legend>
                <span>
                  <Icon name={section.icon} />
                </span>
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.description}</small>
                </span>
              </legend>
              <div className="rh-connected-proposal-section__grid">
                {section.fields.map(([label, field]) => (
                  <label
                    className={
                      fullWidthTextFields.has(field)
                        ? "rh-connected-field is-wide"
                        : "rh-connected-field"
                    }
                    key={field}
                  >
                    <span>
                      {label}
                      {requiredTextFields.has(field) ? " *" : ""}
                    </span>
                    <textarea
                      rows={fullWidthTextFields.has(field) ? 5 : 4}
                      value={draft[field]}
                      onChange={(e) => set(field, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset
            className="rh-connected-proposal-section"
            disabled={submitting || uncertainSubmit}
          >
            <legend>
              <span>
                <Icon name="location" />
              </span>
              <span>
                <strong>مبلغ پیشنهادی</strong>
                <small>برآورد اولیه؛ مدل پرداخت و جزئیات اجرا پس از انتخاب توافق می‌شود.</small>
              </span>
            </legend>
            <div className="rh-connected-proposal-section__grid">
              <label className="rh-connected-field">
                <span>بودجه پیشنهادی (ریال) *</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  required
                  value={
                    draft.budget_amount_minor === null
                      ? ""
                      : String(minorAmountToMajor(draft.budget_amount_minor))
                  }
                  onChange={(e) => set("budget_amount_minor", majorAmountToMinor(e.target.value))}
                />
              </label>
            </div>
          </fieldset>

          <fieldset
            className="rh-connected-proposal-section rh-connected-proposal-consents"
            disabled={submitting || uncertainSubmit}
          >
            <legend>
              <span>
                <Icon name="shield" />
              </span>
              <span>
                <strong>تأییدها و تعهدات</strong>
                <small>پیش از ارسال نهایی، وضعیت هر مورد را مشخص کنید.</small>
              </span>
            </legend>
            <div>
              {(
                [
                  ["nda_accepted", "شرایط محرمانگی را می‌پذیرم"],
                  ["conflict_declared", "وضعیت تعارض منافع را اعلام می‌کنم"],
                  ["ip_accepted", "شرایط مالکیت فکری را می‌پذیرم"],
                  ["accuracy_confirmed", "صحت اطلاعات و اختیار ارسال را تأیید می‌کنم"],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={draft[field]}
                    onChange={(e) => set(field, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <footer className="rh-connected-proposal-actions">
            <div>
              <strong>نسخه {proposal.version.toLocaleString("fa-IR")}</strong>
              <small>
                {uncertainSubmit
                  ? "نتیجه ارسال مشخص نیست؛ برای بررسی، ارسال را دوباره بزنید."
                  : "ذخیره پیش‌نویس ناقص هم ممکن است؛ ارسال نهایی تغییرات را خودکار ذخیره می‌کند."}
              </small>
            </div>
            <button
              className="rh-profile-outline"
              type="submit"
              formNoValidate
              disabled={pending || uncertainSubmit}
            >
              {pending ? "در حال ذخیره…" : "ذخیره نسخه"}
            </button>
            <button
              className="rh-profile-primary"
              type="button"
              disabled={pending || (!uncertainSubmit && eligibility?.status !== "eligible")}
              onClick={() => void persist(true)}
            >
              <Icon name="lock" />
              {proposal.state === "revision_draft" ? "ارسال نسخه اصلاحی" : "ارسال نهایی و قفل نسخه"}
            </button>
          </footer>
        </form>
      )}

      {!dirty &&
        proposal.readiness.evaluated_version === proposal.version &&
        !proposal.readiness.ready &&
        editable && (
          <section className="rh-card rh-connected-readiness" role="status">
            <header>
              <span>
                <Icon name="spark" />
              </span>
              <div>
                <small>کنترل آمادگی</small>
                <h2>موارد باقی‌مانده پیش از ارسال</h2>
              </div>
            </header>
            <ul>
              {proposal.readiness.issues.map((issue) => (
                <li key={issue.path}>{issue.message}</li>
              ))}
            </ul>
            <p>
              موارد بالا مربوط به نسخه ذخیره‌شده است. با ارسال نهایی، تغییرات ذخیره و روی سرور بررسی
              می‌شود.
            </p>
          </section>
        )}
      {eligibility && eligibility.status !== "eligible" && (
        <section className="rh-card rh-connected-eligibility-note">
          <span>
            <Icon name="shield" />
          </span>
          <div>
            <h2>شرایط ارسال کامل نیست</h2>
            {eligibility.reasons.map((reason) => (
              <p key={reason.code}>{reason.message}</p>
            ))}
          </div>
          <Link
            className="rh-profile-outline"
            href={`/app/solver/opportunities/record/?id=${encodeURIComponent(proposal.challenge_id)}`}
          >
            بررسی شرایط فراخوان
          </Link>
        </section>
      )}
      {notice && (
        <div className="rh-profile-toast" role={noticeIsError ? "alert" : "status"}>
          <Icon name={noticeIsError ? "notification" : "check"} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

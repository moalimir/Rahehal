"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import type {
  EligibilityDecisionResource,
  ProposalContentResource,
  ProposalResource,
} from "@rahhal/contracts";
import { majorAmountToMinor, minorAmountToMajor } from "@/lib/challenges/model";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import { proposalHref, readProposalRecordId } from "@/lib/workspace/proposal-navigation";

function parseRecordId(): string | null {
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  return readProposalRecordId(query);
}

function textList(value: string): string[] {
  return value
    .split(/[،,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
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
    title: "بودجه و مدل همکاری",
    description: "منطق بودجه و چارچوب پیشنهادی همکاری را شفاف کنید.",
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
  const gateways = runtime.workspaceGateways!;
  const [proposalId, setProposalId] = useState<string | null | undefined>(undefined);
  const [proposal, setProposal] = useState<ProposalResource | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityDecisionResource | null>(null);
  const [draft, setDraft] = useState<ProposalContentResource | null>(null);
  const [clarificationResponse, setClarificationResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => setProposalId(parseRecordId()), []);

  const load = useCallback(async () => {
    if (!proposalId) return;
    setLoading(true);
    const record = await gateways.proposals.get(proposalId);
    if (!record.ok) {
      setLoading(false);
      setProposal(null);
      setNotice(record.error.message);
      return;
    }
    const decision = await gateways.solverProfile.evaluateEligibility(record.data.challenge_id);
    setLoading(false);
    setProposal(record.data);
    setDraft(record.data.content);
    setEligibility(decision.ok ? decision.data : null);
    if (!decision.ok) setNotice(decision.error.message);
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

  const save = async () => {
    setPending(true);
    setNotice("");
    const result = await gateways.proposals.patch(proposal.id, {
      expectedVersion: proposal.version,
      patch: draft,
    });
    setPending(false);
    setNotice(
      result.ok
        ? `نسخه پیش‌نویس ذخیره شد · شناسه همبستگی ${result.meta.correlation_id}`
        : result.error.message,
    );
    if (result.ok) await load();
  };

  const submit = async () => {
    if (!eligibility || eligibility.status !== "eligible") {
      setNotice("شرایط ارسال این فضای کاری هنوز کامل نیست.");
      return;
    }
    setPending(true);
    const result =
      proposal.state === "revision_draft" && activeRevision
        ? await gateways.proposals.resubmit(proposal.id, {
            expectedVersion: proposal.version,
            revisionRequestId: activeRevision.id,
            acceptedChallengeVersionId: eligibility.evaluated_against_version_id,
          })
        : await gateways.proposals.submit(proposal.id, {
            expectedVersion: proposal.version,
            acceptedChallengeVersionId: eligibility.evaluated_against_version_id,
          });
    setPending(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    window.location.assign(proposalHref(`/app/solver/proposals/${proposal.id}/preview`));
  };

  return (
    <div className="rh-connected-proposal-editor">
      <header className="rh-profile-heading rh-connected-page-head rh-connected-proposal-head">
        <div>
          <small className="rh-connected-proposal-head__id">
            <bdi dir="ltr">{proposal.id}</bdi> · نسخه {proposal.version.toLocaleString("fa-IR")}
          </small>
          <h1>{editable ? "تدوین پیشنهاد" : "اقدام روی پیشنهاد"}</h1>
          <p>هر ذخیره یک نسخه سروری تازه می‌سازد؛ ارسال نهایی همان نسخه را قفل می‌کند.</p>
        </div>
        <Link
          className="rh-profile-outline"
          href={proposalHref(`/app/solver/proposals/${proposal.id}/preview`)}
        >
          <Icon name="eye" /> مشاهده پرونده
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
          <strong>{proposal.readiness.ready ? "آماده ارسال" : "نیازمند تکمیل"}</strong>
        </div>
        <div>
          <small>شرایط فراخوان</small>
          <strong>{eligibility?.status === "eligible" ? "تأییدشده" : "نیازمند بررسی"}</strong>
        </div>
      </section>

      {proposal.state === "clarification_requested" && openClarification && (
        <section className="rh-card rh-solver-flow-card rh-connected-flow-card">
          <h2>پاسخ به شفاف‌سازی</h2>
          <p>{openClarification.question}</p>
          <label>
            <span>پاسخ شما</span>
            <textarea
              rows={5}
              minLength={10}
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
            void save();
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
            <span className={proposal.readiness.ready ? "is-ready" : "is-incomplete"}>
              {proposal.readiness.ready ? "آماده ارسال" : "پیش‌نویس ناقص"}
            </span>
          </header>

          <fieldset className="rh-connected-proposal-section">
            <legend>
              <span>
                <Icon name="brief" />
              </span>
              <span>
                <strong>مشخصات پایه</strong>
                <small>عنوان، بلوغ، زمان و فناوری‌های اصلی راهکار</small>
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
                <span>فناوری‌ها</span>
                <input
                  value={draft.technologies.join("، ")}
                  onChange={(e) => set("technologies", textList(e.target.value))}
                  placeholder="با ویرگول جدا کنید"
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
            <fieldset className="rh-connected-proposal-section" key={section.title}>
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

          <fieldset className="rh-connected-proposal-section">
            <legend>
              <span>
                <Icon name="location" />
              </span>
              <span>
                <strong>برنامه همکاری و تحویل</strong>
                <small>محل اجرا، مسئول اصلی، ظرفیت و مدل مالی پیشنهادی</small>
              </span>
            </legend>
            <div className="rh-connected-proposal-section__grid">
              <label className="rh-connected-field">
                <span>محل پایلوت</span>
                <input
                  value={draft.pilot_location}
                  onChange={(e) => set("pilot_location", e.target.value)}
                />
              </label>
              <label className="rh-connected-field">
                <span>مسئول اصلی</span>
                <input value={draft.lead_name} onChange={(e) => set("lead_name", e.target.value)} />
              </label>
              <label className="rh-connected-field">
                <span>آمادگی شروع</span>
                <input
                  value={draft.start_availability}
                  onChange={(e) => set("start_availability", e.target.value)}
                />
              </label>
              <label className="rh-connected-field">
                <span>ظرفیت زمانی تیم</span>
                <input
                  value={draft.team_availability}
                  onChange={(e) => set("team_availability", e.target.value)}
                />
              </label>
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
              <label className="rh-connected-field">
                <span>مدل پرداخت</span>
                <input
                  value={draft.payment_model}
                  onChange={(e) => set("payment_model", e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rh-connected-proposal-section rh-connected-proposal-consents">
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
              <small>ابتدا ذخیره کنید تا آمادگی روی سرور دوباره محاسبه شود.</small>
            </div>
            <button className="rh-profile-outline" type="submit" disabled={pending}>
              {pending ? "در حال ذخیره…" : "ذخیره نسخه"}
            </button>
            <button
              className="rh-profile-primary"
              type="button"
              disabled={pending || !proposal.readiness.ready || eligibility?.status !== "eligible"}
              onClick={() => void submit()}
            >
              <Icon name="lock" />
              {proposal.state === "revision_draft" ? "ارسال نسخه اصلاحی" : "ارسال نهایی و قفل نسخه"}
            </button>
          </footer>
        </form>
      )}

      {!proposal.readiness.ready && editable && (
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
          <p>پس از تکمیل، ابتدا «ذخیره نسخه» را بزنید تا آمادگی دوباره روی سرور محاسبه شود.</p>
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
        <div className="rh-profile-toast" role="status">
          <Icon
            name={
              notice.includes("ثبت") || notice.includes("ذخیره") || notice.includes("باز شد")
                ? "check"
                : "notification"
            }
          />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

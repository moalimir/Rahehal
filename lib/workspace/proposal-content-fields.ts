import type { ProposalContentResource } from "@rahhal/contracts";

import { currencyLabels } from "@/domain/challenge";
import { formatMinorAmount } from "@/lib/challenges/model";

/**
 * How one submitted proposal reads, for both parties to it.
 *
 * The solver's record and the organization's record each hand-listed the fields
 * they showed, and they drifted: the organization saw eight of the thirty a
 * solver submits, and none of the four declarations C4 had required before it
 * would accept the submission. Nothing was being withheld on purpose -- the
 * server returns the whole content to a granted organization -- the two lists
 * had simply been written at different times.
 *
 * One definition removes the drift by construction, and `keyof` makes a new
 * content field fail the build here rather than appear on one page and not the
 * other. Both parties read the same submission, so both read the same fields.
 */
export type ProposalContentGroup = {
  readonly title: string;
  readonly rows: readonly ProposalContentRow[];
};

export type ProposalContentRow = {
  readonly label: string;
  /** The content key this row reads, for tests and for `keyof` coverage. */
  readonly field: keyof ProposalContentResource;
  readonly value: (content: ProposalContentResource) => string;
};

/** Persian and Arabic-Indic digits read as the digits the rest of a page uses. */
export function persianDigits(value: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
  return /^\d+$/.test(normalized.trim())
    ? Number(normalized).toLocaleString("fa-IR", { useGrouping: false })
    : value;
}

const text =
  (field: keyof ProposalContentResource) =>
  (content: ProposalContentResource): string =>
    String(content[field] ?? "").trim() || "ثبت نشده";

const weeks =
  (field: "prototype_weeks" | "duration_weeks") =>
  (content: ProposalContentResource): string =>
    content[field] ? `${persianDigits(content[field])} هفته` : "ثبت نشده";

/**
 * A declaration is evidence, not prose: it says whether the person accepted a
 * term the challenge required, so it reads as a plain yes or no rather than as
 * a checkbox the reader has to interpret.
 */
const declaration =
  (field: "nda_accepted" | "conflict_declared" | "ip_accepted" | "accuracy_confirmed") =>
  (content: ProposalContentResource): string =>
    content[field] ? "تأیید شده" : "تأیید نشده";

export const proposalContentGroups: readonly ProposalContentGroup[] = [
  {
    title: "مسئله و ارزش",
    rows: [
      { label: "بیان مسئله", field: "problem_statement", value: text("problem_statement") },
      { label: "ارزش پیشنهادی", field: "value_proposition", value: text("value_proposition") },
    ],
  },
  {
    title: "راهکار فنی",
    rows: [
      { label: "رویکرد فنی", field: "technical_approach", value: text("technical_approach") },
      { label: "معماری راهکار", field: "architecture", value: text("architecture") },
      {
        label: "فناوری‌ها",
        field: "technologies",
        value: (content) => content.technologies.join("، ") || "ثبت نشده",
      },
      { label: "سطح بلوغ راهکار", field: "maturity_level", value: text("maturity_level") },
      { label: "داده موردنیاز", field: "data_needs", value: text("data_needs") },
    ],
  },
  {
    title: "اجرا و زمان‌بندی",
    rows: [
      { label: "نقشه راه", field: "roadmap", value: text("roadmap") },
      { label: "زمان نمونه اولیه", field: "prototype_weeks", value: weeks("prototype_weeks") },
      { label: "زمان اجرا", field: "duration_weeks", value: weeks("duration_weeks") },
      { label: "پیش‌نیازها و وابستگی‌ها", field: "dependencies", value: text("dependencies") },
      { label: "محل اجرای پایلوت", field: "pilot_location", value: text("pilot_location") },
      { label: "زمان شروع", field: "start_availability", value: text("start_availability") },
      {
        label: "میزان در دسترس بودن تیم",
        field: "team_availability",
        value: text("team_availability"),
      },
    ],
  },
  {
    title: "سنجش و ریسک",
    rows: [
      { label: "معیارهای موفقیت", field: "success_metrics", value: text("success_metrics") },
      { label: "ریسک‌ها", field: "risks", value: text("risks") },
      { label: "برنامه کاهش ریسک", field: "mitigation", value: text("mitigation") },
    ],
  },
  {
    title: "تیم",
    rows: [
      { label: "سرپرست پیشنهاد", field: "lead_name", value: text("lead_name") },
      { label: "تیم اجرا", field: "team_summary", value: text("team_summary") },
      { label: "تجربه مرتبط", field: "relevant_experience", value: text("relevant_experience") },
    ],
  },
  {
    title: "بودجه",
    rows: [
      {
        label: "بودجه درخواستی",
        field: "budget_amount_minor",
        value: (content) =>
          content.budget_amount_minor === null
            ? "ثبت نشده"
            : `${formatMinorAmount(content.budget_amount_minor)} ${currencyLabels[content.budget_currency]}`,
      },
      { label: "مدل پرداخت", field: "payment_model", value: text("payment_model") },
      { label: "مبنای بودجه", field: "budget_rationale", value: text("budget_rationale") },
    ],
  },
  {
    // The declarations the challenge's own rule required before C4 would accept
    // the submission. The organization could not see them at all, so it could
    // not confirm the terms it set had actually been accepted.
    title: "مالکیت فکری و تعهدها",
    rows: [
      { label: "وضعیت مالکیت فکری", field: "ip_status", value: text("ip_status") },
      { label: "پذیرش محرمانگی", field: "nda_accepted", value: declaration("nda_accepted") },
      {
        label: "اعلام تعارض منافع",
        field: "conflict_declared",
        value: declaration("conflict_declared"),
      },
      { label: "پذیرش شرایط مالکیت فکری", field: "ip_accepted", value: declaration("ip_accepted") },
      {
        label: "تأیید صحت اطلاعات",
        field: "accuracy_confirmed",
        value: declaration("accuracy_confirmed"),
      },
    ],
  },
];

/**
 * Attachments are listed apart because they are references, not prose: private
 * object storage is G3 scope, so a submitted proposal carries file ids and no
 * file this phase can open.
 */
export function proposalAttachmentSummary(content: ProposalContentResource): readonly string[] {
  return content.attachment_ids.map((id) => String(id));
}

/** Every content key one of these groups renders, for coverage assertions. */
export const renderedProposalContentFields: ReadonlySet<keyof ProposalContentResource> = new Set(
  proposalContentGroups.flatMap((group) => group.rows.map((row) => row.field)),
);

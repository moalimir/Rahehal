import type { ProposalState } from "@rahhal/domain";

/** Persian labels for the canonical proposal lifecycle, shared by every surface. */
export const proposalStateLabels: Record<ProposalState, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  eligibility_review: "بررسی شرایط",
  eligible: "واجد شرایط",
  ineligible: "فاقد شرایط",
  clarification_requested: "نیازمند شفاف‌سازی",
  clarification_submitted: "شفاف‌سازی ارسال‌شده",
  reviewing: "در حال بررسی",
  revision_requested: "نیازمند اصلاح",
  revision_draft: "پیش‌نویس اصلاح",
  resubmitted: "اصلاحات ارسال‌شده",
  selected: "منتخب",
  rejected: "ردشده",
  withdrawn: "پس‌گرفته‌شده",
};

import type {
  DirectOfferState,
  MembershipState,
  TeamInvitationState,
  TeamMembershipRequestState,
  TeamStatus,
} from "@rahhal/domain";

export const directOfferStateLabels: Record<DirectOfferState, string> = {
  received: "دریافت‌شده",
  viewed: "مشاهده‌شده",
  response_draft: "پاسخ در حال تکمیل",
  response_submitted: "پاسخ ارسال‌شده",
  negotiating: "در حال مذاکره",
  selected: "منتخب",
  declined: "ردشده",
  expired: "منقضی‌شده",
  cancelled: "لغوشده",
};

export const membershipStateLabels: Record<MembershipState, string> = {
  invited: "دعوت‌شده",
  requested: "درخواست‌شده",
  active: "فعال",
  rejected: "ردشده",
  expired: "منقضی‌شده",
  suspended: "تعلیق‌شده",
  removed: "حذف‌شده",
};

export const teamStatusLabels: Record<TeamStatus, string> = {
  active: "فعال",
  archived: "بایگانی‌شده",
};

export const teamInvitationStateLabels: Record<TeamInvitationState, string> = {
  sent: "ارسال‌شده",
  viewed: "مشاهده‌شده",
  accepted: "پذیرفته‌شده",
  declined: "ردشده",
  expired: "منقضی‌شده",
  revoked: "لغوشده",
};

export const teamMembershipRequestStateLabels: Record<TeamMembershipRequestState, string> = {
  requested: "در انتظار بررسی",
  accepted: "پذیرفته‌شده",
  rejected: "ردشده",
  withdrawn: "پس‌گرفته‌شده",
  expired: "منقضی‌شده",
};

import type {
  DirectOfferState as CanonicalDirectOfferState,
  MembershipRequestState as CanonicalMembershipRequestState,
  ProposalState as CanonicalProposalState,
  TeamInvitationState as CanonicalTeamInvitationState,
  VerificationState as CanonicalVerificationState,
} from "@/domain/solver";

export type ProposalState = CanonicalProposalState;
export type DirectOfferState = CanonicalDirectOfferState;

export type Actor =
  | "solver"
  | "team-manager"
  | "owner"
  | "admin"
  | "proposal-manager"
  | "contributor"
  | "viewer"
  | "org"
  | "reviewer"
  | "ops"
  | "finance"
  | "legal";

export type Transition<State extends string> = {
  from: State;
  to: State;
  actors: readonly Actor[];
  preconditions: readonly string[];
  sideEffects: readonly string[];
  notification: string;
  audit: string;
  retry: "idempotent" | "manual-review" | "not-applicable";
};

export function canTransition<State extends string>(
  table: readonly Transition<State>[],
  from: State,
  to: State,
  actor: Actor,
  satisfied: readonly string[] = [],
) {
  const rule = table.find((item) => item.from === from && item.to === to);
  return Boolean(
    rule &&
      rule.actors.includes(actor) &&
      rule.preconditions.every((condition) => satisfied.includes(condition)),
  );
}

export type ChallengeState =
  | "draft"
  | "triage"
  | "approvals"
  | "published"
  | "evaluating"
  | "decided"
  | "contracting"
  | "pilot"
  | "closed";

export const challengeTransitions: readonly Transition<ChallengeState>[] = [
  {
    from: "draft",
    to: "triage",
    actors: ["org"],
    preconditions: ["brief-valid"],
    sideEffects: ["lock-intake-version"],
    notification: "مسئول غربالگری",
    audit: "challenge.triage.requested",
    retry: "idempotent",
  },
  {
    from: "triage",
    to: "approvals",
    actors: ["org", "ops"],
    preconditions: ["triage-passed"],
    sideEffects: ["create-approval-tasks"],
    notification: "تأییدکنندگان",
    audit: "challenge.approvals.requested",
    retry: "idempotent",
  },
  {
    from: "approvals",
    to: "published",
    actors: ["org", "ops"],
    preconditions: ["technical-approved", "legal-approved", "finance-approved"],
    sideEffects: ["publish-catalog-version", "create-receipt"],
    notification: "حل‌کنندگان مرتبط",
    audit: "challenge.published",
    retry: "idempotent",
  },
  {
    from: "published",
    to: "evaluating",
    actors: ["org"],
    preconditions: ["submission-window-closed"],
    sideEffects: ["freeze-submissions"],
    notification: "داوران",
    audit: "challenge.evaluation.started",
    retry: "idempotent",
  },
  {
    from: "evaluating",
    to: "decided",
    actors: ["org"],
    preconditions: ["reviews-complete", "decision-rationale"],
    sideEffects: ["lock-decision", "notify-solvers"],
    notification: "ارسال‌کنندگان پیشنهاد",
    audit: "challenge.decision.recorded",
    retry: "manual-review",
  },
  {
    from: "decided",
    to: "contracting",
    actors: ["org", "legal"],
    preconditions: ["winner-selected"],
    sideEffects: ["create-contract"],
    notification: "حل‌کننده منتخب",
    audit: "contract.created",
    retry: "idempotent",
  },
  {
    from: "contracting",
    to: "pilot",
    actors: ["org", "legal"],
    preconditions: ["contract-effective"],
    sideEffects: ["create-pilot-plan"],
    notification: "تیم پایلوت",
    audit: "pilot.started",
    retry: "idempotent",
  },
  {
    from: "pilot",
    to: "closed",
    actors: ["org"],
    preconditions: ["deliverables-resolved", "payments-reconciled"],
    sideEffects: ["publish-outcome"],
    notification: "ذی‌نفعان پرونده",
    audit: "challenge.closed",
    retry: "manual-review",
  },
];

export const proposalTransitions: readonly Transition<ProposalState>[] = [
  {
    from: "draft",
    to: "submitted",
    actors: ["solver", "team-manager"],
    preconditions: ["form-valid", "sender-authorized", "terms-accepted"],
    sideEffects: ["create-version", "lock-version", "create-receipt"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "eligibility_review",
    actors: ["org", "ops"],
    preconditions: ["submission-locked"],
    sideEffects: ["open-eligibility-review"],
    notification: "مالک پیشنهاد",
    audit: "proposal.eligibility.started",
    retry: "idempotent",
  },
  {
    from: "eligibility_review",
    to: "eligible",
    actors: ["org", "ops"],
    preconditions: ["eligibility-passed"],
    sideEffects: ["mark-eligible"],
    notification: "مالک پیشنهاد",
    audit: "proposal.eligible",
    retry: "manual-review",
  },
  {
    from: "eligibility_review",
    to: "ineligible",
    actors: ["org", "ops"],
    preconditions: ["eligibility-failed", "reason-recorded"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.ineligible",
    retry: "manual-review",
  },
  {
    from: "eligible",
    to: "clarification_requested",
    actors: ["org"],
    preconditions: ["question-recorded"],
    sideEffects: ["open-controlled-thread"],
    notification: "مالک پیشنهاد",
    audit: "proposal.clarification.requested",
    retry: "idempotent",
  },
  {
    from: "clarification_requested",
    to: "clarification_submitted",
    actors: ["solver", "owner", "admin", "proposal-manager"],
    preconditions: ["response-valid", "sender-authorized"],
    sideEffects: ["lock-clarification-response"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.clarification.submitted",
    retry: "idempotent",
  },
  {
    from: "clarification_submitted",
    to: "reviewing",
    actors: ["org"],
    preconditions: ["clarification-resolved"],
    sideEffects: ["open-review"],
    notification: "داوران",
    audit: "proposal.review.started",
    retry: "idempotent",
  },
  {
    from: "reviewing",
    to: "revision_requested",
    actors: ["org"],
    preconditions: ["revision-scope", "revision-deadline"],
    sideEffects: ["create-revision-draft"],
    notification: "مالک پیشنهاد",
    audit: "proposal.revision.requested",
    retry: "idempotent",
  },
  {
    from: "revision_requested",
    to: "revision_draft",
    actors: ["solver", "owner", "admin", "proposal-manager", "contributor"],
    preconditions: ["editor-authorized"],
    sideEffects: ["open-versioned-draft"],
    notification: "",
    audit: "proposal.revision.draft.created",
    retry: "idempotent",
  },
  {
    from: "revision_draft",
    to: "resubmitted",
    actors: ["solver", "owner", "admin", "proposal-manager"],
    preconditions: ["form-valid", "sender-authorized", "terms-accepted"],
    sideEffects: ["create-version", "lock-version", "create-receipt"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.resubmitted",
    retry: "idempotent",
  },
  {
    from: "resubmitted",
    to: "reviewing",
    actors: ["org", "ops"],
    preconditions: ["eligibility-passed"],
    sideEffects: ["open-review"],
    notification: "مالک پیشنهاد",
    audit: "proposal.review.resumed",
    retry: "idempotent",
  },
  {
    from: "reviewing",
    to: "selected",
    actors: ["org"],
    preconditions: ["reviews-complete", "decision-approved"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.selected",
    retry: "manual-review",
  },
  {
    from: "reviewing",
    to: "rejected",
    actors: ["org"],
    preconditions: ["reviews-complete", "decision-rationale"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.rejected",
    retry: "manual-review",
  },
];

export type InvitationState = "pending" | "accepted" | "declined" | "expired" | "cancelled";
export const invitationTransitions: readonly Transition<InvitationState>[] = [
  {
    from: "pending",
    to: "accepted",
    actors: ["solver", "team-manager"],
    preconditions: ["not-expired"],
    sideEffects: ["open-response-draft"],
    notification: "سازمان دعوت‌کننده",
    audit: "invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "declined",
    actors: ["solver", "team-manager"],
    preconditions: ["reason-recorded"],
    sideEffects: ["close-invitation"],
    notification: "سازمان دعوت‌کننده",
    audit: "invitation.declined",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["close-invitation"],
    notification: "دو طرف دعوت",
    audit: "invitation.expired",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "cancelled",
    actors: ["org"],
    preconditions: ["reason-recorded"],
    sideEffects: ["close-invitation"],
    notification: "دعوت‌شونده",
    audit: "invitation.cancelled",
    retry: "idempotent",
  },
];

export type TeamInvitationState = CanonicalTeamInvitationState;
export const teamInvitationTransitions: readonly Transition<TeamInvitationState>[] = [
  {
    from: "sent",
    to: "viewed",
    actors: ["solver"],
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["record-viewed-at"],
    notification: "",
    audit: "team-invitation.viewed",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "accepted",
    actors: ["solver"],
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["create-membership", "add-workspace"],
    notification: "مدیران تیم",
    audit: "team-invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "accepted",
    actors: ["solver"],
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["create-membership", "add-workspace"],
    notification: "مدیران تیم",
    audit: "team-invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "declined",
    actors: ["solver"],
    preconditions: ["recipient-authorized", "reason-recorded"],
    sideEffects: ["close-invitation"],
    notification: "مدیران تیم",
    audit: "team-invitation.declined",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "declined",
    actors: ["solver"],
    preconditions: ["recipient-authorized", "reason-recorded"],
    sideEffects: ["close-invitation"],
    notification: "مدیران تیم",
    audit: "team-invitation.declined",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "revoked",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["sender-authorized"],
    sideEffects: ["revoke-access-token"],
    notification: "دعوت‌شونده",
    audit: "team-invitation.revoked",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "revoked",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["sender-authorized"],
    sideEffects: ["revoke-access-token"],
    notification: "دعوت‌شونده",
    audit: "team-invitation.revoked",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["close-invitation"],
    notification: "دو طرف دعوت",
    audit: "team-invitation.expired",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["close-invitation"],
    notification: "دو طرف دعوت",
    audit: "team-invitation.expired",
    retry: "idempotent",
  },
];

export type MembershipRequestState = CanonicalMembershipRequestState;
export const membershipRequestTransitions: readonly Transition<MembershipRequestState>[] = [
  {
    from: "requested",
    to: "accepted",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["scope-approved"],
    sideEffects: ["create-membership", "update-roster"],
    notification: "متقاضی عضویت",
    audit: "membership-request.accepted",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "rejected",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["decision-confirmed"],
    sideEffects: ["close-request"],
    notification: "متقاضی عضویت",
    audit: "membership-request.rejected",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "withdrawn",
    actors: ["solver"],
    preconditions: ["requester-authorized"],
    sideEffects: ["close-request"],
    notification: "مدیران تیم",
    audit: "membership-request.withdrawn",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["close-request"],
    notification: "دو طرف درخواست",
    audit: "membership-request.expired",
    retry: "idempotent",
  },
];

export const directOfferTransitions: readonly Transition<DirectOfferState>[] = [
  {
    from: "received",
    to: "viewed",
    actors: ["solver", "owner", "admin", "proposal-manager", "contributor", "viewer"],
    preconditions: ["recipient-authorized"],
    sideEffects: ["record-viewed-at"],
    notification: "",
    audit: "direct-offer.viewed",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "response_draft",
    actors: ["solver", "owner", "admin", "proposal-manager", "contributor"],
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["create-response-draft"],
    notification: "",
    audit: "direct-offer.response.draft.created",
    retry: "idempotent",
  },
  {
    from: "response_draft",
    to: "response_submitted",
    actors: ["solver", "owner", "admin", "proposal-manager"],
    preconditions: ["response-valid", "sender-authorized", "not-expired"],
    sideEffects: ["lock-response-version", "create-receipt"],
    notification: "سازمان دعوت‌کننده",
    audit: "direct-offer.response.submitted",
    retry: "idempotent",
  },
  {
    from: "response_submitted",
    to: "negotiating",
    actors: ["org"],
    preconditions: ["negotiation-opened"],
    sideEffects: ["open-controlled-thread"],
    notification: "فضای دریافت‌کننده",
    audit: "direct-offer.negotiation.started",
    retry: "idempotent",
  },
  {
    from: "negotiating",
    to: "selected",
    actors: ["org"],
    preconditions: ["selection-approved"],
    sideEffects: ["create-case"],
    notification: "فضای دریافت‌کننده",
    audit: "direct-offer.selected",
    retry: "manual-review",
  },
  {
    from: "received",
    to: "declined",
    actors: ["solver", "owner", "admin", "proposal-manager"],
    preconditions: ["recipient-authorized", "reason-recorded"],
    sideEffects: ["close-offer"],
    notification: "سازمان دعوت‌کننده",
    audit: "direct-offer.declined",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "declined",
    actors: ["solver", "owner", "admin", "proposal-manager"],
    preconditions: ["recipient-authorized", "reason-recorded"],
    sideEffects: ["close-offer"],
    notification: "سازمان دعوت‌کننده",
    audit: "direct-offer.declined",
    retry: "idempotent",
  },
  {
    from: "received",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["close-offer"],
    notification: "طرفین دعوت",
    audit: "direct-offer.expired",
    retry: "idempotent",
  },
];

export type MembershipState =
  | "requested"
  | "invited"
  | "active"
  | "rejected"
  | "expired"
  | "suspended"
  | "removed";
export const membershipTransitions: readonly Transition<MembershipState>[] = [
  {
    from: "requested",
    to: "active",
    actors: ["team-manager"],
    preconditions: ["scope-approved"],
    sideEffects: ["grant-role"],
    notification: "متقاضی عضویت",
    audit: "membership.accepted",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "rejected",
    actors: ["team-manager"],
    preconditions: ["reason-recorded"],
    sideEffects: ["close-request"],
    notification: "متقاضی عضویت",
    audit: "membership.rejected",
    retry: "idempotent",
  },
  {
    from: "invited",
    to: "active",
    actors: ["solver"],
    preconditions: ["invite-valid"],
    sideEffects: ["grant-role"],
    notification: "مدیر تیم",
    audit: "membership.invite.accepted",
    retry: "idempotent",
  },
  {
    from: "invited",
    to: "expired",
    actors: ["ops"],
    preconditions: ["deadline-passed"],
    sideEffects: ["revoke-invite-token"],
    notification: "دعوت‌شونده و مدیر تیم",
    audit: "membership.invite.expired",
    retry: "idempotent",
  },
  {
    from: "active",
    to: "suspended",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["not-owner", "not-self"],
    sideEffects: ["revoke-active-access"],
    notification: "عضو تیم",
    audit: "membership.suspended",
    retry: "idempotent",
  },
  {
    from: "suspended",
    to: "active",
    actors: ["owner", "admin", "team-manager"],
    preconditions: ["restore-confirmed"],
    sideEffects: ["restore-role-access"],
    notification: "عضو تیم",
    audit: "membership.restored",
    retry: "idempotent",
  },
  {
    from: "active",
    to: "removed",
    actors: ["team-manager"],
    preconditions: ["not-last-manager", "active-work-transferred"],
    sideEffects: ["revoke-access"],
    notification: "عضو تیم",
    audit: "membership.removed",
    retry: "manual-review",
  },
];

export type ReviewState =
  | "coi-gate"
  | "accepted"
  | "draft"
  | "submitted"
  | "locked"
  | "invalidated";
export const reviewTransitions: readonly Transition<ReviewState>[] = [
  {
    from: "coi-gate",
    to: "accepted",
    actors: ["reviewer"],
    preconditions: ["coi-clear"],
    sideEffects: ["grant-material-access"],
    notification: "سازمان",
    audit: "review.assignment.accepted",
    retry: "idempotent",
  },
  {
    from: "accepted",
    to: "draft",
    actors: ["reviewer"],
    preconditions: ["materials-authorized"],
    sideEffects: ["create-score-draft"],
    notification: "",
    audit: "review.draft.created",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "submitted",
    actors: ["reviewer"],
    preconditions: ["scores-valid", "rationale-valid"],
    sideEffects: ["freeze-score", "create-receipt"],
    notification: "سازمان",
    audit: "review.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "locked",
    actors: ["ops"],
    preconditions: ["receipt-valid"],
    sideEffects: ["lock-score"],
    notification: "داور",
    audit: "review.locked",
    retry: "idempotent",
  },
  {
    from: "locked",
    to: "invalidated",
    actors: ["ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["exclude-score", "reopen-assignment"],
    notification: "داور و سازمان",
    audit: "review.invalidated",
    retry: "manual-review",
  },
];

export type ContractState =
  | "draft"
  | "negotiation"
  | "approval"
  | "signature"
  | "effective"
  | "rejected"
  | "superseded";
export const contractTransitions: readonly Transition<ContractState>[] = [
  {
    from: "draft",
    to: "negotiation",
    actors: ["org", "legal", "solver", "owner", "admin"],
    preconditions: ["scope-defined"],
    sideEffects: ["create-version"],
    notification: "طرفین قرارداد",
    audit: "contract.negotiation.started",
    retry: "idempotent",
  },
  {
    from: "negotiation",
    to: "approval",
    actors: ["org", "legal", "solver", "owner", "admin"],
    preconditions: ["terms-agreed", "ip-agreed"],
    sideEffects: ["freeze-version"],
    notification: "تأییدکنندگان",
    audit: "contract.approval.requested",
    retry: "idempotent",
  },
  {
    from: "approval",
    to: "signature",
    actors: ["legal", "finance", "solver", "owner", "admin"],
    preconditions: ["legal-approved", "finance-approved"],
    sideEffects: ["open-signature"],
    notification: "امضاکنندگان",
    audit: "contract.signature.requested",
    retry: "idempotent",
  },
  {
    from: "signature",
    to: "effective",
    actors: ["legal", "solver", "owner", "admin"],
    preconditions: ["approved-current-version"],
    sideEffects: ["activate-contract"],
    notification: "طرفین قرارداد",
    audit: "contract.effective",
    retry: "manual-review",
  },
];

export type VerificationState = CanonicalVerificationState;
export const verificationTransitions: readonly Transition<VerificationState>[] = [
  {
    from: "not_started",
    to: "draft",
    actors: ["solver", "owner", "admin"],
    preconditions: [],
    sideEffects: ["create-document-checklist"],
    notification: "",
    audit: "verification.draft.created",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "submitted",
    actors: ["solver", "owner", "admin"],
    preconditions: ["documents-valid"],
    sideEffects: ["lock-submission", "create-receipt"],
    notification: "عملیات",
    audit: "verification.submitted",
    retry: "idempotent",
  },
  {
    from: "needs_revision",
    to: "submitted",
    actors: ["solver", "owner", "admin"],
    preconditions: ["documents-valid", "revision-addressed"],
    sideEffects: ["create-revision", "create-receipt"],
    notification: "عملیات",
    audit: "verification.resubmitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "under_review",
    actors: ["ops"],
    preconditions: ["submission-locked"],
    sideEffects: ["open-review"],
    notification: "فضای متقاضی",
    audit: "verification.review.started",
    retry: "idempotent",
  },
  {
    from: "under_review",
    to: "verified",
    actors: ["ops"],
    preconditions: ["evidence-approved"],
    sideEffects: ["issue-verification-evidence"],
    notification: "فضای متقاضی",
    audit: "verification.verified",
    retry: "manual-review",
  },
  {
    from: "under_review",
    to: "needs_revision",
    actors: ["ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["open-revision"],
    notification: "فضای متقاضی",
    audit: "verification.revision.requested",
    retry: "manual-review",
  },
  {
    from: "under_review",
    to: "rejected",
    actors: ["ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["lock-outcome"],
    notification: "فضای متقاضی",
    audit: "verification.rejected",
    retry: "manual-review",
  },
];

export type PilotState =
  | "planned"
  | "running"
  | "deliverable-submitted"
  | "accepted"
  | "revision"
  | "rejected";
export const pilotTransitions: readonly Transition<PilotState>[] = [
  {
    from: "planned",
    to: "running",
    actors: ["org", "team-manager"],
    preconditions: ["contract-effective", "plan-approved"],
    sideEffects: ["start-milestones"],
    notification: "تیم پایلوت",
    audit: "pilot.running",
    retry: "idempotent",
  },
  {
    from: "running",
    to: "deliverable-submitted",
    actors: ["solver", "team-manager"],
    preconditions: ["deliverable-valid"],
    sideEffects: ["create-deliverable-version"],
    notification: "پذیرنده فنی",
    audit: "deliverable.submitted",
    retry: "idempotent",
  },
  {
    from: "deliverable-submitted",
    to: "accepted",
    actors: ["org"],
    preconditions: ["technical-evidence-approved"],
    sideEffects: ["mark-technical-acceptance"],
    notification: "حل‌کننده و مالی",
    audit: "deliverable.accepted",
    retry: "manual-review",
  },
  {
    from: "deliverable-submitted",
    to: "revision",
    actors: ["org"],
    preconditions: ["reason-recorded", "revision-deadline"],
    sideEffects: ["open-deliverable-revision"],
    notification: "حل‌کننده",
    audit: "deliverable.revision.requested",
    retry: "idempotent",
  },
  {
    from: "deliverable-submitted",
    to: "rejected",
    actors: ["org"],
    preconditions: ["reason-recorded"],
    sideEffects: ["close-deliverable"],
    notification: "حل‌کننده و مالی",
    audit: "deliverable.rejected",
    retry: "manual-review",
  },
];

export type PaymentState =
  | "triggered"
  | "approval"
  | "processing"
  | "paid"
  | "reconciled"
  | "hold"
  | "failed"
  | "refunded";
export const paymentTransitions: readonly Transition<PaymentState>[] = [
  {
    from: "triggered",
    to: "approval",
    actors: ["org"],
    preconditions: ["technical-accepted"],
    sideEffects: ["create-finance-task"],
    notification: "مالی",
    audit: "payment.approval.requested",
    retry: "idempotent",
  },
  {
    from: "approval",
    to: "processing",
    actors: ["finance"],
    preconditions: ["finance-approved", "contract-effective"],
    sideEffects: ["create-payment-attempt"],
    notification: "حل‌کننده",
    audit: "payment.processing",
    retry: "idempotent",
  },
  {
    from: "processing",
    to: "paid",
    actors: ["finance"],
    preconditions: ["provider-confirmed"],
    sideEffects: ["create-payment-receipt"],
    notification: "طرفین قرارداد",
    audit: "payment.paid",
    retry: "idempotent",
  },
  {
    from: "paid",
    to: "reconciled",
    actors: ["finance"],
    preconditions: ["ledger-matched"],
    sideEffects: ["close-financial-gate"],
    notification: "سازمان",
    audit: "payment.reconciled",
    retry: "manual-review",
  },
  {
    from: "approval",
    to: "hold",
    actors: ["finance", "ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["freeze-payment"],
    notification: "طرفین قرارداد",
    audit: "payment.held",
    retry: "manual-review",
  },
  {
    from: "processing",
    to: "failed",
    actors: ["finance", "ops"],
    preconditions: ["provider-failed"],
    sideEffects: ["record-failure-code"],
    notification: "مالی",
    audit: "payment.failed",
    retry: "idempotent",
  },
  {
    from: "paid",
    to: "refunded",
    actors: ["finance", "ops"],
    preconditions: ["refund-approved"],
    sideEffects: ["create-refund-receipt"],
    notification: "طرفین قرارداد",
    audit: "payment.refunded",
    retry: "manual-review",
  },
];

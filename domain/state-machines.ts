import type {
  MembershipRequestState as CanonicalMembershipRequestState,
  ProposalState as CanonicalProposalState,
  TeamInvitationState as CanonicalTeamInvitationState,
  VerificationState as CanonicalVerificationState,
} from "@/domain/solver";
import {
  canTransition,
  challengeTransitions,
  directOfferTransitions,
  proposalTransitions,
  teamRole,
  type ChallengeStage,
  type Transition,
} from "@rahhal/domain";

export { canTransition, challengeTransitions, directOfferTransitions, proposalTransitions };
export type ChallengeState = ChallengeStage;

export type ProposalState = CanonicalProposalState;
export type { DirectOfferState } from "@rahhal/domain";

const individualActors = ["individual"] as const;
const organizationMembers = ["org:member"] as const;
const platformOperations = ["platform:ops"] as const;
const platformReviewers = ["platform:reviewer"] as const;
const technicalApprovers = ["org:approver_technical"] as const;
const financeActors = ["platform:finance"] as const;
const financeOrOperations = ["platform:finance", "platform:ops"] as const;
const teamManagers = [teamRole.owner, teamRole.admin] as const;
const solverManagers = ["individual", ...teamManagers] as const;
const reasonRecorded = ["reason-recorded"] as const;
const deadlinePassed = ["deadline-passed"] as const;
const recipientAuthorizedAndActive = ["recipient-authorized", "not-expired"] as const;
const recipientAuthorizedWithReason = ["recipient-authorized", "reason-recorded"] as const;
const closeInvitation = ["close-invitation"] as const;
const closeRequest = ["close-request"] as const;
const lockOutcome = ["lock-outcome"] as const;
const openReview = ["open-review"] as const;

export type InvitationState = "pending" | "accepted" | "declined" | "expired" | "cancelled";
export const invitationTransitions: readonly Transition<InvitationState>[] = [
  {
    from: "pending",
    to: "accepted",
    roles: solverManagers,
    preconditions: ["not-expired"],
    sideEffects: ["open-response-draft"],
    notification: "سازمان دعوت‌کننده",
    audit: "invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "declined",
    roles: solverManagers,
    preconditions: reasonRecorded,
    sideEffects: closeInvitation,
    notification: "سازمان دعوت‌کننده",
    audit: "invitation.declined",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "expired",
    roles: platformOperations,
    preconditions: deadlinePassed,
    sideEffects: closeInvitation,
    notification: "دو طرف دعوت",
    audit: "invitation.expired",
    retry: "idempotent",
  },
  {
    from: "pending",
    to: "cancelled",
    roles: organizationMembers,
    preconditions: reasonRecorded,
    sideEffects: closeInvitation,
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
    roles: individualActors,
    preconditions: recipientAuthorizedAndActive,
    sideEffects: ["record-viewed-at"],
    notification: "",
    audit: "team-invitation.viewed",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "accepted",
    roles: individualActors,
    preconditions: recipientAuthorizedAndActive,
    sideEffects: ["create-membership", "add-workspace"],
    notification: "مدیران تیم",
    audit: "team-invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "accepted",
    roles: individualActors,
    preconditions: recipientAuthorizedAndActive,
    sideEffects: ["create-membership", "add-workspace"],
    notification: "مدیران تیم",
    audit: "team-invitation.accepted",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "declined",
    roles: individualActors,
    preconditions: recipientAuthorizedWithReason,
    sideEffects: closeInvitation,
    notification: "مدیران تیم",
    audit: "team-invitation.declined",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "declined",
    roles: individualActors,
    preconditions: recipientAuthorizedWithReason,
    sideEffects: closeInvitation,
    notification: "مدیران تیم",
    audit: "team-invitation.declined",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "revoked",
    roles: teamManagers,
    preconditions: ["sender-authorized"],
    sideEffects: ["revoke-access-token"],
    notification: "دعوت‌شونده",
    audit: "team-invitation.revoked",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "revoked",
    roles: teamManagers,
    preconditions: ["sender-authorized"],
    sideEffects: ["revoke-access-token"],
    notification: "دعوت‌شونده",
    audit: "team-invitation.revoked",
    retry: "idempotent",
  },
  {
    from: "sent",
    to: "expired",
    roles: platformOperations,
    preconditions: deadlinePassed,
    sideEffects: closeInvitation,
    notification: "دو طرف دعوت",
    audit: "team-invitation.expired",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "expired",
    roles: platformOperations,
    preconditions: deadlinePassed,
    sideEffects: closeInvitation,
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
    roles: teamManagers,
    preconditions: ["scope-approved"],
    sideEffects: ["create-membership", "update-roster"],
    notification: "متقاضی عضویت",
    audit: "membership-request.accepted",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "rejected",
    roles: teamManagers,
    preconditions: ["decision-confirmed"],
    sideEffects: closeRequest,
    notification: "متقاضی عضویت",
    audit: "membership-request.rejected",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "withdrawn",
    roles: individualActors,
    preconditions: ["requester-authorized"],
    sideEffects: closeRequest,
    notification: "مدیران تیم",
    audit: "membership-request.withdrawn",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "expired",
    roles: platformOperations,
    preconditions: deadlinePassed,
    sideEffects: closeRequest,
    notification: "دو طرف درخواست",
    audit: "membership-request.expired",
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
    roles: teamManagers,
    preconditions: ["scope-approved"],
    sideEffects: ["grant-role"],
    notification: "متقاضی عضویت",
    audit: "membership.accepted",
    retry: "idempotent",
  },
  {
    from: "requested",
    to: "rejected",
    roles: teamManagers,
    preconditions: reasonRecorded,
    sideEffects: closeRequest,
    notification: "متقاضی عضویت",
    audit: "membership.rejected",
    retry: "idempotent",
  },
  {
    from: "invited",
    to: "active",
    roles: individualActors,
    preconditions: ["invite-valid"],
    sideEffects: ["grant-role"],
    notification: "مدیر تیم",
    audit: "membership.invite.accepted",
    retry: "idempotent",
  },
  {
    from: "invited",
    to: "expired",
    roles: platformOperations,
    preconditions: deadlinePassed,
    sideEffects: ["revoke-invite-token"],
    notification: "دعوت‌شونده و مدیر تیم",
    audit: "membership.invite.expired",
    retry: "idempotent",
  },
  {
    from: "active",
    to: "suspended",
    roles: teamManagers,
    preconditions: ["not-owner", "not-self"],
    sideEffects: ["revoke-active-access"],
    notification: "عضو تیم",
    audit: "membership.suspended",
    retry: "idempotent",
  },
  {
    from: "suspended",
    to: "active",
    roles: teamManagers,
    preconditions: ["restore-confirmed"],
    sideEffects: ["restore-role-access"],
    notification: "عضو تیم",
    audit: "membership.restored",
    retry: "idempotent",
  },
  {
    from: "active",
    to: "removed",
    roles: teamManagers,
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
    roles: platformReviewers,
    preconditions: ["coi-clear"],
    sideEffects: ["grant-material-access"],
    notification: "سازمان",
    audit: "review.assignment.accepted",
    retry: "idempotent",
  },
  {
    from: "accepted",
    to: "draft",
    roles: platformReviewers,
    preconditions: ["materials-authorized"],
    sideEffects: ["create-score-draft"],
    notification: "",
    audit: "review.draft.created",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "submitted",
    roles: platformReviewers,
    preconditions: ["scores-valid", "rationale-valid"],
    sideEffects: ["freeze-score", "create-receipt"],
    notification: "سازمان",
    audit: "review.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "locked",
    roles: platformOperations,
    preconditions: ["receipt-valid"],
    sideEffects: ["lock-score"],
    notification: "داور",
    audit: "review.locked",
    retry: "idempotent",
  },
  {
    from: "locked",
    to: "invalidated",
    roles: platformOperations,
    preconditions: reasonRecorded,
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
    roles: [
      "org:owner",
      "org:approver_legal",
      "platform:legal",
      "individual",
      "team:owner",
      "team:admin",
    ],
    preconditions: ["scope-defined"],
    sideEffects: ["create-version"],
    notification: "طرفین قرارداد",
    audit: "contract.negotiation.started",
    retry: "idempotent",
  },
  {
    from: "negotiation",
    to: "approval",
    roles: [
      "org:owner",
      "org:approver_legal",
      "platform:legal",
      "individual",
      "team:owner",
      "team:admin",
    ],
    preconditions: ["terms-agreed", "ip-agreed"],
    sideEffects: ["freeze-version"],
    notification: "تأییدکنندگان",
    audit: "contract.approval.requested",
    retry: "idempotent",
  },
  {
    from: "approval",
    to: "signature",
    roles: [
      "org:owner",
      "org:approver_legal",
      "org:approver_finance",
      "platform:legal",
      "platform:finance",
      "individual",
      "team:owner",
      "team:admin",
    ],
    preconditions: ["legal-approved", "finance-approved"],
    sideEffects: ["open-signature"],
    notification: "امضاکنندگان",
    audit: "contract.signature.requested",
    retry: "idempotent",
  },
  {
    from: "signature",
    to: "effective",
    roles: ["platform:legal", "individual", "team:owner", "team:admin"],
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
    roles: solverManagers,
    preconditions: [],
    sideEffects: ["create-document-checklist"],
    notification: "",
    audit: "verification.draft.created",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "submitted",
    roles: solverManagers,
    preconditions: ["documents-valid"],
    sideEffects: ["lock-submission", "create-receipt"],
    notification: "عملیات",
    audit: "verification.submitted",
    retry: "idempotent",
  },
  {
    from: "needs_revision",
    to: "submitted",
    roles: solverManagers,
    preconditions: ["documents-valid", "revision-addressed"],
    sideEffects: ["create-revision", "create-receipt"],
    notification: "عملیات",
    audit: "verification.resubmitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "under_review",
    roles: platformOperations,
    preconditions: ["submission-locked"],
    sideEffects: openReview,
    notification: "فضای متقاضی",
    audit: "verification.review.started",
    retry: "idempotent",
  },
  {
    from: "under_review",
    to: "verified",
    roles: platformOperations,
    preconditions: ["evidence-approved"],
    sideEffects: ["issue-verification-evidence"],
    notification: "فضای متقاضی",
    audit: "verification.verified",
    retry: "manual-review",
  },
  {
    from: "under_review",
    to: "needs_revision",
    roles: platformOperations,
    preconditions: reasonRecorded,
    sideEffects: ["open-revision"],
    notification: "فضای متقاضی",
    audit: "verification.revision.requested",
    retry: "manual-review",
  },
  {
    from: "under_review",
    to: "rejected",
    roles: platformOperations,
    preconditions: reasonRecorded,
    sideEffects: lockOutcome,
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
    roles: ["org:member", "team:owner", "team:admin"],
    preconditions: ["contract-effective", "plan-approved"],
    sideEffects: ["start-milestones"],
    notification: "تیم پایلوت",
    audit: "pilot.running",
    retry: "idempotent",
  },
  {
    from: "running",
    to: "deliverable-submitted",
    roles: solverManagers,
    preconditions: ["deliverable-valid"],
    sideEffects: ["create-deliverable-version"],
    notification: "پذیرنده فنی",
    audit: "deliverable.submitted",
    retry: "idempotent",
  },
  {
    from: "deliverable-submitted",
    to: "accepted",
    roles: technicalApprovers,
    preconditions: ["technical-evidence-approved"],
    sideEffects: ["mark-technical-acceptance"],
    notification: "حل‌کننده و مالی",
    audit: "deliverable.accepted",
    retry: "manual-review",
  },
  {
    from: "deliverable-submitted",
    to: "revision",
    roles: technicalApprovers,
    preconditions: ["reason-recorded", "revision-deadline"],
    sideEffects: ["open-deliverable-revision"],
    notification: "حل‌کننده",
    audit: "deliverable.revision.requested",
    retry: "idempotent",
  },
  {
    from: "deliverable-submitted",
    to: "rejected",
    roles: technicalApprovers,
    preconditions: reasonRecorded,
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
    roles: technicalApprovers,
    preconditions: ["technical-accepted"],
    sideEffects: ["create-finance-task"],
    notification: "مالی",
    audit: "payment.approval.requested",
    retry: "idempotent",
  },
  {
    from: "approval",
    to: "processing",
    roles: ["org:approver_finance", "platform:finance"],
    preconditions: ["finance-approved", "contract-effective"],
    sideEffects: ["create-payment-attempt"],
    notification: "حل‌کننده",
    audit: "payment.processing",
    retry: "idempotent",
  },
  {
    from: "processing",
    to: "paid",
    roles: financeActors,
    preconditions: ["provider-confirmed"],
    sideEffects: ["create-payment-receipt"],
    notification: "طرفین قرارداد",
    audit: "payment.paid",
    retry: "idempotent",
  },
  {
    from: "paid",
    to: "reconciled",
    roles: financeActors,
    preconditions: ["ledger-matched"],
    sideEffects: ["close-financial-gate"],
    notification: "سازمان",
    audit: "payment.reconciled",
    retry: "manual-review",
  },
  {
    from: "approval",
    to: "hold",
    roles: financeOrOperations,
    preconditions: reasonRecorded,
    sideEffects: ["freeze-payment"],
    notification: "طرفین قرارداد",
    audit: "payment.held",
    retry: "manual-review",
  },
  {
    from: "processing",
    to: "failed",
    roles: financeOrOperations,
    preconditions: ["provider-failed"],
    sideEffects: ["record-failure-code"],
    notification: "مالی",
    audit: "payment.failed",
    retry: "idempotent",
  },
  {
    from: "paid",
    to: "refunded",
    roles: financeOrOperations,
    preconditions: ["refund-approved"],
    sideEffects: ["create-refund-receipt"],
    notification: "طرفین قرارداد",
    audit: "payment.refunded",
    retry: "manual-review",
  },
];

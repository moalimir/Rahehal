import { currencies, type Currency, type Transition } from "./challenge.js";
import type {
  ChallengeId,
  ChallengeVersionId,
  DirectOfferId,
  FileId,
  OfferResponseId,
  SavedOpportunityId,
  TenantId,
  WorkspaceId,
} from "./id.js";

export const directOfferStates = [
  "received",
  "viewed",
  "response_draft",
  "response_submitted",
  "negotiating",
  "selected",
  "declined",
  "expired",
  "cancelled",
] as const;
export type DirectOfferState = (typeof directOfferStates)[number];

export const offerResponseStates = ["draft", "submitted"] as const;
export type OfferResponseState = (typeof offerResponseStates)[number];

export const directOfferOpenResponseStates = ["received", "viewed", "response_draft"] as const;
export type DirectOfferOpenResponseState = (typeof directOfferOpenResponseStates)[number];

export function isDirectOfferState(value: unknown): value is DirectOfferState {
  return directOfferStates.includes(value as DirectOfferState);
}

export function isOfferResponseState(value: unknown): value is OfferResponseState {
  return offerResponseStates.includes(value as OfferResponseState);
}

export function isDirectOfferOpenForResponse(
  state: DirectOfferState,
): state is DirectOfferOpenResponseState {
  return (directOfferOpenResponseStates as readonly DirectOfferState[]).includes(state);
}

const recipientViewers = [
  "individual",
  "team:owner",
  "team:admin",
  "team:proposal-manager",
  "team:contributor",
  "team:viewer",
] as const;
const recipientContributors = recipientViewers.filter((role) => role !== "team:viewer");
const recipientSubmitters = recipientContributors.filter((role) => role !== "team:contributor");
const organizationOfferManagers = ["org:owner", "org:member"] as const;

/**
 * The canonical C6 offer machine. Expiry includes an in-progress response
 * draft because server time, rather than a previously opened browser form,
 * decides whether submission is still possible. Selection is intentionally a
 * later command: its canonical side effect is case creation.
 */
export const directOfferTransitions = [
  {
    from: "received",
    to: "viewed",
    roles: recipientViewers,
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["record-viewed-at"],
    notification: "",
    audit: "direct-offer.viewed",
    retry: "idempotent",
  },
  {
    from: "viewed",
    to: "response_draft",
    roles: recipientContributors,
    preconditions: ["recipient-authorized", "not-expired"],
    sideEffects: ["create-response-draft"],
    notification: "",
    audit: "direct-offer.response.draft.created",
    retry: "idempotent",
  },
  {
    from: "response_draft",
    to: "response_submitted",
    roles: recipientSubmitters,
    preconditions: ["response-valid", "recipient-authorized", "not-expired"],
    sideEffects: ["lock-response", "create-receipt"],
    notification: "سازمان دعوت‌کننده",
    audit: "direct-offer.response.submitted",
    retry: "idempotent",
  },
  {
    from: "response_submitted",
    to: "negotiating",
    roles: organizationOfferManagers,
    preconditions: ["sender-authorized"],
    sideEffects: ["open-controlled-thread"],
    notification: "فضای دریافت‌کننده",
    audit: "direct-offer.negotiation.started",
    retry: "idempotent",
  },
  {
    from: "negotiating",
    to: "selected",
    roles: organizationOfferManagers,
    preconditions: ["selection-approved"],
    sideEffects: ["create-case"],
    notification: "فضای دریافت‌کننده",
    audit: "direct-offer.selected",
    retry: "manual-review",
  },
  ...(["received", "viewed", "response_draft"] as const).map(
    (from): Transition<DirectOfferState> => ({
      from,
      to: "declined",
      roles: recipientSubmitters,
      preconditions: ["recipient-authorized", "reason-recorded"],
      sideEffects: ["close-offer", "revoke-grants"],
      notification: "سازمان دعوت‌کننده",
      audit: "direct-offer.declined",
      retry: "idempotent",
    }),
  ),
  ...(["received", "viewed", "response_draft"] as const).map(
    (from): Transition<DirectOfferState> => ({
      from,
      to: "expired",
      roles: ["platform:ops"],
      preconditions: ["deadline-passed"],
      sideEffects: ["close-offer", "expire-grants"],
      notification: "طرفین دعوت",
      audit: "direct-offer.expired",
      retry: "idempotent",
    }),
  ),
  ...(["received", "viewed", "response_draft", "response_submitted", "negotiating"] as const).map(
    (from): Transition<DirectOfferState> => ({
      from,
      to: "cancelled",
      roles: organizationOfferManagers,
      preconditions: ["sender-authorized", "reason-recorded"],
      sideEffects: ["close-offer", "revoke-grants"],
      notification: "فضای دریافت‌کننده",
      audit: "direct-offer.cancelled",
      retry: "idempotent",
    }),
  ),
] as const satisfies readonly Transition<DirectOfferState>[];

export const opportunityOutboxEventTypes = [
  "opportunity.saved",
  "opportunity.unsaved",
  "direct-offer.sent",
  "direct-offer.viewed",
  "direct-offer.response.draft.created",
  "direct-offer.response.draft.updated",
  "direct-offer.response.submitted",
  "direct-offer.negotiation.started",
  "direct-offer.selected",
  "direct-offer.declined",
  "direct-offer.cancelled",
  "direct-offer.expired",
] as const;
export type OpportunityOutboxEventType = (typeof opportunityOutboxEventTypes)[number];

export type OfferResponseContent = {
  readonly approach: string;
  readonly scope: string;
  readonly startAvailability: string;
  readonly durationWeeks: number | null;
  readonly budgetAmountMinor: number | null;
  readonly budgetCurrency: Currency;
  readonly paymentModel: string;
  readonly negotiables: string;
  readonly authorityConfirmed: boolean;
  readonly attachmentIds: readonly FileId[];
};

export type OfferResponseReadinessIssue = {
  readonly path: string;
  readonly code: "required" | "min_length" | "format";
  readonly message: string;
};

export type OfferResponseReadiness = {
  readonly ready: boolean;
  readonly issues: readonly OfferResponseReadinessIssue[];
};

export function evaluateOfferResponseReadiness(
  content: OfferResponseContent,
): OfferResponseReadiness {
  const issues: OfferResponseReadinessIssue[] = [];
  const requireLength = (path: string, value: string, minimum: number) => {
    if (value.trim().length < minimum) {
      issues.push({
        path,
        code: "min_length",
        message: `دست‌کم ${minimum} نویسه وارد کنید.`,
      });
    }
  };
  requireLength("/response/approach", content.approach, 60);
  requireLength("/response/scope", content.scope, 60);
  requireLength("/response/start_availability", content.startAvailability, 1);
  requireLength("/response/payment_model", content.paymentModel, 1);
  if (
    content.durationWeeks === null ||
    !Number.isSafeInteger(content.durationWeeks) ||
    content.durationWeeks < 1 ||
    content.durationWeeks > 520
  ) {
    issues.push({
      path: "/response/duration_weeks",
      code: "format",
      message: "مدت اجرا را به صورت عدد صحیح بین ۱ تا ۵۲۰ هفته وارد کنید.",
    });
  }
  if (
    content.budgetAmountMinor === null ||
    !Number.isSafeInteger(content.budgetAmountMinor) ||
    content.budgetAmountMinor < 0
  ) {
    issues.push({
      path: "/response/budget_amount_minor",
      code: "format",
      message: "مبلغ را به صورت عدد صحیح و غیرمنفی در واحد فرعی ارز وارد کنید.",
    });
  }
  if (!currencies.includes(content.budgetCurrency)) {
    issues.push({
      path: "/response/budget_currency",
      code: "format",
      message: "ارز انتخاب‌شده پشتیبانی نمی‌شود.",
    });
  }
  if (!content.authorityConfirmed) {
    issues.push({
      path: "/response/authority_confirmed",
      code: "required",
      message: "اختیار ارسال پاسخ را تأیید کنید.",
    });
  }
  return { ready: issues.length === 0, issues };
}

export type SavedOpportunity = {
  readonly id: SavedOpportunityId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly challengeId: ChallengeId;
  readonly challengeVersionId: ChallengeVersionId;
  readonly savedAt: string;
};

export type DirectOffer = {
  readonly id: DirectOfferId;
  readonly challengeId: ChallengeId;
  readonly challengeVersionId: ChallengeVersionId;
  readonly senderTenantId: TenantId;
  readonly senderWorkspaceId: WorkspaceId;
  readonly recipientTenantId: TenantId;
  readonly recipientWorkspaceId: WorkspaceId;
  readonly state: DirectOfferState;
  readonly version: number;
  readonly responseDeadline: string;
};

export type OfferResponse = {
  readonly id: OfferResponseId;
  readonly offerId: DirectOfferId;
  readonly ownerTenantId: TenantId;
  readonly ownerWorkspaceId: WorkspaceId;
  readonly state: OfferResponseState;
  readonly version: number;
  readonly content: OfferResponseContent;
};

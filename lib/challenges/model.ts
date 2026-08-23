import { currentUser, type Attachment, type ChallengeRecord } from "@/domain/challenge";
import { safeUploadName } from "@/lib/validation/upload";

export function emptyChallenge(id: string, now = new Date().toISOString()): ChallengeRecord {
  return {
    id,
    status: "draft",
    title: "",
    summary: "",
    category: "",
    location: "",
    ownerName: currentUser.name,
    desiredOutcome: "",
    urgency: "normal",
    attachments: [],
    currentState: "",
    consequence: "",
    expectedOutput: "",
    successCriteria: [],
    inScope: "",
    constraints: "",
    organizationSupport: "",
    previousAttempts: "",
    outputType: "",
    sourcingModel: "",
    allowedApplicantTypes: [],
    applicantScope: "",
    workMode: "",
    proposalDeadline: "",
    preferredStartDate: "",
    budgetStatus: "",
    budgetAmount: "",
    currency: "IRR",
    invitees: "",
    visibility: "",
    publicSummary: "",
    ndaRequired: false,
    ipTerms: "",
    contactName: currentUser.name,
    contactEmail: currentUser.email,
    contactPhone: currentUser.phone,
    accuracyConfirmed: false,
    legalNotes: "",
    createdAt: now,
    updatedAt: now,
    lastStep: 1,
  };
}

export function createAttachment(file: File): Attachment {
  return {
    id: `AT-${Date.now().toString(36)}`,
    name: safeUploadName(file.name),
    size: file.size,
    type: file.type || "application/octet-stream",
    addedAt: new Date().toISOString(),
  };
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

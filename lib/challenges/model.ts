import type { ChallengePublicationState } from "@rahhal/domain";

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

/**
 * Money crosses the API as integer minor units (AGENTS.md rule 11, doc 20),
 * but a person types and reads the major unit — rials, dollars, euros. These
 * two helpers are the only place that conversion happens, so the two units can
 * never be confused for each other again: before this, the intake form wrote
 * the typed major amount straight into `amount_minor` and the catalogue
 * printed `amount_minor` as though it were major, which agreed with itself
 * only because nothing ever applied the scale.
 *
 * All three supported currencies (IRR, USD, EUR) carry ISO 4217 exponent 2.
 * ponytail: single exponent — key it by currency if a 0- or 3-decimal
 * currency is ever added.
 */
const minorUnitsPerMajor = 100;

/** A typed major-unit amount as integer minor units, or null if unusable. */
export function majorAmountToMinor(value: string): number | null {
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٬,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const minor = Math.round(parsed * minorUnitsPerMajor);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Integer minor units back to the major unit a person reads. */
export function minorAmountToMajor(value: number): number {
  return value / minorUnitsPerMajor;
}

/** Formats an integer minor-unit amount for display, in its major unit. */
export function formatMinorAmount(value: number): string {
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minorAmountToMajor(value));
}

/**
 * How a published call's state reads to a solver. Deliberately separate from
 * the publisher-facing wording in `live-call-controls`: the same state answers
 * two different questions ("what did I do to this call" vs "may I still
 * apply"). Keyed on the domain type, so a new state fails the build here.
 */
export const publicationStateLabels: Record<ChallengePublicationState, string> = {
  open: "پذیرش پیشنهاد",
  paused: "پذیرش موقتاً متوقف",
  closed: "پذیرش بسته شده",
  cancelled: "فراخوان لغو شده",
};

/**
 * Deadlines are commitments made to solvers in Tehran, so every date this
 * product shows or accepts is Tehran wall-clock time — never the viewer's own
 * zone, which silently moves a published deadline for anyone outside Iran
 * (NFR-I18N-001, AGENTS.md load-bearing rule 10).
 *
 * Iran has held a fixed +03:30 offset with no DST since 2022, so the literal
 * offset below is safe for constructing an instant from a wall-clock input.
 * Reads go through `Intl` with the IANA zone, which stays correct regardless.
 * ponytail: fixed offset for writes; derive it from Intl if Iran restores DST.
 */
export const tehranTimeZone = "Asia/Tehran";
const tehranUtcOffset = "+03:30";
export const tehranTimeLabel = "به وقت تهران";

export function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tehranTimeZone,
  }).format(new Date(value));
}

/** Reads a `datetime-local` (or `YYYY-MM-DDTHH:mm:ss[.SSS]`) value as Tehran time. */
export function tehranWallClockToIso(value: string): string | null {
  if (!value) return null;
  // `datetime-local` omits seconds; the day-boundary helpers below supply both
  // seconds and milliseconds. Fill in whichever is missing, then stamp the
  // offset so the parse never falls back to the browser's own zone.
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const withMillis = withSeconds.includes(".") ? withSeconds : `${withSeconds}.000`;
  const parsed = new Date(`${withMillis}${tehranUtcOffset}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * A date-only input carries no time, so the two date fields state their own
 * meaning: a deadline lasts through the whole of its day, and a start date
 * begins at the start of its day.
 */
export function tehranEndOfDayToIso(value: string): string | null {
  return value ? tehranWallClockToIso(`${value}T23:59:59.999`) : null;
}

export function tehranStartOfDayToIso(value: string): string | null {
  return value ? tehranWallClockToIso(`${value}T00:00:00`) : null;
}

/**
 * The inverse of the two helpers above: the Tehran calendar date of an
 * instant, as a `<input type="date">` value. Slicing the ISO string instead
 * would return the UTC date, which is the previous day for anything before
 * 03:30 Tehran.
 */
export function tehranDateInput(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  // en-CA formats as YYYY-MM-DD; the timeZone is what makes it the Tehran date.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tehranTimeZone }).format(parsed);
}

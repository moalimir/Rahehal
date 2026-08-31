import type {
  ChallengeDraftContentResource,
  ChallengeDraftPatch,
  ChallengeResource,
  ChallengeSuccessEnvelope,
  CreateChallengeBody,
  ErrorEnvelope,
  MutationSuccessEnvelope,
  PatchChallengeBody,
} from "@rahhal/contracts";
import type { ChallengeRecord } from "@/domain/challenge";
import {
  emptyChallenge,
  majorAmountToMinor,
  minorAmountToMajor,
  tehranDateInput,
  tehranEndOfDayToIso,
  tehranStartOfDayToIso,
} from "@/lib/challenges/model";
import type {
  ChallengeGateway,
  ChallengeGatewayErrorCode,
  ChallengeResult,
  InitialChallengeInput,
} from "@/lib/challenges/gateway";
import { idempotencyKey, requestApi } from "@/lib/api/http";

type NetworkChallengeGatewayOptions = {
  readonly activeWorkspaceId: () => string | null;
};

const dateInput = tehranDateInput;

function inferLastStep(content: ChallengeDraftContentResource): 1 | 2 | 3 | 4 {
  if (content.visibility || content.contact.email || content.accuracy_confirmed) return 4;
  if (content.output_type || content.sourcing_model || content.proposal_deadline) return 3;
  if (content.current_state || content.expected_output || content.in_scope) return 2;
  return 1;
}

export function challengeResourceToRecord(resource: ChallengeResource): ChallengeRecord {
  const content = resource.content;
  const status: ChallengeRecord["status"] =
    resource.stage === "published"
      ? "published"
      : resource.stage === "triage" || resource.stage === "approvals"
        ? "under_review"
        : resource.authoring_status;
  return {
    ...emptyChallenge(resource.id, resource.created_at),
    id: resource.id,
    status,
    title: content.title,
    summary: content.summary,
    category: content.category,
    location: content.location,
    ownerName: content.contact.name,
    desiredOutcome: content.desired_outcome,
    currentState: content.current_state,
    consequence: content.consequence,
    expectedOutput: content.expected_output,
    successCriteria: [...content.success_criteria],
    inScope: content.in_scope,
    constraints: content.constraints,
    organizationSupport: content.organization_support,
    previousAttempts: content.previous_attempts,
    outputType: content.output_type ?? "",
    sourcingModel: content.sourcing_model ?? "",
    applicantScope: content.applicant_scope ?? "",
    allowedApplicantTypes: [...content.allowed_applicant_types],
    workMode: content.work_mode ?? "",
    proposalDeadline: dateInput(content.proposal_deadline),
    preferredStartDate: dateInput(content.preferred_start_date),
    budgetStatus: content.budget.status,
    budgetAmount:
      content.budget.amount_minor === null
        ? ""
        : minorAmountToMajor(content.budget.amount_minor).toString(),
    currency: content.budget.currency,
    invitees: content.invitees.join("، "),
    visibility: content.visibility ?? "",
    publicSummary: content.public_summary,
    ndaRequired: content.nda_required,
    ipTerms: content.ip_terms ?? "",
    contactName: content.contact.name,
    contactEmail: content.contact.email,
    contactPhone: content.contact.phone,
    accuracyConfirmed: content.accuracy_confirmed,
    legalNotes: content.legal_notes,
    createdAt: resource.created_at,
    updatedAt: resource.updated_at,
    ...(resource.stage === "draft" ? {} : { submittedAt: resource.updated_at }),
    lastStep: inferLastStep(content),
  };
}

export function challengeRecordToPatch(record: ChallengeRecord): ChallengeDraftPatch {
  return {
    authoring_status:
      record.status === "ready" || record.status === "needs_changes" ? record.status : "draft",
    title: record.title,
    summary: record.summary,
    category: record.category,
    location: record.location,
    desired_outcome: record.desiredOutcome,
    current_state: record.currentState,
    consequence: record.consequence,
    expected_output: record.expectedOutput,
    success_criteria: record.successCriteria,
    in_scope: record.inScope,
    constraints: record.constraints,
    organization_support: record.organizationSupport,
    previous_attempts: record.previousAttempts,
    output_type: record.outputType || null,
    sourcing_model: record.sourcingModel || null,
    applicant_scope: record.applicantScope || null,
    allowed_applicant_types: record.allowedApplicantTypes,
    work_mode: record.workMode || null,
    proposal_deadline: tehranEndOfDayToIso(record.proposalDeadline),
    preferred_start_date: tehranStartOfDayToIso(record.preferredStartDate),
    budget: {
      status: record.budgetStatus || "undecided",
      amount_minor:
        record.budgetStatus === "fixed" ? majorAmountToMinor(record.budgetAmount) : null,
      currency: record.currency,
    },
    invitees: record.invitees
      .split(/[،,\n]/)
      .map((value) => value.trim())
      .filter(Boolean),
    visibility: record.visibility || null,
    public_summary: record.publicSummary,
    nda_required: record.ndaRequired,
    ip_terms: record.ipTerms || null,
    contact: {
      name: record.contactName || record.ownerName,
      email: record.contactEmail,
      phone: record.contactPhone,
    },
    accuracy_confirmed: record.accuracyConfirmed,
    legal_notes: record.legalNotes,
    attachment_ids: [],
  };
}

function initialPatch(input: InitialChallengeInput): ChallengeDraftPatch {
  return {
    title: input.title,
    summary: input.summary,
    category: input.category,
    location: input.location,
    desired_outcome: input.desiredOutcome,
    contact: { name: input.ownerName, email: "", phone: "" },
  };
}

function failure<Data>(error: ErrorEnvelope): ChallengeResult<Data> {
  return {
    ok: false,
    error: {
      ...error.error,
      code: error.error.code as ChallengeGatewayErrorCode,
    },
    meta: error.meta,
  };
}

function localFailure<Data>(
  code: ChallengeGatewayErrorCode,
  message: string,
): ChallengeResult<Data> {
  return {
    ok: false,
    error: { code, message },
    meta: { server_time: new Date().toISOString(), correlation_id: "cor_web_validation" },
  };
}

export function createNetworkChallengeGateway(
  options: NetworkChallengeGatewayOptions,
): ChallengeGateway {
  const resources = new Map<string, ChallengeResource>();
  const pendingKeys = new Map<string, string>();

  const workspaceHeaders = () => {
    const workspaceId = options.activeWorkspaceId();
    return workspaceId ? { "x-workspace-id": workspaceId } : null;
  };

  const get = async (id: string): Promise<ChallengeResult<ChallengeRecord>> => {
    const headers = workspaceHeaders();
    if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
    const result = await requestApi<ChallengeSuccessEnvelope>(
      `/api/v1/challenges/${encodeURIComponent(id)}`,
      { headers },
    );
    if (!result.ok) return failure(result);
    resources.set(id, result.data);
    return {
      ok: true,
      data: challengeResourceToRecord(result.data),
      meta: { ...result.meta, readiness: result.data.readiness, stage: result.data.stage },
    };
  };

  return {
    queries: {
      async list() {
        return localFailure(
          "INVALID_STATE",
          "فهرست پیش‌نویس‌ها در فاز ۲ به قرارداد سرور افزوده می‌شود؛ از پیوند مستقیم پرونده استفاده کنید.",
        );
      },
      get,
    },
    commands: {
      async create(input) {
        if (input.attachments.length) {
          return localFailure(
            "VALIDATION",
            "بارگذاری فایل هنوز به سرویس خصوصی فایل متصل نشده است؛ فایل را حذف و دوباره تلاش کنید.",
          );
        }
        const headers = workspaceHeaders();
        if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
        const body: CreateChallengeBody = { expected_version: 0, draft: initialPatch(input) };
        const fingerprint = `create:${JSON.stringify(body)}`;
        const key = pendingKeys.get(fingerprint) ?? idempotencyKey("web-challenge-create");
        pendingKeys.set(fingerprint, key);
        const result = await requestApi<MutationSuccessEnvelope>("/api/v1/challenges", {
          method: "POST",
          headers: { ...headers, "idempotency-key": key },
          body: JSON.stringify(body),
        });
        if (!result.ok) return failure(result);
        const loaded = await get(result.data.entity_id);
        if (loaded.ok) pendingKeys.delete(fingerprint);
        return loaded;
      },
      async save(record) {
        if (record.attachments.length) {
          return localFailure(
            "VALIDATION",
            "فایل‌های پیش‌نویس تا اتصال سرویس خصوصی فایل قابل ذخیره نیستند.",
          );
        }
        const resource = resources.get(record.id);
        if (!resource) return localFailure("CONFLICT", "نسخه سرور را دوباره دریافت کنید.");
        const headers = workspaceHeaders();
        if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
        const body: PatchChallengeBody = {
          expected_version: resource.version,
          patch: challengeRecordToPatch(record),
        };
        const fingerprint = `save:${record.id}:${JSON.stringify(body)}`;
        const key = pendingKeys.get(fingerprint) ?? idempotencyKey("web-challenge-save");
        pendingKeys.set(fingerprint, key);
        const result = await requestApi<MutationSuccessEnvelope>(
          `/api/v1/challenges/${encodeURIComponent(record.id)}`,
          {
            method: "PATCH",
            headers: { ...headers, "idempotency-key": key },
            body: JSON.stringify(body),
          },
        );
        if (!result.ok) return failure(result);
        const loaded = await get(record.id);
        if (loaded.ok) pendingKeys.delete(fingerprint);
        return loaded;
      },
      async delete() {
        return localFailure("INVALID_STATE", "حذف پیش‌نویس هنوز در قرارداد سرور این فاز نیست.");
      },
      async submit(record) {
        const resource = resources.get(record.id);
        if (!resource) return localFailure("CONFLICT", "نسخه سرور را دوباره دریافت کنید.");
        const command =
          resource.stage === "draft"
            ? "request-triage"
            : resource.stage === "formulation"
              ? "request-approvals"
              : null;
        if (!command) {
          return localFailure("INVALID_STATE", "پرونده در وضعیت فعلی قابل ارسال نیست.");
        }
        const headers = workspaceHeaders();
        if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
        const body = { expected_version: resource.version };
        const fingerprint = `${command}:${record.id}:${resource.version}`;
        const key = pendingKeys.get(fingerprint) ?? idempotencyKey(`web-challenge-${command}`);
        pendingKeys.set(fingerprint, key);
        const result = await requestApi<MutationSuccessEnvelope>(
          `/api/v1/challenges/${encodeURIComponent(record.id)}:${command}`,
          {
            method: "POST",
            headers: { ...headers, "idempotency-key": key },
            body: JSON.stringify(body),
          },
        );
        if (!result.ok) return failure(result);
        const loaded = await get(record.id);
        if (loaded.ok) pendingKeys.delete(fingerprint);
        return loaded;
      },
      async advanceFormulation(id) {
        const resource = resources.get(id);
        if (!resource) return localFailure("CONFLICT", "نسخه سرور را دوباره دریافت کنید.");
        if (resource.stage !== "triage") {
          return localFailure("INVALID_STATE", "پرونده در مرحله غربالگری نیست.");
        }
        const headers = workspaceHeaders();
        if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
        const body = { expected_version: resource.version };
        const fingerprint = `advance-formulation:${id}:${resource.version}`;
        const key =
          pendingKeys.get(fingerprint) ?? idempotencyKey("web-challenge-advance-formulation");
        pendingKeys.set(fingerprint, key);
        const result = await requestApi<MutationSuccessEnvelope>(
          `/api/v1/challenges/${encodeURIComponent(id)}:advance-formulation`,
          {
            method: "POST",
            headers: { ...headers, "idempotency-key": key },
            body: JSON.stringify(body),
          },
        );
        if (!result.ok) return failure(result);
        const loaded = await get(id);
        if (loaded.ok) pendingKeys.delete(fingerprint);
        return loaded;
      },
      /**
       * B4's publish command. The server owns every precondition -- stage,
       * the four approval gates, and the `org:publisher` role -- so this only
       * carries the version it last read and surfaces the typed refusal.
       * Publishing is irreversible, so its idempotency key is reused across
       * retries of the same version rather than regenerated.
       */
      async publish(id) {
        const resource = resources.get(id);
        if (!resource) return localFailure("CONFLICT", "نسخه سرور را دوباره دریافت کنید.");
        const headers = workspaceHeaders();
        if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری سازمانی انتخاب کنید.");
        const fingerprint = `publish:${id}:${resource.version}`;
        const key = pendingKeys.get(fingerprint) ?? idempotencyKey("web-challenge-publish");
        pendingKeys.set(fingerprint, key);
        const result = await requestApi<MutationSuccessEnvelope>(
          `/api/v1/challenges/${encodeURIComponent(id)}:publish`,
          {
            method: "POST",
            headers: { ...headers, "idempotency-key": key },
            body: JSON.stringify({ expected_version: resource.version }),
          },
        );
        if (!result.ok) return failure(result);
        const loaded = await get(id);
        if (loaded.ok) pendingKeys.delete(fingerprint);
        return loaded;
      },
    },
  };
}

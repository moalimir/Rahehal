import type { ChallengeRecord } from "@/domain/challenge";
import type { ChallengeGateway, ChallengeGatewayErrorCode } from "@/lib/challenges/gateway";
import { createDemoResultFactory } from "@/lib/challenges/adapters/demo-results";
import { DRAFT_ID_POOL } from "@/lib/challenges/ids";
import {
  challengeDemoMessages,
  createChallenge,
  deleteChallenge,
  getChallenge,
  listChallenges,
  publishChallenge,
  saveChallenge,
  submitChallenge,
} from "@/lib/challenges/storage";
import { isRecordReady } from "@/lib/challenges/validation";

const editableStatuses: ChallengeRecord["status"][] = ["draft", "ready", "needs_changes"];
const unavailableForPublish = "پرونده در وضعیت فعلی قابل انتشار نیست.";

const { failure, success, withDemoStorage } = createDemoResultFactory<ChallengeGatewayErrorCode>(
  "challenge",
  "ذخیره‌سازی نسخه نمایشی در این مرورگر در دسترس نیست؛ دوباره تلاش کنید.",
);

function notFound(operation: string) {
  return failure(operation, "NOT_FOUND", "پرونده مسئله پیدا نشد.");
}

export function createLocalDemoChallengeGateway(): ChallengeGateway {
  return {
    queries: {
      async list() {
        return withDemoStorage("list", () => success("list", listChallenges()));
      },
      async get(id) {
        return withDemoStorage("get", () => {
          const record = getChallenge(id);
          return record ? success("get", record) : notFound("get");
        });
      },
    },
    commands: {
      async create(input) {
        return withDemoStorage("create", () => {
          const usedIds = new Set(listChallenges().map((record) => record.id));
          if (DRAFT_ID_POOL.every((id) => usedIds.has(id))) {
            return failure("create", "INVALID_STATE", challengeDemoMessages.draftCapacity);
          }
          return success("create", createChallenge(input));
        });
      },
      async save(record) {
        return withDemoStorage("save", () => {
          const stored = getChallenge(record.id);
          if (!stored) return notFound("save");
          if (
            !editableStatuses.includes(stored.status) ||
            !editableStatuses.includes(record.status)
          ) {
            return failure("save", "INVALID_STATE", "پرونده در وضعیت فعلی قابل ویرایش نیست.");
          }
          return success("save", saveChallenge(record));
        });
      },
      async delete(id) {
        return withDemoStorage("delete", () => {
          const record = getChallenge(id);
          if (!record) return notFound("delete");
          if (!editableStatuses.includes(record.status)) {
            return failure("delete", "INVALID_STATE", "فقط پیش‌نویس قابل حذف است.");
          }
          return deleteChallenge(id)
            ? success("delete", { id })
            : failure("delete", "INVALID_STATE", "پیش‌نویس در وضعیت فعلی قابل حذف نیست.");
        });
      },
      async submit(record) {
        return withDemoStorage("submit", () => {
          const stored = getChallenge(record.id);
          if (!stored) return notFound("submit");
          if (!editableStatuses.includes(stored.status)) {
            return failure("submit", "INVALID_STATE", "پرونده در وضعیت فعلی قابل ارسال نیست.");
          }
          if (!isRecordReady(record)) {
            return failure("submit", "VALIDATION", challengeDemoMessages.incomplete);
          }
          return success("submit", submitChallenge({ ...record, status: stored.status }));
        });
      },
      async publish(id) {
        return withDemoStorage("publish", () => {
          const record = getChallenge(id);
          if (!record) return notFound("publish");
          if (record.status !== "under_review") {
            return failure("publish", "INVALID_STATE", unavailableForPublish);
          }
          if (!isRecordReady(record)) {
            return failure("publish", "VALIDATION", "پرونده شرایط انتشار را ندارد.");
          }
          const published = publishChallenge(id);
          return published
            ? success("publish", published)
            : failure("publish", "INVALID_STATE", unavailableForPublish);
        });
      },
    },
  };
}

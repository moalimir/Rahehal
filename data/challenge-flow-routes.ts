import { CHALLENGE_ROUTE_IDS } from "@/lib/challenges/ids";
import { CONNECTED_RECORD_PATH } from "@/lib/challenges/navigation";

export type ChallengeRecordView = "detail" | "edit" | "preview" | "submitted";

export type ChallengeFlowRoute =
  | { kind: "list"; path: string }
  | { kind: "new"; path: string }
  | { kind: ChallengeRecordView; path: string; id: string }
  // The connected record path before its `id` query is known. Static export
  // prerenders it without a query; the client resolves the id on mount.
  | { kind: "record"; path: string; view: ChallengeRecordView }
  | { kind: "redirect"; path: string; target: string };

const rootRedirects: Record<string, string> = {
  "/org/intake": "/app/org/challenges/new",
  "/org/challenges": "/app/org/challenges",
  "/org/challenges/new": "/app/org/challenges/new",
  "/org/challenges/sample": `/app/org/challenges/${CHALLENGE_ROUTE_IDS[0]}`,
  "/onboarding/organization/first-challenge": "/app/org/challenges/new",
};

const canonicalPaths = CHALLENGE_ROUTE_IDS.flatMap((id) => [
  `/app/org/challenges/${id}`,
  `/app/org/challenges/${id}/overview`,
  `/app/org/challenges/${id}/edit`,
  `/app/org/challenges/${id}/studio`,
  `/app/org/challenges/${id}/preview`,
  `/app/org/challenges/${id}/submitted`,
]);

const generatedRedirects = Object.fromEntries(
  CHALLENGE_ROUTE_IDS.flatMap((id) => [
    [`/org/challenges/${id}`, `/app/org/challenges/${id}`],
    [`/org/challenges/${id}/edit`, `/app/org/challenges/${id}/edit`],
    [`/org/challenges/${id}/studio`, `/app/org/challenges/${id}/edit`],
    [`/org/challenges/${id}/preview`, `/app/org/challenges/${id}/preview`],
    [`/org/challenges/${id}/submitted`, `/app/org/challenges/${id}/submitted`],
  ]),
);

const redirects: Record<string, string> = { ...rootRedirects, ...generatedRedirects };

/**
 * Both builds pre-generate the connected record paths. They are inert in the
 * demo build and carry `?id=chl_…` in the connected build — see
 * `CONNECTED_RECORD_PATH`.
 */
const connectedRecordPaths = [
  CONNECTED_RECORD_PATH,
  `${CONNECTED_RECORD_PATH}/overview`,
  `${CONNECTED_RECORD_PATH}/edit`,
  `${CONNECTED_RECORD_PATH}/preview`,
  `${CONNECTED_RECORD_PATH}/submitted`,
];

export const challengeFlowStaticPaths = [
  "/app/org/challenges",
  "/app/org/challenges/new",
  ...canonicalPaths,
  ...connectedRecordPaths,
  ...Object.keys(redirects),
];

function recordView(segment: string | undefined): ChallengeRecordView {
  if (segment === "studio" || segment === "edit") return "edit";
  if (segment === "preview" || segment === "submitted") return segment;
  return "detail";
}

const serverChallengeId = /^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

export function getChallengeFlowRoute(path: string, search = ""): ChallengeFlowRoute | undefined {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (normalized === "/app/org/challenges") return { kind: "list", path: normalized };
  if (normalized === "/app/org/challenges/new") return { kind: "new", path: normalized };
  if (redirects[normalized])
    return { kind: "redirect", path: normalized, target: redirects[normalized] };

  const record = normalized.match(
    new RegExp(
      `^${CONNECTED_RECORD_PATH}(?:/(overview|edit|studio|preview|submitted))?$`.replaceAll(
        "/",
        "\\/",
      ),
    ),
  );
  if (record) {
    const view = recordView(record[1]);
    const id = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("id");
    if (id && serverChallengeId.test(id)) return { kind: view, path: normalized, id };
    return { kind: "record", path: normalized, view };
  }

  const match = normalized.match(
    /^\/app\/org\/challenges\/([^/]+)(?:\/(overview|edit|studio|preview|submitted))?$/,
  );
  if (!match || !CHALLENGE_ROUTE_IDS.includes(match[1])) return undefined;
  return { kind: recordView(match[2]), path: normalized, id: match[1] };
}

export function challengeFlowMetadata(route: ChallengeFlowRoute) {
  const kind = route.kind === "record" ? route.view : route.kind;
  const title =
    kind === "list"
      ? "مسئله‌ها و چالش‌ها"
      : kind === "new"
        ? "ثبت مسئله سازمانی"
        : kind === "edit"
          ? "تکمیل مسئله"
          : kind === "preview"
            ? "پیش‌نمایش پرونده"
            : kind === "submitted"
              ? "رسید ارسال پرونده"
              : kind === "redirect"
                ? "انتقال به مسیر جدید"
                : "نمای پرونده";
  return { title, summary: "مدیریت ثبت، تکمیل و ارسال مسئله سازمانی برای بررسی پلتفرم." };
}

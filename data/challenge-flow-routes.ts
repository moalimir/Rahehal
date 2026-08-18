import { CHALLENGE_ROUTE_IDS } from "@/lib/challenges/storage";

export type ChallengeFlowRoute =
  | { kind: "list"; path: string }
  | { kind: "new"; path: string }
  | { kind: "detail" | "edit" | "preview" | "submitted"; path: string; id: string }
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

export const challengeFlowStaticPaths = [
  "/app/org/challenges",
  "/app/org/challenges/new",
  ...canonicalPaths,
  ...Object.keys(redirects),
];

export function getChallengeFlowRoute(path: string): ChallengeFlowRoute | undefined {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (normalized === "/app/org/challenges") return { kind: "list", path: normalized };
  if (normalized === "/app/org/challenges/new") return { kind: "new", path: normalized };
  if (redirects[normalized])
    return { kind: "redirect", path: normalized, target: redirects[normalized] };
  const match = normalized.match(
    /^\/app\/org\/challenges\/([^/]+)(?:\/(overview|edit|studio|preview|submitted))?$/,
  );
  if (!match || !CHALLENGE_ROUTE_IDS.includes(match[1])) return undefined;
  const segment = match[2];
  return {
    kind:
      segment === "studio" || segment === "edit"
        ? "edit"
        : segment === "preview" || segment === "submitted"
          ? segment
          : "detail",
    path: normalized,
    id: match[1],
  };
}

export function challengeFlowMetadata(route: ChallengeFlowRoute) {
  const title =
    route.kind === "list"
      ? "مسئله‌ها و چالش‌ها"
      : route.kind === "new"
        ? "ثبت مسئله سازمانی"
        : route.kind === "edit"
          ? "تکمیل مسئله"
          : route.kind === "preview"
            ? "پیش‌نمایش پرونده"
            : route.kind === "submitted"
              ? "رسید ارسال پرونده"
              : route.kind === "redirect"
                ? "انتقال به مسیر جدید"
                : "نمای پرونده";
  return { title, summary: "مدیریت ثبت، تکمیل و ارسال مسئله سازمانی برای بررسی پلتفرم." };
}

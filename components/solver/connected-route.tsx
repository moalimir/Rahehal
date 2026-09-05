"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

import { Icon } from "@/components/icons";
import { PreviewDataNotice } from "@/components/organization-preview-notice";
import { RouteResolving } from "@/components/route-fallbacks";
import { useWebRuntime } from "@/components/runtime-provider";
import { SolverShell, type SolverSpace } from "@/components/solver-shell";
import type { InternalRoute } from "@/data/internal-routes";
import { classifyRoute } from "@/lib/routing/route-classification";

const ConnectedSolverDashboard = dynamic(
  () =>
    import("@/components/solver/connected-dashboard").then(
      (module) => module.ConnectedSolverDashboard,
    ),
  { loading: RouteResolving },
);
const ConnectedOpportunityDirectory = dynamic(
  () =>
    import("@/components/solver/connected-opportunity-browser").then(
      (module) => module.ConnectedOpportunityDirectory,
    ),
  { loading: RouteResolving },
);
const ConnectedOpportunityRecord = dynamic(
  () =>
    import("@/components/solver/connected-opportunity-browser").then(
      (module) => module.ConnectedOpportunityRecord,
    ),
  { loading: RouteResolving },
);
const ConnectedProposalList = dynamic(
  () =>
    import("@/components/solver/connected-proposal-list").then(
      (module) => module.ConnectedProposalList,
    ),
  { loading: RouteResolving },
);
const ConnectedProposalRecord = dynamic(
  () =>
    import("@/components/solver/connected-proposal-record").then(
      (module) => module.ConnectedProposalRecord,
    ),
  { loading: RouteResolving },
);
const ConnectedProposalEditor = dynamic(
  () =>
    import("@/components/solver/connected-proposal-editor").then(
      (module) => module.ConnectedProposalEditor,
    ),
  { loading: RouteResolving },
);
const ConnectedTeamsExperience = dynamic(
  () =>
    import("@/components/solver/connected-teams").then((module) => module.ConnectedTeamsExperience),
  { loading: RouteResolving },
);
const ConnectedSolverProfile = dynamic(
  () =>
    import("@/components/solver/connected-profile").then((module) => module.ConnectedSolverProfile),
  { loading: RouteResolving },
);
const ConnectedSolverSettings = dynamic(
  () =>
    import("@/components/solver/connected-profile").then(
      (module) => module.ConnectedSolverSettings,
    ),
  { loading: RouteResolving },
);
const ConnectedSavedPage = dynamic(
  () =>
    import("@/components/solver/connected-opportunities").then(
      (module) => module.ConnectedSavedPage,
    ),
  { loading: RouteResolving },
);
const ConnectedDirectOffersList = dynamic(
  () =>
    import("@/components/solver/connected-opportunities").then(
      (module) => module.ConnectedDirectOffersList,
    ),
  { loading: RouteResolving },
);
const ConnectedNotifications = dynamic(
  () =>
    import("@/components/solver/connected-notifications").then(
      (module) => module.ConnectedNotifications,
    ),
  { loading: RouteResolving },
);

function ConnectedRouteBoundary({ route }: { route: InternalRoute }) {
  const classification = classifyRoute(route.path);
  return (
    <>
      {classification.classification === "preview" && <PreviewDataNotice />}
      <section className="rh-card rh-profile-empty">
        <Icon name={classification.classification === "unavailable" ? "lock" : "notification"} />
        <h1>
          {classification.classification === "unavailable"
            ? "این بخش در فاز فعلی فعال نیست"
            : "این صفحه هنوز نمای متصل ندارد"}
        </h1>
        <p>
          برای جلوگیری از نمایش داده نمایشی کنار نشست واقعی، این مسیر در نسخه متصل فقط مرز وضعیت خود
          را نشان می‌دهد.
        </p>
        <Link href="/app/solver/dashboard">بازگشت به داشبورد</Link>
      </section>
    </>
  );
}

function connectedContent(route: InternalRoute) {
  if (route.path === "/app/solver/dashboard") return <ConnectedSolverDashboard />;
  if (route.path === "/app/solver/opportunities") return <ConnectedOpportunityDirectory />;
  if (route.path === "/app/solver/opportunities/record") return <ConnectedOpportunityRecord />;
  if (route.path === "/app/solver/proposals") return <ConnectedProposalList />;
  if (route.path === "/app/solver/proposals/record/edit") return <ConnectedProposalEditor />;
  if (route.path.startsWith("/app/solver/proposals/record")) return <ConnectedProposalRecord />;
  if (route.path === "/app/solver/saved") return <ConnectedSavedPage />;
  if (route.path === "/app/solver/received-proposals") return <ConnectedDirectOffersList />;
  if (
    route.path === "/app/solver/teams" ||
    route.path === "/app/solver/teams/new" ||
    route.path === "/app/solver/invitations"
  )
    return <ConnectedTeamsExperience />;
  if (route.path === "/app/solver/profile") return <ConnectedSolverProfile />;
  if (route.path === "/app/solver/verification") return <ConnectedSolverProfile verificationOnly />;
  if (route.path === "/app/solver/settings") return <ConnectedSolverSettings />;
  if (route.path === "/app/solver/notifications")
    return <ConnectedNotifications persona="solver" />;
  return <ConnectedRouteBoundary route={route} />;
}

/**
 * The connected solver tree is selected before any demo hook mounts. This is
 * intentionally separate from the static-demo router: even a transient API
 * failure must never make a live session initialize or display fixture data.
 */
export function ConnectedSolverRoute({ route }: { route: InternalRoute }) {
  const runtime = useWebRuntime();
  const active = runtime.me?.workspaces.find(
    (workspace) => workspace.id === runtime.me?.active_context?.workspace_id,
  );
  const space: SolverSpace = active?.kind === "team" ? "team" : "individual";
  return (
    <SolverShell currentPath={route.path} space={space}>
      {connectedContent(route)}
    </SolverShell>
  );
}

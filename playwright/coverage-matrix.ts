export type VisualScenario = {
  id: string;
  route: string;
  family: "public" | "auth" | "solver" | "organization" | "reviewer" | "operations";
};

export const visualScenarios: VisualScenario[] = [
  { id: "public-landing", route: "/", family: "public" },
  { id: "public-challenges", route: "/challenges", family: "public" },
  { id: "public-organizations", route: "/organizations", family: "public" },
  { id: "public-universities", route: "/universities", family: "public" },
  { id: "auth-solver-login", route: "/auth/login", family: "auth" },
  { id: "auth-organization-login", route: "/auth/organization/login", family: "auth" },
  { id: "auth-solver-registration", route: "/auth/solver/register/type", family: "auth" },
  { id: "solver-dashboard", route: "/app/solver/dashboard", family: "solver" },
  { id: "solver-opportunities", route: "/app/solver/opportunities", family: "solver" },
  { id: "solver-proposals", route: "/app/solver/proposals", family: "solver" },
  { id: "solver-proposal-wizard", route: "/app/solver/proposals/new", family: "solver" },
  { id: "solver-teams", route: "/app/solver/teams", family: "solver" },
  { id: "solver-profile", route: "/app/solver/profile", family: "solver" },
  { id: "organization-dashboard", route: "/app/org/dashboard", family: "organization" },
  { id: "organization-challenge", route: "/app/org/challenges/new", family: "organization" },
  { id: "organization-proposals", route: "/app/org/proposals", family: "organization" },
  { id: "reviewer-assignments", route: "/app/reviewer/assignments", family: "reviewer" },
  { id: "operations-queue", route: "/app/ops/queue", family: "operations" },
];

export const behaviorRoutes = [
  "/",
  "/challenges",
  "/auth/login",
  "/app/solver/dashboard",
  "/app/org/dashboard",
  "/app/reviewer/assignments",
  "/app/ops/queue",
] as const;

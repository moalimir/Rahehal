// Transitional web compatibility surface. The browser code keeps its stable
// import path while the canonical, browser-free taxonomy lives in the shared
// domain workspace used by web, API, contracts, and worker.
export {
  applicantScopes,
  applicantScopeForTypes,
  applicantScopeMatchesTypes,
  applicantTypes,
  isApplicantScope,
  isApplicantType,
  isTeamKind,
  teamKinds,
} from "@rahhal/domain/taxonomy";
export type { ApplicantScope, ApplicantType, TeamKind } from "@rahhal/domain/taxonomy";

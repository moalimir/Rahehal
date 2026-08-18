"use client";

import {
  SolverDirectOfferResponse,
  SolverDirectOffersList,
} from "@/components/solver-direct-offer-experience";
import { SolverProposalsList } from "@/components/solver-proposals-list";
import { SavedPage } from "@/components/solver-profile/saved-page";
import { useCurrentSpace, type SolverProfileSection } from "@/components/solver-profile/shared";
import { TeamBuildingPage } from "@/components/solver-profile/team-creation-page";
import {
  SolverInvitationsExperience,
  SolverTeamsOverview,
} from "@/components/solver-teams-experience";
import { SolverProfileEditor, SolverSettingsEditor } from "@/components/solver-profile-settings";
import { SolverWorkspaceShell, type SolverSpace } from "@/components/solver-shell";

export type { SolverProfileSection };

export function SolverProfileExperience({
  section,
  embedded = false,
  space: suppliedSpace,
  offerId,
  path,
}: {
  section: SolverProfileSection;
  embedded?: boolean;
  space?: SolverSpace;
  offerId?: string;
  path?: string;
}) {
  const currentSpace = useCurrentSpace();
  const space = suppliedSpace ?? currentSpace;
  const content = (
    <>
      {section === "received" && <SolverDirectOffersList />}
      {section === "offer-response" && <SolverDirectOfferResponse offerId={offerId} />}
      {section === "team-building" && <TeamBuildingPage space={space} />}
      {section === "proposals" && <SolverProposalsList />}
      {section === "saved" && <SavedPage space={space} />}
      {section === "invitations" && <SolverInvitationsExperience />}
      {section === "teams" && <SolverTeamsOverview />}
      {section === "profile" && (
        <SolverProfileEditor preview={path === "/app/solver/profile/preview"} />
      )}
      {section === "settings" && <SolverSettingsEditor />}
    </>
  );
  if (embedded) return content;
  return (
    <SolverWorkspaceShell
      active={
        section === "teams" ? "invitations" : section === "offer-response" ? "received" : section
      }
      space={space}
    >
      {content}
    </SolverWorkspaceShell>
  );
}

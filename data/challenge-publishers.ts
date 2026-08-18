import { getOrganization, type OrganizationRecord } from "@/data/organization-registry";
import { challenges } from "@/data/mock";

export type ChallengePublisher = OrganizationRecord;

export function getChallengePublisher(challengeId: string): ChallengePublisher {
  return getOrganization(
    challenges.find((challenge) => challenge.id === challengeId)?.organizationId ?? "verified",
  );
}

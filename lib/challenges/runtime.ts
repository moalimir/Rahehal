import type { ChallengeGateway } from "@/lib/challenges/gateway";
import { createLocalDemoChallengeGateway } from "@/lib/challenges/adapters/local-demo";
import { createLocalDemoOpportunityGateway } from "@/lib/challenges/adapters/local-demo-opportunities";
import type { OpportunityGateway } from "@/lib/challenges/public-catalog";

export const demoChallengeGateway: ChallengeGateway = createLocalDemoChallengeGateway();
export const demoOpportunityGateway: OpportunityGateway = createLocalDemoOpportunityGateway();

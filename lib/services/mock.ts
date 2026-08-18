import {
  auditEvents,
  challenges,
  financeRecords,
  notifications,
  pilots,
  reviewers,
  submissions,
} from "@/data/mock";

export const mockService = {
  async listChallenges() {
    return challenges;
  },
  async getChallenge(slug: string) {
    return challenges.find((challenge) => challenge.slug === slug) ?? null;
  },
  async getWorkspaceSnapshot() {
    return { submissions, reviewers, pilots, notifications, auditEvents, financeRecords };
  },
};

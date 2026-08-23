import type { Challenge } from "@/types";

/** Allowlisted public/solver opportunity projection. Private challenge fields cannot cross this port. */
export type OpportunityView = {
  id: string;
  slug: string;
  title: string;
  industry: Challenge["industry"];
  organizationId: string;
  publisherPublishedCount?: number;
  visibility: Challenge["visibility"];
  route: Challenge["route"];
  status: string;
  budget: number;
  deadline: string;
  fit: number;
  tags: string[];
};

export type OpportunityQueryErrorCode = "NOT_FOUND" | "STORAGE";

export type OpportunityResultMeta = {
  readonly server_time: string;
  readonly correlation_id: string;
};

export type OpportunityResult<Data> =
  | { ok: true; data: Data; meta: OpportunityResultMeta }
  | {
      ok: false;
      error: {
        code: OpportunityQueryErrorCode;
        message: string;
        recovery?: string;
      };
      meta: OpportunityResultMeta;
    };

export interface OpportunityQueries {
  list(): Promise<OpportunityResult<OpportunityView[]>>;
  get(key: string): Promise<OpportunityResult<OpportunityView>>;
}

export type OpportunityGateway = {
  queries: OpportunityQueries;
};

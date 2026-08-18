export type RoleSpace = "public" | "solver" | "org" | "ops";
export type Visibility = "عمومی" | "ناشناسِ تأییدشده" | "دعوتی" | "خصوصی";
export type DemoState =
  | "default"
  | "loading"
  | "partial"
  | "empty"
  | "offline"
  | "permission"
  | "locked"
  | "success";

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  industry: "ساخت‌وتولید" | "انرژی و آب" | "صنایع غذایی";
  organizationId: string;
  visibility: Visibility;
  route: "جایزه حل مسئله" | "شناسایی فناوری" | "توسعه مشترک و پایلوت" | "خرید پژوهش";
  status: string;
  budget: number;
  deadline: string;
  fit: number;
  tags: string[];
}

export interface Metric {
  label: string;
  value: string;
  trend: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

export interface PageSection {
  title: string;
  description: string;
  items: string[];
}

export interface RouteDefinition {
  code: string;
  path: string;
  role: RoleSpace;
  title: string;
  eyebrow: string;
  summary: string;
  primaryAction: string;
  status: string;
  owner: string;
  deadline: string;
  confidentiality: string;
  metrics: Metric[];
  sections: PageSection[];
  steps: string[];
  records: Array<Record<string, string>>;
}

export interface Reviewer {
  id: string;
  name: string;
  expertise: string;
  workload: string;
  coi: "بدون تعارض" | "نیازمند بررسی" | "انصراف به‌دلیل تعارض";
  progress: number;
}

export interface Submission {
  id: string;
  challengeId: string;
  team: string;
  status: string;
  eligibility: string;
  score: number | null;
  updatedAt: string;
}

export interface Pilot {
  id: string;
  title: string;
  owner: string;
  health: "در مسیر" | "نیازمند توجه" | "متوقف";
  budget: number;
  progress: number;
  impact: string;
}

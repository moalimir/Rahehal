import { createDemoSession } from "@/lib/auth/session";

export function signInAsAuthorizedOrganization() {
  createDemoSession("org", "org-mapna");
}

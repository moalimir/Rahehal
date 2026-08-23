import type { AccessDecisionAuditPort, AccessDecisionRecord } from "./ports.js";

export class InMemoryAccessDecisionAudit implements AccessDecisionAuditPort {
  private readonly decisions: AccessDecisionRecord[] = [];

  async record(decision: AccessDecisionRecord) {
    this.decisions.push(structuredClone(decision));
  }

  snapshot() {
    return structuredClone(this.decisions) as readonly AccessDecisionRecord[];
  }
}

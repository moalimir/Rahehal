import { describe, expect, it } from "vitest";
import {
  gateApproverRoles,
  organizationCapabilities,
  organizationRoles,
  publicationGates,
} from "@rahhal/domain";

/**
 * The capability table is the one place the API's authorization predicates and
 * the web navigation both read. These assert the separations of duty that
 * 70_SECURITY_AND_AUTHZ §6 requires, so weakening one to make a screen more
 * convenient fails here rather than in production.
 */
describe("organization capabilities", () => {
  it("lets the two authoring roles author, and no one else", () => {
    const authors = organizationRoles.filter(
      (role) => organizationCapabilities(role).authorChallenges,
    );
    expect(authors).toEqual(["org:owner", "org:member"]);
  });

  it("keeps publication away from every role that authors", () => {
    for (const role of organizationRoles) {
      const capabilities = organizationCapabilities(role);
      expect(capabilities.authorChallenges && capabilities.publishChallenges).toBe(false);
    }
    const publishers = organizationRoles.filter(
      (role) => organizationCapabilities(role).publishChallenges,
    );
    expect(publishers).toEqual(["org:publisher"]);
  });

  it("gives each org approver exactly one gate and no authoring", () => {
    for (const role of organizationRoles) {
      const capabilities = organizationCapabilities(role);
      if (!capabilities.recordsGate) continue;
      expect(capabilities.authorChallenges).toBe(false);
      expect(capabilities.publishChallenges).toBe(false);
      expect(gateApproverRoles[capabilities.recordsGate]).toContain(role);
    }
  });

  it("derives the gate from gateApproverRoles rather than a second list", () => {
    // `quality` is platform-only, so no organization role may claim it.
    for (const gate of publicationGates) {
      const orgRolesForGate = organizationRoles.filter(
        (role) => organizationCapabilities(role).recordsGate === gate,
      );
      const expected = gateApproverRoles[gate].filter((role) => role.startsWith("org:"));
      expect(orgRolesForGate).toEqual(expected);
    }
    expect(organizationCapabilities("org:owner").recordsGate).toBeNull();
  });

  it("reserves organization management for the owner and grants reads to all", () => {
    const managers = organizationRoles.filter(
      (role) => organizationCapabilities(role).manageOrganization,
    );
    expect(managers).toEqual(["org:owner"]);
    for (const role of organizationRoles) {
      expect(organizationCapabilities(role).readChallenges).toBe(true);
    }
  });

  it("grants a non-organization role nothing", () => {
    for (const role of ["platform:ops", "team:owner", "individual"] as const) {
      expect(organizationCapabilities(role)).toMatchObject({
        readChallenges: false,
        authorChallenges: false,
        publishChallenges: false,
        manageOrganization: false,
        recordsGate: null,
      });
    }
  });
});

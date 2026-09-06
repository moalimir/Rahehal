import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { networkWorkspaceRoleLabel } from "@/lib/auth/network-organization-shell";

const shells = readFileSync("components/role-shells.tsx", "utf8");
const appShell = readFileSync("components/app-shell.tsx", "utf8");

describe("connected chrome names the signed-in human", () => {
  it("offers sign-out to every connected role, not only the organization", () => {
    // Sign-out was wired to `connectedOrganization`, so a platform operator or
    // a reviewer with a real OIDC session had no way to end it from the
    // chrome -- the one control a connected session must always offer.
    expect(shells).toMatch(/const connectedSession =\s*\n?\s*runtime\.mode === "network"/);
    expect(shells).toMatch(/onSignOut=\{\s*\n?\s*connectedSession/);
    expect(appShell).toContain("خروج از نشست");
  });

  it("labels a platform role rather than showing its identifier", () => {
    // A raw `platform:ops` in the sidebar is the same identifier problem the
    // record chips solved, in another place.
    expect(networkWorkspaceRoleLabel("platform:ops", "پیش‌فرض")).toBe("کارشناس عملیات پلتفرم");
    expect(networkWorkspaceRoleLabel("platform:reviewer", "پیش‌فرض")).toBe("داور پلتفرم");
    // Organization roles keep the labels they already had.
    expect(networkWorkspaceRoleLabel("org:publisher", "پیش‌فرض")).toBe("منتشرکننده سازمان");
    // An unmapped role falls back rather than printing itself.
    expect(networkWorkspaceRoleLabel("individual", "پیش‌فرض")).toBe("پیش‌فرض");
  });

  it("does not caption a connected shell with a fixture person", () => {
    // The operations shell showed "ندا اکبری" beside that operator's real
    // publication queue -- chrome is the one place a human trusts to say who
    // they are.
    expect(shells).toContain("connectedSession && connectedWorkspace");
    expect(shells).toContain("runtime.me?.user.display_name");
  });
});

describe("a single workspace is entered, not offered as a choice", () => {
  const memory = readFileSync("apps/api/src/in-memory-identity.ts", "utf8");
  const postgres = readFileSync("apps/api/src/postgres/identity-workspace.ts", "utf8");
  const api = readFileSync("apps/api/src/app.ts", "utf8");

  it("decides the active context from how many workspaces are reachable", () => {
    // Both adapters have to agree, or the demo and connected runtimes would
    // disagree about whether signing in leaves you anywhere.
    for (const source of [memory, postgres]) {
      expect(source).toMatch(/onlyWorkspace/);
      expect(source).toMatch(/onlyWorkspace \? "continue" : "select_workspace"/);
    }
    // The PostgreSQL side asks for two rows and treats exactly one as decisive,
    // so a third membership cannot be silently ignored.
    expect(postgres).toMatch(/LIMIT 2/);
    expect(postgres).toMatch(/reachable\.rowCount === 1/);
  });

  it("sends a completed sign-in to the workspace resolver", () => {
    // Landing everyone on the organization's challenge form put a platform
    // operator and a reviewer on a page they have no authority for, one
    // navigation after signing in successfully.
    expect(api).toMatch(/\.header\("location", "\/app"\)/);
    expect(api).not.toContain('"location", "/app/org/challenges/new"');
  });
});

describe("controls the connected contract cannot honour are not offered", () => {
  it("hides the draft delete where no server command exists", () => {
    // The connected adapter refuses it with a typed message, which is honest,
    // but a control that can only ever fail should not be offered at all.
    // Discarding a draft needs an authorised invalidation rather than a
    // delete, because a challenge version is append-only evidence.
    const list = readFileSync("components/challenge-flow/list-page.tsx", "utf8");
    expect(list).toContain("!isNetworkWebRuntime");
    const network = readFileSync("lib/challenges/adapters/network.ts", "utf8");
    expect(network).toContain("حذف پیش‌نویس هنوز در قرارداد سرور این فاز نیست.");
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { createPrivateFileGateway } from "@/lib/workspace/private-files";

const mock = vi.hoisted(() => ({ request: vi.fn(), sequence: 0 }));
vi.mock("@/lib/api/http", () => ({
  requestApi: mock.request,
  idempotencyKey: (prefix: string) => `${prefix}-${++mock.sequence}`,
}));
beforeEach(() => {
  mock.request.mockReset();
  mock.sequence = 0;
});
const ok = (data: unknown) => ({ ok: true, data, meta: {} });
const failed = { ok: false, error: { code: "STORAGE" }, meta: {} };

it("retries an uncertain completion with the same reservation, bytes, version and command keys", async () => {
  const reserved = ok({
    file: { id: "fil_test_001", version: 1 },
    upload_url: "/api/v1/files/fil_test_001/upload?token=synthetic",
  });
  const uploaded = ok({ file: { id: "fil_test_001", version: 2 } });
  mock.request
    .mockResolvedValueOnce(reserved)
    .mockResolvedValueOnce(uploaded)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(reserved)
    .mockResolvedValueOnce(uploaded)
    .mockResolvedValueOnce(ok({ file: { version: 3 } }));
  const gateway = createPrivateFileGateway("wsp_test_001", {
    entity_type: "proposal",
    entity_id: "prp_test_001",
  });
  const file = new File(["%PDF-test"], "test.pdf", { type: "application/pdf" });
  expect((await gateway.upload(file, 1)).ok).toBe(false);
  expect((await gateway.upload(file, 2)).ok).toBe(true);
  const calls = mock.request.mock.calls;
  for (let i = 0; i < 3; i++) expect(calls[i]![1]).toEqual(calls[i + 3]![1]);
  expect(calls[1]![1].body).toBe(file);
  expect(calls[1]![1].headers["content-type"]).toBe("application/pdf");
  expect(JSON.parse(calls[2]![1].body)).toEqual({ expected_version: 2 });
});

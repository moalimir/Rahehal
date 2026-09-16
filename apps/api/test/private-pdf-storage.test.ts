import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { ClamAvPdfScanner, PrivatePdfStorage } from "../src/private-pdf-storage.js";

describe("private PDF scanner transport", () => {
  it.each([
    ["stream: Synthetic-Test FOUND\0", "rejected"],
    ["INSTREAM size limit exceeded. ERROR\0", "scan_failed"],
    ["unexpected\0", "scan_failed"],
    ["", "scan_failed"],
  ] as const)("fails closed for %j", async (reply, expected) => {
    let received = Buffer.alloc(0);
    const bytes = Buffer.from("%PDF-1.7 synthetic transport fixture");
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length >= 10 + 4 + bytes.length + 4) socket.end(reply);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const scanner = new ClamAvPdfScanner("127.0.0.1", (server.address() as AddressInfo).port);
      expect(await scanner.scan("/nonexistent-synthetic.pdf", bytes)).toBe(expected);
      expect(received.subarray(0, 10).toString()).toBe("zINSTREAM\0");
      expect(received.readUInt32BE(10)).toBe(bytes.length);
      expect(received.subarray(14, -4)).toEqual(bytes);
      expect(received.readUInt32BE(received.length - 4)).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("binds signed tokens to action, actor, workspace and expiry", () => {
    const storage = new PrivatePdfStorage(
      "/synthetic-private-files",
      "synthetic-secret-for-unit-test-only",
      { scan: async () => "scan_failed" },
    );
    const binding = "download:usr_one:ten_one:wsp_one:fil_one";
    const token = storage.sign(binding, Date.now() + 60_000);
    expect(() => storage.verify(token, binding)).not.toThrow();
    for (const altered of [
      binding.replace("download", "upload"),
      binding.replace("usr_one", "usr_two"),
      binding.replace("wsp_one", "wsp_two"),
    ]) {
      expect(() => storage.verify(token, altered)).toThrow();
    }
    expect(() => storage.verify(storage.sign(binding, Date.now() - 1), binding)).toThrow();
    expect(() => storage.path("../escape")).toThrow();
  });
});

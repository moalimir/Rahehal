import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { connect } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { privatePdfMaxBytes } from "@rahhal/contracts";
import { ApiProblem, notFound } from "./errors.js";

const exec = promisify(execFile);
export type PdfScanResult = "clean" | "rejected" | "scan_failed";
export interface PdfScanner {
  scan(path: string, content: Buffer): Promise<PdfScanResult>;
}

/** Scanner errors, timeouts and unknown replies can never mark a file clean. */
export class ClamAvPdfScanner implements PdfScanner {
  constructor(
    private readonly host: string,
    private readonly port = 3310,
  ) {}
  async scan(path: string, content: Buffer): Promise<PdfScanResult> {
    try {
      const malware = await new Promise<PdfScanResult>((resolve) => {
        const socket = connect({ host: this.host, port: this.port });
        let response = "";
        const finish = (result: PdfScanResult) => {
          socket.destroy();
          resolve(result);
        };
        socket.setTimeout(30_000, () => finish("scan_failed"));
        socket.on("error", () => finish("scan_failed"));
        socket.on("connect", () => {
          socket.write("zINSTREAM\0");
          const length = Buffer.alloc(4);
          length.writeUInt32BE(content.length);
          socket.write(length);
          socket.write(content);
          socket.write(Buffer.alloc(4));
        });
        socket.on("data", (chunk: Buffer) => {
          response += chunk.toString("utf8");
          if (response.length > 4096) return finish("scan_failed");
          if (response.includes("\0"))
            finish(
              response === "stream: OK\0"
                ? "clean"
                : / FOUND\0$/.test(response)
                  ? "rejected"
                  : "scan_failed",
            );
        });
        socket.on("end", () => finish("scan_failed"));
      });
      if (malware !== "clean") return malware;
      if (!/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(content.subarray(0, 8).toString("ascii")))
        return "rejected";
      // qpdf checks structure/streams rather than trusting extension or MIME.
      await exec("qpdf", ["--check", path], { timeout: 15_000, maxBuffer: 64 * 1024 });
      try {
        await exec("qpdf", ["--is-encrypted", path], { timeout: 15_000, maxBuffer: 4096 });
        return "rejected";
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== 2)
          return "scan_failed";
      }
      return "clean";
    } catch (error) {
      return error instanceof Error && "code" in error && typeof error.code === "number"
        ? "rejected"
        : "scan_failed";
    }
  }
}

/** Local private-volume adapter; never mounted by web or served as static files. */
export class PrivatePdfStorage {
  constructor(
    readonly root: string,
    private readonly secret: string,
    readonly scanner: PdfScanner,
  ) {
    if (!isAbsolute(root) || secret.length < 32)
      throw new Error("Private file root and signing secret are required");
  }
  key(): string {
    return randomBytes(32).toString("hex");
  }
  path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw notFound();
    return join(this.root, key);
  }
  async put(key: string, content: Buffer): Promise<string> {
    if (!content.length || content.length > privatePdfMaxBytes)
      throw new ApiProblem(422, "VALIDATION", "Invalid PDF size");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const digest = createHash("sha256").update(content).digest("hex");
    try {
      const handle = await open(this.path(key), "wx", 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      if (
        createHash("sha256")
          .update(await this.read(key))
          .digest("hex") !== digest
      )
        throw new ApiProblem(409, "CONFLICT", "Upload bytes cannot be replaced");
    }
    return digest;
  }
  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }
  sign(binding: string, expires: number): string {
    return `${expires}.${createHmac("sha256", this.secret).update(`${binding}:${expires}`).digest("hex")}`;
  }
  verify(token: string, binding: string): void {
    const [expiry, signature] = token.split(".");
    const expires = Number(expiry);
    if (
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw notFound();
    const expected = this.sign(binding, expires).split(".")[1]!;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw notFound();
  }
}

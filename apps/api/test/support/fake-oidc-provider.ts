import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";

type AuthorizationRecord = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  used: boolean;
};

export type FakeOidcProviderOptions = {
  readonly emailVerified?: boolean;
  readonly nonceOverride?: string;
};

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function idToken(
  privateKey: KeyObject,
  issuer: string,
  record: AuthorizationRecord,
  options: FakeOidcProviderOptions,
): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64UrlJson({ alg: "RS256", kid: "fake-oidc-key", typ: "JWT" });
  const payload = base64UrlJson({
    iss: issuer,
    sub: "owner-alpha",
    aud: record.clientId,
    exp: now + 300,
    iat: now,
    auth_time: now,
    nonce: options.nonceOverride ?? record.nonce,
    email: "owner-alpha@synthetic.invalid",
    email_verified: options.emailVerified ?? true,
    name: "Synthetic Organization Owner",
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

export class FakeOidcProvider {
  private readonly records = new Map<string, AuthorizationRecord>();
  private readonly privateKey: KeyObject;
  private readonly publicJwk: Record<string, unknown>;
  private readonly server: Server;
  private sequence = 0;
  private originValue = "";
  tokenExchangeCount = 0;

  constructor(private readonly options: FakeOidcProviderOptions = {}) {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
    this.privateKey = pair.privateKey;
    this.publicJwk = pair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    this.server = createServer((request, response) => void this.handle(request, response));
  }

  get issuer(): string {
    if (!this.originValue) throw new Error("Fake OIDC provider has not started");
    return this.originValue;
  }

  async start(): Promise<void> {
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Fake provider has no TCP address");
    this.originValue = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    this.server.close();
    await once(this.server, "close");
  }

  private json(response: ServerResponse, value: unknown) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(value));
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = new URL(request.url ?? "/", this.issuer);
      if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
        this.json(response, {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["none"],
          scopes_supported: ["openid", "email", "profile"],
          code_challenge_methods_supported: ["S256"],
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/jwks") {
        this.json(response, {
          keys: [{ ...this.publicJwk, kid: "fake-oidc-key", alg: "RS256", use: "sig" }],
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/authorize") {
        const clientId = url.searchParams.get("client_id");
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        const nonce = url.searchParams.get("nonce");
        const codeChallenge = url.searchParams.get("code_challenge");
        if (
          !clientId ||
          !redirectUri ||
          !state ||
          !nonce ||
          !codeChallenge ||
          url.searchParams.get("response_type") !== "code" ||
          url.searchParams.get("code_challenge_method") !== "S256"
        ) {
          response.writeHead(400).end();
          return;
        }
        this.sequence += 1;
        const code = `fake-authorization-code-${this.sequence}`;
        this.records.set(code, {
          clientId,
          redirectUri,
          nonce,
          codeChallenge,
          used: false,
        });
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", state);
        response.writeHead(302, { location: callback.toString() }).end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/token") {
        this.tokenExchangeCount += 1;
        const body = new URLSearchParams(await requestBody(request));
        const code = body.get("code") ?? "";
        const record = this.records.get(code);
        const verifier = body.get("code_verifier") ?? "";
        const calculatedChallenge = createHash("sha256").update(verifier).digest("base64url");
        if (
          !record ||
          record.used ||
          body.get("grant_type") !== "authorization_code" ||
          body.get("client_id") !== record.clientId ||
          body.get("redirect_uri") !== record.redirectUri ||
          calculatedChallenge !== record.codeChallenge
        ) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        record.used = true;
        this.json(response, {
          access_token: `fake-provider-access-${this.sequence}`,
          token_type: "Bearer",
          expires_in: 300,
          id_token: idToken(this.privateKey, this.issuer, record, this.options),
        });
        return;
      }
      response.writeHead(404).end();
    } catch {
      response.writeHead(500).end();
    }
  }
}

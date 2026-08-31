import type { SessionTokenSet } from "@rahhal/contracts";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type BrowserSessionRuntimeSettings = {
  readonly origin: string;
  readonly redirectUri: string;
  readonly secureCookies: boolean;
};

export type BrowserAuthorizationFlow = {
  readonly state: string;
  readonly codeVerifier: string;
  readonly expiresAt: string;
};

export const browserCookieNames = {
  flow: "rahhal-oidc-flow",
  access: "rahhal-access",
  refresh: "rahhal-refresh",
} as const;

function exactOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value.replace(/\/$/, "") !== url.origin
  ) {
    throw new Error("RAHHAL_BROWSER_ORIGIN must be an exact origin without path or credentials");
  }
  return url;
}

export function browserSessionRuntimeSettings(
  environment: NodeJS.ProcessEnv,
): BrowserSessionRuntimeSettings | undefined {
  const configured = environment.RAHHAL_BROWSER_ORIGIN?.trim();
  if (!configured) return undefined;

  const url = exactOrigin(configured);
  const production = environment.NODE_ENV === "production";
  if (production && url.protocol !== "https:") {
    throw new Error("RAHHAL_BROWSER_ORIGIN must use HTTPS in production");
  }
  if (url.protocol !== "https:" && (url.protocol !== "http:" || !loopbackHosts.has(url.hostname))) {
    throw new Error("HTTP browser origins are limited to loopback development");
  }

  return {
    origin: url.origin,
    redirectUri: `${url.origin}/auth/browser/callback`,
    secureCookies: url.protocol === "https:",
  };
}

export function parseCookies(value: string | undefined): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  for (const part of value?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const encoded = part.slice(separator + 1).trim();
    if (!name || cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(encoded));
    } catch {
      continue;
    }
  }
  return cookies;
}

function cookie(
  name: string,
  value: string,
  settings: BrowserSessionRuntimeSettings,
  maxAgeSeconds: number,
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    settings.secureCookies ? "Secure" : "",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function encodeBrowserAuthorizationFlow(flow: BrowserAuthorizationFlow): string {
  return Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
}

export function decodeBrowserAuthorizationFlow(value: string): BrowserAuthorizationFlow | null {
  if (value.length > 2_048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.state !== "string" ||
      parsed.state.length < 32 ||
      typeof parsed.codeVerifier !== "string" ||
      parsed.codeVerifier.length < 43 ||
      typeof parsed.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.expiresAt))
    ) {
      return null;
    }
    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function lifetimeSeconds(expiresAt: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / 1_000));
}

export function authorizationFlowCookie(
  flow: BrowserAuthorizationFlow,
  settings: BrowserSessionRuntimeSettings,
  now: Date,
): string {
  return cookie(
    browserCookieNames.flow,
    encodeBrowserAuthorizationFlow(flow),
    settings,
    lifetimeSeconds(flow.expiresAt, now),
  );
}

export function sessionCookies(
  tokens: SessionTokenSet,
  settings: BrowserSessionRuntimeSettings,
  now: Date,
): readonly string[] {
  return [
    cookie(
      browserCookieNames.access,
      tokens.access_token,
      settings,
      lifetimeSeconds(tokens.access_token_expires_at, now),
    ),
    cookie(
      browserCookieNames.refresh,
      tokens.refresh_token,
      settings,
      lifetimeSeconds(tokens.refresh_token_expires_at, now),
    ),
  ];
}

export function clearBrowserSessionCookies(
  settings: BrowserSessionRuntimeSettings,
): readonly string[] {
  return [
    cookie(browserCookieNames.flow, "", settings, 0),
    cookie(browserCookieNames.access, "", settings, 0),
    cookie(browserCookieNames.refresh, "", settings, 0),
  ];
}

export function clearBrowserAuthorizationFlowCookie(
  settings: BrowserSessionRuntimeSettings,
): string {
  return cookie(browserCookieNames.flow, "", settings, 0);
}

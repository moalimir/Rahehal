import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const webRuntime = process.env.RAHHAL_WEB_RUNTIME ?? "demo";
if (webRuntime !== "demo" && webRuntime !== "network") {
  throw new Error("RAHHAL_WEB_RUNTIME must be explicitly demo or network");
}
const networkRuntime = webRuntime === "network";
const internalApiOrigin = process.env.RAHHAL_API_INTERNAL_URL ?? "http://127.0.0.1:3001";

if (networkRuntime) {
  const apiUrl = new URL(internalApiOrigin);
  if (!["http:", "https:"].includes(apiUrl.protocol) || apiUrl.pathname !== "/") {
    throw new Error("RAHHAL_API_INTERNAL_URL must be an HTTP(S) origin");
  }
}

const nextConfig: NextConfig = {
  output: networkRuntime ? "standalone" : "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_RAHHAL_WEB_RUNTIME: webRuntime,
  },
  async rewrites() {
    if (!networkRuntime) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiOrigin.replace(/\/$/, "")}/api/:path*`,
      },
      {
        source: "/auth/browser/:path*",
        destination: `${internalApiOrigin.replace(/\/$/, "")}/auth/browser/:path*`,
      },
    ];
  },
  webpack(config, { webpack }) {
    // The demo build is a static export with no API behind it. Replace the
    // connected-runtime modules with a stub so the network gateway and the
    // browser-session client stay out of the demo bundle instead of shipping
    // as unreachable code. See lib/runtime/network-disabled.ts.
    if (!networkRuntime) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@\/(?:components\/(?:challenge-flow\/(?:connected-record-links|evaluation-page|live-call-controls|rubric-page)|internal\/network-internal-boundary|organization-preview-notice|platform-approval-queue|portal\/network-organization-login|public-challenge-(?:catalogue|record)|site-header-session|solver\/connected-proposal-record)|lib\/(?:api\/http|auth\/(?:network-organization-shell|network-session)|challenges\/adapters\/network(?:-governance|-public-challenges)?))$/,
          path.join(projectRoot, "lib/runtime/network-disabled.ts"),
        ),
      );
    }
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);

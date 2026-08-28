export type WebRuntimeMode = "demo" | "network";

const configured = process.env.NEXT_PUBLIC_RAHHAL_WEB_RUNTIME;

export const webRuntimeMode: WebRuntimeMode = configured === "network" ? "network" : "demo";
export const isNetworkWebRuntime = webRuntimeMode === "network";

import type { MutationFailure } from "@/domain/solver";

export const now = () => new Date().toISOString();
export const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function fail(code: MutationFailure["code"], message: string): MutationFailure {
  return { ok: false, code, message };
}

export function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

type Envelope<T> = { version: 1; value: T; updatedAt: string };

const PREFIX = "rahhal.solver.ui.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}:${key}`) ?? "null") as Envelope<T> | null;
    return parsed?.version === 1 ? parsed.value : fallback;
  } catch {
    localStorage.removeItem(`${PREFIX}:${key}`);
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(
      `${PREFIX}:${key}`,
      JSON.stringify({ version: 1, value, updatedAt: new Date().toISOString() } satisfies Envelope<T>),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeSolverUiValue(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${PREFIX}:${key}`);
  } catch {
    // The active in-memory flow remains usable when storage is unavailable.
  }
}

export function readChallengeLayout() {
  return read<"grid" | "list">("challenge-layout", "grid");
}

export function writeChallengeLayout(layout: "grid" | "list") {
  return write("challenge-layout", layout);
}

export function readTeamCreationDraft<T>(fallback: T) {
  return read<T>("team-creation-draft", fallback);
}

export function writeTeamCreationDraft<T>(draft: T) {
  return write("team-creation-draft", draft);
}

export function readLegacyScopedDraft<T>(scope: string, fallback: T) {
  return read<T>(`legacy-draft:${scope}`, fallback);
}

export function writeLegacyScopedDraft<T>(scope: string, draft: T) {
  return write(`legacy-draft:${scope}`, draft);
}

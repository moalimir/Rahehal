import { parsePrefixedId, type IdPrefix, type PrefixedId } from "@rahhal/domain";

const DEFAULT_TIME = "2026-01-01T00:00:00.000Z";

export function deterministicId<Prefix extends IdPrefix>(
  prefix: Prefix,
  ordinal = 1,
): PrefixedId<Prefix> {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError("ordinal must be a non-negative safe integer");
  }

  const body = ordinal.toString(36).toUpperCase().padStart(16, "0");
  return parsePrefixedId(`${prefix}_${body}`, prefix);
}

export type DeterministicIdFactory = {
  next<Prefix extends IdPrefix>(prefix: Prefix): PrefixedId<Prefix>;
};

export function createDeterministicIdFactory(startAt = 1): DeterministicIdFactory {
  let nextOrdinal = startAt;

  return {
    next<Prefix extends IdPrefix>(prefix: Prefix): PrefixedId<Prefix> {
      const id = deterministicId(prefix, nextOrdinal);
      nextOrdinal += 1;
      return id;
    },
  };
}

export type DeterministicClock = {
  now(): string;
};

export function createDeterministicClock(
  start = DEFAULT_TIME,
  stepMilliseconds = 1_000,
): DeterministicClock {
  const startMilliseconds = Date.parse(start);
  if (!Number.isFinite(startMilliseconds)) {
    throw new RangeError("start must be an ISO-8601 timestamp");
  }
  if (!Number.isSafeInteger(stepMilliseconds) || stepMilliseconds < 0) {
    throw new RangeError("stepMilliseconds must be a non-negative safe integer");
  }

  let tick = 0;
  return {
    now(): string {
      const value = new Date(startMilliseconds + tick * stepMilliseconds).toISOString();
      tick += 1;
      return value;
    },
  };
}

export const fixedTimestamp = DEFAULT_TIME;

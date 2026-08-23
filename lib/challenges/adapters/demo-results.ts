import {
  ChallengeDemoStorageError,
  isChallengeDemoStorageAvailable,
} from "@/lib/challenges/storage";

type DemoResultMeta = {
  readonly server_time: string;
  readonly correlation_id: string;
};

type DemoFailure<ErrorCode extends string> = {
  ok: false;
  error: { code: ErrorCode; message: string };
  meta: DemoResultMeta;
};

type DemoResult<Data, ErrorCode extends string> =
  | { ok: true; data: Data; meta: DemoResultMeta }
  | DemoFailure<ErrorCode>;

export function createDemoResultFactory<ErrorCode extends string>(
  kind: "challenge" | "opportunity",
  storageMessage: string,
) {
  const meta = (operation: string): DemoResultMeta => ({
    server_time: new Date().toISOString(),
    correlation_id: `cor_demo_${kind}_${operation}`,
  });

  const success = <Data>(operation: string, data: Data): DemoResult<Data, ErrorCode> => ({
    ok: true,
    data,
    meta: meta(operation),
  });

  const failure = (
    operation: string,
    code: ErrorCode,
    message: string,
  ): DemoFailure<ErrorCode> => ({
    ok: false,
    error: { code, message },
    meta: meta(operation),
  });

  const withDemoStorage = <Data>(
    operation: string,
    action: () => DemoResult<Data, ErrorCode>,
  ): DemoResult<Data, ErrorCode> => {
    if (!isChallengeDemoStorageAvailable())
      return failure(operation, "STORAGE" as ErrorCode, storageMessage);
    try {
      return action();
    } catch (error) {
      if (error instanceof ChallengeDemoStorageError) {
        return failure(operation, "STORAGE" as ErrorCode, storageMessage);
      }
      throw error;
    }
  };

  return { success, failure, withDemoStorage };
}

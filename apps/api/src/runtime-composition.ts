import { createDemoApiComposition } from "./demo-composition.js";
import { createPostgresApiComposition } from "./postgres-composition.js";
import type { ApiPorts } from "./ports.js";

export type RuntimeApiComposition = {
  readonly ports: ApiPorts;
  close(): Promise<void>;
};

export async function createRuntimeApiComposition(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeApiComposition> {
  switch (environment.RAHHAL_API_MODE) {
    case "demo": {
      const demo = createDemoApiComposition({
        mode: "demo",
        nodeEnv: environment.NODE_ENV,
      });
      return { ports: demo.ports, close: async () => undefined };
    }
    case "postgres":
      return createPostgresApiComposition({ environment });
    default:
      throw new Error(
        "RAHHAL_API_MODE must explicitly be either demo or postgres; no runtime fallback is permitted",
      );
  }
}

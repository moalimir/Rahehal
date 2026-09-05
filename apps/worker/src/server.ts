import { createDemoWorkerComposition } from "./demo-composition.js";
import { createPostgresWorkerComposition } from "./postgres-composition.js";

// `postgres` runs the connected notification projector against durable outbox
// claims; `demo` keeps the in-memory walking skeleton.
const mode = process.env.RAHHAL_WORKER_MODE;
const composition =
  mode === "postgres"
    ? createPostgresWorkerComposition({})
    : createDemoWorkerComposition({ mode, nodeEnv: process.env.NODE_ENV });
const { consumer } = composition;

const interval = setInterval(() => {
  void consumer.pollOnce().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "worker poll failed"}\n`);
  });
}, 1_000);

const stop = () => {
  clearInterval(interval);
  if ("close" in composition) void composition.close();
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

import { createDemoWorkerComposition } from "./demo-composition.js";

const { consumer } = createDemoWorkerComposition({
  mode: process.env.RAHHAL_WORKER_MODE,
  nodeEnv: process.env.NODE_ENV,
});

const interval = setInterval(() => {
  void consumer.pollOnce().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "worker poll failed"}\n`);
  });
}, 1_000);

const stop = () => {
  clearInterval(interval);
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

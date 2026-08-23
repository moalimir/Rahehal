import { buildApi } from "./app.js";
import { createDemoApiComposition } from "./demo-composition.js";

const port = Number(process.env.RAHHAL_API_PORT ?? "3001");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("RAHHAL_API_PORT must be an integer from 1 to 65535");
}

const composition = createDemoApiComposition({
  mode: process.env.RAHHAL_API_MODE,
  nodeEnv: process.env.NODE_ENV,
});
const app = buildApi(composition.ports);

await app.listen({
  host: process.env.RAHHAL_API_HOST ?? "127.0.0.1",
  port,
});

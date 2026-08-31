import { buildApi } from "./app.js";
import { browserSessionRuntimeSettings } from "./browser-session.js";
import { createRuntimeApiComposition } from "./runtime-composition.js";

const port = Number(process.env.RAHHAL_API_PORT ?? "3001");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("RAHHAL_API_PORT must be an integer from 1 to 65535");
}

const composition = await createRuntimeApiComposition();
const app = buildApi(composition.ports, {
  browserSession: browserSessionRuntimeSettings(process.env),
});

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  await composition.close();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

try {
  await app.listen({
    host: process.env.RAHHAL_API_HOST ?? "127.0.0.1",
    port,
  });
} catch (error) {
  await composition.close();
  throw error;
}

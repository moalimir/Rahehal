import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { openApiDocument } from "../dist/openapi.js";

const outputUrl = new URL("../dist/openapi.json", import.meta.url);

await mkdir(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");

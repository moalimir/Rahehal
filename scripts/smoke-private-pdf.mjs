import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const apiOrigin = new URL(
  process.env.RAHHAL_API_URL?.trim() || `http://127.0.0.1:${process.env.RAHHAL_API_PORT ?? "3001"}`,
);
const pdfPath = resolve(
  process.env.RAHHAL_PDF_EXAMPLE || "output/pdf/rahhal-private-pdf-example.pdf",
);
const ownerHeaders = {
  authorization: "Bearer local-a1b-access-owner-alpha",
  "x-workspace-id": "wsp_org_alpha",
};
const outsiderHeaders = {
  authorization: "Bearer local-seed-access-platform-ops",
  "x-workspace-id": "wsp_platform_main",
};
const runId = randomUUID();

async function request(path, init = {}, expectedStatuses = [200]) {
  const response = await fetch(new URL(path, apiOrigin), {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned HTTP ${response.status}: ${await response.text()}`,
    );
  }
  return response;
}

async function json(path, init = {}, expectedStatuses) {
  return (await request(path, init, expectedStatuses)).json();
}

function commandHeaders(step) {
  return {
    ...ownerHeaders,
    "content-type": "application/json",
    "idempotency-key": `private-pdf-smoke-${runId}-${step}`,
  };
}

async function createChallenge() {
  const response = await json(
    "/api/v1/challenges",
    {
      method: "POST",
      headers: commandHeaders("create-challenge"),
      body: JSON.stringify({
        expected_version: 0,
        draft: { title: "نمونه پایدار پذیرش PDF خصوصی" },
      }),
    },
    [201],
  );
  return { id: response.data.entity_id, version: response.meta.entity_version };
}

async function loadChallenge(id) {
  const response = await json(`/api/v1/challenges/${id}`, { headers: ownerHeaders });
  return { id, version: response.data.version };
}

async function reserve(challenge, filename, bytes, suffix) {
  const response = await json("/api/v1/files:request-upload", {
    method: "POST",
    headers: commandHeaders(`reserve-${suffix}`),
    body: JSON.stringify({
      entity_type: "challenge",
      entity_id: challenge.id,
      expected_version: challenge.version,
      filename,
      mime: "application/pdf",
      classification: "confidential",
      size: bytes.length,
    }),
  });
  return response.data;
}

async function uploadAndComplete(challenge, filename, bytes, suffix) {
  const reservation = await reserve(challenge, filename, bytes, suffix);
  const uploaded = await json(reservation.upload_url, {
    method: "PUT",
    headers: {
      ...ownerHeaders,
      "content-type": "application/pdf",
      "idempotency-key": `private-pdf-smoke-${runId}-upload-${suffix}`,
    },
    body: bytes,
  });
  const file = uploaded.data.file;
  await request(`/api/v1/files/${file.id}:download-url`, { headers: ownerHeaders }, [404]);
  await json(`/api/v1/files/${file.id}:complete`, {
    method: "POST",
    headers: commandHeaders(`complete-${suffix}`),
    body: JSON.stringify({ expected_version: file.version }),
  });
  return file.id;
}

async function waitForState(fileId, acceptedStates) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await json(`/api/v1/files/${fileId}`, { headers: ownerHeaders });
    if (acceptedStates.includes(response.data.state)) return response.data;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Timed out waiting for ${fileId} to reach ${acceptedStates.join("/")}`);
}

const challenge = process.env.RAHHAL_PDF_CHALLENGE_ID
  ? await loadChallenge(process.env.RAHHAL_PDF_CHALLENGE_ID)
  : await createChallenge();
const validBytes = await readFile(pdfPath);
const cleanId = await uploadAndComplete(challenge, basename(pdfPath), validBytes, "clean");
const clean = await waitForState(cleanId, ["clean", "rejected", "scan_failed"]);
if (clean.state !== "clean") throw new Error(`Valid PDF scanner verdict was ${clean.state}`);

const grant = await json(`/api/v1/files/${cleanId}:download-url`, { headers: ownerHeaders });
const downloaded = Buffer.from(
  await (await request(grant.data.download_url, { headers: ownerHeaders })).arrayBuffer(),
);
if (!downloaded.equals(validBytes)) throw new Error("Authorized download changed the PDF bytes");
await request(grant.data.download_url, {}, [403]);
await request(grant.data.download_url, { headers: outsiderHeaders }, [403]);

const malformedBytes = Buffer.from("%PDF-1.4\nsynthetic malformed PDF for qpdf rejection\n%%EOF\n");
const malformedId = await uploadAndComplete(
  challenge,
  "synthetic-malformed.pdf",
  malformedBytes,
  "malformed",
);
const malformed = await waitForState(malformedId, ["clean", "rejected", "scan_failed"]);
if (malformed.state !== "rejected") {
  throw new Error(`Malformed PDF scanner verdict was ${malformed.state}`);
}

const eicarSignature = [
  "X5O!P%@AP[4\\PZX54(P^)",
  "7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");
const malwareBytes = Buffer.from(`%PDF-1.4\n% ${eicarSignature}\n%%EOF\n`);
const malwareId = await uploadAndComplete(
  challenge,
  "synthetic-eicar-test.pdf",
  malwareBytes,
  "malware",
);
const malware = await waitForState(malwareId, ["clean", "rejected", "scan_failed"]);
if (malware.state !== "rejected") {
  throw new Error(`EICAR scanner verdict was ${malware.state}`);
}

await json(`/api/v1/challenges/${challenge.id}`, {
  method: "PATCH",
  headers: commandHeaders("attach-clean"),
  body: JSON.stringify({
    expected_version: challenge.version,
    patch: { attachment_ids: [cleanId] },
  }),
});

await json(
  "/api/v1/files:request-upload",
  {
    method: "POST",
    headers: commandHeaders("oversized"),
    body: JSON.stringify({
      entity_type: "challenge",
      entity_id: challenge.id,
      expected_version: challenge.version + 1,
      filename: "synthetic-oversized.pdf",
      mime: "application/pdf",
      classification: "confidential",
      size: 10 * 1024 * 1024 + 1,
    }),
  },
  [422],
);

process.stdout.write(
  `Private PDF smoke passed: challenge=${challenge.id} clean=${cleanId} malformed=${malformedId} malware=${malwareId}\n`,
);

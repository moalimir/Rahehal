import {
  privateFileRoutes,
  type FileTarget,
  type PrivateFileResource,
  type PrivateFileMutationResource,
  type PrivateFileUploadResource,
  type PrivateFileDownloadResource,
  type SuccessEnvelope,
  type RequestFileUploadBody,
} from "@rahhal/contracts";
import { idempotencyKey, requestApi } from "@/lib/api/http";

export function createPrivateFileGateway(workspaceId: string, target: FileTarget) {
  const headers = { "x-workspace-id": workspaceId };
  const path = (template: string, id: string) =>
    template.replace("{fileId}", encodeURIComponent(id));
  const attempts = new WeakMap<
    File,
    { requestKey: string; uploadKey: string; completeKey: string; body?: RequestFileUploadBody }
  >();
  return {
    list: () =>
      requestApi<SuccessEnvelope<readonly PrivateFileResource[]>>(
        `${privateFileRoutes.list}?${new URLSearchParams(target)}`,
        { headers },
      ),
    async upload(file: File, expectedVersion?: number) {
      let attempt = attempts.get(file);
      if (!attempt) {
        attempt = {
          requestKey: idempotencyKey("pdf-request"),
          uploadKey: idempotencyKey("pdf-upload"),
          completeKey: idempotencyKey("pdf-complete"),
        };
        attempts.set(file, attempt);
      }
      if (!attempt.body) {
        let version = expectedVersion;
        if (version === undefined) {
          const record = await requestApi<SuccessEnvelope<{ version: number }>>(
            `/api/v1/${target.entity_type === "proposal" ? "proposals" : "challenges"}/${encodeURIComponent(target.entity_id)}`,
            { headers },
          );
          if (!record.ok) return record;
          version = record.data.version;
        }
        attempt.body = {
          ...target,
          expected_version: version,
          filename: file.name,
          mime: "application/pdf",
          size: file.size,
          classification: "confidential",
        };
      }
      const reserved = await requestApi<SuccessEnvelope<PrivateFileUploadResource>>(
        privateFileRoutes.requestUpload,
        {
          method: "POST",
          headers: { ...headers, "idempotency-key": attempt.requestKey },
          body: JSON.stringify(attempt.body),
        },
      );
      if (!reserved.ok) {
        if (reserved.error.code === "CONFLICT") attempts.delete(file);
        return reserved;
      }
      const uploaded = await requestApi<SuccessEnvelope<PrivateFileMutationResource>>(
        reserved.data.upload_url,
        {
          method: "PUT",
          headers: {
            ...headers,
            "content-type": "application/pdf",
            "idempotency-key": attempt.uploadKey,
          },
          body: file,
        },
      );
      if (!uploaded.ok) return uploaded;
      return requestApi<SuccessEnvelope<PrivateFileMutationResource>>(
        path(privateFileRoutes.complete, uploaded.data.file.id),
        {
          method: "POST",
          headers: { ...headers, "idempotency-key": attempt.completeKey },
          body: JSON.stringify({ expected_version: uploaded.data.file.version }),
        },
      );
    },
    retryScan: (file: PrivateFileResource) =>
      requestApi<SuccessEnvelope<PrivateFileMutationResource>>(
        path(privateFileRoutes.complete, file.id),
        {
          method: "POST",
          headers: { ...headers, "idempotency-key": idempotencyKey("pdf-rescan") },
          body: JSON.stringify({ expected_version: file.version }),
        },
      ),
    async download(file: PrivateFileResource): Promise<boolean> {
      const grant = await requestApi<SuccessEnvelope<PrivateFileDownloadResource>>(
        path(privateFileRoutes.downloadUrl, file.id),
        { headers },
      );
      if (!grant.ok) return false;
      try {
        const response = await fetch(grant.data.download_url, {
          headers,
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("application/pdf"))
          return false;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      } catch {
        return false;
      }
    },
  };
}

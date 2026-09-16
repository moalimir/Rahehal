import type { FileId } from "@rahhal/domain";
import type { MutationReceipt } from "./envelopes.js";

export const privatePdfMaxBytes = 10 * 1024 * 1024;
export const privateFileStates = [
  "awaiting_upload",
  "quarantined",
  "pending_scan",
  "clean",
  "rejected",
  "scan_failed",
] as const;
export type PrivateFileState = (typeof privateFileStates)[number];
export type FileTarget = {
  readonly entity_type: "challenge" | "proposal";
  readonly entity_id: string;
};
export type RequestFileUploadBody = FileTarget & {
  readonly expected_version: number;
  readonly filename: string;
  readonly mime: "application/pdf";
  readonly size: number;
  readonly classification: "confidential";
};
export type PrivateFileResource = FileTarget & {
  readonly id: FileId;
  readonly filename: string;
  readonly size: number;
  readonly state: PrivateFileState;
  readonly version: number;
};
export type PrivateFileMutationResource = {
  readonly file: PrivateFileResource;
  readonly receipt: MutationReceipt<FileId>;
};
export type PrivateFileUploadResource = PrivateFileMutationResource & {
  readonly upload_url: string;
  readonly expires_at: string;
};
export type PrivateFileDownloadResource = {
  readonly download_url: string;
  readonly expires_at: string;
};

export const privateFileRoutes = {
  list: "/api/v1/files",
  requestUpload: "/api/v1/files:request-upload",
  file: "/api/v1/files/{fileId}",
  upload: "/api/v1/files/{fileId}/upload",
  complete: "/api/v1/files/{fileId}:complete",
  downloadUrl: "/api/v1/files/{fileId}:download-url",
  content: "/api/v1/files/{fileId}/content",
} as const;

const targetProperties = {
  entity_type: { type: "string", enum: ["proposal", "challenge"] },
  entity_id: { type: "string", pattern: "^(prp|chl)_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;
export const fileTargetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entity_type", "entity_id"],
  properties: targetProperties,
} as const;
export const requestFileUploadSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "entity_type",
    "entity_id",
    "expected_version",
    "filename",
    "mime",
    "size",
    "classification",
  ],
  properties: {
    ...targetProperties,
    expected_version: { type: "integer", minimum: 1 },
    filename: { type: "string", minLength: 5, maxLength: 180 },
    mime: { const: "application/pdf" },
    size: { type: "integer", minimum: 1, maximum: privatePdfMaxBytes },
    classification: { const: "confidential" },
  },
} as const;
export const completeFileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expected_version"],
  properties: { expected_version: { type: "integer", minimum: 1 } },
} as const;
export const privateFileResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "entity_type", "entity_id", "filename", "size", "state", "version"],
  properties: {
    ...targetProperties,
    id: { type: "string", pattern: "^fil_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
    filename: { type: "string" },
    size: { type: "integer", minimum: 1, maximum: privatePdfMaxBytes },
    state: { type: "string", enum: privateFileStates },
    version: { type: "integer", minimum: 1 },
  },
} as const;

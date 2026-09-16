/** Metadata-only lifecycle events; filenames, content and signed URLs never enter outbox. */
export const privateFileOutboxEventTypes = [
  "file.upload_requested",
  "file.quarantined",
  "file.scan_requested",
  "file.clean",
  "file.rejected",
  "file.scan_failed",
] as const;

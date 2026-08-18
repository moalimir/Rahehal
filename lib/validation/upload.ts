const challengeExtensions = new Set(["pdf", "doc", "docx", "xlsx", "csv"]);
const challengeMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export const CHALLENGE_UPLOAD_ACCEPT = ".pdf,.doc,.docx,.xlsx,.csv";
export const CHALLENGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export function safeUploadName(value: string) {
  const leaf = value.split(/[\\/]/).at(-1) ?? "document";
  return (
    leaf
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 180) || "document"
  );
}

export function challengeUploadError(file: File): string {
  const name = safeUploadName(file.name);
  const extension = name.includes(".") ? (name.split(".").at(-1)?.toLowerCase() ?? "") : "";
  if (!challengeExtensions.has(extension)) {
    return "فرمت فایل باید PDF، DOC، DOCX، XLSX یا CSV باشد.";
  }
  if (file.size <= 0 || file.size > CHALLENGE_UPLOAD_MAX_BYTES) {
    return "حجم فایل باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشد.";
  }
  if (file.type && !challengeMimeTypes.has(file.type)) {
    return "نوع واقعی فایل با فرمت مجاز سازگار نیست؛ فایل دیگری انتخاب کنید.";
  }
  return "";
}

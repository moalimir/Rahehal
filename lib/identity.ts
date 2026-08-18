export function getInitials(name: string, limit = 2): string {
  const normalized = name
    .normalize("NFKC")
    .replace(/[\u200c\u200d]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "ر‌ح";
  const words = normalized.split(" ").filter(Boolean);
  const selected = words.length > 1 ? [words[0], words.at(-1)!] : words;
  return selected
    .map((word) => Array.from(word.replace(/[^\p{L}\p{N}]/gu, ""))[0] ?? "")
    .join("‌")
    .slice(0, limit * 2 - 1);
}

export function isolateBidirectional(value: string): string {
  return `\u2068${value}\u2069`;
}

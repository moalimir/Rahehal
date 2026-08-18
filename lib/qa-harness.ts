export function isQaHarnessEnabled(locationLike?: Pick<Location, "search" | "hash">): boolean {
  if (process.env.NEXT_PUBLIC_RAHHAL_QA_HARNESS !== "enabled") return false;
  if (!locationLike) return false;
  const query = `${locationLike.search}&${locationLike.hash.split("?")[1] ?? ""}`;
  return new URLSearchParams(query.replace(/^&/, "")).get("qa") === "1";
}

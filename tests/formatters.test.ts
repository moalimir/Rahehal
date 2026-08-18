import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, pathToSegments } from "@/lib/formatters";

describe("قالب‌بندی فارسی", () => {
  it("عدد را با رقم فارسی نمایش می‌دهد", () => {
    expect(formatNumber(1405)).toContain("۱");
  });

  it("مبلغ همیشه واحد تومان دارد", () => {
    expect(formatMoney(250000000)).toContain("تومان");
  });

  it("مسیر را برای Static Params قطعه‌بندی می‌کند", () => {
    expect(pathToSegments("/org/challenges/new")).toEqual(["org", "challenges", "new"]);
  });
});

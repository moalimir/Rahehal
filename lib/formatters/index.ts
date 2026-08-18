const persianNumber = new Intl.NumberFormat("fa-IR");
const persianDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatNumber(value: number): string {
  return persianNumber.format(value);
}

export function formatMoney(value: number): string {
  return `${persianNumber.format(value)} تومان`;
}

export function formatPersianDate(value: string): string {
  return persianDate.format(new Date(value));
}

export function pathToSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

import Link from "next/link";

export type RahhalLogoVariant = "horizontal" | "inverse" | "mark";
export type RahhalLogoSize = "sm" | "md" | "lg";

export function RahhalLogo({
  variant = "horizontal",
  size = "md",
}: {
  variant?: RahhalLogoVariant;
  size?: RahhalLogoSize;
}) {
  return (
    <span className={`rahhal-logo rahhal-logo--${variant} rahhal-logo--${size}`}>
      <svg viewBox="0 0 56 50" focusable="false" aria-hidden="true">
        <path className="rahhal-logo__top" d="M18 3h25l10 16-9 6-9-12H18Z" />
        <path className="rahhal-logo__right" d="m53 19-13 23H21l-1-13h13l8-14Z" />
        <path className="rahhal-logo__left" d="M21 42 5 30 17 8l11 7-8 14 9 7Z" />
      </svg>
      {variant !== "mark" && <strong>راه‌حل</strong>}
    </span>
  );
}

export function Brand({ inverse = false }: { inverse?: boolean; reference?: boolean }) {
  return (
    <Link className="brand rahhal-brand-link" href="/" aria-label="راه‌حل، صفحهٔ اصلی">
      <RahhalLogo variant={inverse ? "inverse" : "horizontal"} />
    </Link>
  );
}

import { getInitials } from "@/lib/identity";

export function PersonAvatar({
  name,
  className = "",
  title,
}: {
  name: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`person-avatar monogram ${className}`.trim()}
      title={title}
      role="img"
      aria-label={`نشان ${name}`}
    >
      <bdi dir="ltr">{getInitials(name)}</bdi>
    </span>
  );
}

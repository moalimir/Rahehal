import Image from "next/image";
import { getChallengePublisher, type ChallengePublisher } from "@/data/challenge-publishers";
import { getInitials } from "@/lib/identity";

export function ChallengeOrganizationLogo({
  challengeId,
  size = "medium",
}: {
  challengeId: string;
  size?: "small" | "medium" | "large";
}) {
  return <OrganizationLogo organization={getChallengePublisher(challengeId)} size={size} />;
}

export function OrganizationLogo({
  organization,
  size = "medium",
}: {
  organization: ChallengePublisher;
  size?: "small" | "medium" | "large";
}) {
  const asset = organization.logoAsset;
  return (
    <span
      className={`organization-logo-asset organization-logo-asset--${size} organization-logo-asset--${asset.kind}`}
      title={organization.name}
      data-organization-id={organization.id}
    >
      {asset.kind === "image" && asset.src ? (
        <Image
          src={asset.src}
          alt={organization.logoAlt}
          width={180}
          height={180}
          unoptimized
          style={{
            width: "100%",
            height: "100%",
            padding: size === "small" ? 4 : size === "large" ? 8 : 6,
            objectFit: "contain",
            objectPosition: "center",
          }}
        />
      ) : (
        <span
          className="organization-logo-asset__monogram"
          role="img"
          aria-label={organization.logoAlt}
        >
          {getInitials(organization.name)}
        </span>
      )}
    </span>
  );
}

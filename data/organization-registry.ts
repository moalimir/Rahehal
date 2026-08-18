import aparatLogo from "@/public/images/organizations/real/aparat.png";
import alibabaLogo from "@/public/images/organizations/real/alibaba.png";
import asanPardakhtLogo from "@/public/images/organizations/real/asan-pardakht.svg";
import bankMellatLogo from "@/public/images/organizations/real/bank-mellat.svg";
import bankParsianLogo from "@/public/images/organizations/real/bank-parsian.svg";
import bankTejaratLogo from "@/public/images/organizations/real/bank-tejarat.svg";
import cinnagenLogo from "@/public/images/organizations/real/cinnagen.png";
import darouPakhshLogo from "@/public/images/organizations/real/darou-pakhsh.png";
import divarLogo from "@/public/images/organizations/real/divar.png";
import fanapLogo from "@/public/images/organizations/real/fanap.png";
import filimoLogo from "@/public/images/organizations/real/filimo.png";
import hamrahAvvalLogo from "@/public/images/organizations/real/hamrah-avval.png";
import iranKhodroLogo from "@/public/images/organizations/real/iran-khodro.png";
import nationalGasLogo from "@/public/images/organizations/real/national-gas.png";
import parsKhodroLogo from "@/public/images/organizations/real/pars-khodro.png";
import rightelLogo from "@/public/images/organizations/real/rightel.png";
import shatelLogo from "@/public/images/organizations/real/shatel.png";
import tap30Logo from "@/public/images/organizations/real/tap30.png";
import tavanirLogo from "@/public/images/organizations/real/tavanir.png";
import tehranMunicipalityLogo from "@/public/images/organizations/real/tehran-municipality.png";
import digikalaLogo from "@/public/images/organizations/digikala.png";
import fooladMobarakehLogo from "@/public/images/organizations/foolad-mobarakeh.png";
import irancellLogo from "@/public/images/organizations/irancell.png";
import kallehLogo from "@/public/images/organizations/kalleh.png";
import mapnaLogo from "@/public/images/organizations/mapna.png";
import snappLogo from "@/public/images/organizations/snapp.png";
import snappfoodLogo from "@/public/images/organizations/snappfood.png";

export type OrganizationLogoAsset = { kind: "image"; src: string } | { kind: "monogram" };

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  logoAsset: OrganizationLogoAsset;
  logoAlt: string;
  industry: string;
};

function imageRecord(
  id: string,
  name: string,
  industry: string,
  src: { src: string },
): OrganizationRecord {
  return {
    id,
    name,
    slug: id,
    logoAsset: { kind: "image", src: src.src },
    logoAlt: `لوگوی ${name}`,
    industry,
  };
}

export const organizationRegistry: Record<string, OrganizationRecord> = {
  digikala: imageRecord("digikala", "دیجی‌کالا", "تجارت الکترونیک و داده", digikalaLogo),
  irancell: imageRecord("irancell", "ایرانسل", "ارتباطات و اینترنت اشیا", irancellLogo),
  mapna: imageRecord("mapna", "گروه مپنا", "انرژی و زیرساخت", mapnaLogo),
  kalleh: imageRecord("kalleh", "کاله", "صنایع غذایی", kallehLogo),
  "foolad-mobarakeh": imageRecord(
    "foolad-mobarakeh",
    "فولاد مبارکه",
    "فولاد و تولید صنعتی",
    fooladMobarakehLogo,
  ),
  snapp: imageRecord("snapp", "اسنپ", "خدمات هوشمند و لجستیک", snappLogo),
  snappfood: imageRecord("snappfood", "اسنپ‌فود", "فناوری غذا و لجستیک", snappfoodLogo),
  "hamrah-avval": imageRecord("hamrah-avval", "همراه اول", "ارتباطات دیجیتال", hamrahAvvalLogo),
  rightel: imageRecord("rightel", "رایتل", "ارتباطات دیجیتال", rightelLogo),
  fanap: imageRecord("fanap", "فناپ", "فناوری مالی و داده", fanapLogo),
  tap30: imageRecord("tap30", "تپسی", "حمل‌ونقل هوشمند", tap30Logo),
  divar: imageRecord("divar", "دیوار", "بازارگاه دیجیتال", divarLogo),
  filimo: imageRecord("filimo", "فیلیمو", "رسانه و فناوری", filimoLogo),
  aparat: imageRecord("aparat", "آپارات", "رسانه و فناوری", aparatLogo),
  alibaba: imageRecord("alibaba", "علی‌بابا", "گردشگری و خدمات دیجیتال", alibabaLogo),
  "asan-pardakht": imageRecord("asan-pardakht", "آسان پرداخت", "خدمات مالی", asanPardakhtLogo),
  "bank-mellat": imageRecord("bank-mellat", "بانک ملت", "بانکداری و خدمات مالی", bankMellatLogo),
  "bank-tejarat": imageRecord(
    "bank-tejarat",
    "بانک تجارت",
    "بانکداری و خدمات مالی",
    bankTejaratLogo,
  ),
  "bank-parsian": imageRecord(
    "bank-parsian",
    "بانک پارسیان",
    "بانکداری و خدمات مالی",
    bankParsianLogo,
  ),
  "iran-khodro": imageRecord("iran-khodro", "ایران‌خودرو", "خودروسازی", iranKhodroLogo),
  "pars-khodro": imageRecord("pars-khodro", "پارس‌خودرو", "خودروسازی", parsKhodroLogo),
  "national-gas": imageRecord("national-gas", "شرکت ملی گاز", "گاز و زیرساخت", nationalGasLogo),
  tavanir: imageRecord("tavanir", "توانیر", "برق و زیرساخت", tavanirLogo),
  shatel: imageRecord("shatel", "شاتل", "ارتباطات دیجیتال", shatelLogo),
  cinnagen: imageRecord("cinnagen", "سیناژن", "زیست‌فناوری", cinnagenLogo),
  "darou-pakhsh": imageRecord("darou-pakhsh", "داروپخش", "دارو و سلامت", darouPakhshLogo),
  "tehran-municipality": imageRecord(
    "tehran-municipality",
    "شهرداری تهران",
    "خدمات شهری",
    tehranMunicipalityLogo,
  ),
};

export function getOrganization(
  organizationId: string,
  fallbackName = "سازمان تأییدشده",
  fallbackIndustry = "سازمان و صنعت نمونه",
): OrganizationRecord {
  return (
    organizationRegistry[organizationId] ?? {
      id: organizationId,
      name: fallbackName,
      slug: organizationId,
      logoAsset: { kind: "monogram" },
      logoAlt: `نشان نوشتاری ${fallbackName}`,
      industry: fallbackIndustry,
    }
  );
}

export type OrganizationIndustry =
  | "technology"
  | "industry"
  | "energy"
  | "health"
  | "financial"
  | "transport";

export type OrganizationLogo = string;

export type OrganizationProfile = {
  slug: string;
  name: string;
  sector: string;
  description: string;
  industry: OrganizationIndustry;
  location: string;
  size: "سازمان بزرگ" | "سازمان متوسط";
  activeChallenges: number;
  closedProjects: number;
  logo: OrganizationLogo;
};

const featuredOrganizations: OrganizationProfile[] = [
  {
    slug: "digikala",
    name: "دیجی‌کالا",
    sector: "تجارت الکترونیک و داده",
    description: "نوآوری در تجربه خرید، زنجیره تأمین و تحلیل داده",
    industry: "technology",
    location: "تهران",
    size: "سازمان بزرگ",
    activeChallenges: 9,
    closedProjects: 24,
    logo: "digikala",
  },
  {
    slug: "irancell",
    name: "ایرانسل",
    sector: "ارتباطات و فناوری دیجیتال",
    description: "توسعه راهکارهای ارتباطی و خدمات هوشمند دیجیتال",
    industry: "technology",
    location: "تهران",
    size: "سازمان بزرگ",
    activeChallenges: 7,
    closedProjects: 18,
    logo: "irancell",
  },
  {
    slug: "mapna",
    name: "گروه مپنا",
    sector: "انرژی و زیرساخت",
    description: "حل مسائل پیچیده در انرژی، حمل‌ونقل و زیرساخت",
    industry: "energy",
    location: "تهران",
    size: "سازمان بزرگ",
    activeChallenges: 6,
    closedProjects: 14,
    logo: "mapna",
  },
  {
    slug: "kalleh",
    name: "کاله",
    sector: "صنایع غذایی",
    description: "توسعه محصولات غذایی سالم و نوآورانه و زنجیره تأمین پایدار",
    industry: "health",
    location: "مازندران",
    size: "سازمان بزرگ",
    activeChallenges: 3,
    closedProjects: 9,
    logo: "kalleh",
  },
  {
    slug: "foolad-mobarakeh",
    name: "فولاد مبارکه",
    sector: "صنعت و تولید",
    description: "نوآوری در تولید فولاد، بهینه‌سازی فرایند و پایداری صنعتی",
    industry: "industry",
    location: "اصفهان",
    size: "سازمان بزرگ",
    activeChallenges: 5,
    closedProjects: 14,
    logo: "foolad-mobarakeh",
  },
  {
    slug: "snapp",
    name: "اسنپ",
    sector: "خدمات هوشمند شهری",
    description: "ارائه خدمات حمل‌ونقل و راهکارهای هوشمند شهری",
    industry: "technology",
    location: "تهران",
    size: "سازمان بزرگ",
    activeChallenges: 4,
    closedProjects: 12,
    logo: "snapp",
  },
];

const additionalOrganizations = [
  ["hamrah-avval", "همراه اول", "ارتباطات دیجیتال", "technology", "تهران"],
  ["rightel", "رایتل", "ارتباطات دیجیتال", "technology", "تهران"],
  ["fanap", "فناپ", "فناوری مالی و داده", "financial", "تهران"],
  ["tap30", "تپسی", "حمل‌ونقل هوشمند", "transport", "تهران"],
  ["alibaba", "علی‌بابا", "گردشگری و خدمات آنلاین", "technology", "تهران"],
  ["divar", "دیوار", "بازارگاه دیجیتال", "technology", "تهران"],
  ["filimo", "فیلیمو", "رسانه و فناوری", "technology", "تهران"],
  ["aparat", "آپارات", "رسانه و فناوری", "technology", "تهران"],
  ["asan-pardakht", "آسان پرداخت", "خدمات مالی", "financial", "تهران"],
  ["beh-pardakht", "به‌پرداخت ملت", "خدمات مالی", "financial", "تهران"],
  ["bank-mellat", "بانک ملت", "بانکداری و خدمات مالی", "financial", "تهران"],
  ["bank-tejarat", "بانک تجارت", "بانکداری و خدمات مالی", "financial", "تهران"],
  ["bank-parsian", "بانک پارسیان", "بانکداری و خدمات مالی", "financial", "تهران"],
  ["iran-khodro", "ایران‌خودرو", "خودروسازی", "industry", "تهران"],
  ["saipa", "سایپا", "خودروسازی", "industry", "تهران"],
  ["bahman-group", "گروه بهمن", "خودروسازی", "industry", "تهران"],
  ["golgohar", "گل‌گهر", "معدن و صنایع معدنی", "industry", "کرمان"],
  ["chadormalu", "چادرملو", "معدن و صنایع معدنی", "industry", "یزد"],
  ["foolad-khuzestan", "فولاد خوزستان", "فولاد و تولید", "industry", "خوزستان"],
  ["isfahan-refinery", "پالایش نفت اصفهان", "پالایش و انرژی", "energy", "اصفهان"],
  ["shazand-refinery", "پالایشگاه شازند", "پالایش و انرژی", "energy", "مرکزی"],
  ["mobin-petrochemical", "پتروشیمی مبین", "پتروشیمی و انرژی", "energy", "بوشهر"],
  ["persian-gulf-petrochemical", "صنایع پتروشیمی خلیج فارس", "پتروشیمی", "energy", "تهران"],
  ["tavanir", "توانیر", "برق و زیرساخت", "energy", "تهران"],
  ["national-gas", "شرکت ملی گاز", "گاز و زیرساخت", "energy", "تهران"],
  ["tehran-municipality", "شهرداری تهران", "خدمات شهری", "transport", "تهران"],
  ["raja", "رجا", "حمل‌ونقل ریلی", "transport", "تهران"],
  ["irisl", "کشتیرانی جمهوری اسلامی", "حمل‌ونقل دریایی", "transport", "تهران"],
  ["iran-air", "هما", "حمل‌ونقل هوایی", "transport", "تهران"],
  ["pegah", "صنایع شیر ایران", "صنایع غذایی", "health", "تهران"],
  ["pak-dairy", "لبنیات پاک", "صنایع غذایی", "health", "تهران"],
  ["minoo", "گروه صنعتی مینو", "صنایع غذایی", "health", "تهران"],
  ["behpakhsh", "به‌پخش", "زنجیره تأمین", "industry", "تهران"],
  ["abidi", "داروسازی دکتر عبیدی", "دارو و سلامت", "health", "تهران"],
  ["cinnagen", "سیناژن", "زیست‌فناوری", "health", "البرز"],
  ["aryogen", "آریوژن", "زیست‌فناوری", "health", "البرز"],
  ["darou-pakhsh", "داروپخش", "دارو و سلامت", "health", "تهران"],
  ["shafa-darou", "شفادارو", "دارو و سلامت", "health", "تهران"],
  ["pars-khodro", "پارس‌خودرو", "خودروسازی", "industry", "تهران"],
  ["shatel", "شاتل", "ارتباطات دیجیتال", "technology", "تهران"],
  ["kavir-tire", "کویرتایر", "صنعت و تولید", "industry", "خراسان جنوبی"],
  ["snappfood", "اسنپ‌فود", "فناوری غذا و لجستیک", "technology", "تهران"],
] as const satisfies ReadonlyArray<readonly [string, string, string, OrganizationIndustry, string]>;

const generatedOrganizations: OrganizationProfile[] = additionalOrganizations.map(
  ([slug, name, sector, industry, location], index) => ({
    slug,
    name,
    sector,
    description: `توسعه راهکارهای نوآورانه و حل مسائل عملیاتی در حوزه ${sector}`,
    industry,
    location,
    size: index % 5 === 0 ? "سازمان متوسط" : "سازمان بزرگ",
    activeChallenges: 2 + ((index * 3) % 8),
    closedProjects: 6 + ((index * 5) % 21),
    logo: slug,
  }),
);

export const organizationProfiles: OrganizationProfile[] = [
  ...featuredOrganizations,
  ...generatedOrganizations,
];

export const organizationIndustryLabels: Record<OrganizationIndustry, string> = {
  technology: "فناوری",
  industry: "صنعت و تولید",
  energy: "انرژی",
  health: "سلامت",
  financial: "خدمات مالی",
  transport: "حمل‌ونقل",
};

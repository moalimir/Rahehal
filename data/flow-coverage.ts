export type FlowCoverage = {
  id: `E2E-${string}` | `NEG-${string}`;
  title: string;
  routes: string[];
  proof: string;
};

export const endToEndFlows: FlowCoverage[] = [
  {
    id: "E2E-01",
    title: "ثبت مسئله تا ایجاد پرونده",
    routes: ["/org/intake", "/org/challenges/new", "/org/challenges/sample"],
    proof: "فرم اعتبارسنجی‌شده، نسخه، Gate و رسید رهگیری",
  },
  {
    id: "E2E-02",
    title: "تأیید سازمان و انتشار کنترل‌شده",
    routes: ["/org/verification", "/org/challenges/new", "/ops/quality-gate"],
    proof: "KYC، تأییدهای مستقل و کنترل کیفیت عملیاتی",
  },
  {
    id: "E2E-03",
    title: "تطبیق و دعوت متخصص",
    routes: ["/org/challenges/sample/experts", "/solver/invitations"],
    proof: "تناسب توضیح‌پذیر، ظرفیت، تعارض و چرخه دعوت",
  },
  {
    id: "E2E-04",
    title: "ساخت و ارسال پیشنهاد",
    routes: ["/solver/opportunities", "/solver/proposals/new", "/solver/submissions/sample"],
    proof: "فرم مرحله‌ای، بودجه، milestone و رسید نسخه‌دار",
  },
  {
    id: "E2E-05",
    title: "غربال و مقایسه پیشنهادها",
    routes: ["/org/challenges/sample/proposals", "/org/challenges/sample/compare"],
    proof: "Eligibility مستقل، shortlist و مقایسه هم‌سنخ",
  },
  {
    id: "E2E-06",
    title: "اعلام تعارض داور",
    routes: ["/reviewer", "/reviewer/assignments/RV-204/conflict"],
    proof: "تصمیم صریح تعارض پیش از دسترسی به محتوای حساس",
  },
  {
    id: "E2E-07",
    title: "امتیازدهی و ثبت نهایی داوری",
    routes: ["/reviewer/assignments/RV-204/score", "/reviewer/assignments/RV-204/submit"],
    proof: "Rubric نسخه‌دار، توضیح اجباری و قفل ثبت نهایی",
  },
  {
    id: "E2E-08",
    title: "پایش دور داوری",
    routes: ["/org/challenges/sample/review", "/ops/review-monitoring"],
    proof: "پیشرفت، پراکندگی امتیاز و SLA بدون افشای رأی",
  },
  {
    id: "E2E-09",
    title: "تصمیم نهایی و صورت‌جلسه",
    routes: ["/org/challenges/sample/decision"],
    proof: "فینالیست، نظر مخالف، دلیل و تأیید دو مرحله‌ای",
  },
  {
    id: "E2E-10",
    title: "قرارداد و مالکیت فکری",
    routes: ["/org/challenges/sample/contract", "/solver/contracts"],
    proof: "نسخه بندها، نظر حقوقی و وضعیت امضا",
  },
  {
    id: "E2E-11",
    title: "اجرای پایلوت و milestone",
    routes: ["/org/challenges/sample/pilot", "/solver/pilots/sample"],
    proof: "برنامه، مالک، KPI، SLA و شواهد اجرای پایلوت",
  },
  {
    id: "E2E-12",
    title: "تحویل و پذیرش",
    routes: ["/org/challenges/sample/deliverables"],
    proof: "نسخه تحویل، چک‌لیست پذیرش و بازخورد اصلاحی",
  },
  {
    id: "E2E-13",
    title: "آزادسازی پرداخت",
    routes: ["/org/challenges/sample/finance", "/solver/payments", "/ops/payments"],
    proof: "Gate پذیرش، Reason Code و رسید پرداخت",
  },
  {
    id: "E2E-14",
    title: "اندازه‌گیری اثر",
    routes: ["/org/challenges/sample/impact", "/org/reports"],
    proof: "خط مبنا، KPI، ROI و خروجی گزارش‌پذیر",
  },
  {
    id: "E2E-15",
    title: "ممیزی و رسیدگی به اختلاف",
    routes: ["/org/challenges/sample/history", "/ops/disputes", "/ops/support"],
    proof: "Audit trail، بسته شواهد و وضعیت رسیدگی",
  },
];

export const negativeFlows: FlowCoverage[] = [
  {
    id: "NEG-01",
    title: "عدم دسترسی نقش نامرتبط",
    routes: ["/org/challenges/sample", "/reviewer"],
    proof: "حالت Permission و CTA غیرفعال با دلیل",
  },
  {
    id: "NEG-02",
    title: "انتشار بدون تکمیل Gate",
    routes: ["/org/challenges/new"],
    proof: "قفل CTA تا تکمیل تأیید فنی، مالی و حقوقی",
  },
  {
    id: "NEG-03",
    title: "دسترسی داور دارای تعارض",
    routes: ["/reviewer/assignments/RV-204/conflict", "/reviewer/assignments/RV-204/score"],
    proof: "اعلام تعارض پیش‌شرط ورود به امتیازدهی",
  },
  {
    id: "NEG-04",
    title: "پیشنهاد ناقص",
    routes: ["/solver/proposals/new"],
    proof: "اعتبارسنجی مرحله‌ای و حفظ پیش‌نویس",
  },
  {
    id: "NEG-05",
    title: "مقایسه کمتر از دو پیشنهاد",
    routes: ["/org/challenges/sample/proposals", "/org/challenges/sample/compare"],
    proof: "CTA مقایسه تا انتخاب حداقل دو مورد غیرفعال است",
  },
  {
    id: "NEG-06",
    title: "ثبت تصمیم بدون دلیل",
    routes: ["/org/challenges/sample/decision"],
    proof: "تأیید حساس و الزام دلیل پیش از رسید",
  },
  {
    id: "NEG-07",
    title: "پرداخت پیش از پذیرش",
    routes: ["/org/challenges/sample/finance", "/ops/payments"],
    proof: "پرداخت وابسته به Gate پذیرش و مجوز نقش",
  },
  {
    id: "NEG-08",
    title: "تعارض نسخه هم‌زمان",
    routes: ["/org/challenges/new"],
    proof: "حالت Conflict با گزینه بازیابی و تلاش دوباره",
  },
  {
    id: "NEG-09",
    title: "قطع ارتباط هنگام اقدام",
    routes: ["/org", "/solver", "/reviewer", "/ops"],
    proof: "حالت Offline بدون ازدست‌رفتن داده و مسیر تلاش دوباره",
  },
  {
    id: "NEG-10",
    title: "خطای سرویس یا داده خالی",
    routes: ["/org/challenges", "/solver/opportunities", "/ops"],
    proof: "Error و Empty تفکیک‌شده با اقدام بازیابی مناسب",
  },
];

export const flowCoverage = [...endToEndFlows, ...negativeFlows];

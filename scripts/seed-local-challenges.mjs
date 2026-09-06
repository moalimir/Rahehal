// Creates a spread of organization challenges through the real API routes.
//
// Every challenge here walks the genuine lifecycle with the genuine actors:
// the owner authors, `org:approver_technical` clears the technical gate,
// platform legal/finance/ops clear theirs, and only `org:publisher` publishes.
// Nothing writes `challenge_public_projection` directly. That is the point —
// the two seeded challenges that were inserted by hand drifted from their own
// aggregates, so the org saw one title and solvers saw another, and no test
// could have caught it because no test published through the route.
//
// Usage: node scripts/seed-local-challenges.mjs [--base http://127.0.0.1:3001]
import { randomUUID } from "node:crypto";

const baseArgument = process.argv.indexOf("--base");
const base = baseArgument === -1 ? "http://127.0.0.1:3001" : process.argv[baseArgument + 1];

/**
 * Local synthetic sessions from `apps/api/seeds/`. Each one is a distinct
 * human with exactly the authority its role carries; the script cannot take a
 * shortcut past a gate because no single token can clear two of them.
 */
// `X-Workspace-Id` names the workspace the *record* lives in, not the actor's
// own. A platform approver reaches across tenants by role, so legal, finance
// and ops all address the organization's workspace here; sending their own
// platform workspace scopes the read away from the challenge and returns the
// same non-enumerating `NOT_FOUND` a stranger would get.
const actors = {
  owner: { token: "local-a1b-access-owner-alpha" },
  technical: { token: "local-seed-access-approver-alpha" },
  legal: { token: "local-seed-access-platform-legal" },
  finance: { token: "local-seed-access-platform-finance" },
  ops: { token: "local-seed-access-platform-ops" },
  publisher: { token: "local-seed-access-publisher-alpha" },
};

const organizationWorkspace = "wsp_org_alpha";

async function call(actor, method, path, body) {
  const { token } = actors[actor];
  const headers = {
    authorization: `Bearer ${token}`,
    "x-workspace-id": organizationWorkspace,
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(method === "GET" ? {} : { "idempotency-key": `seed-challenge-${randomUUID()}` }),
  };
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.error?.message ?? response.statusText;
    const fields = payload?.error?.fields?.map((f) => `${f.path}:${f.code}`).join(", ") ?? "";
    throw new Error(
      `${method} ${path} → ${response.status} ${detail}${fields ? ` [${fields}]` : ""}`,
    );
  }
  return payload;
}

const days = (count) => new Date(Date.now() + count * 86_400_000).toISOString();

/** A complete, readiness-satisfying brief. Cases override only what they vary. */
function draft(overrides = {}) {
  const content = {
    title: "فراخوان نمونه",
    summary: "خلاصه‌ای دقیق و قابل سنجش از مسئله عملیاتی که این فراخوان دنبال می‌کند.",
    category: "operations",
    location: "تهران",
    desired_outcome: "کاهش قابل اندازه‌گیری در زمان توقف خط تولید.",
    current_state: "پایش به‌صورت دستی و گزارش‌های پراکنده انجام می‌شود.",
    consequence: "توقف‌های پیش‌بینی‌نشده هزینه مستقیم عملیاتی ایجاد می‌کند.",
    expected_output: "یک طراحی راهکار اعتبارسنجی‌شده به همراه برنامه پایلوت.",
    success_criteria: [
      {
        id: "criterion-1",
        title: "کاهش زمان توقف",
        target: "دست‌کم بیست درصد بهبود نسبت به مبنا",
        method: "مقایسه مبنای توافق‌شده با نتیجه پایلوت.",
      },
    ],
    in_scope: "خط تولید منتخب و داده‌های عملیاتی همان خط.",
    constraints: "استفاده از داده‌های آزمایشی تأییدشده.",
    organization_support: "کارشناس فنی و محیط آزمون در اختیار قرار می‌گیرد.",
    previous_attempts: "پایلوت پیشین ثبت نشده است.",
    output_type: "pilot",
    sourcing_model: "public",
    applicant_scope: "both",
    allowed_applicant_types: ["individual", "expert-team", "company"],
    work_mode: "hybrid",
    proposal_deadline: days(45),
    preferred_start_date: days(75),
    budget: { status: "fixed", amount_minor: 2_500_000_000, currency: "IRR" },
    invitees: [],
    visibility: "public",
    public_summary: "خلاصه عمومی این فراخوان برای نمایش در فهرست فرصت‌ها.",
    verification_required: false,
    nda_required: false,
    document_gate_required: false,
    ip_terms: "solver_license",
    contact: { name: "کارشناس فراخوان", email: "calls@example.test", phone: "+982100000000" },
    accuracy_confirmed: true,
    legal_notes: "",
    attachment_ids: [],
  };
  return { ...content, ...overrides };
}

/**
 * Walks one challenge to the requested stage and returns what happened.
 *
 * `version` tracks the aggregate version each command must send back: every
 * transition bumps it, so a case that stops early leaves the record exactly
 * where a real organization would have left it.
 */
const authoringOrder = ["draft", "triage", "formulation", "approvals", "published"];

async function walk({ name, stage, content, gates = {}, after }, existing) {
  // Challenge versions are append-only evidence, so a half-walked run cannot be
  // deleted and re-created -- re-running would leave a duplicate beside every
  // record. A challenge that already carries this title is therefore resumed
  // from whatever stage it reached, which makes the script safe to re-run.
  let id;
  let version;
  let current;
  const already = existing.get(content.title);
  if (already) {
    id = already.id;
    version = already.version;
    current = already.stage;
  } else {
    const created = await call("owner", "POST", "/api/v1/challenges", {
      expected_version: 0,
      draft: content,
    });
    id = created.data.entity_id;
    // The aggregate version travels in `meta.entity_version`; `data` is the receipt.
    version = created.meta.entity_version;
    current = "draft";
  }

  const target = authoringOrder.indexOf(stage);
  const reached = () => authoringOrder.indexOf(current);
  const advance = async (action, next) => {
    const result = await call("owner", "POST", `/api/v1/challenges/${id}:${action}`, {
      expected_version: version,
    });
    version = result.meta.entity_version;
    current = next;
  };

  if (reached() < 1 && target >= 1) await advance("request-triage", "triage");
  if (reached() < 2 && target >= 2) await advance("advance-formulation", "formulation");
  if (reached() < 3 && target >= 3) await advance("request-approvals", "approvals");

  const wantsGates = target >= 3 && Object.keys(gates).length + (target >= 4 ? 1 : 0) > 0;
  if (current === "approvals" && wantsGates) {
    const plan = {
      technical: gates.technical ?? "approved",
      legal: gates.legal ?? "approved",
      finance: gates.finance ?? "approved",
      quality: gates.quality ?? "approved",
    };
    const actorForGate = {
      technical: "technical",
      legal: "legal",
      finance: "finance",
      quality: "ops",
    };

    // A gate holds one row per version, so re-recording is a conflict rather
    // than a no-op. Read what this version already carries and record only the
    // rest, which is what makes a second run of this script harmless.
    const record = await call("owner", "GET", `/api/v1/challenges/${id}`);
    version = record.data.version;
    // Any gate that already holds a row is skipped, approved or rejected
    // alike: `publication_readiness.satisfied` lists only the approved ones,
    // so a rejected gate would otherwise be re-recorded and conflict.
    const recorded = new Set(
      (record.data.approvals ?? [])
        .filter((approval) => approval.challenge_version_id === record.data.current_version_id)
        .map((approval) => approval.gate),
    );

    for (const gate of ["technical", "legal", "finance", "quality"]) {
      if (plan[gate] === "skip" || recorded.has(gate)) continue;
      // Recording a gate creates its own `challenge_approval` row and leaves
      // the challenge aggregate untouched, so the response's `entity_version`
      // belongs to that approval -- carrying it forward as the challenge's
      // version is what made the following gate look stale.
      await call(actorForGate[gate], "POST", `/api/v1/challenges/${id}/approvals:record`, {
        expected_version: version,
        gate,
        decision: plan[gate],
        reason:
          plan[gate] === "approved"
            ? "بررسی شد و با شرایط فراخوان منطبق است."
            : "نیازمند اصلاح پیش از انتشار است.",
      });
    }
  }

  if (target >= 4 && current !== "published") {
    const published = await call("publisher", "POST", `/api/v1/challenges/${id}:publish`, {
      expected_version: version,
    });
    version = published.meta.entity_version;
    current = "published";
    if (after) version = await after({ id, version, call });
  }

  return { name, id, stage: current, published: current === "published" };
}

/** The cases. Each one exists to make a distinct state reachable in the UI. */
const cases = [
  {
    name: "پیش‌نویس تازه",
    stage: "draft",
    content: draft({ title: "بهینه‌سازی مصرف آب در خط شست‌وشو" }),
  },
  {
    name: "پیش‌نویس ناقص",
    stage: "draft",
    content: { title: "پیش‌نویس ناتمام بازیافت حرارت", summary: "هنوز کامل نشده است." },
  },
  { name: "در غربالگری", stage: "triage", content: draft({ title: "پایش کیفیت هوای سالن تولید" }) },
  {
    name: "در صورت‌بندی",
    stage: "formulation",
    content: draft({ title: "کاهش ضایعات بسته‌بندی" }),
  },
  {
    name: "در انتظار تأییدها",
    stage: "approvals",
    content: draft({ title: "نگهداشت پیش‌بینانه تجهیزات دوار" }),
  },
  {
    name: "تأیید جزئی",
    stage: "approvals",
    content: draft({ title: "یکپارچه‌سازی داده‌های انبار" }),
    gates: { technical: "approved", legal: "approved", finance: "skip", quality: "skip" },
  },
  {
    name: "گیت ردشده",
    stage: "approvals",
    content: draft({ title: "سامانه ردیابی ناوگان سبک" }),
    gates: { technical: "approved", legal: "rejected", finance: "skip", quality: "skip" },
  },
  {
    name: "منتشرشده عمومی",
    stage: "published",
    content: draft({ title: "تشخیص نشتی هوشمند شبکه آب" }),
  },
  {
    name: "منتشرشده فقط برای کاربران ثبت‌نام‌شده",
    stage: "published",
    content: draft({
      title: "بهینه‌سازی زنجیره سرد دارویی",
      visibility: "registered",
      category: "logistics",
    }),
  },
  {
    name: "نیازمند احراز فضای کاری",
    stage: "published",
    content: draft({
      title: "پایش ایمنی پیمانکاران در محیط عملیاتی",
      verification_required: true,
      category: "safety",
    }),
  },
  {
    name: "نیازمند محرمانگی",
    stage: "published",
    content: draft({
      title: "تحلیل داده‌های حساس مشترکین",
      nda_required: true,
      document_gate_required: true,
      category: "technology",
    }),
  },
  {
    name: "فقط تیم‌های متخصص",
    stage: "published",
    content: draft({
      title: "طراحی مبدل حرارتی فشرده",
      allowed_applicant_types: ["expert-team", "company"],
      applicant_scope: "team",
      category: "manufacturing",
    }),
  },
  {
    name: "بودجه نامشخص",
    stage: "published",
    content: draft({
      title: "کاهش مصرف انرژی در سیستم تهویه",
      budget: { status: "undecided", amount_minor: null, currency: "IRR" },
      category: "energy",
    }),
  },
  {
    name: "مهلت نزدیک",
    stage: "published",
    content: draft({ title: "پاسخ سریع به رخداد قطعی برق", proposal_deadline: days(3) }),
  },
  {
    name: "متوقف‌شده",
    stage: "published",
    content: draft({ title: "بازطراحی فرایند تحویل مرسوله" }),
    after: async ({ id, version, call: send }) => {
      const paused = await send("publisher", "POST", `/api/v1/challenges/${id}:pause`, {
        expected_version: version,
        reason: "بازبینی شرایط فراخوان پیش از ادامه دریافت پیشنهاد.",
      });
      return paused.meta.entity_version;
    },
  },
  {
    name: "بسته‌شده",
    stage: "published",
    content: draft({ title: "ارتقای سامانه گزارش‌گیری عملیات" }),
    after: async ({ id, version, call: send }) => {
      const closed = await send("publisher", "POST", `/api/v1/challenges/${id}:close`, {
        expected_version: version,
        reason: "مهلت دریافت پیشنهاد به پایان رسیده است.",
      });
      return closed.meta.entity_version;
    },
  },
];

/** Existing org challenges, so a re-run resumes rather than duplicates. */
const listed = await call("owner", "GET", "/api/v1/challenges");
const existing = new Map(
  listed.data.items.map((row) => [
    row.title,
    { id: row.id, stage: row.stage, version: row.version },
  ]),
);

const results = [];
for (const item of cases) {
  try {
    results.push(await walk(item, existing));
    console.log(`OK    ${item.name}`);
  } catch (error) {
    results.push({ name: item.name, error: String(error.message) });
    console.log(`FAIL  ${item.name} — ${error.message}`);
  }
}

console.log(`\n${results.filter((r) => !r.error).length}/${results.length} created`);
console.log(`published: ${results.filter((r) => r.published).length}`);
const failures = results.filter((r) => r.error);
if (failures.length) process.exitCode = 1;

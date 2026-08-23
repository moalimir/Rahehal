import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const html = fs.readFileSync("index.html", "utf8");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) =>
  errors.push(error.cause?.stack ?? error.stack ?? error.message),
);
virtualConsole.on("error", (error) => errors.push(String(error)));

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "file:///rahhal-challenge-standalone.html",
  virtualConsole,
  beforeParse(window) {
    // jsdom intentionally disables Storage for file:// opaque origins. The
    // standalone is opened from disk in Chromium, so the harness supplies the
    // same browser contract instead of weakening application persistence.
    Object.defineProperty(window, "localStorage", { value: memoryStorage() });
    Object.defineProperty(window, "sessionStorage", { value: memoryStorage() });
    for (const [name, value] of Object.entries({
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      Headers: globalThis.Headers,
      Request: globalThis.Request,
      Response: globalThis.Response,
      fetch: globalThis.fetch,
      ReadableStream: globalThis.ReadableStream,
      WritableStream: globalThis.WritableStream,
      TransformStream: globalThis.TransformStream,
    }))
      Object.defineProperty(window, name, { value });
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
    Object.defineProperty(window, "scrollTo", { value() {} });
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value() {} });
    Object.defineProperty(window.HTMLElement.prototype, "scrollBy", { value() {} });
    Object.defineProperty(window, "ResizeObserver", {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    Object.defineProperty(window, "IntersectionObserver", {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  },
});

function waitFor(predicate, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = dom.window.setInterval(() => {
      if (predicate()) {
        dom.window.clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        dom.window.clearInterval(timer);
        reject(
          new Error(
            `مهلت انتظار برای Hydration پایان یافت.${errors.length ? ` ${errors.join(" | ")}` : ""}`,
          ),
        );
      }
    }, 40);
  });
}

function setInputValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

await waitFor(() => dom.window.document.documentElement.dataset.standaloneReady === "true");
const entry = dom.window.document.querySelector('a[href^="/app/org/challenges/new"]');
if (!entry) throw new Error("CTA ثبت مسئله در لندینگ Standalone پیدا نشد.");
entry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
await waitFor(() =>
  dom.window.document.querySelector("h1")?.textContent?.includes("ثبت مسئله سازمانی"),
);

if (!dom.window.location.hash.includes("/app/org/challenges/new"))
  throw new Error("CTA لندینگ Route ثبت مسئله را باز نکرد.");
if (!dom.window.document.querySelector(".challenge-stepper"))
  throw new Error("فرم چهارمرحله‌ای پس از Hydration نمایش داده نشد.");

dom.window.location.hash = "";
await waitFor(() => dom.window.document.querySelector(".reference-hero"));
const challengeDirectoryLink = dom.window.document.querySelector('a[href^="/challenges"]');
if (!challengeDirectoryLink) throw new Error("CTA مشاهده چالش‌ها در لندینگ Standalone پیدا نشد.");
challengeDirectoryLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".rh-challenge-grid"));
if (!dom.window.location.hash.startsWith("#/challenges"))
  throw new Error("CTA مشاهده چالش‌ها Route فهرست را باز نکرد.");

await waitFor(() =>
  dom.window.document.querySelector('a[href^="/challenges/smart-water-recovery"]'),
);
const challengeDetailLink = dom.window.document.querySelector(
  'a[href^="/challenges/smart-water-recovery"]',
);
if (!challengeDetailLink) throw new Error("لینک جزئیات چالش منتخب پیدا نشد.");
challengeDetailLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() =>
  dom.window.document.querySelector("h1")?.textContent?.includes("بازیابی هوشمند آب"),
);

const solverLoginLink = dom.window.document.querySelector(
  'a[href^="/auth/login"][href*="returnTo="]',
);
if (!solverLoginLink) throw new Error("CTA ورود و ادامه راه‌حل پیدا نشد.");
solverLoginLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".solver-login-card"));
const username = dom.window.document.querySelector('input[autocomplete="username"]');
const password = dom.window.document.querySelector('input[autocomplete="current-password"]');
const loginButton = [...dom.window.document.querySelectorAll("button")].find(
  (button) => button.textContent?.trim() === "ورود به حساب",
);
if (!username || !password || !loginButton) throw new Error("فرم ورود حل‌کننده کامل نیست.");
setInputValue(username, "solver@example.com");
setInputValue(password, "Password123");
loginButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
await waitFor(() =>
  dom.window.location.hash.includes("/app/solver/opportunities/smart-water-recovery"),
);
// The route hash updates one render tick before the authenticated workspace shell
// mounts; wait for the shell itself instead of asserting synchronously (fixes a
// harness race — the offline bundle renders correctly, see T-C in 82_PHASE0_COMPLETION).
try {
  await waitFor(() => Boolean(dom.window.document.querySelector(".rh-shell")));
} catch {
  throw new Error("پس از ورود، همان فرصت در workspace معتبر باز نشد.");
}

dom.window.location.hash = "/app/solver/settings?space=individual&workspaceId=WS-PERSONAL-001";
await waitFor(() =>
  dom.window.document.querySelector('.rh-settings-page[data-route-ready="true"]'),
);
if (!dom.window.document.querySelector("h1")?.textContent?.includes("تنظیمات"))
  throw new Error("تنظیمات در ورود مستقیم کامل نمایش داده نشد.");
if (dom.window.document.querySelectorAll(".rh-settings-nav button").length !== 5)
  throw new Error("همه بخش‌های تنظیمات در اولین ورود حاضر نیستند.");

dom.window.location.hash = "/app/solver/dashboard?space=individual&workspaceId=WS-PERSONAL-001";
await waitFor(() => dom.window.document.querySelector(".rh-dashboard-hero"));
dom.window.location.hash = "/app/solver/settings?space=individual&workspaceId=WS-PERSONAL-001";
await waitFor(() =>
  dom.window.document.querySelector('.rh-settings-page[data-route-ready="true"]'),
);
if (!dom.window.document.querySelector(".rh-settings-panel"))
  throw new Error("تنظیمات پس از بازکردن دوباره در همان نشست ناقص شد.");

dom.window.location.hash = "";
await waitFor(() => dom.window.document.querySelector(".reference-hero"));
const organizationsLink = dom.window.document.querySelector(
  '.redesign-outline-link[href^="/organizations"]',
);
if (!organizationsLink) throw new Error("CTA مشاهده همه شرکت‌ها در لندینگ Standalone پیدا نشد.");
organizationsLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".organization-directory"));
if (!dom.window.location.hash.startsWith("#/organizations"))
  throw new Error("CTA مشاهده همه شرکت‌ها Route سازمان‌ها را باز نکرد.");
if (!dom.window.document.querySelector("h1")?.textContent?.includes("شرکت‌های فعال در راه‌حل"))
  throw new Error("عنوان صفحه جدید سازمان‌ها در Standalone نمایش داده نشد.");
if (dom.window.document.querySelectorAll(".organization-directory-card").length !== 6)
  throw new Error("شش کارت صفحه نخست سازمان‌ها در Standalone نمایش داده نشد.");

dom.window.location.hash = "";
await waitFor(() => dom.window.document.querySelector(".university-showcase"));
const universitiesLink = dom.window.document.querySelector(
  '.university-showcase__all[href^="/universities"]',
);
if (!universitiesLink) throw new Error("CTA مشاهده همه تیم‌های دانشگاهی پیدا نشد.");
universitiesLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".university-directory"));
if (!dom.window.location.hash.startsWith("#/universities"))
  throw new Error("CTA دانشگاه‌ها Route فهرست دانشگاه‌ها را باز نکرد.");
if (dom.window.document.querySelectorAll(".university-directory-card").length !== 12)
  throw new Error("دوازده دانشگاه در Standalone نمایش داده نشد.");

dom.window.location.hash = "";
await waitFor(() => dom.window.document.querySelector(".reference-hero"));
const organizationLoginLink = dom.window.document.querySelector(
  'a[aria-label="ورود سازمان"][href^="/auth/organization/login"]',
);
if (!organizationLoginLink) throw new Error("مسیر ورود اختصاصی سازمان پیدا نشد.");
organizationLoginLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".organization-auth-card--login"));
if (!dom.window.document.querySelector("h1")?.textContent?.includes("ورود به حساب سازمانی"))
  throw new Error("صفحه ورود سازمانی در Standalone نمایش داده نشد.");

const organizationRegisterLink = dom.window.document.querySelector(
  'a[href^="/auth/organization/register/representative"]',
);
if (!organizationRegisterLink) throw new Error("لینک ثبت‌نام سازمان پیدا نشد.");
organizationRegisterLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".organization-auth-card--representative"));
if (
  !dom.window.document
    .querySelector(".organization-registration-stepper")
    ?.textContent?.includes("اطلاعات نماینده")
)
  throw new Error("مرحله اول اطلاعات نماینده نمایش داده نشد.");

dom.window.location.hash = "/auth/organization/register/company";
await waitFor(() => dom.window.document.querySelector(".organization-auth-card--company"));
if (!dom.window.document.querySelector("h1")?.textContent?.includes("اطلاعات سازمان"))
  throw new Error("مرحله دوم اطلاعات سازمان نمایش داده نشد.");

dom.window.location.hash = "";
await waitFor(() => dom.window.document.querySelector(".reference-hero"));
const solverRegisterLink = dom.window.document.querySelector(
  'a[aria-label="ثبت نام فرد یا تیم"][href^="/auth/solver/register/type"]',
);
if (!solverRegisterLink) throw new Error("مسیر ثبت نام فرد یا تیم پیدا نشد.");
solverRegisterLink.dispatchEvent(
  new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
);
await waitFor(() => dom.window.document.querySelector(".solver-registration-page--step-1"));
if (!dom.window.document.querySelector("h1")?.textContent?.includes("ثبت‌نام حل‌کننده"))
  throw new Error("مرحله ایجاد هویت انسانی حل‌کننده نمایش داده نشد.");

dom.window.location.hash = "/auth/solver/register/account";
await waitFor(() => dom.window.document.querySelector(".solver-registration-page--step-2"));
if (!dom.window.document.querySelector("h1")?.textContent?.includes("اطلاعات حساب"))
  throw new Error("مرحله اطلاعات حساب انسانی نمایش داده نشد.");

dom.window.location.hash = "/auth/solver/register/profile";
await waitFor(() => dom.window.document.querySelector(".solver-registration-page--step-3"));
if (!dom.window.document.querySelector("h1")?.textContent?.includes("پروفایل تخصصی"))
  throw new Error("مرحله پروفایل تخصصی حل‌کننده نمایش داده نشد.");

// Tolerate jsdom parser limitations (they do not affect whether the app runs — the
// offline bundle is opened in real Chromium; the flow above already proved it renders):
// jsdom's CSS engine (@acemir/cssom) cannot parse modern CSS, and parse5 flags the
// inlined single-file markup. Genuine app/runtime errors do not originate from these.
const isParserNoise = (message) =>
  message.includes("Could not parse CSS stylesheet") ||
  message.includes("cssom") ||
  message.includes("stylesheets.js") ||
  message.includes("parse5");
if (errors.some((message) => !isParserNoise(message)))
  throw new Error(`خطای Runtime در Standalone: ${errors.join(" | ")}`);

dom.window.close();
console.log(
  "Hydration، ثبت مسئله، چالش‌ها، سازمان‌ها، دانشگاه‌ها و احراز سازمانی و هویت حل‌کننده در اجرای مستقیم فایل تأیید شد.",
);

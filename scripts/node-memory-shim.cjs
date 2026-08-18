/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * بعضی sandboxهای بدون /proc در Node.js 24 برای process.memoryUsage() خطای
 * uv_resident_set_memory می‌دهند. Next.js فقط از این داده برای telemetry و
 * گزارش build استفاده می‌کند. این shim در محیط عادی مقدار واقعی را نگه می‌دارد
 * و فقط در همان خطای محیطی، مقادیر بی‌خطر برمی‌گرداند.
 */
const original = process.memoryUsage.bind(process);

// Next.js بخشی از Export را در child process اجرا می‌کند؛ همان guardها باید
// به فرایندهای فرزند نیز ارث برسند.
if (!process.env.NODE_OPTIONS?.includes(__filename)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${__filename}`]
    .filter(Boolean)
    .join(" ");
}

function safeMemoryUsage() {
  try {
    return original();
  } catch (error) {
    if (error && error.syscall === "uv_resident_set_memory") {
      return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
    }
    throw error;
  }
}

safeMemoryUsage.rss = function safeRss() {
  try {
    return typeof original.rss === "function" ? original.rss() : original().rss;
  } catch (error) {
    if (error && error.syscall === "uv_resident_set_memory") return 0;
    throw error;
  }
};

Object.defineProperty(process, "memoryUsage", { configurable: true, value: safeMemoryUsage });

/*
 * روی بعضی فایل‌سیستم‌های workspace، Export هم‌زمان Next.js ممکن است درست در
 * فاصلهٔ readdir تا rmdir یک فایل موقت 500 بسازد و پاک‌سازی با ENOTEMPTY قطع
 * شود. فقط پوشهٔ موقت `.next/export` را در همان خطای شناخته‌شده با rm اتمیک
 * و retry پاک می‌کنیم؛ خروجی نهایی `out` و سورس پروژه هرگز هدف این guard نیستند.
 */
const fs = require("node:fs");
const path = require("node:path");
const originalRmdir = fs.promises.rmdir.bind(fs.promises);
const originalRm = fs.promises.rm.bind(fs.promises);
const exportSegment = `${path.sep}.next${path.sep}export`;

fs.promises.rm = async function safeNextExportRm(target, options = {}) {
  const normalized = path.resolve(String(target));
  if (normalized.includes(exportSegment) && options.recursive) {
    return originalRm(normalized, {
      ...options,
      maxRetries: Math.max(Number(options.maxRetries) || 0, 50),
      retryDelay: Math.max(Number(options.retryDelay) || 0, 100),
    });
  }
  return originalRm(target, options);
};

fs.promises.rmdir = async function safeNextExportRmdir(target, options) {
  try {
    return await originalRmdir(target, options);
  } catch (error) {
    const normalized = path.resolve(String(target));
    if (error?.code === "ENOTEMPTY" && normalized.includes(exportSegment)) {
      await fs.promises.rm(normalized, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      return;
    }
    throw error;
  }
};

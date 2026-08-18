import type { Metadata } from "next";
import "./design-system.css";
import "./globals.css";
import "./internal.css";
import "./challenge-flow.css";
import "./solver-workspace.css";
import "./organization-workspace.css";
import "./app-shell.css";
import { DialogAccessibilityManager } from "@/components/a11y/dialog-manager";

export const metadata: Metadata = {
  title: { default: "راه‌حل | از مسئله واقعی تا راهکار قابل اجرا", template: "%s | راه‌حل" },
  description:
    "پلتفرم فارسی حل مسئله سازمانی و نوآوری باز؛ از صورت‌بندی تا قرارداد، پایلوت، پرداخت و سنجش اثر.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <DialogAccessibilityManager />
        <a className="skip-link" href="#main-content">
          رفتن به محتوای اصلی
        </a>
        {children}
      </body>
    </html>
  );
}

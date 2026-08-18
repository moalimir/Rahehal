import Link from "next/link";
import { Brand } from "@/components/brand";

export function PublicFooter() {
  return (
    <footer className="landing-footer public-footer">
      <div className="footer-grid container">
        <div className="footer-brand">
          <Brand inverse />
          <p>زیرساخت فارسی تبدیل مسئلهٔ سازمانی به همکاری قابل‌اندازه‌گیری و قابل‌حسابرسی.</p>
          <span>
            <i aria-hidden="true" /> وضعیت سامانه: پایدار
          </span>
        </div>
        <div>
          <strong>محصول</strong>
          <Link href="/challenges">کشف چالش‌ها</Link>
          <Link href="/organizations">سازمان‌ها</Link>
          <Link href="/for-organizations">برای سازمان‌ها</Link>
          <Link href="/for-solvers">برای حل‌کنندگان</Link>
        </div>
        <div>
          <strong>راهنما</strong>
          <Link href="/guides">مرکز راهنما</Link>
          <Link href="/trust-security">اعتماد و امنیت</Link>
          <Link href="/guides/intellectual-property">مالکیت فکری</Link>
          <Link href="/guides/review-rules">قواعد داوری</Link>
        </div>
        <div>
          <strong>همکاری</strong>
          <Link href="/app/org/challenges/new">ثبت مسئله</Link>
          <Link href="/auth/solver/register/type">ساخت پروفایل</Link>
          <Link href="/auth/login">ورود</Link>
          <Link href="/guides">پشتیبانی و راهنما</Link>
        </div>
      </div>
      <div className="footer-bottom container">
        <span>© ۱۴۰۵ راه‌حل · نسخهٔ نمایشی محصول</span>
        <div>
          <Link href="/legal/privacy">حریم خصوصی</Link>
          <Link href="/legal/terms">شرایط استفاده</Link>
          <Link href="/accessibility">دسترس‌پذیری</Link>
        </div>
      </div>
    </footer>
  );
}

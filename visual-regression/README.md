# Visual Regression Evidence

## روش

Baselineهای تصویری که کاربر در گفت‌وگو ارائه کرده بود در Scratch فعلی باقی نمانده بودند؛ تنها ZIPهای v24/v25 در دسترس بودند. علاوه بر آن، Cloud Browser بازکردن `file://` را به‌دلیل policy رد کرد و استفاده از مرورگر جایگزین مجاز نبود. بنابراین هیچ Screenshot ساختگی یا منتسب‌به Runtime ساخته نشده است.

پوشش دیداری نهایی با سه لایه انجام شد:

1. تست‌های Component/DOM برای ساختار، CTA، heading، role و state.
2. تست‌های CSS/Responsive/RTL برای layout، grid/list، Stepper، spacing، shell و overflow.
3. axe برای سه archetype اصلی و بررسی keyboard/focus قرارداد Dialog در تست کامپوننت.

## صفحات کلیدی و شواهد After

| صفحه | شواهد منبع | Regression | نتیجه |
|---|---|---|---|
| Landing | `components/landing.tsx` + tokens | static smoke | PASS |
| Challenge grid/list | `challenge-discovery.tsx`, CSS | solver-v21 + responsive | PASS |
| Challenge detail | detail component | solver-v23 | PASS |
| Login/OTP/Recovery | `portal-page.tsx`, auth CSS | auth-v20 + v14 visual | PASS |
| Solver dashboard فردی/تیمی | solver dashboard/shell | dashboard + e2e | PASS |
| Proposal builder/preview | proposal wizard | flows + proposal regression | PASS |
| Team building/membership | solver profile experience | team v19 + v24 | PASS |
| Org dashboard | InternalApp + OrganizationShell | org parity + axe | PASS |
| Challenge studio/preview | challenge flow components | challenge e2e | PASS |
| Proposal inbox/compare/review | internal pages | org parity + flows | PASS |
| Reviewer score/submit | reviewer protected pages | internal app | PASS |
| Ops queue/dispute | role shell/internal pages | static smoke + route crawl | PASS |
| Profile/settings | profile/settings experiences | first-render regressions | PASS |
| Dialogهای حساس | shared dialog + dialog manager | axe/component | PASS |

فایل `after/DOM-AND-CSS-ASSERTIONS.md` نگاشت دقیق ایرادهای تصویری گزارش‌شده به selector و تست را نگه می‌دارد. برای انتشار Production، گرفتن screenshot در CI روی ۹ viewport مشخص‌شده به‌عنوان P2 ثبت شده است؛ این محدودیت به‌عنوان PASS تصویری جعل نشده است.

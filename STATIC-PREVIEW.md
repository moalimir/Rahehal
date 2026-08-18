# اجرای Static Preview

این پوشه پس از Build شامل همه Routeهای محصول و جریان تعاملی ثبت مسئله است. در ویندوز کافی است `START-WINDOWS.bat` را اجرا کنید.

روش خط فرمان از ریشه پروژه:

```bash
python3 -m http.server 4173
```

سپس `http://localhost:4173` را باز کنید. نمونهٔ Deep Linkها:

- `/challenges/`
- `/auth/login/`
- `/app/org/dashboard/`
- `/app/org/challenges/new/`
- `/app/org/challenges/CH-DRAFT-001/edit/?step=2`
- `/app/org/challenges/CH-DRAFT-001/preview/`
- `/app/org/challenges/CH-DRAFT-001/submitted/`
- `/app/solver/proposals/new/`
- `/app/reviewer/assignments/`
- `/app/ops/queue/`

برای اجرای مستقیم از سورس پروژه نیز می‌توانید از این فرمان استفاده کنید:

```bash
python3 -m http.server 4173 --directory out
```

برای اجرای مستقیم و بدون Server نیز `index.html` را باز کنید. این فایل همان Componentهای
React کامپایل‌شده را با Hash Navigation اجرا می‌کند و یک ماکاپ HTML ثابت نیست.

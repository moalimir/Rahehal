# تغییرات ساختاری نسخه ۱.۳.۰

- همهٔ مسیرهای حل‌کننده، سازمان، داور و عملیات روی Shell پایهٔ مشترک با Navigation نقش‌محور قرار گرفتند.
- مسیرهای قدیمی فقط Redirect می‌شوند و Query، Hash و فضای فردی/تیمی حفظ می‌شود.
- `RahhalLogo` واحد با سه Variant و سه Size جای تمام نمونه‌های پراکنده را گرفت.
- `organizationRegistry` به منبع واحد نام، صنعت و دارایی نشان سازمان تبدیل شد و کارت‌های چالش به آن متصل شدند.
- کارت تیم‌سازی با Identity Row، ستون Avatar واقعی، Wrap امن و Footer هم‌تراز بازسازی شد.
- توکن‌های مشترک رنگ، تایپوگرافی، فاصله، Radius، Shadow، Control، Sidebar، Topbar و z-index اضافه شد.
- Overflow پوسته، Main، تنظیمات و فرم‌ها با Logical Properties و `minmax(0, 1fr)` اصلاح شد.
- Monogram و رشته‌های دوسویه با Utility مشترک، `dir="ltr"` و `bdi` پایدار شدند.
- Footer عمومی به ردیف‌های مستقل برند، معرفی و وضعیت سامانه تفکیک شد.
- Hash Router و Standalone آفلاین از همان Componentهای نهایی استفاده می‌کنند.

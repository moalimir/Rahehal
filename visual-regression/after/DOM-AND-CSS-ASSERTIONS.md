# شواهد After مبتنی بر DOM/CSS

| نقص قبلی | قرارداد اصلاح‌شده | تست |
|---|---|---|
| سه ستون فهرست Challenge ناهم‌ردیف | یک row grid با trackهای مشترک و `minmax(0,1fr)` | `solver-v21-regressions`, `challenge-responsive` |
| تنظیمات در بار اول ناقص | `data-layout-ready=true` و تنها یک shell offset | `internal-app`, `solver-v23-regressions` |
| خط Stepper بیرون مرحله | connector فقط بین sibling stepها | `auth-redesign-v20`, `v14-visual-fixes` |
| Logo و مشخصات سازمان روی هم | `OrganizationIdentity` با contain/padding/registry | `architecture-v13`, `solver-v23-regressions` |
| شماره فرایند در سمت چپ | RTL logical order و badge سمت راست icon | `v14-visual-fixes` |
| Modal ارسال نهایی ناقص | Confirm سبز + Cancel + focus contract + Receipt | `flows`, `accessibility-release` |
| Sidebar/محتوا overlap | token یکتای 264px و shell واحد | `architecture-v13`, `page-spacing` |
| overflow مخفی‌شده | حذف `overflow-x:hidden/clip` سراسری | `architecture-v13`, responsive tests |
| کنترل‌های کوچک | حداقل سطح تعامل 44px | CSS assertions + axe |

این فایل جایگزین Screenshot واقعی معرفی نشده است؛ Evidence قابل تکرار برای CI تصویری آینده است.

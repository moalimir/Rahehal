"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import { networkOrganizationRoleLabel } from "@/lib/auth/network-organization-shell";
import { membershipStateLabels } from "@/lib/workspace/state-labels";

type OrganizationFactsSection = "profile" | "settings" | "access";

const sectionCopy: Record<
  OrganizationFactsSection,
  { readonly eyebrow: string; readonly title: string; readonly description: string }
> = {
  profile: {
    eyebrow: "هویت سازمان",
    title: "پروفایل سازمان",
    description: "هویت این صفحه از نشست و فضای سازمانی فعال خوانده می‌شود.",
  },
  settings: {
    eyebrow: "فضای سازمانی فعال",
    title: "تنظیمات سازمان",
    description: "تنظیمات تحویل‌شده و مرز قابلیت‌های بعدی، بدون داده یا کنترل نمایشی.",
  },
  access: {
    eyebrow: "عضویت و دسترسی",
    title: "دسترسی سازمان",
    description: "نقش و وضعیت عضویت فعلی از مرجع هویت خوانده می‌شود.",
  },
};

function UnavailableCapability({ children }: { children: string }) {
  return (
    <li>
      <Icon name="lock" /> {children}
    </li>
  );
}

/**
 * Phase 3 exposes only organization facts carried by the connected session.
 * Profile editing, member administration, KYB, retention, and security do not
 * have authoritative commands yet, so this page never simulates those writes.
 */
export function ConnectedOrganizationWorkspaceFacts({
  section,
}: {
  section: OrganizationFactsSection;
}) {
  const runtime = useWebRuntime();
  const activeWorkspace = runtime.me?.workspaces.find(
    (workspace) =>
      workspace.kind === "org" && workspace.id === runtime.me?.active_context?.workspace_id,
  );
  const membership = runtime.me?.memberships.find(
    (candidate) =>
      candidate.workspace_id === activeWorkspace?.id && candidate.user_id === runtime.me?.user.id,
  );
  const copy = sectionCopy[section];

  if (!runtime.me || !activeWorkspace || !membership) {
    return (
      <section className="rh-card rh-profile-empty" role="status">
        <Icon name="lock" />
        <h1>فضای سازمانی فعالی پیدا نشد</h1>
        <p>برای ادامه، یک فضای سازمانی مجاز را انتخاب کنید.</p>
        <Link href="/app">انتخاب فضای کاری</Link>
      </section>
    );
  }

  return (
    <div className="org-workspace-page">
      <header className="rh-profile-heading">
        <div>
          <small>{copy.eyebrow}</small>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      {section === "profile" && (
        <div className="org-profile-layout">
          <section className="org-card">
            <header className="org-card__head">
              <div>
                <h2>{activeWorkspace.name}</h2>
                <p>نام ثبت‌شده فضای سازمانی</p>
              </div>
              <span className="org-status is-success">عضویت فعال</span>
            </header>
            <dl className="org-connected-facts">
              <div>
                <dt>شناسه فضای کاری</dt>
                <dd>
                  <bdi dir="ltr">{activeWorkspace.id}</bdi>
                </dd>
              </div>
              <div>
                <dt>نماینده واردشده</dt>
                <dd>{runtime.me.user.display_name}</dd>
              </div>
              <div>
                <dt>نقش فعال</dt>
                <dd>{networkOrganizationRoleLabel(membership.role)}</dd>
              </div>
              <div>
                <dt>راه ارتباطی</dt>
                <dd dir="ltr">
                  {runtime.me.user.primary_email ?? runtime.me.user.primary_phone ?? "ثبت نشده"}
                </dd>
              </div>
            </dl>
          </section>
          <aside className="org-card">
            <header className="org-card__head">
              <div>
                <h2>مرز فاز ۳</h2>
                <p>قابلیت‌هایی که هنوز فرمان مرجع ندارند</p>
              </div>
            </header>
            <ul className="org-profile-checks org-profile-checks--unavailable">
              <UnavailableCapability>ویرایش معرفی و اطلاعات تماس سازمان</UnavailableCapability>
              <UnavailableCapability>مدارک حقوقی و احراز سازمان</UnavailableCapability>
              <UnavailableCapability>نمای عمومی قابل ویرایش</UnavailableCapability>
            </ul>
          </aside>
        </div>
      )}

      {section === "access" && (
        <div className="org-profile-layout">
          <section className="org-card">
            <header className="org-card__head">
              <div>
                <h2>عضویت فعلی شما</h2>
                <p>فقط عضویت‌های قابل دسترس در نشست فعلی نمایش داده می‌شوند.</p>
              </div>
            </header>
            <dl className="org-connected-facts">
              <div>
                <dt>نام کاربر</dt>
                <dd>{runtime.me.user.display_name}</dd>
              </div>
              <div>
                <dt>نقش</dt>
                <dd>{networkOrganizationRoleLabel(membership.role)}</dd>
              </div>
              <div>
                <dt>وضعیت</dt>
                <dd>{membershipStateLabels[membership.state]}</dd>
              </div>
              <div>
                <dt>شناسه عضویت</dt>
                <dd>
                  <bdi dir="ltr">{membership.id}</bdi>
                </dd>
              </div>
            </dl>
          </section>
          <aside className="org-card">
            <header className="org-card__head">
              <div>
                <h2>مدیریت اعضا</h2>
                <p>در نسخه متصل فعلی غیرفعال است.</p>
              </div>
            </header>
            <ul className="org-profile-checks org-profile-checks--unavailable">
              <UnavailableCapability>فهرست همه اعضای سازمان</UnavailableCapability>
              <UnavailableCapability>دعوت، تغییر نقش یا لغو دسترسی</UnavailableCapability>
              <UnavailableCapability>مدیریت نشست و ورود دومرحله‌ای</UnavailableCapability>
            </ul>
          </aside>
        </div>
      )}

      {section === "settings" && (
        <div className="org-profile-layout">
          <section className="org-card">
            <header className="org-card__head">
              <div>
                <h2>ترجیحات فعال محصول</h2>
                <p>این مقادیر بخشی از قرارداد فعلی محصول هستند.</p>
              </div>
              <Link href="/app/org/notifications">مشاهده اعلان‌ها</Link>
            </header>
            <dl className="org-connected-facts">
              <div>
                <dt>زبان و جهت</dt>
                <dd>فارسی · راست‌به‌چپ</dd>
              </div>
              <div>
                <dt>منطقه زمانی</dt>
                <dd>تهران</dd>
              </div>
              <div>
                <dt>اعلان درون‌برنامه‌ای</dt>
                <dd>فعال و متصل</dd>
              </div>
              <div>
                <dt>فضای اعمال تنظیمات</dt>
                <dd>{activeWorkspace.name}</dd>
              </div>
            </dl>
          </section>
          <aside className="org-card">
            <header className="org-card__head">
              <div>
                <h2>هنوز قابل تغییر نیست</h2>
                <p>کنترل نمایشی برای این موارد نشان داده نمی‌شود.</p>
              </div>
            </header>
            <ul className="org-profile-checks org-profile-checks--unavailable">
              <UnavailableCapability>کانال و تناوب تحویل اعلان</UnavailableCapability>
              <UnavailableCapability>سیاست نگهداشت و نمایش داده</UnavailableCapability>
              <UnavailableCapability>امنیت ورود و نشست‌های فعال</UnavailableCapability>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

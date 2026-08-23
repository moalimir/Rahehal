"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/internal/shared";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { useSolverContext } from "@/components/solver-shell";
import type {
  AccountSettings,
  PersonalProfile,
  ProfileVisibility,
  SolverState,
  TeamProfile,
  TeamRole,
  TeamSettings,
} from "@/domain/solver";
import { teamRole } from "@rahhal/domain";
import { buildSolverHref } from "@/lib/solver/context";
import { profileReadiness } from "@/lib/solver/eligibility";
import {
  activeWorkspaces,
  readSolverState,
  saveAccountSettings,
  savePersonalProfile,
  saveTeamProfile,
  saveTeamSettings,
  subscribeSolverState,
  teamPermission,
} from "@/lib/solver/repository";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function useStore() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="rh-profile-toast" role="status">
      <Icon name="check" />
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  );
}

function ProfilePreview({ state }: { state: SolverState }) {
  const context = useSolverContext();
  const individual = context.type === "individual";
  const profile = individual
    ? state.personalProfiles.find((item) => item.workspaceId === context.workspaceId)
    : state.teamProfiles.find((item) => item.workspaceId === context.workspaceId);
  if (!profile)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="notification" />
        <h1>پروفایل این فضا پیدا نشد</h1>
      </section>
    );
  const privateProfile = profile.visibility === "private";
  const name = individual ? state.currentUser.displayName : (profile as TeamProfile).name;
  const headline = individual
    ? (profile as PersonalProfile).headline
    : (profile as TeamProfile).valueProposition;
  const tags = individual
    ? (profile as PersonalProfile).skills
    : (profile as TeamProfile).expertise;
  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>پیش‌نمایش عمومی مستقل</small>
          <h1>{name}</h1>
          <p>{privateProfile ? "این پروفایل در تنظیمات به حالت خصوصی درآمده است." : headline}</p>
        </div>
        <Link className="rh-profile-outline" href={buildSolverHref("/app/solver/profile", context)}>
          بازگشت به ویرایش
        </Link>
      </header>
      {privateProfile ? (
        <section className="rh-card rh-profile-empty">
          <Icon name="lock" />
          <h2>پروفایل عمومی غیرفعال است</h2>
          <p>
            تنها نام workspace نمایش داده می‌شود و رزومه، تماس و سوابق در DOM عمومی قرار ندارند.
          </p>
        </section>
      ) : (
        <section className="rh-card rh-profile-identity">
          <PersonAvatar name={name} className="rh-avatar rh-avatar--xl" />
          <div>
            <h2>{name}</h2>
            <p>{headline}</p>
            <div className="rh-tag-row">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <aside>
            <strong>نوع پروفایل: {individual ? "حل‌کننده فردی" : "تیم"}</strong>
            <p>این نما از snapshot ذخیره‌شده ساخته شده است.</p>
          </aside>
        </section>
      )}
      {!privateProfile && individual && (
        <section className="rh-card rh-resume-card" aria-label="پیش‌نمایش رزومه">
          <h2>رزومه و سوابق قابل مشاهده</h2>
          <article>
            <span>PDF</span>
            <div>
              <strong>
                <bdi dir="ltr">
                  {(profile as PersonalProfile).resumeFileName ?? "فایلی ثبت نشده"}
                </bdi>
              </strong>
              <small>فایل نمونه؛ دانلود واقعی ارائه نشده است.</small>
            </div>
          </article>
          <div>
            {(profile as PersonalProfile).experiences.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

type ProfileTab =
  | "identity"
  | "expertise"
  | "experience"
  | "portfolio"
  | "availability"
  | "privacy";

export function SolverProfileEditor({ preview = false }: { preview?: boolean }) {
  const context = useSolverContext();
  const state = useStore();
  if (preview) return <ProfilePreview state={state} />;
  const initial =
    context.type === "individual"
      ? state.personalProfiles.find((profile) => profile.workspaceId === context.workspaceId)
      : state.teamProfiles.find((profile) => profile.teamId === context.teamId);
  if (!initial)
    return (
      <section className="rh-card rh-profile-empty">
        <h1>پروفایل این workspace پیدا نشد</h1>
      </section>
    );
  // Keep the form mounted while its own mutation is emitted synchronously by the
  // repository. Remounting on updatedAt used to erase the success receipt before
  // assistive technology (or the user) could perceive it.
  return <ProfileEditorForm key={context.workspaceId} initial={initial} state={state} />;
}

function ProfileEditorForm({
  initial,
  state,
}: {
  initial: PersonalProfile | TeamProfile;
  state: SolverState;
}) {
  const context = useSolverContext();
  const [draft, setDraft] = useState(() => clone(initial));
  const [snapshot, setSnapshot] = useState(() => clone(initial));
  const [tab, setTab] = useState<ProfileTab>("identity");
  const [notice, setNotice] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [upload, setUpload] = useState<{
    name?: string;
    progress: number;
    state: "idle" | "uploading" | "error" | "success";
    error?: string;
  }>({ progress: 0, state: "idle" });
  const team = draft.kind === "team";
  const permission = teamPermission(context, "edit-team-profile", {}, state);
  const editable = !team || permission.allowed;
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const set = (field: string, value: unknown) =>
    setDraft((current) => ({ ...current, [field]: value }) as typeof current);
  const list = (value: string) =>
    value
      .split(/[،,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const readiness = profileReadiness(
    {
      ...state,
      personalProfiles: draft.kind === "individual" ? [draft] : state.personalProfiles,
      teamProfiles:
        draft.kind === "team"
          ? state.teamProfiles.map((item) => (item.teamId === draft.teamId ? draft : item))
          : state.teamProfiles,
    },
    context,
  );
  const save = () => {
    if (!editable) {
      setNotice(permission.allowed ? "" : permission.reason);
      return;
    }
    const result =
      draft.kind === "individual" ? savePersonalProfile(draft) : saveTeamProfile(context, draft);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    const persisted = clone(draft);
    persisted.updatedAt = result.timestamp;
    setDraft(persisted);
    setSnapshot(persisted);
    setNotice(`پروفایل ذخیره شد · رسید ${result.receiptId}`);
  };
  const uploadFile = (file?: File) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      setUpload({
        name: file.name,
        progress: 0,
        state: "error",
        error: "فرمت فایل باید PDF باشد.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUpload({
        name: file.name,
        progress: 0,
        state: "error",
        error: "حجم فایل نباید بیشتر از ۵ مگابایت باشد.",
      });
      return;
    }
    setUpload({ name: file.name, progress: 45, state: "uploading" });
    window.setTimeout(() => {
      setUpload({ name: file.name, progress: 100, state: "success" });
      if (draft.kind === "individual") set("resumeFileName", file.name);
      else set("facilities", [...new Set([...draft.facilities, `مدرک: ${file.name}`])]);
    }, 150);
  };
  const name = draft.kind === "individual" ? state.currentUser.displayName : draft.name;
  const tabs: Array<[ProfileTab, string]> = [
    ["identity", "اطلاعات پایه"],
    ["expertise", "تخصص‌ها"],
    ["experience", team ? "اعضای کلیدی و سابقه" : "سوابق و تحصیلات"],
    ["portfolio", "نمونه‌کار و مدارک"],
    ["availability", "ظرفیت همکاری"],
    ["privacy", "حریم خصوصی"],
  ];

  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>{team ? "پروفایل مستقل تیم" : "پروفایل انسانی canonical"}</small>
          <h1>{team ? "پروفایل تیم" : "پروفایل و رزومه"}</h1>
          <p>
            تغییر tab داده کنترل‌شده را حفظ می‌کند؛ ذخیره و انصراف روی یک snapshot مشخص کار می‌کنند.
          </p>
        </div>
        <div className="rh-profile-actions">
          <Link
            className="rh-profile-outline"
            href={buildSolverHref("/app/solver/profile/preview", context)}
          >
            مشاهده پروفایل عمومی <Icon name="eye" />
          </Link>
          <button
            className="rh-profile-primary"
            type="button"
            disabled={!editable || !dirty}
            title={editable ? undefined : permission.reason}
            onClick={save}
          >
            ذخیره تغییرات
          </button>
          <button type="button" disabled={!dirty} onClick={() => setCancelOpen(true)}>
            انصراف
          </button>
        </div>
      </header>
      {!editable && (
        <aside className="rh-team-authority-note" role="status">
          <Icon name="lock" />
          <div>
            <h2>پروفایل فقط‌خواندنی است</h2>
            <p>{permission.allowed ? "" : permission.reason}</p>
          </div>
        </aside>
      )}
      <section className="rh-card rh-profile-identity">
        <PersonAvatar name={name} className="rh-avatar rh-avatar--xl" />
        <div>
          <h2>{name}</h2>
          <p>{draft.kind === "individual" ? draft.headline : draft.valueProposition}</p>
        </div>
        <aside>
          <strong>
            آمادگی پروفایل <em>{readiness.toLocaleString("fa-IR")}٪</em>
          </strong>
          <div className="rh-progress">
            <i style={{ width: `${readiness}%` }} />
          </div>
          <p>
            {readiness < 100
              ? "موارد خالی را در تب‌های بعدی تکمیل کنید."
              : "چک‌لیست این پروفایل کامل است."}
          </p>
        </aside>
      </section>
      <div className="rh-profile-tabs" role="tablist" aria-label="بخش‌های پروفایل">
        {tabs.map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rh-profile-form-layout">
        <section className="rh-card rh-profile-form">
          {tab === "identity" &&
            (draft.kind === "individual" ? (
              <>
                <h2>اطلاعات پایه فرد</h2>
                <label>
                  نام
                  <input value={state.currentUser.displayName} disabled />
                </label>
                <label>
                  عنوان حرفه‌ای
                  <input
                    value={draft.headline}
                    disabled={!editable}
                    onChange={(event) => set("headline", event.target.value)}
                  />
                </label>
                <label>
                  معرفی
                  <textarea
                    rows={5}
                    value={draft.bio}
                    disabled={!editable}
                    onChange={(event) => set("bio", event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <h2>هویت و ارزش پیشنهادی تیم</h2>
                <label>
                  نام تیم
                  <input
                    value={draft.name}
                    disabled={!editable}
                    onChange={(event) => set("name", event.target.value)}
                  />
                </label>
                <label>
                  معرفی تیم
                  <textarea
                    rows={4}
                    value={draft.introduction}
                    disabled={!editable}
                    onChange={(event) => set("introduction", event.target.value)}
                  />
                </label>
                <label>
                  ارزش پیشنهادی
                  <textarea
                    rows={4}
                    value={draft.valueProposition}
                    disabled={!editable}
                    onChange={(event) => set("valueProposition", event.target.value)}
                  />
                </label>
                <label>
                  اطلاعات تماس عمومی تیم
                  <input
                    dir="ltr"
                    value={draft.publicContact}
                    disabled={!editable}
                    onChange={(event) => set("publicContact", event.target.value)}
                  />
                </label>
              </>
            ))}
          {tab === "expertise" && (
            <>
              <h2>{team ? "تخصص، صنعت و فناوری تیم" : "مهارت‌های فرد"}</h2>
              <label>
                تخصص‌ها
                <textarea
                  value={(draft.kind === "individual" ? draft.skills : draft.expertise).join("، ")}
                  disabled={!editable}
                  onChange={(event) =>
                    set(
                      draft.kind === "individual" ? "skills" : "expertise",
                      list(event.target.value),
                    )
                  }
                />
              </label>
              {draft.kind === "team" && (
                <>
                  <label>
                    صنایع
                    <textarea
                      value={draft.industries.join("، ")}
                      disabled={!editable}
                      onChange={(event) => set("industries", list(event.target.value))}
                    />
                  </label>
                  <label>
                    فناوری‌ها
                    <textarea
                      value={draft.technologies.join("، ")}
                      disabled={!editable}
                      onChange={(event) => set("technologies", list(event.target.value))}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {tab === "experience" &&
            (draft.kind === "individual" ? (
              <>
                <h2>سوابق کاری و تحصیلی</h2>
                <label>
                  سوابق کاری
                  <textarea
                    value={draft.experiences.join("\n")}
                    disabled={!editable}
                    onChange={(event) => set("experiences", list(event.target.value))}
                  />
                </label>
                <label>
                  تحصیلات
                  <textarea
                    value={draft.education.join("\n")}
                    disabled={!editable}
                    onChange={(event) => set("education", list(event.target.value))}
                  />
                </label>
              </>
            ) : (
              <>
                <h2>سابقه و ظرفیت تیم</h2>
                <label>
                  سال شروع فعالیت
                  <input
                    dir="ltr"
                    type="number"
                    value={draft.foundedYear ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      set("foundedYear", Number(event.target.value) || undefined)
                    }
                  />
                </label>
                <label>
                  ظرفیت تیم
                  <input
                    value={draft.capacity}
                    disabled={!editable}
                    onChange={(event) => set("capacity", event.target.value)}
                  />
                </label>
                <label>
                  تجهیزات، آزمایشگاه و گواهی‌ها
                  <textarea
                    value={draft.facilities.join("\n")}
                    disabled={!editable}
                    onChange={(event) => set("facilities", list(event.target.value))}
                  />
                </label>
              </>
            ))}
          {tab === "portfolio" && (
            <>
              <h2>نمونه‌کار و مدارک</h2>
              <label>
                {team ? "Case studyهای تیم" : "پروژه‌ها"}
                <textarea
                  value={(draft.kind === "individual" ? draft.projects : draft.caseStudies).join(
                    "\n",
                  )}
                  disabled={!editable}
                  onChange={(event) =>
                    set(
                      draft.kind === "individual" ? "projects" : "caseStudies",
                      list(event.target.value),
                    )
                  }
                />
              </label>
              <label className="rh-resume-drop">
                <Icon name="download" /> بارگذاری نمونه PDF
                <input
                  type="file"
                  accept=".pdf"
                  disabled={!editable}
                  onChange={(event) => uploadFile(event.target.files?.[0])}
                />
              </label>
              {upload.state !== "idle" && (
                <div
                  className="rh-upload-state"
                  role={upload.state === "error" ? "alert" : "status"}
                >
                  <strong>
                    <bdi dir="ltr">{upload.name}</bdi>
                  </strong>
                  <progress max={100} value={upload.progress} />
                  {upload.error && <p>{upload.error}</p>}
                  {upload.state === "error" && (
                    <button type="button" onClick={() => setUpload({ progress: 0, state: "idle" })}>
                      تلاش دوباره
                    </button>
                  )}
                  {upload.state === "success" && (
                    <button
                      type="button"
                      onClick={() => {
                        setUpload({ progress: 0, state: "idle" });
                        if (draft.kind === "individual") set("resumeFileName", undefined);
                      }}
                    >
                      حذف فایل
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {tab === "availability" && (
            <>
              <h2>ظرفیت و روش همکاری</h2>
              <label>
                وضعیت ظرفیت
                <input
                  value={draft.availability}
                  disabled={!editable}
                  onChange={(event) => set("availability", event.target.value)}
                />
              </label>
              <label>
                روش همکاری
                <input
                  value={
                    draft.kind === "individual" ? draft.collaborationMode : draft.collaborationMode
                  }
                  disabled={!editable}
                  onChange={(event) => set("collaborationMode", event.target.value)}
                />
              </label>
            </>
          )}
          {tab === "privacy" && (
            <>
              <h2>حریم خصوصی و نمایش عمومی</h2>
              <label>
                سطح نمایش
                <select
                  value={draft.visibility}
                  disabled={!editable}
                  onChange={(event) => set("visibility", event.target.value as ProfileVisibility)}
                >
                  <option value="public">عمومی</option>
                  <option value="members">اعضای پلتفرم</option>
                  <option value="private">خصوصی</option>
                </select>
              </label>
              <p className="rh-form-intro">
                حالت خصوصی اطلاعات تماس، سوابق و فایل را از projection عمومی حذف می‌کند.
              </p>
            </>
          )}
        </section>
        <aside className="rh-profile-side">
          <section className="rh-card rh-resume-card">
            <h2>{team ? "مدارک تیم" : "رزومه"}</h2>
            <article>
              <span>PDF</span>
              <div>
                <strong>
                  <bdi dir="ltr">
                    {draft.kind === "individual"
                      ? (draft.resumeFileName ?? "ثبت نشده")
                      : `${draft.facilities.length.toLocaleString("fa-IR")} مدرک/تجهیز`}
                  </bdi>
                </strong>
                <small>فایل نمونه؛ وضعیت بارگذاری بالا قابل مشاهده است.</small>
              </div>
            </article>
            <div>
              <Link
                href={buildSolverHref("/app/solver/profile/preview", context, {
                  document: draft.kind === "individual" ? "resume" : "team-evidence",
                })}
              >
                مشاهده پیش‌نمایش واقعی
              </Link>
            </div>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={cancelOpen}
        title="لغو تغییرات ذخیره‌نشده؟"
        description="تمام فیلدها به آخرین snapshot ذخیره‌شده بازمی‌گردند."
        confirmLabel="لغو تغییرات"
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          setDraft(clone(snapshot));
          setCancelOpen(false);
          setNotice("تغییرات ذخیره‌نشده لغو شد.");
        }}
      />
      <Toast message={notice} onClose={() => setNotice("")} />
    </>
  );
}

type SettingsTab = "account" | "security" | "notifications" | "privacy" | "workspace" | "policy";

export function SolverSettingsEditor() {
  const context = useSolverContext();
  const state = useStore();
  const team = context.type === "team";
  const initial = team
    ? state.teamSettings.find((item) => item.teamId === context.teamId)
    : state.accountSettings;
  if (!initial)
    return (
      <section className="rh-card rh-profile-empty">
        <h1>تنظیمات این workspace پیدا نشد</h1>
      </section>
    );
  return <SettingsForm key={context.workspaceId} initial={initial} state={state} />;
}

function SettingsForm({
  initial,
  state,
}: {
  initial: AccountSettings | TeamSettings;
  state: SolverState;
}) {
  const context = useSolverContext();
  const team = "teamId" in initial;
  const [draft, setDraft] = useState(() => clone(initial));
  const [snapshot, setSnapshot] = useState(() => clone(initial));
  const [tab, setTab] = useState<SettingsTab>(team ? "policy" : "account");
  const [notice, setNotice] = useState("");
  const permission = teamPermission(context, "manage-team-settings", {}, state);
  const editable = !team || permission.allowed;
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);
  const set = (field: string, value: unknown) =>
    setDraft((current) => ({ ...current, [field]: value }) as typeof current);
  const save = () => {
    const result = team
      ? saveTeamSettings(context, draft as TeamSettings)
      : saveAccountSettings(draft as AccountSettings);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setSnapshot(clone(draft));
    setNotice(`مقادیر تنظیمات ذخیره شد · رسید ${result.receiptId}`);
  };
  const tabs: Array<[SettingsTab, string]> = team
    ? [
        ["policy", "سیاست و نقش‌ها"],
        ["notifications", "اعلان‌های تیم"],
        ["privacy", "نمایش تیم"],
      ]
    : [
        ["account", "اطلاعات حساب"],
        ["security", "امنیت و ورود"],
        ["notifications", "اعلان‌ها"],
        ["privacy", "حریم خصوصی"],
        ["workspace", "فضای پیش‌فرض"],
      ];
  return (
    <form
      className="rh-settings-page"
      data-layout-ready="true"
      data-route-ready="true"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <header className="rh-profile-heading">
        <div>
          <small>{team ? "تنظیمات workspace تیم" : "تنظیمات حساب انسانی"}</small>
          <h1>{team ? "تنظیمات تیم" : "تنظیمات"}</h1>
          <p>
            {team
              ? "تنظیمات تیم با رمز عبور یا ایمیل امنیتی کاربر مخلوط نمی‌شود."
              : "اطلاعات تماس، امنیت، اعلان و workspace پیش‌فرض واقعاً persist می‌شوند."}
          </p>
        </div>
        <div className="rh-profile-actions">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(clone(snapshot));
              setNotice("مقادیر به snapshot ذخیره‌شده برگشت.");
            }}
          >
            بازنشانی
          </button>
          <button
            className="rh-profile-primary"
            type="submit"
            disabled={!dirty || !editable}
            title={editable ? undefined : permission.reason}
          >
            ذخیره تنظیمات
          </button>
        </div>
      </header>
      {!editable && (
        <aside className="rh-team-authority-note" role="status">
          <Icon name="lock" />
          <div>
            <h2>تنظیمات فقط‌خواندنی است</h2>
            <p>{permission.allowed ? "" : permission.reason}</p>
          </div>
        </aside>
      )}
      <nav className="rh-settings-nav" aria-label="بخش‌های تنظیمات">
        {tabs.map(([value, label]) => (
          <button
            type="button"
            className={tab === value ? "is-active" : ""}
            aria-current={tab === value ? "page" : undefined}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="rh-card rh-settings-panel">
        {!team && tab === "account" && (
          <>
            <h2>اطلاعات حساب</h2>
            <label>
              شماره همراه
              <input
                dir="ltr"
                value={(draft as AccountSettings).mobile}
                disabled={!editable}
                onChange={(event) => set("mobile", event.target.value)}
              />
            </label>
            <label>
              ایمیل بازیابی
              <input
                dir="ltr"
                type="email"
                value={(draft as AccountSettings).recoveryEmail}
                disabled={!editable}
                onChange={(event) => set("recoveryEmail", event.target.value)}
              />
            </label>
            <label>
              منطقه زمانی
              <select
                value={(draft as AccountSettings).timezone}
                disabled={!editable}
                onChange={(event) => set("timezone", event.target.value)}
              >
                <option value="Asia/Tehran">Asia/Tehran</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
              </select>
            </label>
          </>
        )}
        {!team && tab === "security" && (
          <>
            <h2>نشست‌های فعال</h2>
            {(draft as AccountSettings).sessions
              .filter((session) => !session.revokedAt)
              .map((session) => (
                <article className="rh-settings-session" key={session.id}>
                  <div>
                    <strong>{session.device}</strong>
                    <small>
                      آخرین فعالیت:{" "}
                      {new Intl.DateTimeFormat("fa-IR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.lastActiveAt))}
                    </small>
                  </div>
                  {session.current ? (
                    <span className="rh-status rh-status--success">نشست فعلی</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "sessions",
                          (draft as AccountSettings).sessions.map((item) =>
                            item.id === session.id
                              ? { ...item, revokedAt: new Date().toISOString() }
                              : item,
                          ),
                        )
                      }
                    >
                      پایان‌دادن نشست
                    </button>
                  )}
                </article>
              ))}
          </>
        )}
        {tab === "notifications" &&
          (team ? (
            <>
              <h2>سیاست اعلان تیم</h2>
              <label>
                دریافت‌کننده اعلان‌ها
                <select
                  value={(draft as TeamSettings).notificationPolicy}
                  disabled={!editable}
                  onChange={(event) => set("notificationPolicy", event.target.value)}
                >
                  <option value="all-admins">همه مدیران</option>
                  <option value="owner">فقط مالک</option>
                  <option value="assigned">اعضای تخصیص‌یافته</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <h2>اعلان‌های شخصی</h2>
              <label className="rh-toggle">
                <input
                  type="checkbox"
                  checked={(draft as AccountSettings).emailNotifications}
                  onChange={(event) => set("emailNotifications", event.target.checked)}
                />
                <span /> اعلان ایمیلی
              </label>
              <label className="rh-toggle">
                <input
                  type="checkbox"
                  checked={(draft as AccountSettings).smsNotifications}
                  onChange={(event) => set("smsNotifications", event.target.checked)}
                />
                <span /> اعلان پیامکی نمونه
              </label>
            </>
          ))}
        {tab === "privacy" &&
          (team ? (
            <>
              <h2>نمایش پروفایل تیم</h2>
              <label>
                سطح نمایش
                <select
                  value={(draft as TeamSettings).visibility}
                  disabled={!editable}
                  onChange={(event) => set("visibility", event.target.value)}
                >
                  <option value="public">عمومی</option>
                  <option value="members">فقط اعضا</option>
                  <option value="private">خصوصی</option>
                </select>
              </label>
              <label>
                تماس عمومی تیم
                <input
                  dir="ltr"
                  value={(draft as TeamSettings).publicContact}
                  disabled={!editable}
                  onChange={(event) => set("publicContact", event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <h2>حریم خصوصی</h2>
              <label>
                نمایش پروفایل
                <select
                  value={(draft as AccountSettings).profileVisibility}
                  onChange={(event) => set("profileVisibility", event.target.value)}
                >
                  <option value="public">عمومی</option>
                  <option value="members">اعضا</option>
                  <option value="private">خصوصی</option>
                </select>
              </label>
              <p>نمایش پروفایل در نتایج جست‌وجوی سازمان‌ها از همین مقدار canonical پیروی می‌کند.</p>
            </>
          ))}
        {!team && tab === "workspace" && (
          <>
            <h2>فضای کاری پیش‌فرض</h2>
            <label>
              پس از ورود
              <select
                value={(draft as AccountSettings).defaultWorkspaceId}
                onChange={(event) => set("defaultWorkspaceId", event.target.value)}
              >
                {activeWorkspaces(state).map((workspace) => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.type === "individual"
                      ? state.personalWorkspace.name
                      : state.teams.find((candidate) => candidate.id === workspace.teamId)?.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {team && tab === "policy" && (
          <>
            <h2>عضویت و اختیار پیشنهاد</h2>
            <label>
              سیاست عضویت
              <select
                value={(draft as TeamSettings).membershipPolicy}
                disabled={!editable}
                onChange={(event) => set("membershipPolicy", event.target.value)}
              >
                <option value="open">باز</option>
                <option value="request">با درخواست</option>
                <option value="invite-only">فقط دعوت</option>
              </select>
            </label>
            <label>
              نقش پیش‌فرض دعوت
              <select
                value={(draft as TeamSettings).defaultInviteRole}
                disabled={!editable}
                onChange={(event) =>
                  set("defaultInviteRole", event.target.value as Exclude<TeamRole, "team:owner">)
                }
              >
                <option value={teamRole.admin}>مدیر</option>
                <option value={teamRole.proposalManager}>مدیر پیشنهاد</option>
                <option value={teamRole.contributor}>همکار</option>
                <option value={teamRole.viewer}>مشاهده‌گر</option>
              </select>
            </label>
            <label className="rh-toggle">
              <input
                type="checkbox"
                checked={(draft as TeamSettings).policy.adminsCanSubmit}
                disabled={!editable}
                onChange={(event) =>
                  set("policy", {
                    ...(draft as TeamSettings).policy,
                    adminsCanSubmit: event.target.checked,
                  })
                }
              />
              <span /> مدیر بتواند ارسال نهایی کند
            </label>
            <label className="rh-toggle">
              <input
                type="checkbox"
                checked={(draft as TeamSettings).policy.proposalManagersCanSubmit}
                disabled={!editable}
                onChange={(event) =>
                  set("policy", {
                    ...(draft as TeamSettings).policy,
                    proposalManagersCanSubmit: event.target.checked,
                  })
                }
              />
              <span /> مدیر پیشنهاد بتواند ارسال کند
            </label>
            <label className="rh-toggle">
              <input
                type="checkbox"
                checked={(draft as TeamSettings).policy.approvalBeforeSubmit}
                disabled={!editable}
                onChange={(event) =>
                  set("policy", {
                    ...(draft as TeamSettings).policy,
                    approvalBeforeSubmit: event.target.checked,
                  })
                }
              />
              <span /> تأیید داخلی پیش از ارسال لازم باشد
            </label>
          </>
        )}
      </section>
      <Toast message={notice} onClose={() => setNotice("")} />
    </form>
  );
}

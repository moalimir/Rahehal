"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { reviewers } from "@/data/fixtures/internal";
import { setReviewCoi } from "@/lib/reviews/access";
import { MetricCard, Panel, ProgressBar, StatusBadge } from "@/components/internal/shared";
import type { PageProps } from "@/components/internal/page-contracts";

export function ReviewerPage({ route, onAction }: PageProps) {
  const [conflict, setConflict] = useState<"none" | "clear" | "conflict">("none");
  const [scores, setScores] = useState([85, 78, 90, 82]);
  const assignmentId = route.path.match(/\/assignments\/([^/]+)/)?.[1] ?? "RV-204";
  const assignment = (
    <div className="app-review-assignment">
      <div>
        <span className="app-eyebrow">مأموریت {assignmentId} · داوری بدون نمایش هویت</span>
        <h2>ارزیابی راهکار کاهش مصرف آب صنعتی</h2>
        <p>شناسه ارائه‌دهنده و فراداده شناسایی‌کننده تا ثبت نهایی پنهان‌اند.</p>
      </div>
      <dl>
        <div>
          <dt>موعد</dt>
          <dd>امروز ۱۶:۳۰</dd>
        </div>
        <div>
          <dt>پیشرفت</dt>
          <dd>۸۰٪</dd>
        </div>
        <div>
          <dt>معیارنامه داوری</dt>
          <dd>نسخه ۲</dd>
        </div>
      </dl>
    </div>
  );
  if (route.experience === "reviewer-queue" && route.path !== "/app/reviewer/assignments")
    return (
      <>
        {assignment}
        <Panel title="دامنه مأموریت" eyebrow="پیش از دسترسی به مدارک">
          <p>
            ابتدا محدوده داوری، مهلت و سیاست محرمانگی را مرور کنید. دسترسی به مدارک فقط پس از ثبت
            اظهار تعارض منافع باز می‌شود.
          </p>
          <Link
            className="app-button app-button--primary"
            href={`/app/reviewer/assignments/${assignmentId}/conflict`}
          >
            بررسی و اظهار تعارض
          </Link>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-queue")
    return (
      <>
        <section className="app-metric-grid app-metric-grid--three">
          <MetricCard
            label="نیازمند اقدام"
            value="۲"
            detail="۱ مهلت امروز"
            tone="red"
            icon="history"
          />
          <MetricCard label="در حال داوری" value="۳" detail="میانگین پیشرفت ۶۸٪" />
          <MetricCard
            label="تکمیل این ماه"
            value="۱۲"
            detail="SLA: ۹۲٪"
            tone="green"
            icon="shield"
          />
        </section>
        <Panel title="مأموریت‌های من" eyebrow="متمرکز و مستقل">
          <div className="app-assignment-list">
            {reviewers.map((reviewer, index) => {
              const listedAssignmentId = `RV-${204 - index * 16}`;
              return (
                <article key={reviewer.id}>
                  <div>
                    <StatusBadge tone={index === 0 ? "danger" : "info"}>
                      {index === 0 ? "فوری" : "فعال"}
                    </StatusBadge>
                    <bdi>{listedAssignmentId}</bdi>
                  </div>
                  <h3>
                    {
                      ["کاهش مصرف آب صنعتی", "پایش خوردگی تجهیزات", "بهینه‌سازی بازیافت حرارت"][
                        index
                      ]
                    }
                  </h3>
                  <p>معیارنامه نسخه ۲ · محتوای بی‌نام · {reviewer.expertise}</p>
                  <ProgressBar value={reviewer.progress} label="پیشرفت" />
                  <footer>
                    <span>{reviewer.due}</span>
                    <Link
                      className="app-button app-button--primary"
                      href={`/app/reviewer/assignments/${listedAssignmentId}/conflict`}
                    >
                      ادامه مأموریت
                    </Link>
                  </footer>
                </article>
              );
            })}
          </div>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-conflict")
    return (
      <>
        {assignment}
        <Panel title="اظهار تعارض منافع" eyebrow="پیش از نمایش محتوای حساس">
          <div className="app-coi-options">
            <button
              className={conflict === "clear" ? "active" : ""}
              onClick={() => setConflict("clear")}
            >
              <Icon name="shield" />
              <div>
                <strong>تعارضی ندارم</strong>
                <span>هیچ رابطه مالی، حرفه‌ای یا شخصی اثرگذار وجود ندارد.</span>
              </div>
            </button>
            <button
              className={conflict === "conflict" ? "active danger" : ""}
              onClick={() => setConflict("conflict")}
            >
              <Icon name="notification" />
              <div>
                <strong>تعارض یا تردید دارم</strong>
                <span>عملیات بررسی و تا آن زمان محتوا محدود می‌شود.</span>
              </div>
            </button>
          </div>
          {conflict === "conflict" && (
            <label className="app-field">
              <span>شرح محرمانه تعارض</span>
              <textarea rows={4} placeholder="ماهیت رابطه را بدون اطلاعات غیرضروری توضیح دهید." />
            </label>
          )}
          <footer className="app-decision-footer">
            <div>
              <Icon name="lock" />
              <span>تا ثبت اظهار، جزئیات پیشنهاد و تیم نمایش داده نمی‌شود.</span>
            </div>
            <button
              className="app-button app-button--primary"
              disabled={conflict === "none"}
              onClick={() => {
                setReviewCoi(assignmentId, conflict === "clear" ? "clear" : "conflict");
                onAction(
                  conflict === "clear"
                    ? "ثبت نبود تعارض و پذیرش مأموریت"
                    : "ثبت تعارض و ارجاع به عملیات",
                  { sensitive: true, reason: conflict === "conflict" },
                );
              }}
            >
              ثبت اظهار و ادامه
            </button>
          </footer>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-score")
    return (
      <>
        {assignment}
        <div className="app-review-layout">
          <aside className="app-rubric-nav">
            {["تناسب مسئله", "اعتبار فنی", "اجرای پایلوت", "ریسک و ایمنی"].map((item, index) => (
              <button key={item} className={index === 0 ? "active" : ""}>
                <span>{(index + 1).toLocaleString("fa-IR")}</span>
                <div>
                  <strong>{item}</strong>
                  <small>وزن {[25, 35, 25, 15][index].toLocaleString("fa-IR")}٪</small>
                </div>
                <StatusBadge tone={scores[index] > 0 ? "success" : "warning"}>
                  {scores[index] > 0 ? "کامل" : "ناقص"}
                </StatusBadge>
              </button>
            ))}
          </aside>
          <Panel title="تناسب راهکار با مسئله" eyebrow="وزن ۲۵٪ · حدنصاب ۶۰">
            <div className="app-score-control">
              <label>
                <span>امتیاز</span>
                <strong>{scores[0].toLocaleString("fa-IR")}</strong>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={scores[0]}
                  onChange={(event) =>
                    setScores((items) =>
                      items.map((item, index) => (index === 0 ? Number(event.target.value) : item)),
                    )
                  }
                />
              </label>
              <div>
                <span>۰ · نامتناسب</span>
                <span>۱۰۰ · شواهد کامل</span>
              </div>
            </div>
            <label className="app-field">
              <span>
                دلیل امتیاز <b>*</b>
              </span>
              <textarea
                rows={7}
                defaultValue="راهکار با محدودیت توقف و معیار کاهش مصرف سازگار است. فرض کیفیت آب باید در شرط پذیرش روز دهم کنترل شود."
              />
            </label>
            <div className="app-autosave">
              <i />
              پیش‌نویس ذخیره شد · اکنون
            </div>
            <button
              className="app-button app-button--primary"
              onClick={() => onAction("ذخیره پیش‌نویس داوری")}
            >
              ذخیره و معیار بعدی
            </button>
          </Panel>
          <aside className="app-blind-note">
            <Icon name="lock" />
            <h3>داوری مستقل</h3>
            <p>
              امتیاز دیگر داوران تا ثبت نهایی نمایش داده نمی‌شود. ارتباط با حل‌کننده فقط از مسیر
              شفاف‌سازی کنترل‌شده است.
            </p>
            <button
              className="app-button app-button--secondary"
              onClick={() => onAction("ثبت درخواست شفاف‌سازی")}
            >
              درخواست شفاف‌سازی
            </button>
          </aside>
        </div>
      </>
    );
  return (
    <>
      {assignment}
      <Panel title="پیش‌نمایش ثبت نهایی" eyebrow="پس از ثبت، ویرایش فقط با بازگشایی عملیات">
        <div className="app-final-review">
          <div className="app-final-score">
            <strong>
              {Math.round(
                scores.reduce((sum, value) => sum + value, 0) / scores.length,
              ).toLocaleString("fa-IR")}
            </strong>
            <span>امتیاز نهایی از ۱۰۰</span>
          </div>
          <div className="app-score-breakdown">
            {["تناسب", "فنی", "پایلوت", "ریسک"].map((label, index) => (
              <div key={label}>
                <span>{label}</span>
                <ProgressBar value={scores[index]} />
                <strong>{scores[index].toLocaleString("fa-IR")}</strong>
              </div>
            ))}
          </div>
        </div>
        <label className="app-confirm-check">
          <input type="checkbox" defaultChecked />
          <span>
            <Icon name="check" />
          </span>
          <div>
            <strong>استقلال و کامل‌بودن داوری را تأیید می‌کنم</strong>
            <small>
              این داوری بدون مشاهده امتیاز دیگران و براساس معیارنامه نسخه ۲ انجام شده است.
            </small>
          </div>
        </label>
        <footer className="app-decision-footer">
          <div>
            <Icon name="shield" />
            <span>نسخه، دلایل، زمان سرور و اظهار تعارض در رسید ثبت می‌شوند.</span>
          </div>
          <button
            className="app-button app-button--primary"
            onClick={() =>
              onAction(`ثبت نهایی داوری ${assignmentId}`, { sensitive: true, reason: true })
            }
          >
            ثبت نهایی و دریافت رسید
          </button>
        </footer>
      </Panel>
    </>
  );
}

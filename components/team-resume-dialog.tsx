"use client";

import { Icon } from "@/components/icons";

export type TeamResumeSummary = {
  team: string;
  field: string;
  inviter: string;
  members: string;
  role: string;
  tags: string[];
  verified: boolean;
  verificationLabel: string;
};

function createResumePdf(team: string): Blob {
  const safeTeam = team.replace(/[^\x20-\x7e]/g, "").replace(/[()\\]/g, "");
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 760 Td",
    `(Rahhal - Team Resume) Tj`,
    "0 -34 Td",
    "/F1 12 Tf",
    `(Team: ${safeTeam || "Inviting team"}) Tj`,
    "0 -24 Td",
    "(Demo resume generated from the Rahhal workspace.) Tj",
    "ET",
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadResume(team: string) {
  const url = URL.createObjectURL(createResumePdf(team));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Rahhal-Team-Resume.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TeamResumeDialog({
  resume,
  onClose,
  onDownloaded,
}: {
  resume: TeamResumeSummary;
  onClose: () => void;
  onDownloaded?: () => void;
}) {
  return (
    <div
      className="rh-team-resume-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="rh-team-resume-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-resume-kicker team-resume-title"
        aria-describedby="team-resume-description"
      >
        <header className="rh-team-resume-dialog__header">
          <span className="rh-team-resume-dialog__avatar" aria-hidden="true">
            {resume.team.slice(0, 1)}
          </span>
          <div>
            <small id="team-resume-kicker">رزومه تیم دعوت‌کننده</small>
            <h2 id="team-resume-title">{resume.team}</h2>
            <p>{resume.field}</p>
            <span className={`rh-team-resume-dialog__verified${resume.verified ? "" : " is-pending"}`}>
              <Icon name={resume.verified ? "check" : "history"} /> {resume.verificationLabel}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن پنجره رزومه">
            <Icon name="close" />
          </button>
        </header>

        <div className="rh-team-resume-dialog__body">
          <div className="rh-team-resume-dialog__main">
            <section className="rh-team-resume-dialog__section">
              <h3>معرفی تیم</h3>
              <p id="team-resume-description">
                این خلاصه برای ارزیابی اولیه دعوت نمایش داده می‌شود. سوابق پروژه‌ها، ترکیب اعضا و
                حوزه‌های تخصصی تیم پیش از پذیرش قابل بررسی است.
              </p>
              <dl className="rh-team-resume-dialog__facts">
                <div>
                  <Icon name="user" />
                  <dt>مدیر و نماینده تیم</dt>
                  <dd>{resume.inviter}</dd>
                </div>
                <div>
                  <Icon name="people" />
                  <dt>اعضای تأییدشده</dt>
                  <dd>{resume.members}</dd>
                </div>
              </dl>
            </section>

            <section className="rh-team-resume-dialog__section">
              <h3>حوزه‌های تخصصی</h3>
              <div className="rh-team-resume-dialog__tags">
                {resume.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <p>ترکیب تخصصی تیم متناسب با پروژه‌های داده‌محور و صنعتی است.</p>
            </section>

            <section className="rh-team-resume-dialog__document" aria-label="فایل رزومه تیم">
              <span className="rh-team-resume-dialog__pdf" aria-hidden="true">
                PDF
              </span>
              <div>
                <strong>رزومه کامل تیم</strong>
                <small>سوابق پروژه‌ها، اعضا و توانمندی‌های تخصصی</small>
                <span>
                  <Icon name="download" /> آماده دریافت
                </span>
              </div>
            </section>
          </div>

          <aside className="rh-team-resume-dialog__role">
            <span>
              <Icon name="user" /> نقش پیشنهادی به شما
            </span>
            <strong>{resume.role}</strong>
            <p>برای تکمیل ترکیب تخصصی تیم</p>
            <ul>
              <li>
                <Icon name="check" /> دعوت از سوی مدیر تیم
              </li>
              <li>
                <Icon name="check" /> تیم دارای {resume.members}
              </li>
              <li>
                <Icon name="check" /> رزومه کامل قابل دریافت
              </li>
            </ul>
            <div>
              <p>اطلاعات تماس پس از پذیرش دعوت در دسترس قرار می‌گیرد.</p>
              <Icon name="lock" />
            </div>
          </aside>
        </div>

        <footer className="rh-team-resume-dialog__footer">
          <p>پیش از تصمیم‌گیری، رزومه و ترکیب تیم را بررسی کنید.</p>
          <div>
            <button type="button" onClick={onClose}>
              بستن
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => {
                downloadResume(resume.team);
                onDownloaded?.();
              }}
            >
              دریافت رزومه PDF <Icon name="download" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

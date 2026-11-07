import type {
  ResumeFactRecord,
  ResumeProfileRecord,
  ResumeVersionRecord,
} from "../shared/contracts";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderResumeHtml(input: {
  profile: ResumeProfileRecord;
  facts: ResumeFactRecord[];
  version: ResumeVersionRecord | null;
}): string {
  const { profile, facts, version } = input;
  const grouped = new Map<string, ResumeFactRecord[]>();
  for (const fact of facts) {
    const existing = grouped.get(fact.kind) || [];
    existing.push(fact);
    grouped.set(fact.kind, existing);
  }
  const sections = [...grouped.entries()]
    .map(
      ([kind, items]) =>
        `<section><h2>${escapeHtml(kind)}</h2>${items
          .map(
            (fact) =>
              `<article><h3>${escapeHtml(fact.title)}</h3><p class="meta">${[
                fact.organization,
                fact.role,
                [fact.startDate, fact.endDate].filter(Boolean).join(" - "),
                fact.location,
              ]
                .filter(Boolean)
                .map(escapeHtml)
                .join(" · ")}</p><ul>${fact.bullets
                .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
                .join("")}</ul>${
                fact.skills.length
                  ? `<p class="skills">技能：${fact.skills
                      .map(escapeHtml)
                      .join("、")}</p>`
                  : ""
              }</article>`,
          )
          .join("")}</section>`,
    )
    .join("");
  const contact = [profile.phone, profile.email, profile.currentCity]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{margin:18mm}body{font-family:"Microsoft YaHei",sans-serif;color:#172a30;line-height:1.62;font-size:11pt}
    h1{font-size:25px;margin:0 0 4px}h2{font-size:15px;border-bottom:1px solid #d8e4e3;padding-bottom:4px;margin-top:21px}
    h3{font-size:13px;margin:13px 0 2px}p{margin:4px 0}.meta,.skills{color:#53666c;font-size:10pt}
    ul{margin:5px 0 0;padding-left:20px}li{margin:3px 0}.summary{padding:9px 11px;background:#f2f8f7;border-radius:6px}
  </style></head><body><h1>${escapeHtml(profile.fullName)}</h1>${
    contact ? `<p>${contact}</p>` : ""
  }${
    version?.name
      ? `<p>目标版本：${escapeHtml(version.name)}</p>`
      : ""
  }${
    profile.summary
      ? `<p class="summary">${escapeHtml(profile.summary)}</p>`
      : ""
  }${sections}</body></html>`;
}

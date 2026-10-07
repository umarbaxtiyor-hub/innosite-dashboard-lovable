// Deterministik boshqaruv signallari (AI Control Center MVP). Faqat haqiqiy DB ma'lumotlari asosida.
// Keyinchalik LLM ulanadi: bu qoidalar natijasi LLM'ga "dalil" sifatida beriladi.

export type Severity = "critical" | "warning" | "info";
export type Insight = {
  fingerprint: string; rule_key: string; severity: Severity; project_id: string | null;
  title: string; metric: string; evidence: Record<string, unknown>; recommended_action: string;
};

export type ProjectInput = {
  id: string; name: string; total_budget: number | null; start_date: string | null; end_date: string | null;
  boq_planned: number; boq_actual: number; expense_total: number; income_total: number;
  expenses_30d: { id: string; amount: number; category: string; date: string }[];
  fuel_7d: number; fuel_prev28d: number;
  attendance_7d_days: number; employees_active: number;
  dpr_last_date: string | null;
  zayavka_overdue: number; zayavka_pending_old: number;
  issues_7d?: { date: string; text: string }[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Fingerprint: qoida + loyiha + davr. Bir davrda bir signal faqat bir marta yaratiladi. */
export function fingerprint(rule: string, projectId: string | null, period: string, extra = "") {
  return `${rule}|${projectId ?? "-"}|${period}${extra ? `|${extra}` : ""}`;
}

export function computeInsights(projects: ProjectInput[], today: string): Insight[] {
  const out: Insight[] = [];
  const week = isoWeek(today);
  const month = today.slice(0, 7);
  for (const p of projects) {
    const budget = Number(p.total_budget ?? 0) || p.boq_planned;
    // 1) Byudjet og'ishi
    if (budget > 0) {
      const used = pct(p.expense_total, budget);
      const elapsed = timeElapsedPct(p.start_date, p.end_date, today);
      if (used >= 100) out.push(mk("budget_overrun", "critical", p, month, `Byudjet oshib ketdi: ${used}%`, `${used}% sarflangan`,
        { budget, expense_total: p.expense_total, source: "expenses, projects.total_budget" }, "Xarajatlarni to'xtatib, smetani qayta ko'rib chiqing."));
      else if (elapsed !== null && used - elapsed >= 20) out.push(mk("budget_deviation", "warning", p, month, `Xarajat vaqtdan ${Math.round(used - elapsed)}% oldinda`,
        `${used}% byudjet / ${elapsed}% vaqt`, { budget, expense_total: p.expense_total, elapsed_pct: elapsed, source: "expenses, projects" }, "Eng katta xarajat toifalarini tekshiring."));
    }
    // 2) BOQ progress xavfi / jadval kechikishi
    const elapsed = timeElapsedPct(p.start_date, p.end_date, today);
    if (p.boq_planned > 0 && elapsed !== null) {
      const prog = pct(p.boq_actual, p.boq_planned);
      if (elapsed - prog >= 30) out.push(mk("schedule_delay", elapsed - prog >= 50 ? "critical" : "warning", p, week,
        `BOQ bajarilishi ${prog}%, vaqt ${elapsed}%`, `${Math.round(elapsed - prog)}% orqada`,
        { boq_planned: p.boq_planned, boq_actual: p.boq_actual, elapsed_pct: elapsed, source: "boq_items" }, "Orqada qolgan BOQ bandlariga resurs qo'shing."));
    }
    // 3) Pul oqimi xavfi
    const net = p.income_total - p.expense_total;
    if (p.expense_total > 0 && net < 0) out.push(mk("cashflow_risk", net < -0.2 * p.expense_total ? "critical" : "warning", p, week,
      `Sof pul oqimi manfiy: ${fmt(net)} so'm`, `kirim ${fmt(p.income_total)} / chiqim ${fmt(p.expense_total)}`,
      { income_total: p.income_total, expense_total: p.expense_total, source: "incomes, expenses" }, "Buyurtmachidan to'lov so'rang yoki xarajatni kechiktiring."));
    // 4) G'ayrioddiy xarajat (toifa medianasidan 5x, kamida 3 ta namunada)
    const byCat = new Map<string, number[]>();
    for (const e of p.expenses_30d) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e.amount]);
    const unusual = p.expenses_30d.filter((e) => {
      const arr = (byCat.get(e.category) ?? []).filter((x) => x > 0).sort((a, b) => a - b);
      if (arr.length < 8 || e.amount < 3_000_000) return false;
      const med = arr[Math.floor(arr.length / 2)];
      return med > 0 && e.amount >= med * 8;
    }).sort((a, b) => b.amount - a.amount).slice(0, 3); // spam bo'lmasin: loyiha bo'yicha eng katta 3 tasi
    for (const e of unusual) {
      const arr = (byCat.get(e.category) ?? []).filter((x) => x > 0).sort((a, b) => a - b);
      const med = arr[Math.floor(arr.length / 2)];
      if (med > 0) out.push(mk("unusual_expense", "warning", p, e.id, `G'ayrioddiy xarajat: ${fmt(e.amount)} so'm (${e.category})`,
        `mediana ${fmt(med)} dan ${Math.round(e.amount / med)}x`, { expense_id: e.id, date: e.date, median: med, source: "expenses" }, "Hujjat va mas'ulni tekshiring."));
    }
    // 5) Yoqilg'i anomaliyasi (oxirgi 7 kun vs oldingi 28 kun haftalik o'rtacha)
    const avg = p.fuel_prev28d / 4;
    if (avg > 0 && p.fuel_7d >= avg * 1.8) out.push(mk("fuel_anomaly", "warning", p, week, `Yoqilg'i xarajati ${Math.round((p.fuel_7d / avg) * 100)}% ga oshdi`,
      `7 kun ${fmt(p.fuel_7d)} / o'rtacha ${fmt(avg)}`, { fuel_7d: p.fuel_7d, weekly_avg: avg, source: "expenses (yoqilg'i)" }, "Texnika bo'yicha sarfni solishtiring."));
    // 6) Ishchi kuchi yetishmasligi
    if (p.employees_active >= 3) {
      const ratio = p.attendance_7d_days / (p.employees_active * 6);
      if (ratio < 0.5) out.push(mk("manpower_shortage", ratio < 0.25 ? "critical" : "warning", p, week, `Davomat past: ${Math.round(ratio * 100)}%`,
        `${p.attendance_7d_days} kishi-kun / ${p.employees_active} xodim`, { source: "employee_attendance, employees" }, "Brigada va xodimlar sonini tekshiring."));
    }
    // 7) DPR kelmayapti
    if (p.dpr_last_date && daysBetween(p.dpr_last_date, today) >= 3) out.push(mk("dpr_missing", "info", p, week,
      `${daysBetween(p.dpr_last_date, today)} kundan beri kunlik hisobot yo'q`, `oxirgi: ${p.dpr_last_date}`, { source: "daily_reports" }, "Prorabdan DPR so'rang."));
    // 8) Ta'minot kechikishi
    if (p.zayavka_overdue > 0 || p.zayavka_pending_old > 0) out.push(mk("procurement_delay", p.zayavka_overdue >= 3 ? "critical" : "warning", p, week,
      `Ta'minot kechikmoqda: ${p.zayavka_overdue} muddati o'tgan, ${p.zayavka_pending_old} ta 7+ kun tasdiqlanmagan`, `${p.zayavka_overdue + p.zayavka_pending_old} zayavka`,
      { source: "project_zayavka" }, "Snabjenets bilan yetkazib berish sanalarini aniqlang."));
    // 9) HSE / QA-QC: faqat DPR'dagi haqiqiy "muammolar" matnidan
    for (const is of p.issues_7d ?? []) {
      const t = is.text.toLocaleLowerCase("uz");
      const hse = /baxtsiz|jarohat|shikast|avariya|yong['‘’`]?in|qulab|halok|xavfsizlik buzil/.test(t);
      const qa = /brak|nuqson|sifatsiz|qayta qurish|demontaj|yoriq|darz/.test(t);
      if (hse || qa) out.push(mk(hse ? "hse_issue" : "qaqc_issue", hse ? "critical" : "warning", p, is.date,
        `${hse ? "HSE" : "QA/QC"} muammo: ${is.text.slice(0, 90)}`, `DPR ${is.date}`, { source: "daily_reports.issues", text: is.text.slice(0, 300) },
        hse ? "Ishni to'xtatib, hodisani tekshiring va dalolatnoma tuzing." : "Nuqsonni qayd eting, tuzatish muddatini belgilang."));
    }
  }
  return out;
}

export function classifyIssue(text: string): "hse" | "qaqc" | "other" {
  const t = text.toLocaleLowerCase("uz");
  if (/baxtsiz|jarohat|shikast|avariya|yong['‘’`]?in|qulab|halok|xavfsizlik buzil/.test(t)) return "hse";
  if (/brak|nuqson|sifatsiz|qayta qurish|demontaj|yoriq|darz/.test(t)) return "qaqc";
  return "other";
}

function mk(rule: string, severity: Severity, p: ProjectInput, period: string, title: string, metric: string, evidence: Record<string, unknown>, action: string): Insight {
  return { fingerprint: fingerprint(rule, p.id, period), rule_key: rule, severity, project_id: p.id, title, metric, evidence: { project: p.name, ...evidence }, recommended_action: action };
}

export function timeElapsedPct(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(start), e = Date.parse(end), t = Date.parse(today);
  if (!(e > s)) return null;
  return Math.max(0, Math.min(100, Math.round(((t - s) / (e - s)) * 100)));
}

export function isoWeek(d: string): string {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const y = dt.getUTCFullYear();
  const w = Math.floor((dt.getTime() - Date.UTC(y, 0, 4)) / 604_800_000) + 1;
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/** Takrorlanmaslik: mavjud fingerprintlar yangilanadi, faqat yangilari qaytariladi. */
export function partitionNew(insights: Insight[], existing: Set<string>) {
  const seen = new Set<string>();
  const fresh: Insight[] = [], repeat: Insight[] = [];
  for (const i of insights) {
    if (seen.has(i.fingerprint)) continue;
    seen.add(i.fingerprint);
    (existing.has(i.fingerprint) ? repeat : fresh).push(i);
  }
  return { fresh, repeat };
}

export function syncHealth(k: { failed: number; stuck: number; pending: number; duplicates: number; warnings: number }): "healthy" | "attention" | "critical" {
  if (k.duplicates > 0 || k.stuck > 0 || k.failed >= 10) return "critical";
  if (k.failed > 0 || k.pending > 20 || k.warnings > 0) return "attention";
  return "healthy";
}

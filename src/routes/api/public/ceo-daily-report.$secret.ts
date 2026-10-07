// Kunlik CEO hisoboti — pg_cron yoki tashqi rejalashtiruvchi chaqiradi.
// Har bir faol loyiha uchun 1 betlik PDF tayyorlanadi va Telegram orqali
// CEO / admin foydalanuvchilarga yuboriladi.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildCeoReport } from "@/lib/ceo-report-data";
import { renderCeoReportPdf, ceoReportFileName } from "@/lib/ceo-report-pdf";
import { aishaTts } from "@/server/telegram.server";
import type { CeoReport } from "@/lib/ceo-report-data";

// Faqat "PV Olg'a" loyihasi uchun ovozli hisobot yuboriladi.
const normName = (s: string) =>
  (s ?? "").toLowerCase().replace(/[\u2018\u2019\u02bb\u02bc`']/g, "").replace(/\s+/g, " ").trim();
const isVoiceProject = (name: string) => normName(name).includes("olga");

function voiceSummary(r: CeoReport): string {
  const mln = (v: number) => `${Math.round(v / 1_000_000)} million so'm`;
  const parts = [
    `${r.projectName} loyihasi bo'yicha kunlik hisobot.`,
    `Bajarilish ${r.progress} foiz.`,
    `Kassa qoldiq ${mln(r.balance)}.`,
    `Kirim ${mln(r.kassaIn)}, chiqim ${mln(r.totalOut)}.`,
    `Material ${mln(r.spendMaterial)}, ishlar ${mln(r.spendWork)}, operatsion ${mln(r.spendOperatsion)}.`,
    `Bugun ${r.todayEmpCount} xodim va ${r.todayUstaCount} usta ishladi.`,
  ];
  return parts.join(" ");
}

async function sendVoiceReport(TG_API: string, chat_id: number, audio: ArrayBuffer, caption: string) {
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  form.append("caption", caption);
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "hisobot.wav");
  form.append("title", "Kunlik hisobot");
  return fetch(`${TG_API}/sendAudio`, { method: "POST", body: form });
}

async function run(): Promise<{ projects: number; sent: number; errors: string[] }> {
  const errors: string[] = [];
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

  // Qabul qiluvchilar: CEO + admin (telegram id bor va faol)
  const { data: roleRows } = await sb.from("user_roles").select("user_id,role").in("role", ["ceo", "admin"]);
  const userIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
  const { data: profs } = userIds.length
    ? await sb.from("profiles").select("id,telegram_user_id,is_active").in("id", userIds)
    : { data: [] as any[] };
  const chatIds = Array.from(
    new Set(
      (profs ?? [])
        .filter((p: any) => p.is_active !== false && p.telegram_user_id)
        .map((p: any) => Number(p.telegram_user_id)),
    ),
  );

  const { data: projects } = await sb.from("projects").select("id,name,status");
  const active = (projects ?? []).filter((p: any) => String(p.status ?? "active").toLowerCase() !== "archived");

  let sent = 0;
  // Yagona kunlik summary (DB dan) + sync holati — PDF lardan oldin
  try {
    const { buildDailySummaryText } = await import("@/server/insights.server");
    const text = await buildDailySummaryText(sb);
    for (const chat_id of chatIds) {
      const r = await fetch(`${TG_API}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }) });
      if (!r.ok) errors.push(`summary ${chat_id}: ${r.status}`);
    }
  } catch (e: any) { errors.push(`summary: ${e?.message ?? e}`); }
  for (const p of active) {
    try {
      const report = await buildCeoReport(sb, p.id);
      const bytes = await renderCeoReportPdf(report);
      const caption =
        `📊 <b>${report.projectName}</b>\n` +
        `Kunlik hisobot — ${new Date().toISOString().slice(0, 10)}\n` +
        `Bajarilish: <b>${report.progress}%</b> · Kassa qoldiq: <b>${Math.round(report.balance).toLocaleString("en-US")}</b> so'm`;
      for (const chat_id of chatIds) {
        const fd = new FormData();
        fd.append("chat_id", String(chat_id));
        fd.append("caption", caption);
        fd.append("parse_mode", "HTML");
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        fd.append("document", new Blob([ab], { type: "application/pdf" }), ceoReportFileName(report));
        const r = await fetch(`${TG_API}/sendDocument`, { method: "POST", body: fd });
        if (r.ok) sent++;
        else errors.push(`tg ${chat_id}: ${await r.text().catch(() => "")}`);
      }

      // Ovozli hisobot — faqat PV Olg'a loyihasi uchun
      if (isVoiceProject(report.projectName) && chatIds.length) {
        const audio = await aishaTts(voiceSummary(report));
        if (audio) {
          for (const chat_id of chatIds) {
            const vr = await sendVoiceReport(TG_API, chat_id, audio, `🔊 ${report.projectName} — ovozli hisobot`);
            if (!vr.ok) errors.push(`voice ${chat_id}: ${await vr.text().catch(() => "")}`);
          }
        } else {
          errors.push(`${report.projectName}: ovoz yaratilmadi`);
        }
      }
    } catch (e: any) {
      errors.push(`${p.name}: ${e?.message ?? e}`);
    }
  }
  return { projects: active.length, sent, errors };
}

export const Route = createFileRoute("/api/public/ceo-daily-report/$secret")({
  server: {
    handlers: {
      GET: async ({ params }) => handle(params.secret),
      POST: async ({ params }) => handle(params.secret),
    },
  },
});

async function handle(secret: string) {
  const allowed = [process.env.CEO_REPORT_SECRET, process.env.TELEGRAM_WEBHOOK_SECRET].filter(Boolean);
  const { timingSafeEqual } = await import("crypto");
  const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  if (!allowed.length || !allowed.some((a) => eq(String(a), secret))) return new Response("Unauthorized", { status: 401 });
  try {
    const res = await run();
    return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

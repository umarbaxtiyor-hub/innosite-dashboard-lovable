// Navbatdagi kirim/chiqim yozuvlarini Google Sheets jadvaliga yozadi.
// Trigger va soatlik cron chaqiradi. Kalit faqat DB dagi `internal_secrets`
// (sheets_sync_token) da saqlanadi — kod yoki migratsiyada emas.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { flushSheetSync, flushBotOutbox } from "@/server/sheets-sync.server";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function expectedToken(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("internal_secrets").select("value").eq("key", "sheets_sync_token").maybeSingle();
  if (error) {
    console.error("[sheets-sync] token lookup failed", error.message);
    return null;
  }
  return data?.value ?? null;
}

async function handle(secret: string) {
  const expected = await expectedToken();
  if (!expected || !safeEqual(secret, expected)) return new Response("Unauthorized", { status: 401 });
  try {
    const res = await flushSheetSync();
    // Yozilmay qolgan bot (salyarka/HR/DPR) yozuvlari va boshqaruv signallari — xato asosiy syncni to'xtatmaydi
    let outbox: unknown = null, insights: unknown = null;
    try { outbox = await flushBotOutbox(); } catch (e: any) { console.error("[sheets-sync] outbox", e); }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { runInsights } = await import("@/server/insights.server");
      insights = await runInsights(supabaseAdmin, { notify: true });
    } catch (e: any) { console.error("[sheets-sync] insights", e); }
    return new Response(JSON.stringify({ ...res, outbox, insights }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[sheets-sync] flush failed", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/sheets-sync/$secret")({
  server: {
    handlers: {
      GET: async ({ params }) => handle(params.secret),
      POST: async ({ params }) => handle(params.secret),
    },
  },
});

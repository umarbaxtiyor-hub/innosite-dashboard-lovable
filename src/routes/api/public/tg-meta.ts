import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Validate Telegram WebApp initData (HMAC) — mirrors tg-submit.ts
function verifyInitData(
  initData: string,
  botToken: string,
): { ok: boolean; userId?: number; authDate?: number } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false };
    params.delete("hash");
    const dataCheck = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = createHmac("sha256", secret).update(dataCheck).digest("hex");
    if (computed !== hash) return { ok: false };
    const authDate = Number(params.get("auth_date") || 0);
    // Reject initData older than 24h
    if (!authDate || Date.now() / 1000 - authDate > 86400) return { ok: false };
    const userJson = params.get("user");
    if (!userJson) return { ok: true, authDate };
    const u = JSON.parse(userJson);
    return { ok: true, userId: u.id, authDate };
  } catch {
    return { ok: false };
  }
}

export const Route = createFileRoute("/api/public/tg-meta")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          return new Response(JSON.stringify({ error: "server not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }

        const url = new URL(request.url);
        const initData = url.searchParams.get("initData") || "";
        const v = verifyInitData(initData, token);
        if (!v.ok || !v.userId) {
          return new Response(JSON.stringify({ error: "invalid initData" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }

        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );
        const [sess, mm, mw, brigs, projs] = await Promise.all([
          sb
            .from("telegram_sessions")
            .select("data")
            .eq("telegram_user_id", v.userId)
            .maybeSingle(),
          sb.from("master_materials").select("id,name,unit").order("name"),
          sb.from("master_works").select("id,name,unit").order("name"),
          sb.from("brigades").select("id,name").order("name"),
          sb.from("projects").select("id,name,code").eq("status", "active").order("name"),
        ]);
        return new Response(
          JSON.stringify({
            session: sess?.data?.data ?? null,
            materials: mm.data ?? [],
            works: mw.data ?? [],
            brigades: brigs.data ?? [],
            projects: projs.data ?? [],
          }),
          { headers: { "Content-Type": "application/json", ...cors } },
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleUpdate } from "@/server/telegram.server";

// Telegram bir update'ni qayta yuborishi mumkin (timeout/retry). update_id
// birinchi marta saqlanadi; takror kelsa qayta ishlanmaydi → DB/Sheets'ga
// ikki marta yozilmaydi.
async function claimUpdate(updateId: unknown): Promise<"new" | "duplicate" | "unknown"> {
  if (typeof updateId !== "number") return "unknown";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("telegram_processed_updates")
      .upsert({ update_id: updateId }, { onConflict: "update_id", ignoreDuplicates: true })
      .select("update_id");
    if (error) {
      console.error("[tg-webhook] dedup insert failed", update_idSafe(updateId), error.message);
      return "unknown";
    }
    return data && data.length > 0 ? "new" : "duplicate";
  } catch (e) {
    console.error("[tg-webhook] dedup error", e);
    return "unknown";
  }
}
const update_idSafe = (id: unknown) => `update_id=${String(id)}`;

export const Route = createFileRoute("/api/public/telegram-webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!expected || params.secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let update: any;
        try {
          update = await request.json();
        } catch (e) {
          console.error("[tg-webhook] invalid JSON body", e);
          return new Response("ok");
        }
        const claim = await claimUpdate(update?.update_id);
        if (claim === "duplicate") {
          console.warn("[tg-webhook] duplicate skipped", update_idSafe(update?.update_id));
          return new Response("ok");
        }
        try {
          // Workerda fire-and-forget ishlamaydi — response qaytgach context to'xtaydi.
          await handleUpdate(update);
        } catch (e: any) {
          console.error("[tg-webhook] handleUpdate failed", update_idSafe(update?.update_id), e?.stack ?? e);
        }
        return new Response("ok");
      },
      GET: async () => new Response("Telegram webhook endpoint"),
    },
  },
});

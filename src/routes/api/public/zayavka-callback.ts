import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  secret: z.string().min(1),
  zayavka_id: z.string().uuid(),
  status: z.enum(["Approved", "Rejected", "approved", "rejected"]),
  approved_by: z.string().max(255).nullish(),
  rejected_reason: z.string().max(2000).nullish(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export const Route = createFileRoute("/api/public/zayavka-callback")({
  server: {
    handlers: {
      OPTIONS: async () => json({}, 204),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Schema.parse(await request.json());
        } catch (e: any) {
          return json({ error: "Invalid payload", details: e?.message }, 400);
        }
        const expected = process.env.MAKE_CALLBACK_SECRET;
        if (!expected || parsed.secret !== expected) {
          return json({ error: "Unauthorized" }, 401);
        }

        const isApproved = parsed.status.toLowerCase() === "approved";
        const patch: Record<string, any> = {
          workflow_status: isApproved ? "approved" : "rejected",
          status: isApproved ? "approved" : "rejected",
        };
        if (isApproved) {
          patch.approved_at = new Date().toISOString();
          patch.rejected_reason = null;
        } else {
          patch.rejected_reason = parsed.rejected_reason ?? null;
        }

        const { error } = await supabaseAdmin
          .from("project_zayavka")
          .update(patch as any)
          .eq("id", parsed.zayavka_id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      },
    },
  },
});

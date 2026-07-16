import { createFileRoute } from "@tanstack/react-router";
import { handleUpdate } from "@/server/telegram.server";

export const Route = createFileRoute("/api/public/telegram-webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!expected || params.secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const update = await request.json();
          // Workerda fire-and-forget ishlamaydi — response qaytgach context to'xtaydi.
          await handleUpdate(update);
        } catch (e) {
          console.error("tg error", e);
        }
        return new Response("ok");
      },
      GET: async () => new Response("Telegram webhook endpoint"),
    },
  },
});

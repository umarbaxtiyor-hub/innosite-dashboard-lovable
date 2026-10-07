import { createFileRoute } from "@tanstack/react-router";
import { requireAuthFromRequest } from "@/lib/require-auth.server";

// UzbekVoice.ai STT — o'zbekcha ovozni matnga aylantirish
export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAuthFromRequest(request);
          const apiKey = process.env.AISHA_API_KEY;
          if (!apiKey) return json({ error: "Ovoz xizmati kaliti sozlanmagan" }, 500);

          const inForm = await request.formData();
          const audio = inForm.get("audio");
          if (!(audio instanceof Blob)) {
            return json({ error: "audio fayl yo'q" }, 400);
          }

          const language = (inForm.get("language") as string) || "uz";

          const mime = audio.type || "audio/webm";
          const ext = mime.includes("ogg") ? "ogg"
            : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
            : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
            : mime.includes("wav") ? "wav"
            : "webm";

          const form = new FormData();
          form.append("file", audio, `voice.${ext}`);
          form.append("return_offsets", "false");
          form.append("run_diarization", "false");
          form.append("blocking", "true");
          form.append("language", language);

          const res = await fetch("https://uzbekvoice.ai/api/v1/stt", {
            method: "POST",
            headers: { Authorization: apiKey },
            body: form,
          });

          if (!res.ok) {
            const errText = await res.text();
            return json({ error: voiceErr(res.status, errText) }, res.status === 402 ? 402 : 502);
          }

          const j = (await res.json()) as { result?: { text?: string } };
          return json({ transcript: (j.result?.text ?? "").trim() }, 200);
        } catch (e: unknown) {
          if (e instanceof Response) return e;
          return json({ error: e instanceof Error ? e.message : "STT xato" }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function voiceErr(status: number, body: string) {
  if (status === 401 || status === 403) return "Ovoz xizmati kaliti noto'g'ri yoki muddati o'tgan.";
  if (status === 402) return "Ovoz xizmati balansi yetarli emas.";
  if (status === 503) return "Ovoz xizmati vaqtincha mavjud emas.";
  return `Ovoz xizmati xatosi [${status}]: ${body.slice(0, 200)}`;
}

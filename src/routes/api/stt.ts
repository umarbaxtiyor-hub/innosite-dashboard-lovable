import { createFileRoute } from "@tanstack/react-router";

// Aisha STT — o'zbek tilida ovozli matn (Speech-to-Text)
// Docs: https://aisha.group/en/api-documentation/speech-to-text
export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const apiKey = process.env.AISHA_API_KEY;
          if (!apiKey) return json({ error: "AISHA_API_KEY sozlanmagan" }, 500);

          const inForm = await request.formData();
          const audio = inForm.get("audio");
          if (!(audio instanceof Blob)) {
            return json({ error: "audio fayl yo'q" }, 400);
          }

          const language = (inForm.get("language") as string) || "uz";

          // Aisha kutadigan formatga o'tkazamiz
          const form = new FormData();
          // file extension'ni MIME asosida tahmin qilamiz
          const mime = audio.type || "audio/webm";
          const ext = mime.includes("ogg") ? "ogg"
            : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
            : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
            : mime.includes("wav") ? "wav"
            : "webm";
          form.append("audio", audio, `voice.${ext}`);
          form.append("language", language);
          form.append("has_diarization", "false");

          const res = await fetch("https://back.aisha.group/api/v1/stt/post/", {
            method: "POST",
            headers: { "X-Api-Key": apiKey, "Accept-Language": "uz" },
            body: form,
          });

          if (!res.ok) {
            const errText = await res.text();
            return json({ error: aishaErr(res.status, errText) }, res.status === 402 ? 402 : 502);
          }

          const j = (await res.json()) as { transcript?: string };
          return json({ transcript: (j.transcript ?? "").trim() }, 200);
        } catch (e: unknown) {
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

function aishaErr(status: number, body: string) {
  if (status === 401 || status === 403) return "Aisha API kalit noto'g'ri yoki muddati o'tgan.";
  if (status === 402) return "Aisha balansi yetarli emas.";
  if (status === 400) return `So'rov xato: ${body.slice(0, 200)}`;
  if (status === 503) return "Aisha STT xizmati vaqtincha mavjud emas.";
  return `Aisha xato [${status}]: ${body.slice(0, 200)}`;
}

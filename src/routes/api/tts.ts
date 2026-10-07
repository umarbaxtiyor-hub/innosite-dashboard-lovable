import { createFileRoute } from "@tanstack/react-router";
import { requireAuthFromRequest } from "@/lib/require-auth.server";

// UzbekVoice.ai TTS — o'zbek tilida tabiiy ovoz
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAuthFromRequest(request);
          const { text, voice, model } = (await request.json()) as {
            text?: string;
            voice?: "male" | "female";
            model?: string;
          };

          if (!text || typeof text !== "string") {
            return json({ error: "text majburiy" }, 400);
          }

          const apiKey = process.env.AISHA_API_KEY;
          if (!apiKey) {
            return json({ error: "Ovoz xizmati kaliti sozlanmagan" }, 500);
          }

          const clean = text
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/[*_#>`|]/g, " ")
            .replace(/\[(.*?)\]\(.*?\)/g, "$1")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1000);

          void voice;

          const res = await fetch("https://uzbekvoice.ai/api/v1/tts", {
            method: "POST",
            headers: { Authorization: apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean, model: model || "sevinch" }),
          });

          if (!res.ok) {
            const errText = await res.text();
            return json({ error: voiceErrorMessage(res.status, errText) }, 502);
          }

          const j = (await res.json()) as { result?: { url?: string } };
          const audioUrl = j.result?.url;
          if (!audioUrl) {
            return json({ error: "Ovoz fayli qaytmadi" }, 502);
          }

          const audioRes = await fetch(audioUrl);
          if (!audioRes.ok) {
            return json({ error: `Audio yuklanmadi [${audioRes.status}]` }, 502);
          }

          const buf = await audioRes.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
          });
        } catch (e: unknown) {
          if (e instanceof Response) return e;
          return json({ error: e instanceof Error ? e.message : "TTS xato" }, 500);
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

function voiceErrorMessage(status: number, body: string) {
  if (status === 401 || status === 403) return "Ovoz xizmati kaliti noto'g'ri yoki muddati o'tgan.";
  if (status === 402) return "Ovoz xizmati balansi yetarli emas.";
  if (status === 400) return `So'rov xato: ${body.slice(0, 200)}`;
  if (status === 503) return "Ovoz xizmati vaqtincha mavjud emas.";
  return `Ovoz xizmati xatosi [${status}]: ${body.slice(0, 200)}`;
}

import { createFileRoute } from "@tanstack/react-router";

// Aisha TTS — o'zbek tilida tabiiy ovoz (Gulnoza modeli)
// Docs: https://aisha.group/en/api-documentation/text-to-speech
// Voice param "male"/"female" -> mood mapping (Aisha hozircha faqat Gulnoza ayol ovozi)
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text, voice, mood, speed } = (await request.json()) as {
            text?: string;
            voice?: "male" | "female";
            mood?: "Neutral" | "Cheerful" | "Happy" | "Sad";
            speed?: number;
          };

          if (!text || typeof text !== "string") {
            return json({ error: "text majburiy" }, 400);
          }

          const apiKey = process.env.AISHA_API_KEY;
          if (!apiKey) {
            return json({ error: "AISHA_API_KEY sozlanmagan" }, 500);
          }

          // Markdown belgilarini tozalash + Aisha 1000 belgilik limiti
          const clean = text
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/[*_#>`|]/g, " ")
            .replace(/\[(.*?)\]\(.*?\)/g, "$1")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1000);

          const form = new FormData();
          form.append("transcript", clean);
          form.append("language", "uz");
          form.append("model", "Gulnoza");
          form.append("mood", mood ?? "Neutral");
          const sp = typeof speed === "number" && speed >= 0.5 && speed <= 2 ? speed : 1.0;
          form.append("speed", String(sp));

          const res = await fetch("https://back.aisha.group/api/v1/tts/post/", {
            method: "POST",
            headers: { "X-Api-Key": apiKey, "Accept-Language": "uz" },
            body: form,
          });

          const ctype = res.headers.get("content-type") ?? "";
          if (!res.ok) {
            const errText = await res.text();
            return json(
              { error: aishaErrorMessage(res.status, errText) },
              res.status === 402 ? 402 : 502,
            );
          }

          // Aisha JSON qaytaradi: { audio_path: "/media/tts_audios/xxx.wav" }
          if (!ctype.includes("application/json")) {
            // Ehtimol to'g'ridan-to'g'ri audio
            const buf = await res.arrayBuffer();
            return new Response(buf, {
              status: 200,
              headers: { "Content-Type": ctype || "audio/wav", "Cache-Control": "no-store" },
            });
          }

          const j = (await res.json()) as { audio_path?: string };
          if (!j.audio_path) {
            return json({ error: "Aisha javobida audio_path yo'q" }, 502);
          }

          const audioUrl = j.audio_path.startsWith("http")
            ? j.audio_path
            : `https://back.aisha.group${j.audio_path}`;

          const audioRes = await fetch(audioUrl, {
            headers: { "X-Api-Key": apiKey },
          });
          if (!audioRes.ok) {
            return json({ error: `Audio yuklanmadi [${audioRes.status}]` }, 502);
          }

          const buf = await audioRes.arrayBuffer();
          const isWav = audioUrl.toLowerCase().endsWith(".wav");
          // voice param mavjudligi backward-compat uchun saqlanadi (Aisha bitta ayol ovoz)
          void voice;
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (e: unknown) {
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

function aishaErrorMessage(status: number, body: string) {
  if (status === 401) return "Aisha API kalit noto'g'ri yoki muddati o'tgan.";
  if (status === 402) return "Aisha balansi yetarli emas. space.aisha.group da to'ldiring.";
  if (status === 400) return `So'rov xato: ${body.slice(0, 200)}`;
  if (status === 503) return "Aisha TTS xizmati vaqtincha mavjud emas.";
  return `Aisha xato [${status}]: ${body.slice(0, 200)}`;
}

import { createServerFn } from "@tanstack/react-start";

export const sendTelegramReport = createServerFn({ method: "POST" })
  .inputValidator((d: any) => {
    if (!d || typeof d.text !== "string" || !d.text.trim()) throw new Error("Matn bo'sh");
    if (!d.chat_id) throw new Error("chat_id kerak");
    return { text: String(d.text), chat_id: String(d.chat_id) };
  })
  .handler(async ({ data }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.chat_id,
        text: data.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      throw new Error(j?.description || `Telegram xato (${res.status})`);
    }
    return { ok: true, message_id: j.result?.message_id };
  });

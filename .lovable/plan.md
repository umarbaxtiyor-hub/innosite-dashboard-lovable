# Innosite production audit (faqat o'qildi, hech narsa o'zgarmadi)

Tekshirildi: DB so'rovlari (navbat, ledger, takroriy yozuvlar, triggerlar, RLS) va bot/sync kodi.

| # | Modul | Status | Asosiy muammo | Ta'sir | Priority |
|---|---|---|---|---|---|
| 1 | DPR | RISK | `appendDprEntries` oddiy append — idempotent emas; Telegram qayta yuborsa (webhook retry) Daily_Log'da ikki qator | DPR hajmlari ikki marta sanaladi | P1 |
| 2 | HR/davomat | RISK | HR ham shu oddiy append; HR Sheet va `employee_attendance` jadvali alohida — bitta manba yo'q | Davomat/oylik hisobi mos kelmasligi | P1 |
| 3 | Salyarka | RISK | `appendFuelEntries` idempotent emas; Daftar tasdiqlashda ham, ⛽ oqimida ham chaqiriladi (2 ta yo'l) | Litr qoldig'i noto'g'ri | P1 |
| 4 | Finance | RISK | 8 guruh takroriy xarajat topildi (bir loyiha, sana, summa, izoh): 2 ta `excel_import`, 6 ta `telegram_photo/text` (2026-09-28). `project_id` null yo'q (4312 xarajat, 69 kirim) | Chiqim jami bir oz oshgan bo'lishi mumkin — ko'rib chiqish kerak, o'chirilmadi | P1 |
| 5 | Telegram bot | RISK | Webhook har doim `ok` qaytaradi, xatolar `catch {}` bilan yutiladi; `aiAllowedByChat` xotirada — restartda AI ruxsati yo'qoladi; update_id bo'yicha takrorni tekshirish yo'q | Jim yo'qolgan yozuvlar va takroriy yozuvlar manbai | P0 |
| 6 | AI Agent | OK | `askAgent` ishlaydi; AI chaqiruv kodi 4 joyda nusxalangan | Faqat texnik qarz | P2 |
| 7 | Sheets sync (kassa) | OK | Ledger bilan idempotent. Hozir 4 ta navbat yozuvi `processing` (17:08 da yaratilgan, ledger `written`) — jonli ish bo'lishi mumkin, lekin `synced` ga o'tishini kuzatish kerak | Takror yo'q; kuzatish kerak | P1 |
| 8 | Supabase/RLS | RISK | Barcha jadvallarda RLS yoqilgan, 7 kunda trigger xatosi 0. Lekin sync webhook maxfiy kaliti migration faylida ochiq yozilgan va `finans` roli `app_settings` dan o'qiy oladi | Kalit sizsa, begona sync chaqira oladi | P0 |
| 9 | Dead/duplicate | RISK | Eski Nakladnoy/Buyurtma/Shartnoma oqimlari (~1300 qator), 3 ta 0-chaqiruvli funksiya, fuel/hr/dpr target/append/pdf nusxalari | Xato kiritish xavfi | P2 |

## Eng muhim 5 action (tartib bilan)

1. **P0 — Webhook kalitini almashtirish**: yangi maxfiy kalit, `app_settings` ni faqat admin o'qisin, eski kalitni bekor qilish.
2. **P0 — Telegram takror himoyasi**: `update_id` ni saqlab, qayta kelgan update'ni e'tiborsiz qoldirish; xatolarni jim yutmasdan log qilish.
3. **P1 — Fuel/HR/DPR yozuvlariga ledger idempotentlik** (kassa sync'dagi kabi token bilan).
4. **P1 — 8 ta takroriy xarajatni sizga ro'yxat qilib berish** — o'chirish faqat sizning tasdig'ingiz bilan.
5. **P1 — `aiAllowedByChat` ni DB ga ko'chirish** va qotgan `processing` navbat uchun ogohlantirish.

Qaysilarini tuzatishni tanlang — faqat o'shalarni qilaman.

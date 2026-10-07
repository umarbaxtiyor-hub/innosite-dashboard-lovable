# Excel yuklashni tezlashtirish (3000+ qator)

## Nega hozir sekin — aniqlangan sabab

3000 qatorli fayl sekinligi **AI'ning o'zidan emas, yuborish usulidan**:

1. `src/lib/jurnal-excel-runner.ts` har bir AI so'roviga atigi **15 qatordan** yuboradi (`CHUNK_SIZE = 15`). 3000 qator = **~200 ta alohida AI so'rovi**.
2. Bir vaqtda faqat **4 ta so'rov** parallel yuradi (`CONCURRENCY = 4`) — demak, ~50 ta ketma-ket "navbat", har biri bir necha soniya. Jami: bir necha daqiqa.
3. ChatGPT/AI chatlarga faylni tashlaganingizda ular butun faylni bir yo'la o'qiydi va bazaga hech narsa yozmaydi. Bizda esa har qator bazaga saqlanadi, rejadagi material/ish bilan solishtiriladi va takrorlar tekshiriladi — bu qo'shimcha, lekin kerakli ish.

Ya'ni bu "buzilish" emas, lekin hozirgi sozlash ortiqcha ehtiyotkor — sezilarli tezlashtirish mumkin.

## O'zgarishlar

### 1. Chunk hajmini oshirish (asosiy tezlik omili)
`src/lib/jurnal-excel-runner.ts`:
- `CHUNK_SIZE`: 15 → **60** (3000 qator = ~200 emas, **50 ta so'rov**)
- `CONCURRENCY`: 4 → **6**

Kutiladigan natija: 3000 qator uchun AI tahlil vaqti **~3-4 baravar qisqaradi** (bir necha daqiqadan ~1 daqiqagacha), aniqlik saqlanadi, chunk 60 qator model uchun hali ham yengil.

### 2. Xavfsizlik cheklovlari (sifat yomonlashmasligi uchun)
- Bitta chunk javobi kesilib qolsa (truncated JSON), `jurnal-ai.functions.ts` dagi mavjud "salvage" logikasi to'liq obyektlarni qutqaradi — chunk 60 ga oshganda bu mexanizm avtomatik himoya qiladi.
- 429 (rate limit) kelsa, chunk qayta uriniladi (1 marta retry, 2 soniya kutib) — hozir bunday qator shunchaki "o'tkazib yuboriladi".

### 3. Foydalanuvchiga ko'rinadigan yaxshilanish
- Toast progress "AI tahlil qilmoqda… X / 3000" ko'rinishida qoladi — endi tezroq sanaydi.

## Nima o'zgartirilmaydi
- AI modeli, prompt, reja-matching logikasi, takror (dedup) tekshiruvi, bazaga yozish tartibi — barchasi o'zgarishsiz.
- Zayavka (smeta) Excel yuklash (`ExcelUploadCard.tsx`) — u yerda allaqachon 80 qatorlik chunk ishlatilgan, tezroq.

## Texnik tafsilotlar
- Fayl: `src/lib/jurnal-excel-runner.ts` — faqat `CHUNK_SIZE`, `CONCURRENCY` konstantalari va chunk-level retry qo'shiladi.
- Smeta zayavka uploaderda `chunkSize = 80, CONCURRENCY = 4` ishlatilayotgani chunkni 60 ga oshirish xavfsiz ekanini tasdiqlaydi.

# Project BOQ + Project Operations + Daily Report

Mavjud Finance (Jurnal, Kassa, Kirim/Chiqim) va Operations funksiyalari o'zgarmaydi. Ustiga ikkita aniq ajratilgan modul qo'shiladi.

## 1. Project BOQ (loyihaning ildizi)

Mavjud Smeta (BOQ) bo'limi kengaytiriladi — yangi parallel jadval yaratilmaydi, shu sabab hozirgi ma'lumot yo'qolmaydi.

BOQ ichida uch bo'lim:
- **Material**
- **Work (Ish)**
- **Ustalar** (brigada ishlari — yangi bo'lim)

Har bir BOQ item ustuni:

| Ko'rsatkich | Manba |
|---|---|
| Planned qty | BOQ item (reja hajmi) |
| Budget | reja hajmi × birlik narx |
| Actual qty | qabul/bajarilgan hajm yig'indisi |
| Actual cost | shu item bo'yicha real xarajat |
| Remaining | Budget − Actual cost, hajm bo'yicha ham |
| Progress % | Actual qty ÷ Planned qty |

BOQ sahifasida: 3 ta karta (Material / Work / Ustalar) + reja-fakt jadval, qidiruv, tahrir. Summalar faqat admin / finans / ceo ga ko'rinadi (hozirgi qoida saqlanadi).

## 2. Project Operations (BOQdan mutlaqo alohida)

Yangi bo'lim va yangi jadval. Kategoriyalari qat'iy:
Employees / Salary, Fuel, Equipment, Equipment Rental, Transportation, Food, Accommodation, Other.

- Operations yozuvlari **hech qachon BOQ progressiga ta'sir qilmaydi**.
- BOQ xarajatlari Operationsga qo'shilmaydi. Ikki modul o'zaro aralashmaydi.
- Dashboardda alohida "Operations" bloki: kategoriya bo'yicha summalar.
- Finance (Jurnal/Kassa) esa ikkalasini ham pul harakati sifatida ko'radi — hozirgidek, o'zgarishsiz.

## 3. Daily Report (Telegram bot, prorab uchun)

Bot oqimi (prorab loyihaga biriktirilgan):
1. BOQ activity tanlash (qidiruv orqali)
2. Bugun bajarilgan quantity
3. Ustalar (brigada + odam soni)
4. Texnika (nomi + soat/kun)
5. Foto yuklash
6. Muammolar / izoh
7. Tasdiqlash

Saqlangach:
- Daily report BOQ itemga bog'lanadi va **actual qty avtomatik yangilanadi** → progress darhol o'zgaradi.
- Texnika va ustalar satrlari Operations tomoniga yoziladi (BOQ summasiga tegmaydi).
- Foto storage'ga yuklanadi.

Webda "Daily Report" sahifasi: kun bo'yicha ro'yxat, foto, muammolar, BOQ bog'lanishi; admin/finans tahrirlashi va o'chirishi mumkin.

## Struktura

```text
Project
├── Project BOQ
│   ├── Material
│   ├── Work
│   ├── Ustalar
│   └── Daily Report  → progressni yangilaydi
└── Project Operations
    ├── Employees / Salary
    ├── Fuel
    ├── Equipment / Rental
    ├── Transportation
    ├── Food / Accommodation
    └── Other
```

## Texnik qism

- Migratsiya 1: `project_zayavka.kind` ga `ustalar` qiymati; BOQ actual qty/cost hisoblovchi funksiya.
- Migratsiya 2: `project_operations` jadvali (project_id, category enum, description, qty, unit, amount, payment_method, op_date, source, created_by) + GRANT + RLS (admin/finans/ceo to'liq, pm o'z loyihasi).
- Migratsiya 3: `daily_reports` (project_id, report_date, telegram_user_id, notes/issues, photo_url) va `daily_report_lines` (boq_item_id/zayavka_id, qty_done, brigade_id, workers_count, equipment_name, hours) + GRANT + RLS. Trigger: satr o'zgarganda BOQ progress qayta hisoblanadi (`recompute_zayavka_progress` qayta ishlatiladi).
- Bot: `src/server/telegram.server.ts` ga `daily_report` flow (step-by-step session), loyiha avtomatik biriktirilgan.
- Web: `src/routes/operations.tsx`, `src/routes/daily-report.tsx`, BOQ sahifasiga "Ustalar" tabi; sidebar/mobil menyuga qo'shiladi, ruxsatlar `src/lib/permissions.ts` da.
- Dashboard/Excel: BOQ va Operations bloklari alohida ko'rsatiladi, mavjud Chiqim formulasi buzilmaydi (Operations yozuvlari ikki marta sanalmaydi).

Telegram bot'da "Loyiha" tugmasini e'tiborni tortuvchi qilish — amalga oshirish rejasi

## Muammo
Hozirgi `mainMenu()` funksiyasida loyiha tanlanmagan holatda tugma matni:
```
🏗 Loyiha tanlash /Loyihalar
```
bu diqqatni yetarlicha tortmaydi.

## Cheklovlar
- Telegram reply keyboard'da CSS animatsiya (o'chib-yonish, puls) **mumkin emas**
- Serverless worker'da fon interval/timer ishga tushirib, doimiy ravishda `editMessageReplyMarkup` chaqirish texnik jihatdan **ishlamaydi**

## Yechim: 2+3 kombinatsiyasi

### 1. Tugma — ko'zga tegishli emoji bilan (2-variant)
`mainMenu()` funksiyasida loyiha tanlanmagan bo'lsa, tugmani quyidagicha o'zgartirish:

```
🔴 Loyihani tanlang! /Loyihalar
```

Yoki yana kuchliroq:
```
🚨 Loyihani tanlang! /Loyihalar
```

Loyiha tanlanganida eski ko'rinishda qoladi:
```
🏗 {pname} /Loyihalar
```

### 2. Ogohlantirish xabari (3-variant)
Loyiha tanlanmagan foydalanuvchi har qanday bo'limga kirishga harakat qilganda (Smeta, Buxgalteriya, Davomat), menyu o'rniga **avval ogohlantirish** chiqadi:

```
⚠️ <b>Avval loyihani tanlang!</b>

Ishni boshlash uchun quyidagi tugmani bosing 👇
```

Va darhol `showProjectPicker()` chaqiriladi.

### 3. /start va /menu'da ham ogohlantirish
Agar foydalanuvchi `/start` yoki `/menu` yozsa va loyiha tanlanmagan bo'lsa, yuqoridagi ogohlantirish + loyiha tanlash ro'yxati avtomatik chiqadi.

## Foydalaniladigan fayl
- `src/server/telegram.server.ts` — `mainMenu()` funksiyasi va bo'limga kirish tekshiruvi (sectionTexts bloki)

## Hech qanday UI o'zgartirish yo'q
Bu faqat Telegram bot server logikasi — web ilova (React) interfeysiga ta'sir qilmaydi.

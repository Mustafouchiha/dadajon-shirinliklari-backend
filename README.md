# Dadajon Tort -- Backend

Telegram Mini App orqali ishlaydigan tort do'koni: katalog, savat, faqat do'kondan olib ketish (dastavka yo'q),
va QR kod orqali operator tomonidan buyurtmani mijozga topshirish.

**Stack:** Node.js + Express | PostgreSQL (Neon) | Telegraf (Telegram bot) | JWT auth

## Loyiha tuzilmasi

```
backend/
├── models/       -> User, Product (tort katalogi), Order
├── routes/       -> auth, products, orders, operator, settings
├── middleware/   -> auth, operatorAuth
├── db.js         -> Neon Postgres ulanish + jadval sxemasi
├── bot.js        -> Telegram bot (Telegraf)
└── server.js     -> kirish nuqtasi
```

## Buyurtma oqimi

1. Mijoz botda `/start` bosadi -> telefon yuboradi -> Mini App ochiladi
2. Katalogdan tort tanlaydi, savatga qo'shadi, faqat do'kondan olib ketish uchun buyurtma beradi (dastavka yo'q)
3. Buyurtma kodi va QR kod generatsiya qilinadi, operatorlarga bot orqali xabar boradi
4. Operator buyurtmani tayyorlab, "Tayyor" deb belgilaydi -- mijozga xabar boradi
5. Mijoz do'konga kelib QR kodini ko'rsatadi, operator Mini App ichidagi "QR skanerlash" tugmasi orqali (Telegram'ning o'z kamera-skaneridan foydalanib) kodni o'qiydi
6. Tizim buyurtmani "berildi" deb belgilaydi va qaysi operator, qachon berganini saqlaydi -- bu tarix "Buyurtmalar" bo'limida ko'rinadi

## Bosh operator

`MAIN_OPERATOR_PHONE` muhit o'zgaruvchisida ko'rsatilgan telefon raqamli foydalanuvchi avtomatik bosh operator huquqiga ega bo'ladi (Operator panelga kiradi, boshqa operatorlarni qo'sha/o'chira oladi). Bosh operator boshqa xodimlarni operator panel ichidan (`role='operator'`) qo'shishi mumkin.

## Lokal ishga tushirish

```bash
cd backend
npm install
cp .env.example .env   # va qiymatlarni to'ldiring
npm run dev
```

## Render'ga deploy qilish

1. [render.com](https://render.com) -> New -> Blueprint (yoki Web Service) -> GitHub repo ulang -> `backend` papkasi root sifatida ishlatiladi (`render.yaml` shu papkada)
2. `render.yaml`da `sync: false` deb belgilangan o'zgaruvchilarni Render Dashboard > Environment bo'limida qo'lda kiriting:
   ```
   DATABASE_URL          = <Neon connection string>
   JWT_SECRET             = <tasodifiy 32+ belgili sir so'z>
   TELEGRAM_BOT_TOKEN     = <@BotFather tokeni>
   MAIN_OPERATOR_PHONE    = <bosh operatorning 9 xonali raqami>
   CLIENT_URL             = <Vercel frontend URL>
   MINI_APP_URL           = <Vercel frontend URL>
   ADMIN_TELEGRAM         = @sizning_username
   ```
3. Start Command avtomatik aniqlanadi (`node server.js`).
4. Deploy tugagach domenni (`https://xxx.onrender.com`) frontenddagi `VITE_API_URL`ga qo'ying.

## Neon PostgreSQL

1. [neon.tech](https://neon.tech) -> New Project -> Connection string (pooled) ni nusxalang -> `DATABASE_URL`ga qo'ying
2. Server birinchi marta ishga tushganda barcha jadvallar avtomatik yaratiladi (`db.js`)

Muhim: `DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN` kabi maxfiy qiymatlarni hech qachon kodga yoki git'ga commit qilmang -- faqat Render Environment (yoki lokal `.env`, u `.gitignore`da).

# Davomat bot

Telegram davomat boti – Supabase ga saqlaydi. Guruhda va shaxsiy chatda ishlaydi.

## Admin panel (taomlar)

- **URL:** `http://localhost:3000` (lokal) yoki Render da berilgan URL
- **Kirish:** email `admin@gmail.com`, parol `husanboy2013` (`.env` da `ADMIN_EMAIL`, `ADMIN_PASSWORD` orqali o‘zgartirish mumkin)
- Taomlar qo‘shish, ro‘yxat, o‘chirish

## Ishga tushirish

```bash
npm install
npm start
```

Bot va admin panel birga ishga tushadi (port 3000). `.env` da: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_USER_IDS`, ixtiyoriy: `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Deploy

Render da: [DEPLOY_RENDER.md](DEPLOY_RENDER.md). Render da **Web Service** yoki **Background Worker** – agar faqat bot kerak bo‘lsa Background Worker; admin panel ham kerak bo‘lsa **Web Service** tanlang va Start Command: `npm start` (server.js port ochadi, Render PORT beradi).

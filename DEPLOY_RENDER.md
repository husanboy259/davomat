# Render da davomat botini deploy qilish

## 1. GitHub ga kod yuklash

1. [GitHub](https://github.com) da yangi repository yarating (masalan: `davomat-bot`).
2. Loyihangizda terminal oching va quyidagilarni bajaring:

```bash
git init
git add .
git commit -m "Davomat bot"
git branch -M main
git remote add origin https://github.com/Foydalanuvchi/davomat-bot.git
git push -u origin main
```

**Muhim:** `.env` faylini GitHub ga yuklamang (maxfiy ma'lumotlar). `.gitignore` da `.env` bo‘lishi kerak.

---

## 2. Render hisob yaratish

1. [render.com](https://render.com) ga kiring.
2. **Sign Up** → GitHub bilan ro‘yxatdan o‘ting.
3. GitHub ruxsatini bering (repositoriyalarga kirish uchun).

---

## 3. Yangi Background Worker yaratish

1. Render Dashboard da **New +** → **Background Worker** tanlang.
2. **Connect a repository** – GitHub dagi `davomat-bot` reponi tanlang (agar ko‘rinmasa, **Configure account** orqali repo qo‘shing).
3. Sozlamalar:

| Maydon | Qiymat |
|--------|--------|
| **Name** | `davomat-bot` (yoki xohlagan nom) |
| **Region** | Singapore yoki Yevropa (sizga yaqin) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

4. **Environment** bo‘limiga o‘ting va quyidagi **Environment Variables** qo‘shing:

| Key | Value (sizning qiymatlaringiz) |
|-----|-------------------------------|
| `TELEGRAM_BOT_TOKEN` | @BotFather dan olgan token |
| `SUPABASE_URL` | Supabase loyiha → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `ADMIN_USER_IDS` | Sizning Telegram user id (masalan: `7739994444`) |

5. **Create Background Worker** tugmasini bosing.

---

## 4. Deployni kuzatish

1. **Logs** bo‘limida "Davomat bot ishlayapti." xabari chiqishi kerak.
2. Agar xato bo‘lsa – **Environment** da barcha o‘zgaruvchilar to‘g‘ri kiritilganini tekshiring.
3. Botni Telegram da sinab ko‘ring: `/start` yuboring.

---

## 5. Tez-tez uchraydigan xatolar

| Xato | Yechim |
|------|--------|
| Bot javob bermayapti | `TELEGRAM_BOT_TOKEN` to‘g‘ri va yangi ekanini tekshiring. |
| "Supabase xatolik" | `SUPABASE_URL` va `SUPABASE_ANON_KEY` ni Supabase Dashboard dan nusxalang. |
| Ruhsat ishlamayapti | `ADMIN_USER_IDS` ga o‘z Telegram user id ingizni yozing (@userinfobot orqali oling). |

---

## 6. Yangilash

Kod o‘zgargach, GitHub ga push qiling:

```bash
git add .
git commit -m "Yangilanish"
git push
```

Render avtomatik yangi deploy boshlaydi (auto-deploy yoqilgan bo‘lsa).

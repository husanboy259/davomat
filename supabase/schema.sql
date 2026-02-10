-- Davomat boti: bitta egasi, qolganlar faqat ruhsat orqali
-- Supabase Dashboard > SQL Editor da bajarish

-- 1. Foydalanuvchilar (Telegram user_id, ruhsat, egasi yoki yo'q)
CREATE TABLE IF NOT EXISTS users (
  telegram_user_id BIGINT PRIMARY KEY,
  username TEXT,
  is_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ruhsat so'rovlari – "Botdan foydalanmoqchimisiz?" Ha bosganda shu jadvalga yoziladi, faqat egasi tasdiqlaydi
CREATE TABLE IF NOT EXISTS ruhsat_sorovlari (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Guruhlar / sinflar (7-b, 8-a) – faqat egasi qo'shadi
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by_user_id BIGINT NOT NULL REFERENCES users(telegram_user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Qaysi user qaysi guruhga davomat yozishi mumkin – faqat egasi userlarni guruhga qo'shadi
CREATE TABLE IF NOT EXISTS user_groups (
  telegram_user_id BIGINT NOT NULL REFERENCES users(telegram_user_id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (telegram_user_id, group_id)
);

-- 5. Davomat (sana, sinf, jami/keldi, kim yozgan)
CREATE TABLE IF NOT EXISTS davomat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sana DATE NOT NULL DEFAULT CURRENT_DATE,
  sinf TEXT NOT NULL,
  jami_oquvchi INTEGER NOT NULL,
  kelgan_oquvchi INTEGER NOT NULL,
  created_by_user_id BIGINT REFERENCES users(telegram_user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Kelmagan o'quvchilar – har bir davomat yozuviga bog'liq, shu yerda kelmagan ismlar qo'shiladi
CREATE TABLE IF NOT EXISTS kelmagan_oquvchilar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  davomat_id UUID NOT NULL REFERENCES davomat(id) ON DELETE CASCADE,
  oquvchi_ismi TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Ruxsat berilgan Telegram guruhlari – faqat shu guruhlarda bot ishlaydi (/allowed orqali admin qo'shadi)
CREATE TABLE IF NOT EXISTS allowed_chats (
  telegram_chat_id BIGINT PRIMARY KEY,
  added_by_user_id BIGINT REFERENCES users(telegram_user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_users_allowed ON users(is_allowed);
CREATE INDEX IF NOT EXISTS idx_users_owner ON users(is_owner);
CREATE INDEX IF NOT EXISTS idx_ruhsat_sorovlari_status ON ruhsat_sorovlari(status);
CREATE INDEX IF NOT EXISTS idx_ruhsat_sorovlari_user ON ruhsat_sorovlari(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_user_groups_user ON user_groups(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_davomat_sana ON davomat(sana);
CREATE INDEX IF NOT EXISTS idx_davomat_sinf ON davomat(sinf);
CREATE INDEX IF NOT EXISTS idx_davomat_created_by ON davomat(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_kelmagan_davomat_id ON kelmagan_oquvchilar(davomat_id);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruhsat_sorovlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE davomat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kelmagan_oquvchilar ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot ruhsat_sorovlari" ON ruhsat_sorovlari FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot groups" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot user_groups" ON user_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot davomat" ON davomat FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot kelmagan" ON kelmagan_oquvchilar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Bot allowed_chats" ON allowed_chats FOR ALL USING (true) WITH CHECK (true);

-- Eski loyihada is_admin bo'lsa, is_owner qo'shish (ixtiyoriy):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;
-- UPDATE users SET is_owner = true WHERE telegram_user_id = (SELECT telegram_user_id FROM users WHERE is_admin = true LIMIT 1);

-- Birinchi egani qo'lda qo'shish (o'zingizning Telegram id ingizni yozing):
-- INSERT INTO users (telegram_user_id, username, is_allowed, is_owner)
-- VALUES (123456789, 'your_username', true, true)
-- ON CONFLICT (telegram_user_id) DO UPDATE SET is_allowed = true, is_owner = true;

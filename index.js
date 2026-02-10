const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Tokenni tozalash: bo'sh joy, \r\n, BOM, qo's tirnoq va yashirin belgilar
let token = (process.env.TELEGRAM_BOT_TOKEN || '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/[\s\r\n\uFEFF\u200B-\u200D\u2060]/g, '');
if (!token || token.length < 10) {
  console.error('Xato: TELEGRAM_BOT_TOKEN .env da yo\'q yoki juda qisqa.');
  console.error('1) .env fayli index.js bilan bir xil papkada (davomat papkada) bo\'lishi kerak.');
  console.error('2) Bir qatorda: TELEGRAM_BOT_TOKEN=123456789:AAH... (qo\'s tirnoq va ortiqcha bo\'sh joy bo\'lmasin).');
  console.error('3) Token @BotFather dan /newbot yoki /mybots orqali oling.');
  process.exit(1);
}
// Telegram token formati: 123456789:AAH... (raqam:harflar)
if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
  console.error('Xato: Token formati noto\'g\'ri. Bot token raqam, ikki nuqta va harflardan iborat bo\'lishi kerak (masalan: 123456789:AAH...).');
  console.error('@BotFather da /mybots -> botingiz -> API Token dan to\'g\'ri token nusxalang.');
  process.exit(1);
}
const bot = new Telegraf(token);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Ega – faqat bitta ( .env da ADMIN_USER_IDS da birinchi id )
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));
const OWNER_ID = ADMIN_IDS[0] || null;

// /allowed_group dan keyin id kiritishni kutish
const pendingAllowedGroupId = new Map();

// Guruhda faqat ruxsat berilgan chatlarda ishlash – boshqa guruhda ishlamasin
bot.use(async (ctx, next) => {
  const chatType = ctx.chat?.type;
  if (chatType !== 'group' && chatType !== 'supergroup') return next();
  const text = (ctx.message?.text || '').trim();
  if (text.startsWith('/allowed_group')) return next();
  const allowed = await supabase.from('allowed_chats').select('telegram_chat_id').eq('telegram_chat_id', ctx.chat.id).maybeSingle();
  if (allowed.data) return next();
  try {
    await ctx.reply('Bu guruhga ruxsat yo\'q. Admin /allowed_group keyin guruh id sini kiritadi.');
  } catch (_) {}
  return;
});

function parseDavomat(text) {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(\d+[-]?[a-z]?)\s+(\d+)\/(\d+)\s+(.+?)\s+kelmadi$/i
  );
  if (!match) return null;
  const [, sinf, jamiStr, kelganStr, ismlarStr] = match;
  const jami = parseInt(jamiStr, 10);
  const kelgan = parseInt(kelganStr, 10);
  if (isNaN(jami) || isNaN(kelgan) || jami < kelgan) return null;
  const kelmaganlar = ismlarStr
    .split(/\s*,\s*|\s+va\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (kelmaganlar.length === 0) return null;
  return { sinf: sinf.trim(), jami, kelgan, kelmaganlar };
}

async function ensureUser(telegramUserId, username) {
  const { data } = await supabase
    .from('users')
    .select('telegram_user_id, is_allowed, is_owner')
    .eq('telegram_user_id', telegramUserId)
    .single();
  if (data) return data;
  const isEga = OWNER_ID !== null && telegramUserId === OWNER_ID;
  await supabase.from('users').upsert(
    {
      telegram_user_id: telegramUserId,
      username: username || null,
      is_allowed: isEga,
      is_owner: isEga,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'telegram_user_id' }
  );
  return {
    telegram_user_id: telegramUserId,
    is_allowed: isEga,
    is_owner: isEga,
  };
}

async function isOwner(telegramUserId) {
  const { data } = await supabase
    .from('users')
    .select('is_owner')
    .eq('telegram_user_id', telegramUserId)
    .single();
  return data?.is_owner === true || telegramUserId === OWNER_ID;
}

async function getOwnerId() {
  const { data } = await supabase.from('users').select('telegram_user_id').eq('is_owner', true).limit(1).single();
  return data?.telegram_user_id || OWNER_ID;
}

// Guruh (Telegram chat) ruxsat berilganmi – faqat shu guruhlarda bot ishlaydi
async function isChatAllowed(telegramChatId) {
  const { data } = await supabase
    .from('allowed_chats')
    .select('telegram_chat_id')
    .eq('telegram_chat_id', telegramChatId)
    .maybeSingle();
  return !!data;
}

// "7b" va "7-b" ni bir xil deb hisoblash – ikkala variantda qidirish
function groupNameVariants(name) {
  const m = name.match(/^(\d+)([-]?)([a-z]?)$/i);
  if (!m) return [name];
  const [, num, hyphen, letter] = m;
  if (!letter) return [name];
  const withHyphen = `${num}-${letter}`;
  const withoutHyphen = `${num}${letter}`;
  if (name === withHyphen) return [name, withoutHyphen];
  return [name, withHyphen];
}

async function canUserAccessGroup(telegramUserId, groupName) {
  if (await isOwner(telegramUserId)) return true;
  const names = groupNameVariants(groupName);
  for (const n of names) {
    const { data: group } = await supabase.from('groups').select('id').eq('name', n).maybeSingle();
    if (group) {
      const { data: link } = await supabase
        .from('user_groups')
        .select('telegram_user_id')
        .eq('telegram_user_id', telegramUserId)
        .eq('group_id', group.id)
        .maybeSingle();
      if (link) return true;
    }
  }
  return false;
}

// Davomat yozish (private yoki guruhda) – bitta joyda
async function handleDavomat(ctx, text) {
  const from = ctx.from;
  const user = await ensureUser(from.id, from.username);
  if (!user.is_allowed) {
    const { data: pending } = await supabase.from('ruhsat_sorovlari').select('id').eq('telegram_user_id', from.id).eq('status', 'pending').maybeSingle();
    if (pending) {
      const name = from.username ? `@${from.username}` : (from.first_name || 'Foydalanuvchi');
      const egaXabar = `Ega: tasdiqlash uchun /allow ${from.id}`;
      await ctx.reply(`Siz ruhsat so'ragansiz. Egasi tasdiqlashini kuting.\n\n${egaXabar}`);
      try {
        const ownerId = await getOwnerId();
        if (ownerId) {
          await ctx.telegram.sendMessage(ownerId, `${name} (ID: ${from.id}) davomat yozmoqchi, hali ruhsat yo'q.\nTasdiqlash: /allow ${from.id}`);
        }
      } catch (_) {}
      return;
    }
    return ctx.reply('Menga qo\'shilish uchun /start bosing va "Ha" tugmasini bosing.', { reply_markup: { inline_keyboard: [ [ { text: 'Ha', callback_data: 'ruhsat_ha' } ], [ { text: 'Yo\'q', callback_data: 'ruhsat_yoq' } ] ] } });
  }
  const parsed = parseDavomat(text);
  if (!parsed) {
    return ctx.reply('Davomat format: <sinf> <jami>/<kelgan> <ism(lar)> kelmadi\nMasalan: 7-b 20/19 bobur kelmadi');
  }
  const { sinf, jami, kelgan, kelmaganlar } = parsed;
  const canAccess = await canUserAccessGroup(from.id, sinf);
  if (!canAccess) {
    return ctx.reply(
      `Sizda "${sinf}" guruhiga davomat yozish ruxsati yo'q.\n\n` +
      `Admin: avval /guruh_qosh ${sinf} (agar bo'lmasa), keyin /guruhga_qosh ${from.id} ${sinf} ishlating.`
    );
  }
  try {
    const { data: davomatRow, error: davomatError } = await supabase
      .from('davomat')
      .insert({ sana: new Date().toISOString().slice(0, 10), sinf, jami_oquvchi: jami, kelgan_oquvchi: kelgan, created_by_user_id: from.id })
      .select('id')
      .single();
    if (davomatError) return ctx.reply('Davomat saqlanmadi: ' + davomatError.message);
    const inserts = kelmaganlar.map((ism) => ({ davomat_id: davomatRow.id, oquvchi_ismi: ism }));
    const { error: kelmaganError } = await supabase.from('kelmagan_oquvchilar').insert(inserts);
    if (kelmaganError) return ctx.reply('Kelmaganlar saqlanmadi: ' + kelmaganError.message);
    const sana = new Date().toLocaleDateString('uz-UZ');
    await ctx.reply(`✅ Saqlandi.\n${sinf} | ${sana} | ${kelgan}/${jami}\nKelmagan: ${kelmaganlar.join(', ')}`);
  } catch (err) {
    console.error(err);
    await ctx.reply('Xatolik: ' + (err?.message || err));
  }
}

// —— /start: "Menga qo'shilsinmi?" Ha / Yo'q – har doim ko'rsatiladi (ruhsatsiz user uchun)
const START_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [ { text: 'Ha', callback_data: 'ruhsat_ha' } ],
      [ { text: 'Yo\'q', callback_data: 'ruhsat_yoq' } ],
    ],
  },
};

bot.command('start', async (ctx) => {
  const from = ctx.from;
  let showQuestion = true;
  let customText = null;

  try {
    const user = await ensureUser(from.id, from.username);
    if (user.is_allowed) {
      showQuestion = false;
      customText = 'Davomat botiga xush kelibsiz. Davomat yozish: <sinf> <jami>/<kelgan> <ism(lar)> kelmadi\nMasalan: 7-b 20/19 bobur kelmadi';
    }
  } catch (_) {
    showQuestion = true;
  }

  if (showQuestion) {
    try {
      const { data: pending } = await supabase
        .from('ruhsat_sorovlari')
        .select('id')
        .eq('telegram_user_id', from.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (pending) {
        customText = 'Siz allaqachon ruhsat so\'ragansiz. Egasi tasdiqlashini kuting.';
        showQuestion = false;
      }
    } catch (_) {}
  }

  try {
    if (customText && !showQuestion) {
      await ctx.reply(customText);
      return;
    }
    const matn = from.username
      ? `Menga qo'shilsinmi, @${from.username}?`
      : "Menga qo'shilsinmi?";
    await ctx.reply(matn, START_KEYBOARD);
  } catch (err) {
    console.error('/start javob yuborish:', err?.message || err);
    try {
      await ctx.reply("Menga qo'shilsinmi?", START_KEYBOARD);
    } catch (e2) {
      await ctx.reply("Menga qo'shilsinmi? Ha yoki Yo'q yozing.");
    }
  }
});

// —— Egasi: ruhsat berish (user_id)
bot.command('ruhsat', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat egasi ruhsat bera oladi.');
  }
  const arg = ctx.message.text.replace(/^\/ruhsat\s*/i, '').trim();
  if (!arg) {
    return ctx.reply('Ishlatish: /ruhsat <user_id> yoki /ruhsat @username');
  }
  let targetId = null;
  if (/^\d+$/.test(arg)) {
    targetId = parseInt(arg, 10);
  } else {
    const username = arg.replace(/^@/, '');
    const member = await ctx.telegram.getChatMember(ctx.chat.id, username).catch(() => null);
    if (member?.user?.id) targetId = member.user.id;
  }
  if (!targetId) {
    return ctx.reply('Foydalanuvchi topilmadi. user_id yoki @username yuboring.');
  }
  await supabase.from('users').upsert(
    {
      telegram_user_id: targetId,
      is_allowed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'telegram_user_id' }
  );
  await ctx.reply(`Ruhsat berildi: ${targetId}`);
});

// Xabar yuborishda xatolik (bloklangan, chat topilmadi) – bot ishdan to‘xtamasin
async function safeReply(ctx, text) {
  try {
    await ctx.reply(text);
  } catch (e) {
    const d = e?.response?.description || e?.message || '';
    if (d.includes('blocked') || d.includes('chat not found') || d.includes('Forbidden')) {
      console.warn('Foydalanuvchiga xabar yuborilmadi (bloklangan yoki chat yo\'q):', ctx.from?.id);
    } else {
      console.error('safeReply xatolik:', d);
    }
  }
}

// —— Ha / Yo'q tugmalari
bot.action('ruhsat_ha', async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch (_) {}
  const from = ctx.from;
  const { data: existing } = await supabase
    .from('ruhsat_sorovlari')
    .select('id')
    .eq('telegram_user_id', from.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    await safeReply(ctx, 'Siz allaqachon ruhsat so\'ragansiz. Egasi tasdiqlashini kuting.');
    return;
  }
  await supabase.from('ruhsat_sorovlari').insert({
    telegram_user_id: from.id,
    username: from.username || null,
    status: 'pending',
  });
  await safeReply(ctx, 'So\'rovingiz yuborildi. Egasi tasdiqlagach, botdan foydalana olasiz.');

  const ownerId = await getOwnerId();
  if (ownerId) {
    const name = from.username ? `@${from.username}` : from.first_name || '';
    try {
      await ctx.telegram.sendMessage(
        ownerId,
        `Ruhsat so\'rovi:\nFoydalanuvchi: ${name} (ID: ${from.id})\nTasdiqlash: /allow ${from.id}\nRad etish: /ruhsat_rad ${from.id}`
      );
    } catch (err) {
      const d = err?.response?.description || err?.message || '';
      if (d.includes('chat not found')) {
        console.warn('Ega (ADMIN_USER_IDS) botni boshmagan yoki ID noto\'g\'ri. .env da o\'z Telegram id ingizni yozing va botga /start bosing.');
      } else if (d.includes('blocked') || d.includes('Forbidden')) {
        console.warn('Ega botni bloklagan.');
      } else {
        console.error('Egaga xabar yuborishda xatolik:', d);
      }
    }
  }
});

bot.action('ruhsat_yoq', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await safeReply(ctx, 'Rahmat.');
  } catch (_) {}
});

// —— Egasi: ruhsat berish (user_id) – so'rovni tasdiqlash
bot.command('ruhsat_ber', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat egasi ruhsat bera oladi.');
  }
  const arg = ctx.message.text.replace(/^\/ruhsat_ber\s*/i, '').trim();
  if (!arg || !/^\d+$/.test(arg)) {
    return ctx.reply('Ishlatish: /ruhsat_ber <user_id>');
  }
  const targetId = parseInt(arg, 10);
  await supabase.from('users').upsert(
    { telegram_user_id: targetId, is_allowed: true, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_user_id' }
  );
  await supabase.from('ruhsat_sorovlari').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('telegram_user_id', targetId).eq('status', 'pending');
  await ctx.reply(`Ruhsat berildi: ${targetId}`);
  try {
    await ctx.telegram.sendMessage(targetId, 'Ruhsat berildi. Endi davomat yozishingiz mumkin (egasi sizni guruhga qo\'shgan bo\'lishi kerak).');
  } catch (_) {}
});

// —— Egasi: ruhsat rad etish
bot.command('ruhsat_rad', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat egasi ruhsatni rad qila oladi.');
  }
  const arg = ctx.message.text.replace(/^\/ruhsat_rad\s*/i, '').trim();
  if (!arg || !/^\d+$/.test(arg)) {
    return ctx.reply('Ishlatish: /ruhsat_rad <user_id>');
  }
  const targetId = parseInt(arg, 10);
  await supabase.from('ruhsat_sorovlari').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('telegram_user_id', targetId).eq('status', 'pending');
  await ctx.reply(`Ruhsat rad etildi: ${targetId}`);
  try {
    await ctx.telegram.sendMessage(targetId, 'Ruhsat so\'rovingiz rad etildi.');
  } catch (_) {}
});

// —— Egasi: guruh (sinf) qo'shish – faqat admin (hech kim boshqasi qo'sha olmaydi)
bot.command('guruh_qosh', async (ctx) => {
  const uid = ctx.from.id;
  await ensureUser(uid, ctx.from.username);
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat admin guruh qo\'sha oladi.');
  }
  const name = ctx.message.text.replace(/^\/guruh_qosh\s*/i, '').trim();
  if (!name) {
    return ctx.reply('Ishlatish: /guruh_qosh 7-b');
  }
  const { error } = await supabase.from('groups').insert({
    name,
    created_by_user_id: uid,
  });
  if (error) {
    if (error.code === '23505') return ctx.reply(`"${name}" allaqachon mavjud.`);
    return ctx.reply('Xatolik: ' + error.message);
  }
  await ctx.reply(`Guruh qo'shildi: ${name}`);
});

// —— Egasi: userni guruhga qo'shish – faqat admin
bot.command('guruhga_qosh', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat admin guruhga odam qo\'sha oladi.');
  }
  const parts = ctx.message.text.replace(/^\/guruhga_qosh\s*/i, '').trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('Ishlatish: /guruhga_qosh <user_id yoki @username> <guruh_nomi>\nMasalan: /guruhga_qosh @user 7-b');
  }
  const groupName = parts.pop();
  const userArg = parts.join(' ');
  let targetId = null;
  if (/^\d+$/.test(userArg)) {
    targetId = parseInt(userArg, 10);
  } else {
    const username = userArg.replace(/^@/, '');
    const member = await ctx.telegram.getChatMember(ctx.chat.id, username).catch(() => null);
    if (member?.user?.id) targetId = member.user.id;
  }
  if (!targetId) {
    return ctx.reply('Foydalanuvchi topilmadi.');
  }
  const { data: group } = await supabase.from('groups').select('id').eq('name', groupName).single();
  if (!group) {
    return ctx.reply(`"${groupName}" guruh topilmadi. Avval /guruh_qosh ${groupName} bajarilgan bo'lsin.`);
  }
  await supabase.from('users').upsert(
    { telegram_user_id: targetId, username: null, is_allowed: false, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_user_id' }
  );
  const { error } = await supabase.from('user_groups').upsert(
    { telegram_user_id: targetId, group_id: group.id },
    { onConflict: 'telegram_user_id,group_id' }
  );
  if (error) return ctx.reply('Xatolik: ' + error.message);
  await ctx.reply(`${targetId} "${groupName}" guruhiga qo'shildi.`);
});

// —— /allowed_group – faqat admin: guruhda yozsa shu guruh qo'shiladi, yoki keyin id kiritadi
bot.command('allowed_group', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat admin /allowed_group ishlata oladi.');
  }
  const chatType = ctx.chat?.type;
  const chatId = ctx.chat.id;
  // Guruhda yozilsa – shu guruh id sini avtomatik qo'shish
  if (chatType === 'group' || chatType === 'supergroup') {
    const { error } = await supabase.from('allowed_chats').upsert(
      { telegram_chat_id: chatId, added_by_user_id: uid },
      { onConflict: 'telegram_chat_id' }
    );
    if (error) return ctx.reply('Xatolik: ' + error.message);
    return ctx.reply(`Bu guruh qo'shildi (ID: ${chatId}). Endi shu guruhda bot ishlaydi.`);
  }
  const arg = ctx.message.text.replace(/^\/allowed_group\s*/i, '').trim();

  if (arg && /^-?\d+$/.test(arg)) {
    pendingAllowedGroupId.delete(uid);
    const gid = parseInt(arg, 10);
    const { error } = await supabase.from('allowed_chats').upsert(
      { telegram_chat_id: gid, added_by_user_id: uid },
      { onConflict: 'telegram_chat_id' }
    );
    if (error) return ctx.reply('Xatolik: ' + error.message);
    return ctx.reply(`Guruh qo'shildi (ID: ${gid}). Endi faqat shu guruhda va boshqa ruxsat berilgan guruhlarda bot ishlaydi.`);
  }

  pendingAllowedGroupId.set(uid, true);
  await ctx.reply('Guruh id sini yuboring (masalan: -1001234567890). Guruh id ni @userinfobot yoki @getidsbot orqali oling.');
});

// Admin guruh id kiritganda – /allowed_group dan keyin
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (!uid || !pendingAllowedGroupId.has(uid)) return next();
  const text = (ctx.message?.text || '').trim();
  if (text.startsWith('/')) return next();
  if (!/^-?\d+$/.test(text)) {
    pendingAllowedGroupId.delete(uid);
    await ctx.reply('Id raqam bo\'lishi kerak (masalan: -1001234567890). Qayta /allowed_group bosing.');
    return;
  }
  pendingAllowedGroupId.delete(uid);
  const gid = parseInt(text, 10);
  const { error } = await supabase.from('allowed_chats').upsert(
    { telegram_chat_id: gid, added_by_user_id: uid },
    { onConflict: 'telegram_chat_id' }
  );
  if (error) {
    await ctx.reply('Xatolik: ' + error.message);
    return;
  }
  await ctx.reply(`Guruh qo'shildi (ID: ${gid}). Endi faqat ruxsat berilgan guruhlarda bot ishlaydi.`);
  return;
});

// —— /allow <id> – faqat admin: odamga ruhsat berish
bot.command('allow', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat admin /allow ishlata oladi.');
  }
  const arg = ctx.message.text.replace(/^\/allow\s*/i, '').trim();
  if (!arg || !/^\d+$/.test(arg)) {
    return ctx.reply('Ishlatish: /allow <user_id>\nMasalan: /allow 7739994444');
  }
  const targetId = parseInt(arg, 10);
  await supabase.from('users').upsert(
    { telegram_user_id: targetId, is_allowed: true, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_user_id' }
  );
  await supabase.from('ruhsat_sorovlari').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('telegram_user_id', targetId).eq('status', 'pending');
  await ctx.reply(`Ruhsat berildi: ${targetId}`);
  try {
    await ctx.telegram.sendMessage(targetId, 'Ruhsat berildi. Endi davomat yozishingiz mumkin (admin sizni sinfga qo\'shgan bo\'lishi kerak).');
  } catch (_) {}
});

// —— Guruhlar ro'yxati – faqat admin
bot.command('guruhlar', async (ctx) => {
  const uid = ctx.from.id;
  if (!(await isOwner(uid))) {
    return ctx.reply('Faqat admin guruhlarni ko\'ra oladi.');
  }
  const { data: list } = await supabase.from('groups').select('name').order('name');
  if (!list?.length) return ctx.reply('Guruhlar yo\'q. /guruh_qosh 7-b orqali qo\'shing.');
  await ctx.reply('Guruhlar: ' + list.map((g) => g.name).join(', '));
});

// Davomat ro'yxatini ko'rsatish (barcha yozuvlar)
async function showDavomatList(ctx) {
  const uid = ctx.from.id;
  const user = await ensureUser(uid, ctx.from.username);
  if (!user.is_allowed) {
    return ctx.reply('Davomat ro\'yxatini ko\'rish uchun ruhsat kerak.');
  }
  const { data: rows } = await supabase
    .from('davomat')
    .select('id, sana, sinf, jami_oquvchi, kelgan_oquvchi, created_at')
    .order('created_at', { ascending: false });
  if (!rows?.length) {
    return ctx.reply('Davomat bo\'yicha yozuv yo\'q.');
  }
  const ids = rows.map((r) => r.id);
  const { data: kelmaganlar } = await supabase
    .from('kelmagan_oquvchilar')
    .select('davomat_id, oquvchi_ismi')
    .in('davomat_id', ids);
  const byDavomat = {};
  for (const k of kelmaganlar || []) {
    if (!byDavomat[k.davomat_id]) byDavomat[k.davomat_id] = [];
    byDavomat[k.davomat_id].push(k.oquvchi_ismi);
  }
  const lines = rows.map((r) => {
    const kel = (byDavomat[r.id] || []).join(', ');
    return `${r.sana} | ${r.sinf} | ${r.kelgan_oquvchi}/${r.jami_oquvchi}${kel ? ' | Kelmagan: ' + kel : ''}`;
  });
  const header = '📋 Davomat:\n\n';
  const full = header + lines.join('\n');
  const maxLen = 4000;
  if (full.length <= maxLen) {
    await ctx.reply(full);
  } else {
    let cur = header;
    for (const line of lines) {
      if (cur.length + line.length + 1 > maxLen) {
        await ctx.reply(cur.trim());
        cur = line + '\n';
      } else {
        cur += line + '\n';
      }
    }
    if (cur.trim()) await ctx.reply(cur.trim());
  }
}

// —— /show davomat – davomat jadvalidagi barcha yozuvlar
bot.command('show', async (ctx) => {
  const arg = ctx.message.text.replace(/^\/show\s*/i, '').trim().toLowerCase();
  if (arg !== 'davomat') {
    return ctx.reply('Ishlatish: /show davomat');
  }
  await showDavomatList(ctx);
});

// —— /davomat – bo'sh yozilsa barcha davomat chiqadi, matn bilan davomat qo'shiladi
bot.command('davomat', async (ctx) => {
  const text = ctx.message.text.replace(/^\/davomat\s*/i, '').trim();
  if (!text) {
    return await showDavomatList(ctx);
  }
  await handleDavomat(ctx, text);
});

// —— /add – guruhda ham davomat qo'shish (davomat bilan bir xil)
bot.command('add', async (ctx) => {
  const text = ctx.message.text.replace(/^\/add\s*/i, '').trim();
  if (!text) {
    return ctx.reply('Ishlatish: /add 7-b 20/19 bobur kelmadi');
  }
  await handleDavomat(ctx, text);
});

// —— Davomat (commandsiz matn – private chatda)
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;
  await handleDavomat(ctx, text);
});

// Update ishlovda xatolik (bloklangan, chat not found va h.k.) – bot ishdan to‘xtamasin
bot.catch((err, ctx) => {
  const d = err?.response?.description || err?.message || '';
  if (d.includes('blocked') || d.includes('chat not found') || d.includes('Forbidden') || err?.response?.error_code === 400 || err?.response?.error_code === 403) {
    console.warn('Update xatolik (e\'tiborsiz qilindi):', d);
  } else {
    console.error('Bot xatolik:', err);
  }
});

// Ishga tushirish – tarmoq xatosi bo'lsa bir necha marta qayta urinish
const maxRetries = 3;
const retryDelayMs = 5000;

function launchBot(retriesLeft = maxRetries) {
  bot.launch()
    .then(() => console.log('Davomat bot ishlayapti.'))
    .catch((err) => {
      const msg = err?.message || '';
      const isNetwork = err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED' || err?.type === 'system' || msg.includes('ETIMEDOUT') || msg.includes('fetch failed');
      if (isNetwork && retriesLeft > 0) {
        console.warn(`Telegram ga ulanish muvaffaqiyatsiz. ${retriesLeft} marta qayta uriniladi (${retryDelayMs / 1000} sek)...`);
        setTimeout(() => launchBot(retriesLeft - 1), retryDelayMs);
        return;
      }
      if (err?.response?.error_code === 404 || msg.includes('404')) {
        console.error('Telegram 404: Bot token noto\'g\'ri yoki o\'chirilgan.');
        console.error('@BotFather da /newbot yoki /mybots orqali yangi token oling va .env da TELEGRAM_BOT_TOKEN ni yangilang.');
      } else if (isNetwork) {
        console.error('Tarmoq xatosi: Telegram API ga ulanib bo\'lmadi (ETIMEDOUT / ulanish rad etildi).');
        console.error('Tekshiring: Internet, VPN (yoqing yoki o\'chiring), Firewall/Antivirus (api.telegram.org ga ruxsat bering).');
      } else {
        console.error(err);
      }
      process.exit(1);
    });
}

launchBot();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

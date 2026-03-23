const { createClient } = require("@supabase/supabase-js");

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN      = "8606006762:AAH912kW13AEsT5y2GmMoZLi4rAVXAwXOHU";
const ADMIN_ID   = 5803735374;
const SUPABASE_URL = "https://ksrxdxxkrwzbelujibyz.supabase.co";
const SUPABASE_KEY = "sb_publishable_Xe5bsf_M2WKhu5Dzud1V9w_vQkIr4n_";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════════════════════
//  TELEGRAM API HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function sendMessage(chatId, text, options = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      ...options,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function isAdmin(userId) {
  return Number(userId) === ADMIN_ID;
}

async function isAllowedGroup(chatId) {
  const { data, error } = await supabase
    .from("allowed_groups")
    .select("group_id")
    .eq("group_id", String(chatId))
    .single();
  return !!data && !error;
}

async function checkAccess(msg) {
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  if (!isGroup) return true;
  return await isAllowedGroup(msg.chat.id);
}

function parseDate(str) {
  const parts = str.split("/");
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(Number);
  if (!a || !b) return null;
  const year  = new Date().getFullYear();
  const month = String(a).padStart(2, "0");
  const day   = String(b).padStart(2, "0");
  const iso   = `${year}-${month}-${day}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
}

const ABSENT_WORDS  = ["kelmadi", "absent", "yo'q", "yoq", "kelmagan", "kelmasdi"];
const PRESENT_WORDS = ["keldi", "present", "bor", "kelgan", "keldim"];

function detectStatus(text) {
  const lower = text.toLowerCase();
  for (const w of ABSENT_WORDS)  if (lower.includes(w)) return "absent";
  for (const w of PRESENT_WORDS) if (lower.includes(w)) return "present";
  return null;
}

function removeKeywords(text) {
  let result = text;
  for (const w of [...ABSENT_WORDS, ...PRESENT_WORDS]) {
    result = result.replace(new RegExp(`\\b${w}\\b`, "gi"), "").trim();
  }
  return result.replace(/\s+/g, " ").trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SAVE ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

async function saveAttendance(chatId, record) {
  const { error } = await supabase.from("attendance").upsert(
    {
      student_name : record.studentName,
      class_name   : record.className,
      group_id     : record.groupId,
      group_name   : record.groupName,
      date         : record.date,
      status       : record.status,
      note         : record.note || "",
      marked_by    : record.markedBy,
      marked_at    : new Date().toISOString(),
    },
    { onConflict: "student_name,class_name,group_id,date" }
  );

  if (error) {
    await sendMessage(chatId, "❌ Database error: " + error.message);
    return;
  }

  const emoji       = record.status === "absent" ? "❌" : "✅";
  const statusLabel = record.status === "absent" ? "Kelmadi (Absent)" : "Keldi (Present)";

  await sendMessage(
    chatId,
    `${emoji} *Saved!*\n\n` +
    `👤 *${record.studentName}*\n` +
    `🏫 Class : ${record.className}\n` +
    `📅 Date  : ${record.date}\n` +
    `📌 Status: ${statusLabel}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleStart(msg) {
  const chatId = msg.chat.id;
  if (!(await checkAccess(msg))) {
    return sendMessage(chatId, "❌ This group is not authorized.\nContact the admin.");
  }
  const adminExtra = isAdmin(msg.from.id)
    ? `\n🔧 *Admin:*\n/allow {group\\_id}\n/deny {group\\_id}\n/groups\n`
    : "";

  return sendMessage(
    chatId,
    `👋 *School Attendance Bot*\n\n` +
    `📌 *Format:*\n` +
    `\`/attend [sinf] [sana] [ism] [holat]\`\n\n` +
    `📝 *Misol:*\n` +
    `\`/attend 6-B 6/5 Botir kelmadi\`\n` +
    `\`/attend 6-B 6/5 Dilnoza keldi\`\n` +
    `\`/attend 6-B Botir kelmadi\`\n\n` +
    `📋 /attendance — bugungi davomat\n` +
    `📊 /report — hisobot\n` +
    adminExtra
  );
}

async function handleAttend(msg, args) {
  const chatId = msg.chat.id;
  if (!(await checkAccess(msg))) {
    return sendMessage(chatId, "❌ This group is not authorized. Contact admin.");
  }

  const raw = args.trim();
  if (!raw) {
    return sendMessage(
      chatId,
      `⚠️ *Foydalanish:*\n` +
      `\`/attend [sinf] [sana] [ism] [holat]\`\n\n` +
      `*Misollar:*\n` +
      `\`/attend 6-B 6/5 Botir kelmadi\`\n` +
      `\`/attend 6-B 6/5 Dilnoza keldi\`\n` +
      `\`/attend 6-B Botir kelmadi\``
    );
  }

  const tokens = raw.split(/\s+/);
  const classPattern = /^\d+[-–][a-zA-Z]$/i;

  if (!classPattern.test(tokens[0])) {
    return sendMessage(
      chatId,
      `❌ Birinchi so'z sinf nomi bo'lishi kerak.\nMasalan: \`6-B\`, \`7-A\`\n\nSiz yozdingiz: \`${tokens[0]}\``
    );
  }

  const className = tokens[0].toUpperCase();
  let rest = tokens.slice(1);

  let date = new Date().toISOString().split("T")[0];
  if (rest.length > 0 && /^\d{1,2}\/\d{1,2}$/.test(rest[0])) {
    const parsed = parseDate(rest[0]);
    if (!parsed) {
      return sendMessage(chatId, `❌ Noto'g'ri sana: \`${rest[0]}\`\nFormat: \`oy/kun\` masalan \`6/5\``);
    }
    date = parsed;
    rest = rest.slice(1);
  }

  if (rest.length === 0) {
    return sendMessage(chatId, `⚠️ O'quvchi ismi kiritilmadi.\nMasalan: \`/attend 6-B 6/5 Botir kelmadi\``);
  }

  const remaining   = rest.join(" ");
  const status      = detectStatus(remaining) || "present";
  const studentName = removeKeywords(remaining);

  if (!studentName) {
    return sendMessage(chatId, `⚠️ O'quvchi ismi topilmadi.\nMasalan: \`/attend 6-B 6/5 Botir kelmadi\``);
  }

  await saveAttendance(chatId, {
    studentName,
    className,
    groupId   : String(chatId),
    groupName : msg.chat.title || "Private",
    date,
    status,
    note      : "",
    markedBy  : String(msg.from.id),
  });
}

async function handleAttendance(msg, args) {
  const chatId = msg.chat.id;
  if (!(await checkAccess(msg))) return sendMessage(chatId, "❌ Unauthorized.");

  const date = args?.trim() || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("group_id", String(chatId))
    .eq("date", date)
    .order("class_name", { ascending: true })
    .order("student_name", { ascending: true });

  if (error || !data?.length) {
    return sendMessage(chatId, `📭 *${date}* uchun davomat topilmadi.`);
  }

  const byClass = {};
  for (const r of data) {
    if (!byClass[r.class_name]) byClass[r.class_name] = [];
    byClass[r.class_name].push(r);
  }

  let text = `📋 *Davomat — ${date}*\n`;
  for (const [cls, records] of Object.entries(byClass)) {
    const present = records.filter(r => r.status === "present").length;
    const absent  = records.filter(r => r.status === "absent").length;
    text += `\n🏫 *${cls}* — ✅${present}  ❌${absent}\n`;
    for (const r of records) {
      text += `  ${r.status === "absent" ? "❌" : "✅"} ${r.student_name}\n`;
    }
  }

  return sendMessage(chatId, text);
}

async function handleReport(msg, args) {
  const chatId = msg.chat.id;
  if (!(await checkAccess(msg))) return sendMessage(chatId, "❌ Unauthorized.");

  const parts     = (args || "").trim().split(/\s+/).filter(Boolean);
  const className = parts[0]?.toUpperCase() || null;
  const date      = parts[1] || new Date().toISOString().split("T")[0];

  let query = supabase
    .from("attendance")
    .select("*")
    .eq("group_id", String(chatId))
    .eq("date", date)
    .order("student_name", { ascending: true });

  if (className) query = query.eq("class_name", className);

  const { data, error } = await query;

  if (error || !data?.length) {
    return sendMessage(chatId, `📭 ${className ? `*${className}* sinfi uchun` : ""} *${date}* da ma'lumot yo'q.`);
  }

  const present = data.filter(r => r.status === "present");
  const absent  = data.filter(r => r.status === "absent");

  let text = `📊 *Hisobot${className ? ` — ${className}` : ""}*\n📅 ${date}\n\n`;
  text += `✅ Keldi (${present.length}):\n`;
  text += present.length ? present.map(r => `  • ${r.student_name}`).join("\n") : "  —";
  text += `\n\n❌ Kelmadi (${absent.length}):\n`;
  text += absent.length  ? absent.map(r => `  • ${r.student_name}`).join("\n")  : "  —";

  return sendMessage(chatId, text);
}

async function handleAllow(msg, args) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return sendMessage(chatId, "❌ Faqat admin uchun.");

  const groupId = args?.trim();
  if (!groupId) {
    return sendMessage(chatId, "⚠️ Foydalanish: `/allow {group_id}`");
  }

  const { error } = await supabase.from("allowed_groups").upsert({
    group_id : groupId,
    added_by : String(msg.from.id),
    added_at : new Date().toISOString(),
  });

  if (error) return sendMessage(chatId, "❌ Xato: " + error.message);
  return sendMessage(chatId, `✅ Guruh \`${groupId}\` ruxsat etildi!`);
}

async function handleDeny(msg, args) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return sendMessage(chatId, "❌ Faqat admin uchun.");

  const groupId = args?.trim();
  if (!groupId) return sendMessage(chatId, "⚠️ Foydalanish: `/deny {group_id}`");

  const { error } = await supabase.from("allowed_groups").delete().eq("group_id", groupId);
  if (error) return sendMessage(chatId, "❌ Xato: " + error.message);
  return sendMessage(chatId, `🗑️ Guruh \`${groupId}\` o'chirildi.`);
}

async function handleGroups(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return sendMessage(chatId, "❌ Faqat admin uchun.");

  const { data, error } = await supabase
    .from("allowed_groups")
    .select("*")
    .order("added_at", { ascending: false });

  if (error || !data?.length) return sendMessage(chatId, "📭 Ruxsat etilgan guruhlar yo'q.");

  const list = data.map((g, i) =>
    `${i + 1}. \`${g.group_id}\` — ${g.group_name || "Nomsiz"} (${g.added_at?.split("T")[0]})`
  ).join("\n");

  return sendMessage(chatId, `📋 *Ruxsat etilgan guruhlar:*\n\n${list}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Attendance Bot is running!" });
  }

  try {
    const { message } = req.body;
    if (!message || !message.text) return res.status(200).json({ ok: true });

    const text    = message.text.trim();
    const command = text.split(" ")[0].replace("@" + (process.env.BOT_USERNAME || ""), "");
    const args    = text.slice(command.length).trim();

    if (command === "/start")       await handleStart(message);
    else if (command === "/attend") await handleAttend(message, args);
    else if (command === "/attendance") await handleAttendance(message, args);
    else if (command === "/report") await handleReport(message, args);
    else if (command === "/allow")  await handleAllow(message, args);
    else if (command === "/deny")   await handleDeny(message, args);
    else if (command === "/groups") await handleGroups(message);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(200).json({ ok: true });
  }
}

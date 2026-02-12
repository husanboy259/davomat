const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'husanboy2013';

const DATA_DIR = path.join(__dirname, 'data');
const FOODS_FILE = path.join(DATA_DIR, 'foods.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const verificationCodes = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFoods() {
  ensureDataDir();
  if (!fs.existsSync(FOODS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FOODS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeFoods(foods) {
  ensureDataDir();
  fs.writeFileSync(FOODS_FILE, JSON.stringify(foods, null, 2), 'utf8');
}

function readUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail(toEmail, code) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.log('Email kod (SMTP sozlanmagan):', toEmail, '->', code);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: user,
    to: toEmail,
    subject: 'Tasdiqlash kodi',
    text: `Sizning tasdiqlash kodingiz: ${code}. 10 daqiqa amal qiladi.`,
  });
}

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'davomat-admin-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Admin login qiling' });
}

function requireUser(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Login qiling' });
}

// —— Admin login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.admin = true;
    req.session.user = undefined;
    return res.json({ ok: true, role: 'admin' });
  }
  res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
});

// —— User: ro'yxatdan o'tish (email, name, password) → kod yuboriladi
app.post('/api/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  const e = (email || '').trim().toLowerCase();
  const n = (name || '').trim();
  if (!e || !n || !password) return res.status(400).json({ error: 'Email, ism va parol kerak' });
  const users = readUsers();
  if (users.some((u) => u.email === e)) return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
  const user = {
    id: generateId(),
    email: e,
    name: n,
    passwordHash: hashPassword(password),
    verified: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  const code = generateCode();
  verificationCodes.set(e, { code, expires: Date.now() + 10 * 60 * 1000 });
  await sendVerificationEmail(e, code);
  res.json({ ok: true, needVerify: true, email: e });
});

// —— User: email kodini tekshirish
app.post('/api/verify', (req, res) => {
  const { email, code } = req.body || {};
  const e = (email || '').trim().toLowerCase();
  if (!e || !code) return res.status(400).json({ error: 'Email va kod kerak' });
  const stored = verificationCodes.get(e);
  if (!stored) return res.status(400).json({ error: 'Kod yuborilmagan yoki muddati o\'tgan' });
  if (Date.now() > stored.expires) {
    verificationCodes.delete(e);
    return res.status(400).json({ error: 'Kod muddati o\'tgan. Qayta so\'rang.' });
  }
  if (stored.code !== String(code).trim()) return res.status(400).json({ error: 'Kod noto\'g\'ri' });
  verificationCodes.delete(e);
  const users = readUsers();
  const user = users.find((u) => u.email === e);
  if (!user) return res.status(500).json({ error: 'Foydalanuvchi topilmadi' });
  user.verified = true;
  writeUsers(users);
  req.session.admin = false;
  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.json({ ok: true, user: req.session.user });
});

// —— User: login (email, password)
app.post('/api/user-login', (req, res) => {
  const { email, password } = req.body || {};
  const e = (email || '').trim().toLowerCase();
  if (!e || !password) return res.status(400).json({ error: 'Email va parol kerak' });
  const users = readUsers();
  const user = users.find((u) => u.email === e);
  if (!user) return res.status(401).json({ error: 'Email topilmadi. Ro\'yxatdan o\'ting.' });
  if (user.passwordHash !== hashPassword(password)) return res.status(401).json({ error: 'Parol noto\'g\'ri' });
  if (!user.verified) return res.status(401).json({ error: 'Email tasdiqlanmagan. Kodni kiriting.' });
  req.session.admin = false;
  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.json({ ok: true, user: req.session.user });
});

// —— Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// —— Joriy session (admin yoki user)
app.get('/api/me', (req, res) => {
  if (req.session && req.session.admin) return res.json({ admin: true, user: null });
  if (req.session && req.session.user) return res.json({ admin: false, user: req.session.user });
  res.json({ admin: false, user: null });
});

// —— Kod qayta yuborish
app.post('/api/resend-code', async (req, res) => {
  const { email } = req.body || {};
  const e = (email || '').trim().toLowerCase();
  if (!e) return res.status(400).json({ error: 'Email kerak' });
  const users = readUsers();
  if (!users.some((u) => u.email === e)) return res.status(400).json({ error: 'Email topilmadi' });
  const code = generateCode();
  verificationCodes.set(e, { code, expires: Date.now() + 10 * 60 * 1000 });
  await sendVerificationEmail(e, code);
  res.json({ ok: true });
});

// —— Admin: foods
app.get('/api/foods', requireAdmin, (req, res) => {
  const foods = readFoods();
  foods.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  res.json(foods);
});

app.post('/api/foods', requireAdmin, (req, res) => {
  const { name, description, price, image_url } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nomi kerak' });
  const foods = readFoods();
  const newFood = {
    id: generateId(),
    name: name.trim(),
    description: description ? description.trim() : null,
    price: price != null && price !== '' ? parseFloat(price) : null,
    image_url: image_url ? image_url.trim() : null,
    created_at: new Date().toISOString(),
  };
  foods.unshift(newFood);
  writeFoods(foods);
  res.json(newFood);
});

app.delete('/api/foods/:id', requireAdmin, (req, res) => {
  const foods = readFoods().filter((f) => f.id !== req.params.id);
  writeFoods(foods);
  res.json({ ok: true });
});

// —— User: taomlar ro'yxati (faqat o'qish)
app.get('/api/user/foods', requireUser, (req, res) => {
  const foods = readFoods();
  foods.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  res.json(foods);
});

app.listen(PORT, () => {
  console.log('Admin panel:', PORT);
  require('./index.js');
});

# 📚 School Attendance Bot

Telegram bot for tracking school attendance, with group-based access control via Supabase.

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Run Supabase SQL
- Go to: https://supabase.com/dashboard → your project → **SQL Editor**
- Paste and run the contents of `supabase_schema.sql`

### 3. Start the bot
```bash
npm start
```

---

## 📋 Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/start` | Everyone | Welcome message |
| `/attend` | Group members | Mark attendance for today |
| `/attendance` | Group members | View today's attendance list |
| `/report [date]` | Group members | View report (optional date: YYYY-MM-DD) |
| `/allow {group_id}` | Admin only | Allow a group to use the bot |
| `/deny {group_id}` | Admin only | Remove a group |
| `/groups` | Admin only | List all allowed groups |

---

## 🔧 How to Allow a Group

1. Add the bot to a Telegram group
2. Get the group ID (use @getidsbot or send a message and check bot logs)
3. Send to the bot in private: `/allow -1001234567890`
4. The group can now use `/attend`

---

## 🗄️ Database Tables

### `allowed_groups`
| Column | Type | Description |
|--------|------|-------------|
| id | bigserial | Primary key |
| group_id | text | Telegram group chat ID |
| group_name | text | Optional group name |
| added_by | text | Admin user ID |
| added_at | timestamptz | When it was added |

### `attendance`
| Column | Type | Description |
|--------|------|-------------|
| id | bigserial | Primary key |
| user_id | text | Telegram user ID |
| user_name | text | User's full name |
| group_id | text | Which group |
| group_name | text | Group title |
| date | date | Attendance date |
| time | timestamptz | Exact check-in time |

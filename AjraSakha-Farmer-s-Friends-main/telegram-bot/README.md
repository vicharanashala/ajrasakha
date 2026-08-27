# Telegram Bot for AjraSakha Feedback Collection

## Setup Instructions

### Step 1: Create Telegram Bot via BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Give bot a name: `AjraSakha Feedback`
4. Give bot a username: `ajrasakha_feedback_bot`
5. BotFather will give you a **BOT TOKEN** like: `6123456789:ABCdefGHIjklMNOpqrSTUvwxyz123456789`
6. Save this token!

### Step 2: Set Environment Variables

Create `.env` file:
```
TELEGRAM_BOT_TOKEN=6123456789:ABCdefGHIjklMNOpqrSTUvwxyz123456789
MONGODB_URI=mongodb+srv://your_user:your_password@cluster.mongodb.net/?appName=your_app
```

### Step 3: Install Requirements

```bash
pip install python-telegram-bot pymongo python-dotenv
```

### Step 4: Run the Bot

```bash
python3 bot.py
```

### Step 5: Test

1. Open Telegram
2. Search for your bot username (`ajrasakha_feedback_bot`)
3. Send `/start`
4. Ask a farming question!
5. Get answer and feedback prompt

---

## Bot Features

- **GDB Search**: Farmers ask questions, bot finds answers
- **Feedback Collection**: "Was this helpful? Reply 1 for Yes, 2 for No"
- **Multi-language**: Works in English, Hindi, regional languages
- **State Tracking**: Logs which state farmer is from
- **Dashboard Integration**: All feedback goes to same MongoDB

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start conversation |
| `/help` | Show help |
| `/stats` | Show your interaction stats |
| `/feedback` | Manually give feedback on last answer |

---

## How It Works

```
Farmer sends question on Telegram
         ↓
Bot searches GDB in MongoDB
         ↓
Bot sends answer + "Was this helpful? (1/2)"
         ↓
Farmer replies 1 or 2
         ↓
Bot stores feedback in MongoDB
         ↓
Feedback visible on Dashboard!
```

---

## Deployment

For production, use:
- **Render.com** (free tier)
- **Railway.app** (free tier)
- **Heroku** (free tier - limited)

Set `TELEGRAM_BOT_TOKEN` as environment variable.
# Create Your Telegram Bot - Step by Step

## Step 1: Open Telegram and Find BotFather

1. Open Telegram on your phone or web (https://web.telegram.org)
2. In the search bar, type: **@BotFather**
3. Click on **@BotFather** (verified with blue checkmark)
4. Click **START** at the bottom

## Step 2: Create New Bot

Send this message to BotFather:

```
/newbot
```

BotFather will reply:
```
Alright, a new bot. How are we going to call it?
Please choose a name for your bot.
```

Reply with a name (you can change this later):
```
AjraSakha Feedback
```

BotFather will reply:
```
Good. Now let's choose a username for your bot.
It must end in 'bot'. Like this, for example: TetrisBot.
```

Reply with a unique username:
```
ajrasakha_feedback_bot
```

## Step 3: Get Your Token

BotFather will reply with something like:
```
Done! Congratulations on your new bot.

You will find it at t.me/ajrasakha_feedback_bot

Use this token to access the HTTP API:
6123456789:ABCdefGHIjklMNOpqrSTUvwxyz123456789

Keep your token secure and store it safely.
```

**Copy the token** (the long string with numbers and letters).

## Step 4: Configure Your Bot

1. Send `/setdescription` to BotFather
2. Select your bot when prompted
3. Send this description:
```
🌾 AjraSakha - Get expert-verified answers to your farming questions. Rate answers to help improve our service! 
```

4. Send `/setabouttext` to BotFather
5. Select your bot when prompted
6. Send this about text:
```
Get instant answers for your farming questions. After each answer, rate it with 1 or 2 to help us improve. 🌾
```

7. Send `/setuserpic` to BotFather (optional)
8. Select your bot and upload a logo (if you have one)

## Step 5: Set Bot Commands

Send `/setcommands` to BotFather, then:

```
start - Start conversation with AjraSakha
help - Show how to use the bot
stats - View your interaction statistics
```

## Step 6: Save Your Token

Add your token to `.env` file:
```
TELEGRAM_BOT_TOKEN=6123456789:ABCdefGHIjklMNOpqrSTUvwxyz123456789
```

## Step 7: Run the Bot

```bash
cd telegram-bot
pip install -r requirements.txt
python3 bot.py
```

You should see:
```
🌾 Starting AjraSakha Telegram Bot...
📊 MongoDB: mongodb+srv://your_user:...
✅ Bot started! Send a message to your bot on Telegram.
```

## Step 8: Test It!

1. Open Telegram
2. Search for your bot: `@ajrasakha_feedback_bot`
3. Click **START**
4. Try asking: "How to control brown planthopper?"
5. Get answer and feedback request
6. Click ✅ Yes or ❌ No to give feedback

---

## Troubleshooting

**Bot doesn't respond?**
- Check token is correct
- Make sure bot.py is running
- Check internet connection

**Getting "ModuleNotFoundError"?**
```bash
pip install python-telegram-bot pymongo python-dotenv
```

**MongoDB connection error?**
```bash
# Check MongoDB URI in .env
echo $MONGODB_URI
```

---

## Free Hosting (24/7 Availability)

Once working, deploy for free at:
- **Render.com** (recommended)
- **Railway.app**
- **Fly.io**

Or run on your computer 24/7.

---

## Privacy Note

BotFather tokens are SECRET. Don't share them publicly or commit to git.

Add `.env` to `.gitignore`:
```
echo ".env" >> .gitignore
```
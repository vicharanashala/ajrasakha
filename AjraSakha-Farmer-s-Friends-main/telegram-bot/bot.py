#!/usr/bin/env python3
"""
AjraSakha Telegram Bot for Feedback Collection

Install requirements:
    pip install python-telegram-bot pymongo python-dotenv

Usage:
    python3 bot.py

Environment variables:
    TELEGRAM_BOT_TOKEN - Your Telegram bot token from @BotFather
    MONGODB_URI - MongoDB connection string
"""

import os
import sys
from pathlib import Path
from datetime import datetime

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv()

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    ConversationHandler,
    filters,
)

from pymongo import MongoClient
import random

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
MONGODB_URI = os.getenv(
    'MONGODB_URI',
    'mongodb+srv://your_user:your_password@cluster.mongodb.net/?appName=your_app'
)

# States
WAITING_FOR_FEEDBACK = 1

# MongoDB connection
mongo_client = MongoClient(MONGODB_URI, tlsAllowInvalidCertificates=True)
db = mongo_client['farmer_feedback']

# GDB entries cache (for demo - in production, query MongoDB directly)
SAMPLE_QUESTIONS = {
    "brown planthopper": {
        "question": "How to control brown planthopper in rice?",
        "answer": "Apply Imidacloprid or Ethofenprox @ 0.5ml/liter. Use light traps. Drain fields periodically. For severe cases, use Chlorantraniliprole. Maintain proper spacing and avoid excessive nitrogen.",
        "domain": "Pest Control"
    },
    "drip irrigation": {
        "question": "Best drip irrigation schedule for sugarcane?",
        "answer": "Apply 4-6 irrigations for sugarcane. Critical stages: tillering (25-30 DAP), grand growth (60-90 DAP), and maturity (120-150 DAP). Use tensiometer to maintain soil moisture at 30-40 kPa. Install drip system with 4-8 LPH emitters.",
        "domain": "Irrigation"
    },
    "urea": {
        "question": "Urea application timing for wheat?",
        "answer": "Apply urea in 3 doses: 1/3 basal at sowing, 1/3 at first irrigation (21 DAS), 1/3 at second irrigation (42 DAS). Broadcast and incorporate into soil. Avoid foliar spray during high temperature.",
        "domain": "Fertilizers"
    },
    "frost": {
        "question": "How to protect crops from frost?",
        "answer": "Use straw mulch to insulate soil. Irrigate before frost night. Smoke screens using crop residues. Install windbreaks. Cover young plants with agro textiles. Apply anti-transpirants like kaolin.",
        "domain": "Weather"
    },
    "powdery mildew": {
        "question": "How to control powdery mildew in grapes?",
        "answer": "Apply Wettable Sulfur 3g/liter or Carbendazim 1g/liter at flowering. Repeat after 15 days. Prune affected shoots. Improve air circulation. Avoid overhead irrigation.",
        "domain": "Crop Disease"
    },
    "pink bollworm": {
        "question": "Pink bollworm management in cotton?",
        "answer": "Use Pheromone traps (4/ha). Apply Quinalphos 25EC @ 2ml/liter at 60 and 90 DAS. Remove and destroy infested bolls. Use Bt cotton varieties. Practice crop rotation.",
        "domain": "Pest Control"
    },
}

FEEDBACK_QUESTIONS = [
    "Was this answer helpful for your farm? 🌾\n\nReply with:\n1️⃣ for YES - It helped\n2️⃣ for NO - Need improvement",
    "Did this solve your problem? 🤔\n\n1️⃣ Yes, it helped\n2️⃣ No, not really",
    "How was this answer? 👍👎\n\n1 - Helpful\n2 - Not Helpful",
]


def search_gdb(query):
    """Search GDB for matching entry - uses real MongoDB GDB entries"""
    query_lower = query.lower()

    # First try to search MongoDB GDB entries for exact match
    try:
        results = list(db.gdb_entries.find({
            "$or": [
                {"question": {"$regex": query, "$options": "i"}},
                {"keywords": {"$regex": query, "$options": "i"}},
                {"answer": {"$regex": query, "$options": "i"}}
            ]
        }).limit(1))

        if results:
            entry = results[0]
            return {
                "_id": entry["_id"],
                "question": entry.get("question", ""),
                "answer": entry.get("answer", ""),
                "domain": entry.get("domain", "General"),
                "language": entry.get("language", "English"),
                "state": entry.get("state"),
                "is_real": True
            }
    except Exception as e:
        print(f"MongoDB search error: {e}")

    # Fallback to sample questions (for demo when not matching real GDB)
    for keyword, data in SAMPLE_QUESTIONS.items():
        if keyword in query_lower:
            # Map keyword to real GDB entry ID
            domain_to_gdb = {
                "brown planthopper": "gdb_pest_control_001",
                "drip irrigation": "gdb_irrigation_001",
                "urea": "gdb_fertilizers_001",
                "frost": "gdb_weather_001",
                "powdery mildew": "gdb_crop_disease_001",
                "pink bollworm": "gdb_pest_control_002",
            }
            data["_id"] = domain_to_gdb.get(keyword, f"gdb_{data['domain'].lower().replace(' ', '_')}_001")
            data["is_real"] = True
            return data

    # Final fallback: return random entry with real ID
    if SAMPLE_QUESTIONS:
        data = random.choice(list(SAMPLE_QUESTIONS.values()))
        data["_id"] = f"gdb_{data['domain'].lower().replace(' ', '_')}_001"
        data['is_demo'] = True
        return data

    return None


def format_answer_text(data, question):
    """Format answer for Telegram message"""
    domain = data.get('domain', 'General')
    answer = data.get('answer', 'Answer not available')

    return f"""🌾 *AjraSakha Answer*

📋 *Question:* {question}
📁 *Domain:* {domain}

💡 *Answer:*
{answer}

---
_This answer comes from our expert-verified Golden Dataset._"""


def format_feedback_question():
    """Format feedback request"""
    return random.choice(FEEDBACK_QUESTIONS)


# Handlers
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    await update.message.reply_text(
        "🌾 *Welcome to AjraSakha!* 🌾\n\n"
        "I help farmers get expert-verified agricultural answers.\n\n"
        "Just type your farming question and I'll find the best answer!\n\n"
        "*Example questions:*\n"
        "• How to control brown planthopper?\n"
        "• Best drip irrigation for sugarcane?\n"
        "• How to protect crops from frost?\n\n"
        "After each answer, I'll ask if it was helpful. Your feedback helps improve our database!",
        parse_mode='Markdown'
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    await update.message.reply_text(
        "📖 *How to use AjraSakha Bot*\n\n"
        "1️⃣ Type your farming question\n"
        "2️⃣ Get expert-verified answer\n"
        "3️⃣ Rate the answer (1 = helpful, 2 = not helpful)\n\n"
        "*Commands:*\n"
        "/start - Start conversation\n"
        "/help - Show this help\n"
        "/stats - Your interaction stats\n\n"
        "_Your feedback helps all farmers get better answers!_",
        parse_mode='Markdown'
    )


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command"""
    user_id = str(update.message.from_user.id)

    total_feedback = db.feedback.count_documents({'farmer_id': user_id})
    helpful = db.feedback.count_documents({'farmer_id': user_id, 'response': '1'})
    not_helpful = db.feedback.count_documents({'farmer_id': user_id, 'response': '2'})

    score = round((helpful / total_feedback * 100), 1) if total_feedback > 0 else 0

    await update.message.reply_text(
        f"📊 *Your Stats*\n\n"
        f"Total feedback given: {total_feedback}\n"
        f"Helpful: {helpful}\n"
        f"Not helpful: {not_helpful}\n"
        f"Helpfulness score: {score}%\n\n"
        f"Thank you for helping improve our database! 🙏",
        parse_mode='Markdown'
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming farmer messages"""
    user_id = str(update.message.from_user.id)
    user_name = update.message.from_user.first_name
    question = update.message.text.strip()

    if not question:
        await update.message.reply_text("Please ask a farming question!")
        return

    # Use AI-powered question matcher to find or generate answer
    from services.question_matcher import matcher as question_matcher

    # Show typing indicator
    await update.message.chat.send_action("typing")

    answer_text, gdb_entry = question_matcher.find_or_generate(
        question,
        language="English"
    )

    match_type = gdb_entry.get('_match_type', 'existing')
    confidence = gdb_entry.get('_confidence', 1.0)

    # Store pending question for feedback
    pending_question = {
        'user_id': user_id,
        'user_name': user_name,
        'question': question,
        'answer': gdb_entry.get('answer', answer_text),
        'domain': gdb_entry.get('domain'),
        'gdb_entry_id': gdb_entry.get('_id'),
        'match_type': match_type,
        'confidence': confidence,
        'timestamp': datetime.utcnow()
    }
    context.user_data['pending_question'] = pending_question

    # Send answer with appropriate header based on match type
    show_disclaimer = gdb_entry.get('_show_disclaimer', False)
    disclaimer_msg = gdb_entry.get('_disclaimer_message', '')

    if match_type == 'off_topic':
        # Off-topic - no need for feedback
        response_text = (
            f"❌ *Not an Agriculture Question*\n\n"
            f"{answer_text}\n\n"
            f"_Please ask about farming topics!_"
        )
        await update.message.reply_text(response_text, parse_mode='Markdown')
        return

    if match_type == 'ai_generated':
        header = "🌾 *AjraSakha AI Answer* (NEW QUESTION)\n\n"
    elif match_type == 'pending_review':
        header = "🌾 *AjraSakha Answer* (Pending Expert Review)\n\n"
    else:
        header = "🌾 *AjraSakha Answer* (From Verified Database)\n\n"

    response_text = (
        f"{header}"
        f"📋 *Question:* {question}\n"
        f"📁 *Domain:* {gdb_entry.get('domain', 'General')}\n"
        f"💡 *Answer:*\n{answer_text}\n"
    )

    # Show 2-hour disclaimer for new questions per project requirement
    if show_disclaimer:
        response_text += f"\n⏰ *2-Hour Disclaimer:*\n_{disclaimer_msg}_\n"

    if match_type == 'ai_generated':
        response_text += "\n📝 _This answer was routed to our expert reviewer pipeline._"

    await update.message.reply_text(response_text, parse_mode='Markdown')

    # Ask for feedback
    feedback_text = format_feedback_question()
    keyboard = [
        [
            InlineKeyboardButton("✅ Yes (1)", callback_data="feedback_1"),
            InlineKeyboardButton("❌ No (2)", callback_data="feedback_2")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(feedback_text, reply_markup=reply_markup)


async def feedback_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle feedback button clicks"""
    query = update.callback_query
    await query.answer()

    user_id = str(query.from_user.id)
    feedback = query.data.split('_')[1]  # '1' or '2'
    is_helpful = feedback == '1'

    # Get pending question
    pending = context.user_data.get('pending_question', {})

    if not pending:
        await query.edit_message_text(
            "No pending question to give feedback on. "
            "Please ask a new question!"
        )
        return

    # Store feedback in MongoDB
    feedback_doc = {
        'gdb_entry_id': pending.get('gdb_entry_id', f"gdb_{pending.get('domain', 'unknown').lower().replace(' ', '_')}_001"),
        'farmer_id': user_id,
        'farmer_name': pending.get('user_name'),
        'message_id': str(query.message.message_id),
        'response': feedback,
        'state': 'Telegram',
        'language': pending.get('language', 'English'),
        'domain': pending.get('domain'),
        'source': 'telegram',
        'match_type': pending.get('match_type', 'existing'),
        'timestamp': datetime.utcnow(),
        'status': 'captured'
    }

    db.feedback.insert_one(feedback_doc)

    # Auto-promote AI entries: If entry got 3+ helpful feedback, mark as approved
    if pending.get('match_type') in ['ai_generated', 'pending_review'] and is_helpful:
        gdb_entry_id = pending.get('gdb_entry_id')
        if gdb_entry_id:
            helpful_count = db.feedback.count_documents({
                'gdb_entry_id': gdb_entry_id,
                'response': '1'
            })

            # Auto-approve if 3+ positive feedbacks
            if helpful_count >= 3:
                db.gdb_entries.update_one(
                    {'_id': gdb_entry_id},
                    {'$set': {
                        'status': 'approved',
                        'auto_approved': True,
                        'auto_approved_at': datetime.utcnow()
                    }}
                )
                print(f"✅ Entry auto-approved: {gdb_entry_id} (3+ helpful feedbacks)")

    # Confirm to farmer
    if is_helpful:
        await query.edit_message_text(
            "✅ *Thank you for your feedback!*\n\n"
            "Glad this was helpful for your farm! 🙏\n\n"
            "Ask another question or /help for more options.",
            parse_mode='Markdown'
        )
    else:
        await query.edit_message_text(
            "⚠️ *Thank you for your feedback!*\n\n"
            "We apologize this wasn't helpful. We'll work to improve this answer.\n\n"
            "Ask another question or /help for more options.",
            parse_mode='Markdown'
        )

    # Clear pending
    context.user_data['pending_question'] = None


async def handle_feedback_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle feedback sent as text (1 or 2)"""
    user_id = str(update.message.from_user.id)
    feedback = update.message.text.strip()

    if feedback not in ['1', '2']:
        return  # Not feedback, let it be handled as a new question

    is_helpful = feedback == '1'
    pending = context.user_data.get('pending_question', {})

    if not pending:
        await update.message.reply_text(
            "No pending question to give feedback on. Please ask a question first!"
        )
        return

    # Store feedback
    feedback_doc = {
        'gdb_entry_id': pending.get('gdb_entry_id', f"gdb_{pending.get('domain', 'unknown').lower().replace(' ', '_')}_001"),
        'farmer_id': user_id,
        'farmer_name': pending.get('user_name'),
        'message_id': str(update.message.message_id),
        'response': feedback,
        'state': 'Telegram',
        'language': pending.get('language', 'English'),
        'domain': pending.get('domain'),
        'source': 'telegram',
        'timestamp': datetime.utcnow(),
        'status': 'captured'
    }

    db.feedback.insert_one(feedback_doc)

    # Confirm
    if is_helpful:
        await update.message.reply_text(
            "✅ *Thank you!*\n\nGlad this was helpful! 🙏\n\n"
            "Ask another question anytime!",
            parse_mode='Markdown'
        )
    else:
        await update.message.reply_text(
            "⚠️ *Thank you!*\n\nWe'll improve this answer. 🙏\n\n"
            "Ask another question anytime!",
            parse_mode='Markdown'
        )

    context.user_data['pending_question'] = None


def main():
    """Run the bot"""
    if not TELEGRAM_BOT_TOKEN:
        print("❌ Error: TELEGRAM_BOT_TOKEN not set!")
        print("Get your token from @BotFather and set TELEGRAM_BOT_TOKEN in .env")
        return

    print("🌾 Starting AjraSakha Telegram Bot...")
    print(f"📊 MongoDB: {MONGODB_URI[:50]}...")

    # Build application
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # Add handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("stats", stats_command))

    # Callback handler for feedback buttons
    app.add_handler(CallbackQueryHandler(feedback_callback, pattern="feedback_"))

    # Message handler (priority lower than feedback text)
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        handle_message
    ))

    # Start polling
    print("✅ Bot started! Send a message to your bot on Telegram.")
    print("Press Ctrl+C to stop.")

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""
🌾 AJRAASAKHA - Farmer Chat Experience 🌾
==========================================

YOU are the farmer. Ask questions just like you would on WhatsApp.
Get answers from the GDB, provide feedback, and see the flow.

Type your question when prompted. Type 'quit' to exit.
"""

import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from shared.mongodb import get_db
import random

print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              🌾  WELCOME TO AJRAASAKHA - FARMER CHAT  🌾                     ║
║                                                                              ║
║     Ask agricultural questions in any language                                ║
║     Get expert-verified answers from the Golden Dataset                      ║
║     Help us improve by providing feedback                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
""")

db = get_db()

# Sample questions by domain for reference
SAMPLE_QUESTIONS = {
    "Crop Disease": [
        "How to control powdery mildew in grapes?",
        "What is the best treatment for rice blast?",
        "My wheat crop has yellow spots, what to do?",
        "Cotton leaf curl virus treatment",
        "Tomato blight prevention methods"
    ],
    "Irrigation": [
        "Drip irrigation scheduling for sugarcane",
        "Best time to irrigate paddy fields",
        "Water saving techniques for drought",
        "Sprinkler system maintenance tips"
    ],
    "Pest Control": [
        "How to control brown planthopper in rice?",
        "Pink bollworm management in cotton",
        "Natural pest control for vegetables"
    ],
    "Fertilizers": [
        "Urea application timing for wheat",
        "NPK ratio for sugarcane",
        "Organic fertilizer alternatives"
    ],
    "Weather": [
        "Ideal sowing time for kharif crops",
        "How to protect crops from frost?"
    ],
    "Soil Health": [
        "Soil testing procedures",
        "pH adjustment for acidic soil"
    ],
    "Harvesting": [
        "Optimal harvest time for paddy",
        "Post-harvest loss reduction techniques"
    ],
    "Seeds": [
        "Certified seed identification",
        "Seed treatment for better germination"
    ]
}

def search_gdb(query):
    """Search GDB for relevant entries"""

    # Try exact match first
    results = list(db.gdb_entries.find({
        "$or": [
            {"question": {"$regex": query, "$options": "i"}},
            {"keywords": {"$regex": query, "$options": "i"}},
            {"answer": {"$regex": query, "$options": "i"}}
        ]
    }).limit(3))

    if not results:
        # Try domain-specific search
        for domain, questions in SAMPLE_QUESTIONS.items():
            for q in questions:
                if any(word in query.lower() for word in q.lower().split()[:3]):
                    found = list(db.gdb_entries.find({"domain": domain}).limit(2))
                    if found:
                        results.extend(found)

    if not results:
        # Return random entry as fallback for demo
        results = list(db.gdb_entries.aggregate([{"$sample": {"size": 1}}]))

    return results[0] if results else None


def format_answer(entry):
    """Format the GDB entry as a chat message"""
    return f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 **Question:**
{entry.get('question', 'Question not available')}

💡 **Answer:**
{entry.get('answer', 'Answer not available')}

📁 **Source:** GDB Entry | Domain: {entry.get('domain', 'General')} | Language: {entry.get('language', 'English')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


def ask_feedback(entry_id, domain):
    """Ask for feedback and process response"""

    print("""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤔 **Was this answer helpful for your farm?**

   Reply with **1** for ✅ YES - It was helpful
   Reply with **2** for ❌ NO - It needs improvement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

    while True:
        response = input("📱 Your response (1 or 2): ").strip()

        if response in ["1", "2"]:
            break
        print("   Please reply with 1 (Yes) or 2 (No)")


    is_helpful = response == "1"

    # Store feedback
    feedback_doc = {
        "gdb_entry_id": entry_id,
        "farmer_id": "demo_farmer",
        "message_id": f"demo_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "response": response,
        "state": "Demo",
        "language": "English",
        "domain": domain,
        "timestamp": datetime.utcnow(),
        "status": "captured"
    }
    db.feedback.insert_one(feedback_doc)


    if is_helpful:
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ **Thank you for your feedback!**

Your response helps us improve the quality of answers for all farmers.
This answer will be marked as helpful in our system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
        return True

    else:
        # Check if this entry gets flagged
        entry_stats = db.feedback.aggregate([
            {"$match": {"gdb_entry_id": entry_id}},
            {"$group": {
                "_id": "$gdb_entry_id",
                "total": {"$sum": 1},
                "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
            }}
        ])
        stats = list(entry_stats)
        if stats:
            total = stats[0]["total"]
            helpful = stats[0]["helpful"]
            score = (helpful / total * 100) if total > 0 else 0

            # Check if should be flagged
            if total >= 5 and score < 60:
                print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **Thank you for your feedback!**

We apologize that this answer wasn't helpful. Your feedback is
important to us.

🔔 **This entry has been FLAGGED for expert review!**

   - Total responses: {total}
   - Helpfulness score: {score:.1f}%
   - Threshold for review: <60% with 10+ responses

Our team will review and improve this answer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
            else:
                print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **Thank you for your feedback!**

We apologize that this answer wasn't helpful. Your feedback is
important to us.

📊 **Current entry stats:**
   - Total responses: {total}
   - Helpfulness score: {score:.1f}%

{'🔔 This entry will be flagged for review once it has 10+ responses.' if total >= 3 else ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
        return False


def show_stats():
    """Show current stats"""
    total = db.feedback.count_documents({})
    helpful = db.feedback.count_documents({"response": "1"})
    not_helpful = db.feedback.count_documents({"response": "2"})
    score = (helpful / total * 100) if total > 0 else 0

    print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **System Statistics:**

   Total Feedback: {total}
   Helpful: {helpful} ({score:.1f}%)
   Not Helpful: {not_helpful} ({100-score:.1f}%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")


def main():
    """Main chat loop"""

    print("\n💡 **Sample questions you can ask:**")
    for domain, questions in SAMPLE_QUESTIONS.items():
        print(f"\n   {domain}:")
        for q in questions[:2]:
            print(f"      • {q}")

    print("""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✍️  **Type your question below (in English or your language):**

   (Or type 'help' for suggestions, 'stats' for system stats, 'quit' to exit)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

    while True:
        try:
            question = input("\n👨‍🌾 You: ").strip()

            if not question:
                continue

            if question.lower() == "quit":
                print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🙏 **Thank you for using AjraSakha!**

Your feedback helps us serve farmers better.
To see the dashboard, visit: http://localhost:3000

🌾 Stay connected, stay informed! 🌾

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
                break

            elif question.lower() == "help":
                print("\n💡 **Here are some questions you can ask:**")
                for domain, questions in SAMPLE_QUESTIONS.items():
                    print(f"\n   {domain}:")
                    for q in questions[:2]:
                        print(f"      • {q}")
                continue

            elif question.lower() == "stats":
                show_stats()
                continue

            print("\n⏳ Searching the Golden Dataset...")

            # Search for answer
            entry = search_gdb(question)

            if entry:
                print(format_answer(entry))

                # Ask for feedback
                is_helpful = ask_feedback(entry["_id"], entry.get("domain", "General"))

            else:
                print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ **Sorry, we couldn't find a relevant answer.**

We're constantly adding new content to help farmers like you.
Please try again with a different question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

        except KeyboardInterrupt:
            print("\n\n🙏 Thank you for using AjraSakha!")
            break
        except Exception as e:
            print(f"\nError: {e}")
            print("Please try again.")


if __name__ == "__main__":
    main()
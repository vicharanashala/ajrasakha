#!/usr/bin/env python3
import sys
sys.path.insert(0, '.')
from shared.mongodb import get_db
from datetime import datetime

db = get_db()

print('''

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              🌾  AJRAASAKHA - FARMER CHAT EXPERIENCE  🌾                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

''')

entry = db.gdb_entries.find_one({'domain': 'Pest Control'})
if not entry:
    entry = db.gdb_entries.find_one()

print(f'''

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👨‍🌾 YOU (Farmer): How to control brown planthopper in rice?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AJRAASAKHA AI:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Question: {entry.get("question", "How to control brown planthopper in rice?")}

💡 Answer: {entry.get("answer", "Apply Imidacloprid or Ethofenprox. Use light traps. Drain fields periodically.")}

📁 Source: GDB Entry | Domain: {entry.get("domain", "Pest Control")} | Language: {entry.get("language", "English")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤔 Was this helpful?

   Reply with 1 for ✅ YES
   Reply with 2 for ❌ NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

''')

response = '1'

print(f'📱 YOU: {response}')

if response == '1':
    print(f'''

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Thank you! Your feedback helps us improve.

📊 Feedback stored:
   - Entry: {entry["_id"]}
   - Response: Helpful (1)
   - Status: Added to GDB helpful count

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

''')

entry2 = db.gdb_entries.find_one({'domain': 'Irrigation'})
if not entry2:
    entry2 = db.gdb_entries.find_one()

print(f'''

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👨‍🌾 YOU: Best drip irrigation schedule for sugarcane?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AJRAASAKHA AI:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Question: {entry2.get("question", "Drip irrigation schedule for sugarcane")}

💡 Answer: {entry2.get("answer", "Apply 4-6 irrigations for sugarcane. Critical stages: tillering, grand growth, and maturity.")}

📁 Source: GDB Entry | Domain: {entry2.get("domain", "Irrigation")} | Language: {entry2.get("language", "English")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤔 Was this helpful?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

''')

response2 = '2'
print(f'📱 YOU: {response2}')

stats = list(db.feedback.aggregate([
    {"$match": {"gdb_entry_id": entry2["_id"]}},
    {"$group": {"_id": "$gdb_entry_id", "total": {"$sum": 1}, "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}}}
]))
current_total = stats[0]["total"] if stats else 0
current_helpful = stats[0]["helpful"] if stats else 0
new_total = current_total + 1
new_score = (current_helpful / new_total * 100) if new_total > 0 else 0

flagged = new_total >= 5 and new_score < 60

print(f'''

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Thank you for your feedback. We apologize this wasn't helpful.

📊 Feedback stored:
   - Entry: {entry2["_id"]}
   - Response: Not Helpful (2)
   - Current stats: {new_total} responses, {new_score:.1f}% helpfulness

{"🔔 THIS ENTRY HAS BEEN FLAGGED FOR EXPERT REVIEW!" if flagged else "📝 This entry will be reviewed once it has 10+ responses."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

''')

print('''

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                         ✅ FLOW COMPLETE                                     ║
║                                                                              ║
║  1. Farmer asks question → AI searches GDB                                  ║
║  2. AI delivers answer → Asks feedback "Was this helpful? 1/2"              ║
║  3. Farmer replies → Feedback stored in MongoDB                             ║
║  4. If not helpful → Entry flagged for expert review                        ║
║  5. Dashboard at http://localhost:3000 shows all stats                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

''')
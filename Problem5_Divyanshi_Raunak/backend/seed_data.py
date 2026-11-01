from pymongo import MongoClient
import random
from datetime import datetime, timedelta
import hashlib

client = MongoClient("mongodb://localhost:27017/")
db = client["ajrasakha_db"]

print("Clearing old seed collections...")
db["gdb_entries"].drop()
db["farmer_feedback"].drop()
db["flagged_queue"].drop()
db["farmer_sessions"].drop()
db["weekly_digests"].drop()

gdb_catalog = [
    {
        "_id": "GDB-04821",
        "crop": "Wheat (गेहूँ)",
        "domain": "Pest & Disease Management",
        "sub_domain": "Aphid Control (माहू कीट नियंत्रण)",
        "question_en": "How to control aphids in wheat crop during heading stage?",
        "question_hi": "गेहूं में बालियां निकलते समय माहू (चेपा) कीट का नियंत्रण कैसे करें?",
        "answer_en": "Spray Thiamethoxam 25% WG @ 50g in 150-200 liters of water per acre. Alternatively, spray Imidacloprid 17.8% SL @ 60ml/acre when aphid count exceeds 5 per ear head.",
        "answer_hi": "गेहूं में माहू के नियंत्रण के लिए थायमेथॉक्सम 25% WG 50 ग्राम या इमिडाक्लोप्रिड 17.8% SL 60 मिली प्रति एकड़ 150-200 लीटर पानी में मिलाकर छिड़काव करें।",
        "technical_level": "Medium",
        "status": "FLAGGED_REVIEW",
        "upvotes": 14,
        "downvotes": 18, # 14/32 = 43.8% -> FLAGGED!
        "primary_state": "Punjab"
    },
    {
        "_id": "GDB-03102",
        "crop": "Mustard (सरसों)",
        "domain": "Pest & Disease Management",
        "sub_domain": "White Rust Control (सफेद रतुआ)",
        "question_en": "What fungicide should be sprayed for white rust in mustard?",
        "question_hi": "सरसों में सफेद रतुआ (व्हाइट रस्ट) रोग के लिए कौन सी दवा का छिड़काव करें?",
        "answer_en": "Spray Metalaxyl 8% + Mancozeb 64% WP (Ridomil MZ) @ 2g per liter of water at 15-day intervals upon initial white pustule appearance.",
        "answer_hi": "सफेद रतुआ के शुरुआती लक्षण दिखते ही मेटालैक्सिल 8% + मैंकोजेब 64% WP (रिडोमिल एमजेड) 2 ग्राम प्रति लीटर पानी में घोलकर 15 दिन के अंतराल पर छिड़कें।",
        "technical_level": "High",
        "status": "FLAGGED_REVIEW",
        "upvotes": 12,
        "downvotes": 16, # 12/28 = 42.8% -> FLAGGED!
        "primary_state": "Rajasthan"
    },
    {
        "_id": "GDB-09450",
        "crop": "Paddy (धान)",
        "domain": "Nutrient & Fertilizer Management",
        "sub_domain": "Zinc Deficiency (खैरा रोग)",
        "question_en": "How to treat Khaira disease (Zinc deficiency) in paddy nursery?",
        "question_hi": "धान में खैरा रोग (जिंक की कमी) का उपचार कैसे करें?",
        "answer_en": "Foliar spray of 0.5% Zinc Sulphate heptahydrate (21% Zn) mixed with 0.25% slaked lime suspension (5 kg Zinc Sulphate + 2.5 kg Lime in 1000L water/ha).",
        "answer_hi": "धान में खैरा रोग दिखने पर 5 किग्रा जिंक सल्फेट (21%) तथा 2.5 किग्रा बुझा हुआ चूना 1000 लीटर पानी में घोलकर प्रति हेक्टेयर छिड़काव करें।",
        "technical_level": "High",
        "status": "FLAGGED_REVIEW",
        "upvotes": 15,
        "downvotes": 19, # 15/34 = 44.1% -> FLAGGED!
        "primary_state": "Uttar Pradesh"
    },
    {
        "_id": "GDB-01044",
        "crop": "Wheat (गेहूँ)",
        "domain": "Irrigation Scheduling",
        "sub_domain": "CRI Stage Irrigation (सीआरआई अवस्था सिंचाई)",
        "question_en": "When is the first and most critical irrigation given to wheat crop?",
        "question_hi": "गेहूं की फसल में पहली और सबसे जरूरी सिंचाई (CRI) कब करनी चाहिए?",
        "answer_en": "The first irrigation must be applied at Crown Root Initiation (CRI) stage, typically 20-25 days after sowing. Avoid waterlogging.",
        "answer_hi": "गेहूं में पहली और सबसे महत्वपूर्ण सिंचाई बुवाई के 20-25 दिन बाद मुकुट जड़ (CRI) बनते समय करें। खेत में पानी रुकने न दें।",
        "technical_level": "Simple",
        "status": "ACTIVE",
        "upvotes": 48,
        "downvotes": 4, # 92.3%
        "primary_state": "Haryana"
    },
    {
        "_id": "GDB-02218",
        "crop": "Cotton (कपास)",
        "domain": "Pest & Disease Management",
        "sub_domain": "Pink Bollworm (गुलाबी सुंडी)",
        "question_en": "What is the recommended management for Pink Bollworm in Bt cotton?",
        "question_hi": "कपास में गुलाबी सुंडी (पिंक बोलवर्म) से बचाव के क्या उपाय हैं?",
        "answer_en": "Install pheromone traps @ 5/acre for monitoring. If moth catch exceeds 8/trap/night for 3 consecutive days, spray Profenofos 50% EC @ 2ml/L water.",
        "answer_hi": "निगरानी के लिए 5 फेरोमोन ट्रैप प्रति एकड़ लगाएं। यदि लगातार 3 दिन प्रति ट्रैप 8 पतंगे आएं तो प्रोफेनोफॉस 50% EC 2 मिली प्रति लीटर पानी में मिलाकर छिड़कें।",
        "technical_level": "Medium",
        "status": "ACTIVE",
        "upvotes": 36,
        "downvotes": 8, # 81.8%
        "primary_state": "Punjab"
    },
    {
        "_id": "GDB-05520",
        "crop": "Sugarcane (गन्ना)",
        "domain": "Weed Management",
        "sub_domain": "Early Weed Control (शुरुआती खरपतवार)",
        "question_en": "How to control broadleaf and grassy weeds in spring planted sugarcane?",
        "question_hi": "वसंतकालीन गन्ने में चौड़ी व संकरी पत्ती वाले खरपतवारों का नियंत्रण कैसे करें?",
        "answer_en": "Spray Atrazine 50% WP @ 1-1.5 kg per acre within 2-3 days of planting in moist soil. Ensure uniform soil coverage.",
        "answer_hi": "गन्ना बुवाई के 2-3 दिन बाद पर्याप्त नमी में एट्राजीन 50% WP 1 से 1.5 किग्रा प्रति एकड़ 200-250 लीटर पानी में मिलाकर छिड़कें।",
        "technical_level": "Medium",
        "status": "ACTIVE",
        "upvotes": 29,
        "downvotes": 5,
        "primary_state": "Uttar Pradesh"
    },
    {
        "_id": "GDB-06781",
        "crop": "Soybean (सोयाबीन)",
        "domain": "Pest & Disease Management",
        "sub_domain": "Girdle Beetle & Semilooper (गर्डल बीटल)",
        "question_en": "How to manage Girdle beetle and semilooper attack in soybean?",
        "question_hi": "सोयाबीन में चक्र भृंग (गर्डल बीटल) और सेमीलूपर सुंडी का नियंत्रण कैसे करें?",
        "answer_en": "Spray Chlorantraniliprole 18.5% SC (Coragen) @ 60ml in 150-200 liters of water per acre at initial pest appearance.",
        "answer_hi": "गर्डल बीटल और सुंडी दिखने पर क्लोरेंट्रानिलीप्रोल 18.5% SC (कोराजन) 60 मिली प्रति एकड़ 150-200 लीटर पानी में मिलाकर छिड़कें।",
        "technical_level": "Medium",
        "status": "ACTIVE",
        "upvotes": 42,
        "downvotes": 6,
        "primary_state": "Madhya Pradesh"
    },
    {
        "_id": "GDB-08190",
        "crop": "Gram (चना)",
        "domain": "Pest & Disease Management",
        "sub_domain": "Pod Borer (चने की फली छेदक)",
        "question_en": "How to control pod borer (Helicoverpa armigera) in chickpea?",
        "question_hi": "चने में फली छेदक सुंडी (हेलिकोवर्पा) के नियंत्रण हेतु कौन सी दवा उपयोगी है?",
        "answer_en": "Spray Emamectin Benzoate 5% SG @ 80g or Flubendiamide 39.35% SC @ 40ml per acre in 150-200 liters of water during early pod formation.",
        "answer_hi": "फली बनते समय इमामेक्टिन बेंजोएट 5% SG 80 ग्राम या फ्लूबेन्डियामाइड 39.35% SC 40 मिली प्रति एकड़ 150-200 लीटर पानी में मिलाकर छिड़काव करें।",
        "technical_level": "Medium",
        "status": "ACTIVE",
        "upvotes": 38,
        "downvotes": 4,
        "primary_state": "Madhya Pradesh"
    }
]

states = ["Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Rajasthan", "Maharashtra"]
languages = ["hi", "pa", "en"]
voice_samples_pos = [
    "दवाई बहुत बढ़िया काम की, 2 दिन में माहू खत्म हो गया धन्यवाद",
    "ਸਹੀ ਸਲਾਹ ਸੀ, ਕਣਕ ਨੂੰ ਬਹੁਤ ਫਾਇਦਾ ਹੋਇਆ",
    "This was very helpful, thank you AjraSakha",
    "खुराक बिल्कुल सही थी, स्प्रे करने के बाद फसल हरी हो गई"
]
voice_samples_neg = [
    "दुकान पर यह दवा नहीं मिली, दुकानदार बोला कोई और दवा ले जाओ",
    "ਬਹੁਤ ਔਖੀ ਅੰਗਰੇਜ਼ੀ ਦਵਾਈ ਸੀ, ਸਮਝ ਨਹੀਂ ਆਇਆ ਕਿੰਨੀ ਟੈਂਕੀ ਪਾਉਣੀ ਹੈ",
    "Spray did not work, pests are still damaging the crop",
    "भाषा बहुत कठिन थी, नाम बाजार में नहीं मिला"
]

feedbacks = []
for entry in gdb_catalog:
    up = entry["upvotes"]
    down = entry["downvotes"]
    tot = up + down
    ratio = round(up / tot, 3)
    entry["metrics"] = {
        "total_queries": tot * 4,
        "total_feedback": tot,
        "upvotes": up,
        "downvotes": down,
        "helpful_ratio": ratio,
        "voice_feedback_count": int(tot * 0.25),
        "last_feedback_at": datetime.utcnow().isoformat()
    }
    
    # Generate individual feedback rows
    for i in range(tot):
        is_up = i < up
        is_voice = (i % 4 == 0)
        state = entry["primary_state"] if (i % 2 == 0) else random.choice(states)
        lang = "pa" if state == "Punjab" else "hi"
        phone = f"91{random.randint(9000000000, 9999999999)}"
        phone_hash = hashlib.sha256(phone.encode()).hexdigest()[:16]
        
        if is_up:
            rating = 1
            root_cause = "GENERAL_POSITIVE"
            voice_txt = random.choice(voice_samples_pos) if is_voice else None
        else:
            rating = 2
            root_cause = random.choice(["TOO_TECHNICAL", "MEDICINE_UNAVAILABLE_LOCALLY", "UNCLEAR_DOSAGE"])
            voice_txt = random.choice(voice_samples_neg) if is_voice else None
            
        fb_doc = {
            "_id": f"FB-SEED-{entry['_id']}-{i:03d}",
            "gdb_id": entry["_id"],
            "farmer_phone_hash": phone_hash,
            "farmer_state": state,
            "farmer_district": "Central District",
            "language": lang,
            "input_channel": "WHATSAPP_VOICE" if is_voice else ("WHATSAPP_BUTTON" if i%2==0 else "WHATSAPP_TEXT"),
            "rating": rating,
            "voice_transcription": voice_txt,
            "root_cause_category": root_cause,
            "query_text": entry["question_hi"],
            "scheduled_nudge_delivered": (i % 5 == 0),
            "timestamp": (datetime.utcnow() - timedelta(days=random.randint(0, 6), hours=random.randint(1, 12))).isoformat()
        }
        feedbacks.append(fb_doc)
        
    db["gdb_entries"].insert_one(entry)
    
    # Populate flagged queue if ratio < 0.60
    if ratio < 0.60:
        db["flagged_queue"].insert_one({
            "gdb_id": entry["_id"],
            "crop": entry["crop"],
            "domain": entry["domain"],
            "question_en": entry["question_en"],
            "question_hi": entry["question_hi"],
            "current_answer_en": entry["answer_en"],
            "current_answer_hi": entry["answer_hi"],
            "helpful_ratio": ratio,
            "total_feedback": tot,
            "upvotes": up,
            "downvotes": down,
            "threshold_configured": 0.60,
            "min_samples_configured": 10,
            "flagged_at": datetime.utcnow().isoformat(),
            "primary_negative_state": entry["primary_state"],
            "root_cause_breakdown": {
                "MEDICINE_UNAVAILABLE_LOCALLY": "52%",
                "TOO_TECHNICAL": "30%",
                "UNCLEAR_DOSAGE": "18%"
            },
            "flag_reason": f"Helpfulness score ({int(ratio*100)}%) is below 60% threshold across {tot} responses.",
            "review_status": "PENDING_AGRI_REVIEW",
            "assigned_team": "ACE Agronomy Board"
        })

db["farmer_feedback"].insert_many(feedbacks)
print(f"Successfully seeded {len(gdb_catalog)} GDB entries, {len(feedbacks)} farmer feedbacks, and 3 flagged entries!")

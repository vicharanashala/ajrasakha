import requests
import time
import subprocess
import sys

from pathlib import Path

print("Starting backend server for verification...")
import os
base_dir = os.path.dirname(os.path.abspath(__file__))
proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8000"], cwd=base_dir)

time.sleep(3)

try:
    # 1. Test Analytics Overview
    r1 = requests.get("http://localhost:8000/api/analytics/overview")
    print("1. Analytics Overview:", r1.status_code, r1.json())
    assert r1.status_code == 200

    # 2. Test Flagged Queue
    r2 = requests.get("http://localhost:8000/api/flagged/queue")
    print("2. Flagged Queue Count:", r2.status_code, r2.json().get("total"))
    assert r2.json().get("total") == 3
    assert all(item.get("is_flagged") is True and item.get("flag_info") is not None for item in r2.json().get("queue", []))

    # 3. Test WhatsApp Simulation - Initial Question
    r3 = requests.post("http://localhost:8000/api/whatsapp/simulate-turn", json={
        "phone_number": "919876543210",
        "message_body": "गेहूं में माहू कीट की दवा बताएं",
        "farmer_state": "Punjab",
        "language": "hi",
        "input_type": "TEXT"
    })
    print("3. Query Response Step:", r3.status_code, r3.json().get("step"))
    assert r3.json().get("step") == "ANSWER_DELIVERED"
    assert len(r3.json().get("quick_reply_buttons", [])) == 2

    # 4. Test WhatsApp Simulation - 1-Tap Upvote
    r4 = requests.post("http://localhost:8000/api/whatsapp/simulate-turn", json={
        "phone_number": "919876543210",
        "farmer_state": "Punjab",
        "language": "hi",
        "input_type": "BUTTON_CLICK",
        "button_value": 1
    })
    print("4. Button Click Step:", r4.status_code, r4.json().get("step"))
    assert r4.json().get("step") == "FEEDBACK_RECORDED"

    # 5. Test WhatsApp Voice Note Processing
    r5 = requests.post("http://localhost:8000/api/whatsapp/simulate-turn", json={
        "phone_number": "919876543215",
        "farmer_state": "Punjab",
        "language": "hi",
        "input_type": "VOICE_NOTE",
        "voice_audio_note": "ਦਵਾਈ ਬਹੁਤ ਵਧੀਆ ਸੀ, ਕਣਕ ਨੂੰ ਬਹੁਤ ਫਾਇਦਾ ਹੋਇਆ ਧੰਨਵਾਦ"
    })
    voice_analysis = r5.json().get("voice_analysis", {})
    print("5. Voice Note NLP Sentiment:", voice_analysis.get("sentiment"), "Rating:", voice_analysis.get("rating"))
    assert voice_analysis.get("sentiment") == "POSITIVE"

    # 6. Test Evening Scheduled Nudge Simulator
    r6 = requests.post("http://localhost:8000/api/whatsapp/simulate-turn", json={
        "phone_number": "919876543210",
        "farmer_state": "Punjab",
        "language": "hi",
        "input_type": "TRIGGER_NUDGE"
    })
    print("6. Scheduled Nudge Trigger Step:", r6.json().get("step"))
    assert r6.json().get("step") == "SCHEDULED_NUDGE_SENT"

    # 7. Test Weekly Agri Digest
    r7 = requests.get("http://localhost:8000/api/digest/weekly")
    print("7. Weekly Digest ID:", r7.json().get("digest_id"))
    print("   Action Items Count:", len(r7.json().get("critical_action_items", [])))
    print("   Lowest Performing Entries:", len(r7.json().get("lowest_performing_gdb_entries", [])))
    assert len(r7.json().get("lowest_performing_gdb_entries", [])) > 0

    print("\n[SUCCESS] ALL 7 AUTOMATED VERIFICATION TESTS PASSED PERFECTLY!")

finally:
    proc.terminate()

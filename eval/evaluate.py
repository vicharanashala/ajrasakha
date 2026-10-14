import json
import os
import time
from dotenv import load_dotenv
from groq import Groq

# ─── SETUP ────────────────────────────────────────────────────────
load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

with open("mock_gdb.json", "r", encoding="utf-8") as f:
    data = json.load(f)

entries = data["entries"]
print(f"Loaded {len(entries)} entries. Starting evaluation...\n")

# ─── STEP 1: SIMULATE BOT ANSWER ──────────────────────────────────
def simulate_bot_answer(question, domain):
    """Ask Groq to answer as if it's AjraSakha bot"""
    prompt = f"""You are AjraSakha, an agricultural advisory bot for Indian farmers.
Answer the following farmer question briefly in 2-3 sentences.
Domain: {domain}
Question: {question}
Answer:"""
    
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200
    )
    return response.choices[0].message.content.strip()

# ─── STEP 2: SCORE THE ANSWER ─────────────────────────────────────
def score_answer(question, bot_answer, expert_answer, domain):
    """Ask Groq to score the bot answer against the expert answer"""
    prompt = f"""You are an agricultural expert evaluating an AI bot's answer.
Score the bot answer on three criteria. Reply ONLY in this exact format, nothing else:

RELEVANCE: <score 1-10>
FAITHFULNESS: <score 1-10>
GDB_MATCH: <score 1-10>

Definitions:
- RELEVANCE: Does the bot answer actually address what the farmer asked?
- FAITHFULNESS: Does the bot answer stick to agricultural facts without making things up?
- GDB_MATCH: How similar is the bot answer to the expert answer in meaning and content?

Question: {question}
Domain: {domain}
Expert Answer: {expert_answer}
Bot Answer: {bot_answer}

Scores:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100
    )
    return response.choices[0].message.content.strip()

def score_agricultural_metric(question, bot_answer, crop, region, domain):
    """Check if bot answer mentions correct crop, treatment, and region"""
    if domain == "greetings":
        return 10  # Greetings don't need agricultural specifics
    
    crop_info = f"Crop: {crop}" if crop else "Crop: not specified"
    region_info = f"Region: {region}" if region else "Region: not specified"
    
    prompt = f"""You are an agricultural expert. Score this bot answer on agricultural accuracy.
Reply ONLY in this exact format, nothing else:

AGRI_SCORE: <score 1-10>

Scoring criteria:
- 9-10: Answer mentions correct crop name, correct treatment/solution, and is appropriate for the region
- 7-8: Answer mentions correct crop and treatment but misses regional specifics
- 5-6: Answer is partially correct but misses important agricultural details
- 3-4: Answer has some relevant content but significant agricultural inaccuracies
- 1-2: Answer is agriculturally incorrect or irrelevant

Question: {question}
{crop_info}
{region_info}
Domain: {domain}
Bot Answer: {bot_answer}

Score:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20
    )
    text = response.choices[0].message.content.strip()
    try:
        for line in text.split("\n"):
            if line.startswith("AGRI_SCORE:"):
                return int(line.split(":")[1].strip().split()[0])
        return 0
    except:
        return 0

# ─── STEP 3: PARSE SCORES ─────────────────────────────────────────
def parse_scores(score_text):
    """Extract numbers from the score response"""
    scores = {"relevance": 0, "faithfulness": 0, "gdb_match": 0}
    for line in score_text.split("\n"):
        line = line.strip()
        if line.startswith("RELEVANCE:"):
            try:
                scores["relevance"] = int(line.split(":")[1].strip().split()[0])
            except:
                scores["relevance"] = 0
        elif line.startswith("FAITHFULNESS:"):
            try:
                scores["faithfulness"] = int(line.split(":")[1].strip().split()[0])
            except:
                scores["faithfulness"] = 0
        elif line.startswith("GDB_MATCH:"):
            try:
                scores["gdb_match"] = int(line.split(":")[1].strip().split()[0])
            except:
                scores["gdb_match"] = 0
    return scores

# ─── MAIN LOOP ────────────────────────────────────────────────────
results = []

for i, entry in enumerate(entries):
    print(f"[{i+1}/60] Evaluating {entry['id']} ({entry['domain']})...")
    
    # Simulate bot answer
    bot_answer = simulate_bot_answer(entry["question"], entry["domain"])
    
    # Score it
    score_text = score_answer(
        entry["question"],
        bot_answer,
        entry["answer"],
        entry["domain"]
    )
    
    # Parse scores
    scores = parse_scores(score_text)
    agri_score = score_agricultural_metric(entry["question"], bot_answer, entry.get("crop"), entry.get("region"), entry["domain"])
    
    # Store result
    result = {
        "id": entry["id"],
        "domain": entry["domain"],
        "difficulty": entry["difficulty"],
        "question": entry["question"],
        "expert_answer": entry["answer"],
        "bot_answer": bot_answer,
        "scores": {**scores, "agri_score": agri_score}
    }
    results.append(result)
    
    print(f"  Relevance: {scores['relevance']}/10 | Faithfulness: {scores['faithfulness']}/10 | GDB Match: {scores['gdb_match']}/10 | Agri: {agri_score}/10")

    # Small delay to avoid hitting rate limits
    time.sleep(1)

# ─── SAVE RESULTS ─────────────────────────────────────────────────
with open("results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\nDone. Results saved to results.json")
print(f"Total entries evaluated: {len(results)}")
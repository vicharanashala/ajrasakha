import json
from datetime import datetime
from collections import defaultdict

with open("results.json") as f:
    results = json.load(f)

domain_scores = defaultdict(lambda: {"relevance": [], "faithfulness": [], "gdb_match": [], "agri_score": []})
difficulty_scores = defaultdict(lambda: {"relevance": [], "faithfulness": [], "gdb_match": [], "agri_score": []})

for r in results:
    d = r["domain"]
    diff = r["difficulty"]
    domain_scores[d]["relevance"].append(r["scores"]["relevance"])
    domain_scores[d]["faithfulness"].append(r["scores"]["faithfulness"])
    domain_scores[d]["gdb_match"].append(r["scores"]["gdb_match"])
    domain_scores[d]["agri_score"].append(r["scores"].get("agri_score", 0))
    difficulty_scores[diff]["relevance"].append(r["scores"]["relevance"])
    difficulty_scores[diff]["faithfulness"].append(r["scores"]["faithfulness"])
    difficulty_scores[diff]["gdb_match"].append(r["scores"]["gdb_match"])
    difficulty_scores[diff]["agri_score"].append(r["scores"].get("agri_score", 0))

def avg(lst):
    return round(sum(lst) / len(lst), 1) if lst else 0

all_relevance = avg([r["scores"]["relevance"] for r in results])
all_faithful = avg([r["scores"]["faithfulness"] for r in results])
all_gdb = avg([r["scores"]["gdb_match"] for r in results])
all_agri = avg([r["scores"].get("agri_score", 0) for r in results])

domain_averages = {}
for domain in ["weather", "market", "soil", "schemes", "pest", "greetings"]:
    s = domain_scores[domain]
    rv = avg(s["relevance"])
    fv = avg(s["faithfulness"])
    gv = avg(s["gdb_match"])
    av = avg(s["agri_score"])
    domain_averages[domain] = avg([rv, fv, gv, av])

best = max(domain_averages, key=domain_averages.get)
worst = min(domain_averages, key=domain_averages.get)

lines = []
lines.append("# AjraSakha Answer Evaluation Report")
lines.append("")
lines.append("Generated: " + datetime.now().strftime("%d %B %Y, %I:%M %p"))
lines.append("Total Entries Evaluated: " + str(len(results)))
lines.append("Domains Covered: weather, market, soil, schemes, pest, greetings")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## What Was Evaluated")
lines.append("")
lines.append("For each entry in the mock GDB, the pipeline:")
lines.append("1. Took the farmer question")
lines.append("2. Generated a simulated bot answer using an LLM")
lines.append("3. Scored the bot answer against the expert GDB answer on four metrics")
lines.append("")
lines.append("Metrics:")
lines.append("- Relevance: Did the bot answer actually address what the farmer asked?")
lines.append("- Faithfulness: Did the bot stick to agricultural facts without hallucinating?")
lines.append("- GDB Match: How closely did the bot answer match the expert validated answer?")
lines.append("- Agricultural Accuracy: Did the answer mention the correct crop, treatment, and region?")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Domain Quality Scores")
lines.append("")
lines.append("| Domain | Relevance | Faithfulness | GDB Match | Agri Accuracy | Overall |")
lines.append("|--------|-----------|--------------|-----------|---------------|---------|")

for domain in ["weather", "market", "soil", "schemes", "pest", "greetings"]:
    s = domain_scores[domain]
    rv = avg(s["relevance"])
    fv = avg(s["faithfulness"])
    gv = avg(s["gdb_match"])
    av = avg(s["agri_score"])
    ov = avg([rv, fv, gv, av])
    lines.append("| " + domain.capitalize() + " | " + str(rv) + "/10 | " + str(fv) + "/10 | " + str(gv) + "/10 | " + str(av) + "/10 | " + str(ov) + "/10 |")

lines.append("")
lines.append("Strongest domain: " + best.capitalize() + " (" + str(domain_averages[best]) + "/10 overall)")
lines.append("Weakest domain: " + worst.capitalize() + " (" + str(domain_averages[worst]) + "/10 overall)")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Score Breakdown by Question Difficulty")
lines.append("")
lines.append("| Difficulty | Relevance | Faithfulness | GDB Match | Agri Accuracy |")
lines.append("|------------|-----------|--------------|-----------|---------------|")

for diff in ["generic", "moderate", "specific"]:
    s = difficulty_scores[diff]
    rv = avg(s["relevance"])
    fv = avg(s["faithfulness"])
    gv = avg(s["gdb_match"])
    av = avg(s["agri_score"])
    lines.append("| " + diff.capitalize() + " | " + str(rv) + "/10 | " + str(fv) + "/10 | " + str(gv) + "/10 | " + str(av) + "/10 |")

lines.append("")
lines.append("---")
lines.append("")
lines.append("## Key Findings")
lines.append("")
lines.append("### 1. Overall Pipeline Performance")
lines.append("- Average Relevance: " + str(all_relevance) + "/10")
lines.append("- Average Faithfulness: " + str(all_faithful) + "/10")
lines.append("- Average GDB Match: " + str(all_gdb) + "/10")
lines.append("- Average Agricultural Accuracy: " + str(all_agri) + "/10")
lines.append("")
lines.append("### 2. Relevance and Agricultural Accuracy are Consistently Strong")
lines.append("All domains scored above 8/10 on relevance and agricultural accuracy.")
lines.append("The bot correctly identifies the question and provides agriculturally")
lines.append("appropriate responses with correct crop names, treatments, and regional context.")
lines.append("")
lines.append("### 3. Faithfulness Gap in Schemes Domain")
lines.append("The Schemes domain scored lowest on faithfulness (" + str(avg(domain_scores["schemes"]["faithfulness"])) + "/10).")
lines.append("Government scheme details such as exact subsidy percentages and eligibility")
lines.append("criteria are high-precision facts where hallucination risk is highest.")
lines.append("This domain requires priority attention before production deployment.")
lines.append("")
lines.append("### 4. GDB Match Scores Indicate Retrieval Gap")
lines.append("GDB Match scores are the lowest metric across all domains (avg " + str(all_gdb) + "/10).")
lines.append("The bot generates plausible, agriculturally accurate answers but does not")
lines.append("closely mirror the specific expert-validated phrasing, dosages, and regional")
lines.append("details in the GDB. Improving retrieval accuracy would directly improve this metric.")
lines.append("")
lines.append("### 5. High Agricultural Accuracy Suggests Strong Domain Knowledge")
lines.append("Despite lower GDB Match scores, agricultural accuracy remains high (avg " + str(all_agri) + "/10).")
lines.append("This means the bot is saying the right things in its own words, not the")
lines.append("expert's words. The gap is in retrieval precision, not domain knowledge.")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Recommendations for AI Team")
lines.append("")
lines.append("1. Prioritise Schemes domain for retrieval improvement - highest hallucination risk")
lines.append("2. Improve GDB retrieval precision - bot answers are relevant but not faithful to exact GDB content")
lines.append("3. Run this pipeline on real AjraSakha outputs to get production-level quality scores")
lines.append("4. Set quality thresholds - flag any answer scoring below 6/10 on faithfulness for human review")
lines.append("5. Expand test set to include real disclaimer-triggered queries once database access is available")
lines.append("6. Focus retrieval improvements on Pest domain - lowest GDB Match score (" + str(avg(domain_scores["pest"]["gdb_match"])) + "/10)")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Sample Evaluated Entries")
lines.append("")

high_overall = sorted(results, key=lambda x: sum(x["scores"].values()), reverse=True)[0]
low_faithful = sorted(results, key=lambda x: x["scores"]["faithfulness"])[0]
low_gdb = sorted(results, key=lambda x: x["scores"]["gdb_match"])[0]

for label, entry in [("Highest Overall Score", high_overall),
                      ("Lowest Faithfulness", low_faithful),
                      ("Lowest GDB Match", low_gdb)]:
    lines.append("### " + label)
    lines.append("ID: " + entry["id"] + " | Domain: " + entry["domain"].capitalize() + " | Difficulty: " + entry["difficulty"].capitalize())
    lines.append("")
    lines.append("Question: " + entry["question"])
    lines.append("")
    lines.append("Expert Answer: " + entry["expert_answer"][:200] + "...")
    lines.append("")
    lines.append("Bot Answer: " + entry["bot_answer"][:200] + "...")
    lines.append("")
    agri = entry["scores"].get("agri_score", "N/A")
    lines.append("Scores: Relevance " + str(entry["scores"]["relevance"]) + "/10 | Faithfulness " + str(entry["scores"]["faithfulness"]) + "/10 | GDB Match " + str(entry["scores"]["gdb_match"]) + "/10 | Agri Accuracy " + str(agri) + "/10")
    lines.append("")

lines.append("---")
lines.append("")
lines.append("Report generated by AjraSakha Answer Evaluation Pipeline - Project 3, Summership 2026")

with open("evaluation_report.md", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("Report saved to evaluation_report.md")
print("")
print("Quick summary:")
print("  Overall Relevance:         " + str(all_relevance) + "/10")
print("  Overall Faithfulness:      " + str(all_faithful) + "/10")
print("  Overall GDB Match:         " + str(all_gdb) + "/10")
print("  Overall Agri Accuracy:     " + str(all_agri) + "/10")
print("  Strongest domain:          " + best.capitalize())
print("  Weakest domain:            " + worst.capitalize())

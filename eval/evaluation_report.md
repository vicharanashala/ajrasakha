# AjraSakha Answer Evaluation Report

Generated: 10 July 2026, 02:53 PM
Total Entries Evaluated: 60
Domains Covered: weather, market, soil, schemes, pest, greetings

---

## What Was Evaluated

For each entry in the mock GDB, the pipeline:
1. Took the farmer question
2. Generated a simulated bot answer using an LLM
3. Scored the bot answer against the expert GDB answer on four metrics

Metrics:
- Relevance: Did the bot answer actually address what the farmer asked?
- Faithfulness: Did the bot stick to agricultural facts without hallucinating?
- GDB Match: How closely did the bot answer match the expert validated answer?
- Agricultural Accuracy: Did the answer mention the correct crop, treatment, and region?

---

## Domain Quality Scores

| Domain | Relevance | Faithfulness | GDB Match | Agri Accuracy | Overall |
|--------|-----------|--------------|-----------|---------------|---------|
| Weather | 8.6/10 | 8.3/10 | 6.5/10 | 9.0/10 | 8.1/10 |
| Market | 8.4/10 | 8.0/10 | 6.2/10 | 8.5/10 | 7.8/10 |
| Soil | 8.6/10 | 7.8/10 | 6.2/10 | 8.9/10 | 7.9/10 |
| Schemes | 8.6/10 | 7.2/10 | 6.0/10 | 8.8/10 | 7.7/10 |
| Pest | 8.4/10 | 7.9/10 | 5.5/10 | 8.7/10 | 7.6/10 |
| Greetings | 8.0/10 | 9.0/10 | 6.8/10 | 10.0/10 | 8.4/10 |

Strongest domain: Greetings (8.4/10 overall)
Weakest domain: Pest (7.6/10 overall)

---

## Score Breakdown by Question Difficulty

| Difficulty | Relevance | Faithfulness | GDB Match | Agri Accuracy |
|------------|-----------|--------------|-----------|---------------|
| Generic | 8.5/10 | 8.6/10 | 6.9/10 | 9.3/10 |
| Moderate | 8.3/10 | 7.4/10 | 5.3/10 | 8.7/10 |
| Specific | 8.5/10 | 7.9/10 | 6.1/10 | 8.9/10 |

---

## Key Findings

### 1. Overall Pipeline Performance
- Average Relevance: 8.4/10
- Average Faithfulness: 8.0/10
- Average GDB Match: 6.2/10
- Average Agricultural Accuracy: 9.0/10

### 2. Relevance and Agricultural Accuracy are Consistently Strong
All domains scored above 8/10 on relevance and agricultural accuracy.
The bot correctly identifies the question and provides agriculturally
appropriate responses with correct crop names, treatments, and regional context.

### 3. Faithfulness Gap in Schemes Domain
The Schemes domain scored lowest on faithfulness (7.2/10).
Government scheme details such as exact subsidy percentages and eligibility
criteria are high-precision facts where hallucination risk is highest.
This domain requires priority attention before production deployment.

### 4. GDB Match Scores Indicate Retrieval Gap
GDB Match scores are the lowest metric across all domains (avg 6.2/10).
The bot generates plausible, agriculturally accurate answers but does not
closely mirror the specific expert-validated phrasing, dosages, and regional
details in the GDB. Improving retrieval accuracy would directly improve this metric.

### 5. High Agricultural Accuracy Suggests Strong Domain Knowledge
Despite lower GDB Match scores, agricultural accuracy remains high (avg 9.0/10).
This means the bot is saying the right things in its own words, not the
expert's words. The gap is in retrieval precision, not domain knowledge.

---

## Recommendations for AI Team

1. Prioritise Schemes domain for retrieval improvement - highest hallucination risk
2. Improve GDB retrieval precision - bot answers are relevant but not faithful to exact GDB content
3. Run this pipeline on real AjraSakha outputs to get production-level quality scores
4. Set quality thresholds - flag any answer scoring below 6/10 on faithfulness for human review
5. Expand test set to include real disclaimer-triggered queries once database access is available
6. Focus retrieval improvements on Pest domain - lowest GDB Match score (5.5/10)

---

## Sample Evaluated Entries

### Highest Overall Score
ID: G001 | Domain: Greetings | Difficulty: Generic

Question: Hello

Expert Answer: Namaste! Welcome to AjraSakha, your agricultural advisory assistant. You can ask me questions about crops, weather, soil, pest control, government schemes, and market prices. How can I help you today?...

Bot Answer: Namaste! Welcome to our agricultural advisory service, I'm AjraSakha, your guide for farming-related queries. How can I assist you today with your farming needs?...

Scores: Relevance 10/10 | Faithfulness 10/10 | GDB Match 9/10 | Agri Accuracy 10/10

### Lowest Faithfulness
ID: SC007 | Domain: Schemes | Difficulty: Moderate

Question: Can tenant farmers apply for PM Kisan?

Expert Answer: No, PM-KISAN is available only to landholding farmers. Tenant farmers and sharecroppers are not eligible under the current scheme guidelines because the benefit is linked to land records. However, sev...

Bot Answer: Yes, tenant farmers can apply for PM Kisan, but they need to meet certain eligibility criteria. They must have a valid lease agreement and the landowner's consent to apply for the scheme. Additionally...

Scores: Relevance 8/10 | Faithfulness 2/10 | GDB Match 1/10 | Agri Accuracy 8/10

### Lowest GDB Match
ID: SC007 | Domain: Schemes | Difficulty: Moderate

Question: Can tenant farmers apply for PM Kisan?

Expert Answer: No, PM-KISAN is available only to landholding farmers. Tenant farmers and sharecroppers are not eligible under the current scheme guidelines because the benefit is linked to land records. However, sev...

Bot Answer: Yes, tenant farmers can apply for PM Kisan, but they need to meet certain eligibility criteria. They must have a valid lease agreement and the landowner's consent to apply for the scheme. Additionally...

Scores: Relevance 8/10 | Faithfulness 2/10 | GDB Match 1/10 | Agri Accuracy 8/10

---

Report generated by AjraSakha Answer Evaluation Pipeline - Project 3, Summership 2026
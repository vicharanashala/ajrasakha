# Ajrasakha

A farmer-friendly chat interface where agricultural workers can ask questions in their own language and get reliable answers instantly.

## Overview

Ajrasakha follows a smart **three-tier approach** to find the best answer:

1. Searches the **Golden Dataset** — expert-verified question–answer pairs.
2. Checks the **Package of Practices (PoP)** database — standard agricultural guidelines.
3. Falls back to **AI language models** if neither source has the answer.

This ensures farmers always get a helpful response — whether from verified expert knowledge or AI-generated guidance.

## Key Features

- **Native-language support** — ask questions in regional languages via the Sarvam AI API, making the platform accessible across regions.
- **Simple, intuitive interface** — designed for users who may not be tech-savvy.
- **Smart prioritization** — verified Golden Dataset answers first, then Package of Practices, then AI-generated responses.
- **Voice input** — ask questions by speaking, through speech-to-text.
- **Saved conversations** — revisit previous answers anytime.
- **Real-time delivery** — instant answers from the knowledge base or AI models.
- Built on **LibreChat**, offering a modern, reliable experience tailored for agricultural needs.

### GDB Coverage Gap Detector

To intelligently scale our Golden Dataset, the platform includes a **Coverage Gap Detector pipeline**:
- **Continuous Analysis**: Automatically pulls disclaimer-triggered (unanswered) queries from the system.
- **Semantic Clustering**: Uses `sentence-transformers` and `scikit-learn` (DBSCAN) to group unanswerable questions by intent.
- **Heatmap Dashboard**: A sleek, React-based dashboard displaying a coverage heatmap across crops and states, allowing the outreach team to prioritize which farming domains lack GDB coverage.

## Technologies Used

- **Frontend:** React + TypeScript
- **Backend:** Node.js + Express.js
- **Chat platform:** LibreChat
- **AI models:** DeepSeek-R1, Qwen3, and GPT-OSS via Ollama
- **Data & search:** MongoDB Atlas (Golden Dataset + Package of Practices) with vector search for semantically similar questions
- **Language translation:** Sarvam AI API
- **Authentication:** Firebase
- **Data access:** Model Context Protocol (MCP) servers for structured agricultural data

## How It Works

1. **Golden Dataset first** — when a farmer asks a question, the system searches for verified expert answers. If a match exists, it's delivered instantly.
2. **Package of Practices next** — if no match is found, the system checks the PoP database for relevant standard guidelines and best practices.
3. **AI fallback** — if neither source has the answer, AI language models generate a helpful response, sent to the farmer immediately.
4. **Continuous review** — each AI-generated answer is simultaneously forwarded to the **Ajrasakha Reviewer System** for expert validation. As more answers are reviewed and approved, the Golden Dataset grows, so more farmers receive instantly verified answers over time.

## Benefits for Farmers

- Instant answers with **no language barrier**, across multiple regional languages.
- Ask by **text or voice** — accessible even for those who struggle with typing.
- **Trusted information first**, by prioritizing verified expert knowledge.
- **Quality that keeps improving**, as AI answers undergo expert review.
- **Saved history** for referencing past answers.
- **24/7 availability**, helping farmers make timely decisions during critical farming periods.

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


# AJRASAKHA Review System

The **Ajrasakha Review System** is a peer validation and knowledge-authoring platform used by agricultural specialists to create, review, and validate answers for questions that are not available in the Golden Dataset (GDB).

The system helps continuously expand the Golden Dataset with high-quality, expert-validated agricultural knowledge.

---

## Overview

When a farmer asks a question through the Ajrasakha chatbot and an appropriate answer is not available in the Golden Dataset:

* The question is simultaneously routed into the Review System.
* It is automatically allocated to an agricultural expert based on their current workload.
* The assigned expert authors an answer, which proceeds through a peer validation process.
* Once the answer receives **three peer approvals**, it moves to the moderator stage for final quality checks.
* Upon moderator approval, the verified answer is pushed to the Golden Dataset (GDB), and the original user can be notified.
* The target turnaround time for this complete authoring and validation process is approximately **2 hours**.

---


## Question Allocation & Authoring

The Review System utilizes **single allocation** for answer creation:

* **Workload-Based Distribution:** Incoming unanswered questions are automatically allocated to an available expert based on their current workload.
* **Single Ownership:** Only one expert is assigned to draft a response at a time, preventing duplicate effort.
* **Turnaround Efficiency:** Speeds up the authoring pipeline by establishing clear question ownership.

---

## Answer Validation & Moderation

### Peer Review Actions

After an expert creates an answer, other agricultural experts can review it. Each reviewer has three actions:

* **Approve:** Increments the approval count by one (`+1`). An answer requires **three peer approvals** from other agricultural experts before proceeding to the moderator.
* **Reject:** Resets the approval count to zero (`0`). The answer must be re-authored with a new answer before it can enter the peer-review process again.
* **Modify:** A reviewer can modify the existing answer. When an answer is modified, the approval count is reset to zero (`0`), and the modified answer must go through the peer-review process again.

### Moderator Review

After an answer receives three peer approvals, it reaches the moderator for final quality validation:

* **Approve:** If the quality meets the required standard, the answer is pushed to the Golden Dataset (GDB) for future chatbot queries.
* **Re-route / Reject:** If the quality is insufficient, the moderator re-routes the answer back into the authoring/review workflow.

---

## User Roles & Responsibilities

The Review System uses role-based access and workflows for managing the question and answer lifecycle:

| Role | Key Responsibilities |
| :--- | :--- |
| **Admin** | Manages users, questions, assignments, duplicate/dynamic questions, system monitoring, and operational workflows. |
| **Gatekeeper** | Handles questions requiring special processing; identifies duplicate questions, handles dynamic questions, and routes workflows. |
| **Auditor** | Maintains quality and consistency; handles duplicates/dynamic queries, creates answers where required, and validates relevant content. |
| **Agricultural Expert** | Responsible for creating answers for unanswered questions, reviewing peer answers, and approving, rejecting, or modifying drafts. |
| **PAE Expert** | Participates in answer creation and validation, helping verify final answers within the review workflow. |
| **Moderator** | Performs final quality checks; verifies standards, re-routes non-compliant answers, and approves publication to the Golden Dataset. |

---

## Key Features

* **Peer Validation:** Answers are reviewed and validated by multiple agricultural experts before publication.
* **Automatic Question Allocation:** Single allocation assigns questions based on expert workload.
* **Three-Approval Workflow:** Enforces consensus quality before moderator review.
* **Answer Modification & Rejection:** Dynamically resets approval counts to maintain data accuracy.
* **Duplicate & Dynamic Question Handling:** Specialized triage workflows for edge cases and recurring questions.
* **Flag Raising:** Enables users and reviewers to flag questions or answers requiring special attention.
* **Dedicated Dashboards:** Separate analytics and operational views for Admins, Moderators, and Chatbot usage.
* **Reports & Data Export:** Enables downloading operational metrics and system logs.
* **Answer Lifecycle Tracking:** Full audit trail tracking questions from initial chatbot inquiry to GDB ingestion.
* **User Notifications:** Automatically notifies the inquiring farmer once a verified answer is ready.

---

## Technologies Used

* **Frontend:** React + Tailwind CSS
* **Backend:** Node.js
* **Database:** MongoDB
* **Authentication:** Firebase
* **Deployment:** Google Cloud Run
* **Language / AI Services:** Sarvam AI API, MiniMax models
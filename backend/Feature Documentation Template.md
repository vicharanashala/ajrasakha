# Feature Documentation Template

> Fill only the sections relevant to your feature.

> Keep answers short and practical.

---

# Feature Name

Example:

```text

Question Allocation

```

---

# Module

Example:

```text

src/modules/question

```

---

# Purpose

What does this feature do?

Example:

```text

Allocates questions to experts automatically.

```

---

# Main Files

List important files only.

Example:

```text

controllers/QuestionController.ts

services/QuestionService.ts

repositories/QuestionRepository.ts

```

---

# Main API Endpoints

Example:

| Method | Endpoint | Purpose |

| ------ | ---------- | --------------- |

| GET | /questions | Get questions |

| POST | /questions | Create question |

---

# Main Service Functions

Example:

| Function | Purpose |

| ---------------- | -------------------- |

| createQuestion | Creates new question |

| allocateQuestion | Assigns expert |

---

# Database Collections / Tables Used

Example:

```text

questions

question_allocations

```

---

# External Services Used

Examples:

- OpenAI
- Firebase
- WhatsApp API
- LangGraph
- S3
- Push Notifications

If none:

```text

None

```

---

# Important Business Logic

Mention ONLY important rules.

Example:

```text

- Duplicate questions are rejected

- Only admin can reallocate

- Closed questions cannot be edited

```

---

# Possible Error Cases

Example:

```text

- Invalid question ID

- Duplicate question

- Expert not found

```

---

# Suggested Test Cases

Example:

```text

- create question successfully

- reject duplicate question

- get question by id

```

---

# Anything Risky / Important?

Optional.

Example:

```text

Uses cron-based allocation logic.

```

```

```

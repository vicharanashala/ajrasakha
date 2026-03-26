# AgriAI Q&A Semantic Search API

Semantic search over 6 600+ agricultural Q&A entries stored in MongoDB Atlas.  
Given a natural-language query, returns the top-N most relevant questions ranked by cosine similarity.

**Model:** `BAAI/bge-large-en` (1024-dimensional dense vectors)  
**Server:** FastAPI + Uvicorn on `http://100.100.108.13:8000`  
**Access:** Anyone connected to the same Tailscale network (`vicharanashala@`)

---

## Endpoints

### `POST /search`

Returns a **JSON array** of the top-k semantically relevant Q&A entries for a query.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Natural-language question or topic |
| `top_k` | integer | no | `5` | Number of results to return |

**Example request**

```bash
curl -X POST http://100.100.108.13:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "leaf curling problem in chilli", "top_k": 5}'
```

**Example response**

```json
[
  {
    "id": "69258d6e69c176608bf91def",
    "question": "What should I do for leaf fold (leaf curling) problem in Chilli crop?",
    "text": "Question: What should I do for leaf fold (leaf curling) problem in Chilli crop?\n\nanswer: Leaf curl in chilli is mainly caused by the Chilli Leaf Curl Virus...",
    "answer": "Leaf curl in chilli is mainly caused by the Chilli Leaf Curl Virus...",
    "details": {
      "state": "West Bengal",
      "district": "Kolkata",
      "crop": "Chilli",
      "season": "All year",
      "domain": "Crop Protection"
    },
    "status": "closed",
    "source": "AJRASAKHA",
    "score": 0.931
  },
  ...
]
```

**Response fields**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique MongoDB document ID |
| `question` | string | The original question — use as heading |
| `text` | string | Raw full Q&A (`Question: ...\n\nanswer: ...`) — both in one field |
| `answer` | string | Clean parsed answer only — use this for the response body |
| `details.state` | string | State (e.g. `"Punjab"`, `"West Bengal"`) |
| `details.district` | string | District name |
| `details.crop` | string | Crop name (e.g. `"Wheat"`, `"Chilli"`) |
| `details.season` | string | Season (`"Rabi"`, `"Kharif"`, `"All year"`) |
| `details.domain` | string | Category (`"Crop Protection"`, `"Disease"`, `"Fertilizer and Nutrient"`, `"Pest"`) |
| `status` | string | `"closed"` or `"open"` |
| `source` | string | Who answered — `"AGRI_EXPERT"` or `"AJRASAKHA"` |
| `score` | float | Cosine similarity (0–1). Higher = more relevant |

---

### Using the response (JavaScript)

```js
const results = await fetch("http://100.100.108.13:8000/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "leaf curl in chilli", top_k: 5 })
}).then(r => r.json());

// Display all Q&A
results.map(item => {
  console.log(item.question);  // question heading
  console.log(item.answer);    // answer body
  console.log(item.score);     // relevance score
});

// Filter by crop
const wheatOnly = results.filter(item => item.details.crop === "Wheat");

// Filter by domain
const pestOnly = results.filter(item => item.details.domain === "Pest");

// Filter by state
const punjabOnly = results.filter(item => item.details.state === "Punjab");

// Sort by score (already sorted by default, but if needed)
const sorted = [...results].sort((a, b) => b.score - a.score);
```

---

### `GET /health`

Quick liveness check.

```bash
curl http://100.100.108.13:8000/health
# {"status":"ok"}
```

---

## Interactive API docs

While the server is running, open in your browser:

- **Swagger UI** → http://100.100.108.13:8000/docs
- **ReDoc** → http://100.100.108.13:8000/redoc

---
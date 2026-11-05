# Step-by-Step PR Guide for AjraSakha Feedback

## Step 1: Fork the Repository

1. Go to: https://github.com/vicharanashala/ajrasakha
2. Click **Fork** (top right)
3. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/ajrasakha.git
cd ajrasakha
```

## Step 2: Create Feature Branch

```bash
git checkout -b feat/farmer-feedback-system
```

## Step 3: Add Backend Route

Create file: `backend/src/modules/feedback/routes.js`

Copy contents from:
`farmer-feedback/integration/backend/feedback/routes.js`

## Step 4: Add Frontend Component

Create file: `frontend/src/components/feedback/FeedbackButtons.jsx`

Copy contents from:
`farmer-feedback/integration/frontend/src/components/feedback/FeedbackButtons.jsx`

## Step 5: Add WhatsApp Integration

Create file: `whatsapp-integration/whatsapp-feedback.js`

Copy contents from:
`farmer-feedback/integration/whatsapp-integration/whatsapp-feedback.js`

## Step 6: Update Backend App

Edit `backend/src/app.js`:

Find (around line 15-20):
```javascript
const questionRoute = require('./modules/question/routes');
const answerRoute = require('./modules/answer/routes');
```

Add AFTER:
```javascript
const feedbackRouter = require('./modules/feedback/routes');
```

Find (around line 50-60):
```javascript
app.use('/api/questions', questionRoute);
app.use('/api/answers', answerRoute);
```

Add AFTER:
```javascript
app.use('/api/feedback', feedbackRouter);
```

## Step 7: Commit & Push

```bash
git add .
git commit -m "feat: Add farmer feedback collection system"
git push origin feat/farmer-feedback-system
```

## Step 8: Create PR

Go to: https://github.com/vicharanashala/ajrasakha

You should see a yellow banner: **"feat/farmer-feedback-system had recent pushes"** - Click **"Compare & pull request"**

## PR Template

**Title:**
```
feat: Add farmer feedback collection system
```

**Description:**
```markdown
## Summary
Adds farmer feedback collection system enabling:
- Feedback buttons after GDB answers (web platform)
- WhatsApp feedback integration
- Stats dashboard per entry/domain/language/state
- Auto-flagging of low-rated entries for expert review

## Changes
- backend/src/modules/feedback/routes.js - Feedback API endpoints
- frontend/src/components/feedback/FeedbackButtons.jsx - Feedback UI component
- whatsapp-integration/whatsapp-feedback.js - WhatsApp webhook integration
- backend/src/app.js - Added feedback routes

## Testing
```bash
# Test feedback submission
curl -X POST http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"gdb_entry_id":"test","farmer_id":"user","response":"1"}'

# Check stats
curl http://localhost:4000/api/feedback/stats/overview
```

## Screenshots
[Add screenshots of feedback buttons and dashboard]

Fixes #ISSUE_NUMBER
```

---

## Files Summary

| File to Create | Source |
|----------------|--------|
| `backend/src/modules/feedback/routes.js` | `integration/backend/feedback/routes.js` |
| `frontend/src/components/feedback/FeedbackButtons.jsx` | `integration/frontend/src/components/feedback/FeedbackButtons.jsx` |
| `whatsapp-integration/whatsapp-feedback.js` | `integration/whatsapp-integration/whatsapp-feedback.js` |

| File to Edit | Change |
|--------------|--------|
| `backend/src/app.js` | Add 2 lines (1 import, 1 route) |
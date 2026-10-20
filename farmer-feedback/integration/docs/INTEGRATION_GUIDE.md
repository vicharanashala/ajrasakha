# AjraSakha Feedback Integration Guide

## Overview

This module adds farmer feedback collection to the AjraSakha platform, enabling:

1. **Web Platform**: Feedback buttons after GDB answers
2. **WhatsApp**: Feedback requests after answer delivery
3. **Dashboard**: Stats on helpfulness per GDB entry, domain, language, state
4. **Auto-flagging**: Entries below threshold sent for review

## Files to Add

```
ajrasakha/
├── backend/
│   ├── src/
│   │   └── modules/
│   │       └── feedback/
│   │           ├── routes.js          # Feedback API endpoints
│   │           └── index.js           # Module export
│   └── src/
│       └── shared/
│           └── models/
│               └── Feedback.js        # Mongoose schema
├── frontend/
│   └── src/
│       └── components/
│           └── feedback/
│               ├── FeedbackButtons.jsx    # Reusable feedback buttons
│               └── FarmerChat.jsx         # Optional: full chat UI
└── mongodb/
    └── setup.js                         # Database setup script
```

## Integration Steps

### Step 1: MongoDB Setup

Run the setup script to create collections and indexes:

```bash
cd ajrasakha
node mongodb/setup.js
```

Or add indexes manually:

```javascript
// In your MongoDB shell or migration
db.feedbacks.createIndex({ gdb_entry_id: 1 });
db.feedbacks.createIndex({ timestamp: -1 });
db.feedbacks.createIndex({ domain: 1 });
db.feedbacks.createIndex({ response: 1 });
```

### Step 2: Add Backend Routes

Add to your Express app in `backend/src/app.js` or routes/index.js:

```javascript
const feedbackRouter = require('./modules/feedback/routes');

// Add to existing router
app.use('/api/feedback', feedbackRouter);
```

### Step 3: Add Feedback to Web Platform

**Option A: Add Feedback Buttons After Answers**

In your answer display component (where GDB answers are shown):

```javascript
import FeedbackButtons from '../components/feedback/FeedbackButtons';

// After the answer content
<Box>
  <Typography>{answer}</Typography>
  <FeedbackButtons
    gdbEntryId={entry.id}
    farmerId={user.id}
    domain={entry.domain}
    onFeedbackGiven={(isHelpful) => console.log('Feedback:', isHelpful)}
  />
</Box>
```

**Option B: Use Full Chat Interface**

```javascript
import FarmerChat from '../components/feedback/FarmerChat';

// In your chat page
<FarmerChat userId={user.id} />
```

### Step 4: WhatsApp Integration (LangGraph)

In your WhatsApp webhook handler (`/api/webhooks/whatsapp/send-message`):

```javascript
const {
  trackOutgoingMessage,
  handleFeedbackResponse,
  sendFeedbackRequest,
  isFeedbackResponse
} = require('./whatsapp-feedback');

// After sending answer
await trackOutgoingMessage({
  messageId: result.messageSid,
  gdbEntryId: gdbEntryId,
  farmerPhone: phoneNumber,
  domain: domain
});

// Send feedback request
await sendFeedbackRequest(phoneNumber, sendMessageFn);

// In your main webhook handler
app.post('/api/webhooks/whatsapp', async (req, res) => {
  const { Body, From } = req.body;

  if (isFeedbackResponse(Body)) {
    await handleFeedbackResponse({
      farmerPhone: From,
      response: Body,
      timestamp: new Date(),
      db: mongoose.connection.db
    });
  }
});
```

### Step 5: Add Environment Variables

```env
# Feedback thresholds
FEEDBACK_HELPFUL_THRESHOLD=60
FEEDBACK_MIN_RESPONSES=10
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/feedback` | Submit feedback |
| GET | `/api/feedback/:gdb_entry_id` | Get feedback for entry |
| GET | `/api/feedback/:gdb_entry_id/stats` | Get entry statistics |
| GET | `/api/feedback/stats/overview` | Get overall stats |
| GET | `/api/feedback/stats/breakdown/:field` | Breakdown by domain/language/state |
| GET | `/api/feedback/flagged` | Get entries needing review |
| GET | `/api/feedback/entries` | All entries with stats |

## Example API Usage

```javascript
// Submit feedback
fetch('/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gdb_entry_id: 'gdb_crop_disease_001',
    farmer_id: 'user_123',
    response: '1',
    domain: 'Crop Disease',
    source: 'web'
  })
});

// Get flagged entries
fetch('/api/feedback/flagged?threshold=60&min_responses=10')
```

## Response Format

All endpoints return:

```json
{
  "success": true,
  "data": { ... }
}
```

Errors:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Dashboard Integration

The feedback data can be visualized by querying:

```javascript
// Overall stats
GET /api/feedback/stats/overview

// Breakdown by domain
GET /api/feedback/stats/breakdown/domain

// Flagged entries for review
GET /api/feedback/flagged
```

## Testing

```bash
# Test feedback submission
curl -X POST http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "gdb_entry_id": "test_entry",
    "farmer_id": "test_farmer",
    "response": "1",
    "source": "web"
  }'

# Get stats
curl http://localhost:4000/api/feedback/stats/overview
```

## Notes

- `source` can be: `web`, `whatsapp`, or `chat`
- `response` must be: `1` (helpful) or `2` (not helpful)
- Auto-flagging runs when entry has ≥10 responses and <60% helpful
- WhatsApp feedback expires after 48 hours
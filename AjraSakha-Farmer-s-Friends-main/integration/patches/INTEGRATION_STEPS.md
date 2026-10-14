# AjraSakha Feedback Integration - File Copy Instructions

## Files to Copy

### 1. backend/src/modules/feedback/routes.js
```
COPY FROM: integration/patches/0001-backend-feedback-routes.patch reference
TO: ajrasakha/backend/src/modules/feedback/routes.js
```

### 2. frontend/src/components/feedback/FeedbackButtons.jsx
```
COPY FROM: integration/patches/0002-frontend-feedback-buttons.patch reference
TO: ajrasakakha/frontend/src/components/feedback/FeedbackButtons.jsx
```

### 3. whatsapp-integration/whatsapp-feedback.js
```
COPY FROM: integration/patches/0003-whatsapp-integration.patch reference
TO: ajrasakha/whatsapp-integration/whatsapp-feedback.js
```

## Changes to Existing Files

### backend/src/app.js

Find these lines:
```javascript
const questionRoute = require('./modules/question/routes');
const answerRoute = require('./modules/answer/routes');
```

Add AFTER:
```javascript
const feedbackRouter = require('./modules/feedback/routes');
```

Find these lines:
```javascript
app.use('/api/questions', questionRoute);
app.use('/api/answers', answerRoute);
```

Add AFTER:
```javascript
app.use('/api/feedback', feedbackRouter);
```

## Optional: Create WhatsApp Feedback Collection Index

Run in MongoDB shell:
```javascript
db.whatsapp_feedback_tracking.createIndex({ message_id: 1 }, { unique: true });
db.whatsapp_feedback_tracking.createIndex({ farmer_phone: 1 });
db.whatsapp_feedback_tracking.createIndex({ feedback_received: 1, expires_at: 1 });

db.feedbacks.createIndex({ gdb_entry_id: 1 });
db.feedbacks.createIndex({ timestamp: -1 });
db.feedbacks.createIndex({ response: 1 });
```

## Integration for WhatsApp (if existing WhatsApp integration exists)

In the WhatsApp send-message handler, after sending answer:

```javascript
const { trackOutgoingMessage, handleFeedbackResponse, isFeedbackResponse } = require('../whatsapp-integration/whatsapp-feedback');

// After successful message send
await trackOutgoingMessage({
  messageId: result.messageSid,
  gdbEntryId: gdbEntryId,
  farmerPhone: phoneNumber,
  db: mongoose.connection.db
});

// In webhook handler
app.post('/api/webhooks/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  if (isFeedbackResponse(Body)) {
    await handleFeedbackResponse({ farmerPhone: From, response: Body, db: mongoose.connection.db });
  }
});
```

## Testing After Integration

```bash
# Submit test feedback
curl -X POST http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "gdb_entry_id": "test_entry",
    "farmer_id": "test_user",
    "response": "1",
    "domain": "Test",
    "source": "web"
  }'

# Check overview
curl http://localhost:4000/api/feedback/stats/overview

# Check entries
curl http://localhost:4000/api/feedback/entries

# Check flagged
curl http://localhost:4000/api/feedback/flagged
```
# Pull Request Guide for AjraSakha Feedback Feature

## Overview

This PR adds a complete farmer feedback collection system to AjraSakha, enabling:

- Feedback collection from web platform and WhatsApp
- Statistics dashboard per GDB entry, domain, language, state
- Auto-flagging of low-rated entries for expert review
- Weekly digest of lowest-rated entries

## Branch Strategy

```
main
├── feature/
│   └── farmer-feedback  (THIS PR)
```

## Files to be Added

### Backend Additions

```
backend/src/modules/feedback/
├── routes.js       (NEW - Feedback API endpoints)
└── index.js        (NEW - Module exports)

backend/src/shared/models/
└── Feedback.js     (NEW - Mongoose schema)
```

### Frontend Additions

```
frontend/src/components/feedback/
├── FeedbackButtons.jsx    (NEW - Reusable feedback buttons)
└── FarmerChat.jsx         (NEW - Optional full chat UI)
```

### Database Setup

```
mongodb/
└── setup.js               (NEW - Collection/index setup)
```

## Integration Points

### Backend (`backend/src/app.js`)

Add import (after existing router imports):
```javascript
const feedbackRouter = require('./modules/feedback/routes');
```

Add route (after existing app.use lines):
```javascript
app.use('/api/feedback', feedbackRouter);
```

### WhatsApp Handler (if using existing WhatsApp integration)

Add feedback middleware to webhook:
```javascript
const { feedbackMiddleware } = require('./whatsapp-feedback');
app.use('/api/webhooks/whatsapp', feedbackMiddleware(db));
```

### Frontend - Answer Display

Add feedback buttons after answer text:
```javascript
import FeedbackButtons from '../components/feedback/FeedbackButtons';

// In answer display:
<FeedbackButtons
  gdbEntryId={entry.id}
  farmerId={user.id}
  domain={entry.domain}
/>
```

## PR Checklist

- [ ] Added feedback routes to backend
- [ ] Added Feedback model
- [ ] Added frontend components
- [ ] MongoDB indexes created
- [ ] Environment variables documented
- [ ] API documented
- [ ] Tested end-to-end flow

## Testing the Integration

```bash
# 1. Start the server
cd backend && npm start

# 2. Test feedback submission
curl -X POST http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "gdb_entry_id": "test_entry",
    "farmer_id": "test_user",
    "response": "1",
    "domain": "Test",
    "source": "web"
  }'

# 3. Check stats
curl http://localhost:4000/api/feedback/stats/overview

# 4. Check flagged
curl http://localhost:4000/api/feedback/flagged
```

## Screenshots

### Feedback Buttons (Web)
- Appear after each GDB answer
- "Was this helpful?" with Yes/No buttons
- Confirmation message after selection

### Dashboard View
- Overall helpfulness score
- Breakdown by domain/language/state
- Flagged entries queue

## Rollback Plan

If issues arise, this PR can be fully reverted with:
```bash
git revert <pr-branch>
```

No existing data structures are modified - only new collections/endpoints are added.

## Questions?

Contact: @your-username
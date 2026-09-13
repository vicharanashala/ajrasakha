# AjraSakha Feedback Integration Module

Add farmer feedback collection to AjraSakha with minimal changes.

## Quick Start

```bash
# 1. Setup MongoDB
node mongodb/setup.js

# 2. Add routes to backend (see docs/INTEGRATION_GUIDE.md)

# 3. Add components to frontend (see docs/INTEGRATION_GUIDE.md)
```

## What's Included

```
integration/
├── backend/
│   └── feedback/
│       └── routes.js         # Express router with all endpoints
├── frontend/
│   └── src/
│       └── components/
│           └── feedback/
│               ├── FeedbackButtons.jsx   # Reusable buttons
│               └── FarmerChat.jsx        # Full chat interface
├── mongodb/
│   └── setup.js              # Database setup
├── whatsapp-integration/
│   └── whatsapp-feedback.js  # WhatsApp webhook integration
└── docs/
    ├── INTEGRATION_GUIDE.md  # Full integration guide
    └── PR_GUIDE.md          # PR instructions
```

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/feedback` | Submit feedback |
| `GET /api/feedback/:id/stats` | Entry statistics |
| `GET /api/feedback/flagged` | Low-rated entries |
| `GET /api/feedback/stats/breakdown/:field` | By domain/language/state |

## Usage Example

```javascript
// Submit feedback
await fetch('/api/feedback', {
  method: 'POST',
  body: JSON.stringify({
    gdb_entry_id: 'gdb_crop_disease_001',
    farmer_id: 'user_123',
    response: '1',  // 1=helpful, 2=not helpful
    domain: 'Crop Disease'
  })
});
```

See `docs/INTEGRATION_GUIDE.md` for full instructions.
/**
 * WhatsApp Feedback Integration
 *
 * This module integrates with LangGraph's WhatsApp server.
 * It adds feedback collection after answer delivery.
 *
 * Integration: Add this to your existing WhatsApp webhook handler
 *
 * Flow:
 * 1. Farmer sends WhatsApp message
 * 2. LangGraph processes and returns answer
 * 3. This hook captures the answer and sends follow-up question
 * 4. Farmer replies with 1 or 2
 * 5. Feedback stored in MongoDB
 */

/**
 * Example integration with express:
 *
 * const feedbackRouter = require('./whatsapp-feedback');
 *
 * // After sending answer to farmer
 * app.post('/api/webhooks/whatsapp/send-message', async (req, res) => {
 *   // ... existing code to send message via LangGraph
 *
 *   // Add feedback tracking
 *   await feedbackRouter.trackOutgoingMessage({
 *     messageId: result.messageSid,
 *     gdbEntryId: req.body.gdb_entry_id,
 *     farmerPhone: req.body.phoneNumber,
 *     domain: req.body.domain
 *   });
 *
 *   // Add follow-up question
 *   await feedbackRouter.sendFeedbackRequest(req.body.phoneNumber);
 * });
 *
 * // Handle feedback responses (1 or 2)
 * app.post('/api/webhooks/whatsapp', async (req, res) => {
 *   const { Body, From } = req.body;
 *
 *   if (Body === '1' || Body === '2') {
 *     await feedbackRouter.handleFeedbackResponse({
 *       farmerPhone: From,
 *       response: Body,
 *       timestamp: new Date()
 *     });
 *   }
 * });
 */

const mongoose = require('mongoose');

const FEEDBACK_QUESTION = 'Was this helpful? Reply 1 for Yes, 2 for No';
const FEEDBACK_EXPIRY_HOURS = 48;

/**
 * Feedback tracking schema for WhatsApp conversations
 */
const whatsappFeedbackSchema = new mongoose.Schema({
  message_id: { type: String, required: true, index: true },
  gdb_entry_id: { type: String, required: true, index: true },
  farmer_phone: { type: String, required: true, index: true },
  domain: String,
  language: String,
  state: String,
  answer_sent_at: { type: Date, default: Date.now },
  feedback_received: { type: Boolean, default: false },
  feedback_response: { type: String, enum: ['1', '2', null], default: null },
  feedback_received_at: Date,
  expires_at: Date
});

const WhatsAppFeedback = mongoose.models.WhatsAppFeedback ||
  mongoose.model('WhatsAppFeedback', whatsappFeedbackSchema);

/**
 * Track outgoing message for feedback
 * Call this after sending an answer to a farmer
 */
async function trackOutgoingMessage({ messageId, gdbEntryId, farmerPhone, domain, language, state }) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + FEEDBACK_EXPIRY_HOURS);

  await WhatsAppFeedback.create({
    message_id: messageId,
    gdb_entry_id: gdbEntryId,
    farmer_phone: farmerPhone,
    domain,
    language,
    state,
    answer_sent_at: new Date(),
    expires_at: expiresAt
  });
}

/**
 * Get pending message for feedback
 * Returns the most recent unanswered feedback request for a farmer
 */
async function getPendingFeedback(farmerPhone) {
  return WhatsAppFeedback.findOne({
    farmer_phone: farmerPhone,
    feedback_received: false,
    expires_at: { $gt: new Date() }
  }).sort({ answer_sent_at: -1 });
}

/**
 * Handle feedback response from farmer
 * Call this when farmer replies with 1 or 2
 */
async function handleFeedbackResponse({ farmerPhone, response, timestamp, db }) {
  const pending = await getPendingFeedback(farmerPhone);

  if (!pending) {
    console.log('No pending feedback found for:', farmerPhone);
    return null;
  }

  // Update WhatsApp tracking
  pending.feedback_received = true;
  pending.feedback_response = response;
  pending.feedback_received_at = timestamp;
  await pending.save();

  // Store in main feedback collection
  const feedbackData = {
    gdb_entry_id: pending.gdb_entry_id,
    farmer_id: farmerPhone,
    message_id: pending.message_id,
    response: response,
    state: pending.state,
    language: pending.language,
    domain: pending.domain,
    source: 'whatsapp',
    timestamp: timestamp,
    status: 'captured'
  };

  // Insert into feedback collection
  if (db) {
    await db.collection('feedback').insertOne(feedbackData);
  }

  return {
    message_id: pending.message_id,
    gdb_entry_id: pending.gdb_entry_id,
    response: response
  };
}

/**
 * Send feedback request to farmer
 * This sends the "Was this helpful? Reply 1 for Yes, 2 for No" message
 *
 * Note: This requires access to the WhatsApp sending function
 * Pass sendMessage function to actually send the message
 */
async function sendFeedbackRequest(farmerPhone, sendMessageFn) {
  if (sendMessageFn) {
    await sendMessageFn(farmerPhone, FEEDBACK_QUESTION);
  }
  return FEEDBACK_QUESTION;
}

/**
 * Check if a message is a feedback response (1 or 2)
 */
function isFeedbackResponse(messageBody) {
  return messageBody === '1' || messageBody === '2';
}

/**
 * Get feedback statistics for WhatsApp
 */
async function getWhatsAppStats(db) {
  const stats = await db.collection('feedback').aggregate([
    { $match: { source: 'whatsapp' } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        helpful: { $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] } },
        not_helpful: { $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] } }
      }
    }
  ]).toArray();

  if (stats.length === 0) {
    return { total: 0, helpful: 0, not_helpful: 0, helpfulness_score: 0 };
  }

  const { total, helpful, not_helpful } = stats[0];
  return {
    total,
    helpful,
    not_helpful,
    helpfulness_score: Math.round((helpful / total) * 10000) / 100
  };
}

/**
 * Express middleware for WhatsApp feedback webhook
 * Use this to wrap existing WhatsApp webhook handlers
 *
 * Usage:
 * const feedbackMiddleware = require('./whatsapp-feedback/middleware');
 * app.use('/api/webhooks/whatsapp', feedbackMiddleware);
 */
function feedbackMiddleware(db) {
  return async (req, res, next) => {
    const { Body, From } = req.body || {};

    // Check if this is a feedback response
    if (Body && From && isFeedbackResponse(Body)) {
      try {
        const result = await handleFeedbackResponse({
          farmerPhone: From,
          response: Body,
          timestamp: new Date(),
          db
        });

        if (result) {
          console.log('WhatsApp feedback captured:', result);
        }
      } catch (error) {
        console.error('WhatsApp feedback error:', error);
      }
    }

    next();
  };
}

module.exports = {
  trackOutgoingMessage,
  getPendingFeedback,
  handleFeedbackResponse,
  sendFeedbackRequest,
  isFeedbackResponse,
  getWhatsAppStats,
  feedbackMiddleware,
  WhatsAppFeedback,
  FEEDBACK_QUESTION
};
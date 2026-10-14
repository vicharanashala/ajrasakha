const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

/**
 * Feedback Schema
 * Add this to your existing models or use standalone
 */
const feedbackSchema = new mongoose.Schema({
  gdb_entry_id: {
    type: String,
    required: true,
    index: true
  },
  farmer_id: {
    type: String,
    required: true,
    index: true
  },
  message_id: {
    type: String
  },
  response: {
    type: String,
    enum: ['1', '2'],
    required: true
  },
  state: String,
  language: String,
  domain: String,
  source: {
    type: String,
    enum: ['web', 'whatsapp', 'chat'],
    default: 'web'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['captured', 'flagged', 'reviewed'],
    default: 'captured'
  }
});

const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

/**
 * POST /api/feedback
 * Submit feedback for a GDB entry
 *
 * Body: {
 *   gdb_entry_id: string (required),
 *   farmer_id: string (required),
 *   message_id: string (optional),
 *   response: '1' | '2' (required),
 *   state: string (optional),
 *   language: string (optional),
 *   domain: string (optional),
 *   source: 'web' | 'whatsapp' | 'chat' (optional, default: 'web')
 * }
 */
router.post('/', async (req, res) => {
  try {
    const {
      gdb_entry_id,
      farmer_id,
      message_id,
      response,
      state,
      language,
      domain,
      source = 'web'
    } = req.body;

    if (!gdb_entry_id || !farmer_id || !response) {
      return res.status(400).json({
        success: false,
        message: 'gdb_entry_id, farmer_id, and response are required'
      });
    }

    if (!['1', '2'].includes(response)) {
      return res.status(400).json({
        success: false,
        message: 'Response must be "1" (helpful) or "2" (not helpful)'
      });
    }

    const feedback = new Feedback({
      gdb_entry_id,
      farmer_id,
      message_id,
      response,
      state,
      language,
      domain,
      source,
      timestamp: new Date(),
      status: 'captured'
    });

    await feedback.save();

    res.status(201).json({
      success: true,
      message: 'Feedback recorded successfully',
      data: {
        id: feedback._id,
        gdb_entry_id: feedback.gdb_entry_id,
        response: feedback.response,
        timestamp: feedback.timestamp
      }
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error recording feedback'
    });
  }
});

/**
 * GET /api/feedback/:gdb_entry_id
 * Get all feedback for a specific GDB entry
 */
router.get('/:gdb_entry_id', async (req, res) => {
  try {
    const { gdb_entry_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const feedbacks = await Feedback.find({ gdb_entry_id })
      .sort({ timestamp: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total = await Feedback.countDocuments({ gdb_entry_id });

    res.json({
      success: true,
      data: {
        gdb_entry_id,
        total,
        feedbacks
      }
    });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching feedback'
    });
  }
});

/**
 * GET /api/feedback/:gdb_entry_id/stats
 * Get statistics for a specific GDB entry
 */
router.get('/:gdb_entry_id/stats', async (req, res) => {
  try {
    const { gdb_entry_id } = req.params;

    const stats = await Feedback.aggregate([
      { $match: { gdb_entry_id } },
      {
        $group: {
          _id: '$gdb_entry_id',
          total_responses: { $sum: 1 },
          helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] }
          },
          not_helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] }
          },
          last_feedback_at: { $max: '$timestamp' }
        }
      },
      {
        $addFields: {
          helpfulness_score: {
            $cond: [
              { $gt: ['$total_responses', 0] },
              { $multiply: [{ $divide: ['$helpful_count', '$total_responses'] }, 100] },
              0
            ]
          }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No feedback found for this entry'
      });
    }

    res.json({
      success: true,
      data: {
        gdb_entry_id: stats[0]._id,
        total_responses: stats[0].total_responses,
        helpful_count: stats[0].helpful_count,
        not_helpful_count: stats[0].not_helpful_count,
        helpfulness_score: Math.round(stats[0].helpfulness_score * 100) / 100,
        last_feedback_at: stats[0].last_feedback_at
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching stats'
    });
  }
});

/**
 * GET /api/feedback/stats/overview
 * Get overall feedback statistics
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          total_feedback: { $sum: 1 },
          helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] }
          },
          not_helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] }
          }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({
        success: true,
        data: {
          total_feedback: 0,
          helpful_count: 0,
          not_helpful_count: 0,
          helpfulness_score: 0
        }
      });
    }

    const { total_feedback, helpful_count, not_helpful_count } = stats[0];

    res.json({
      success: true,
      data: {
        total_feedback,
        helpful_count,
        not_helpful_count,
        helpfulness_score: Math.round((helpful_count / total_feedback) * 10000) / 100
      }
    });
  } catch (error) {
    console.error('Overview stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching overview'
    });
  }
});

/**
 * GET /api/feedback/stats/breakdown/:field
 * Get breakdown by domain, language, state, or source
 * Example: /api/feedback/stats/breakdown/domain
 */
router.get('/stats/breakdown/:field', async (req, res) => {
  try {
    const { field } = req.params;
    const validFields = ['domain', 'language', 'state', 'source'];

    if (!validFields.includes(field)) {
      return res.status(400).json({
        success: false,
        message: `Invalid field. Must be one of: ${validFields.join(', ')}`
      });
    }

    const breakdown = await Feedback.aggregate([
      { $match: { [field]: { $ne: null } } },
      {
        $group: {
          _id: `$${field}`,
          total: { $sum: 1 },
          helpful: {
            $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] }
          },
          not_helpful: {
            $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          helpfulness_score: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$helpful', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({
      success: true,
      data: breakdown.map(item => ({
        [field]: item._id,
        total_responses: item.total,
        helpful_count: item.helpful,
        not_helpful_count: item.not_helpful,
        helpfulness_score: Math.round(item.helpfulness_score * 100) / 100
      }))
    });
  } catch (error) {
    console.error('Breakdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching breakdown'
    });
  }
});

/**
 * GET /api/feedback/flagged
 * Get entries that need review (low helpfulness, 10+ responses, <60%)
 */
router.get('/flagged', async (req, res) => {
  try {
    const { threshold = 60, min_responses = 10 } = req.query;

    const pipeline = [
      {
        $group: {
          _id: '$gdb_entry_id',
          total_responses: { $sum: 1 },
          helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] }
          },
          not_helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] }
          },
          domain: { $first: '$domain' },
          language: { $first: '$language' },
          last_feedback_at: { $max: '$timestamp' }
        }
      },
      {
        $addFields: {
          helpfulness_score: {
            $cond: [
              { $gt: ['$total_responses', 0] },
              { $multiply: [{ $divide: ['$helpful_count', '$total_responses'] }, 100] },
              0
            ]
          },
          priority_score: {
            $subtract: [
              100,
              {
                $cond: [
                  { $gt: ['$total_responses', 0] },
                  { $multiply: [{ $divide: ['$helpful_count', '$total_responses'] }, 100] },
                  0
                ]
              }
            ]
          }
        }
      },
      {
        $match: {
          total_responses: { $gte: parseInt(min_responses) },
          helpfulness_score: { $lt: parseInt(threshold) }
        }
      },
      { $sort: { priority_score: -1 } }
    ];

    const flagged = await Feedback.aggregate(pipeline);

    res.json({
      success: true,
      data: flagged.map(item => ({
        gdb_entry_id: item._id,
        domain: item.domain,
        language: item.language,
        total_responses: item.total_responses,
        helpful_count: item.helpful_count,
        not_helpful_count: item.not_helpful_count,
        helpfulness_score: Math.round(item.helpfulness_score * 100) / 100,
        priority_score: Math.round(item.priority_score * 100) / 100,
        status: 'flagged',
        last_feedback_at: item.last_feedback_at
      }))
    });
  } catch (error) {
    console.error('Flagged error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching flagged entries'
    });
  }
});

/**
 * GET /api/feedback/entries
 * Get all GDB entries with feedback statistics
 */
router.get('/entries', async (req, res) => {
  try {
    const { domain, language, state, sort_by = 'helpfulness_score', order = 'asc', limit = 50, offset = 0 } = req.query;

    const matchStage = {};
    if (domain) matchStage.domain = domain;
    if (language) matchStage.language = language;
    if (state) matchStage.state = state;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$gdb_entry_id',
          total_responses: { $sum: 1 },
          helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] }
          },
          not_helpful_count: {
            $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] }
          },
          domain: { $first: '$domain' },
          language: { $first: '$language' },
          state: { $first: '$state' },
          last_feedback_at: { $max: '$timestamp' }
        }
      },
      {
        $addFields: {
          helpfulness_score: {
            $cond: [
              { $gt: ['$total_responses', 0] },
              { $multiply: [{ $divide: ['$helpful_count', '$total_responses'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { [sort_by]: order === 'desc' ? -1 : 1 }
      },
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ];

    const entries = await Feedback.aggregate(pipeline);

    res.json({
      success: true,
      data: entries.map(item => ({
        gdb_entry_id: item._id,
        domain: item.domain,
        language: item.language,
        state: item.state,
        total_responses: item.total_responses,
        helpful_count: item.helpful_count,
        not_helpful_count: item.not_helpful_count,
        helpfulness_score: Math.round(item.helpfulness_score * 100) / 100,
        last_feedback_at: item.last_feedback_at
      }))
    });
  } catch (error) {
    console.error('Entries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching entries'
    });
  }
});

module.exports = router;
module.exports.Feedback = Feedback;
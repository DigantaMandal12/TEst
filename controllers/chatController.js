const { CAMPUS_PICKUP_LOCATIONS } = require('../config/pickupConfig');
const { generateAssistantReply, getAIObservabilityMetrics } = require('../services/aiService');

function index(req, res) {
  res.render('chat/index', {
    pageTitle: 'Campus AI Hardware Assistant',
    locations: CAMPUS_PICKUP_LOCATIONS
  });
}

async function sendMessage(req, res, next) {
  try {
    const rawMessage = (req.body && req.body.message) || '';
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message content cannot be empty.'
      });
    }

    // Input Flood & Cost Control Defense: Capped at 2,000 characters
    if (rawMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Prompt exceeds maximum allowed length of 2,000 characters.'
      });
    }

    // Data Minimization: Pass only essential context; exclude database IDs and credentials
    const currentUserId = req.session && req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userContext = req.session && req.session.user ? {
      userId: currentUserId, // Used strictly server-side for internal tool lookup
      name: req.session.user.name,
      role: req.session.user.role,
      department: req.session.user.department,
      trustScore: req.session.user.trustScore
    } : null;

    const reply = await generateAssistantReply(rawMessage, userContext);

    res.json({
      success: true,
      reply
    });
  } catch (err) {
    console.error('[CHAT ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred while processing your request. Please try again later.'
    });
  }
}

// Observability metrics endpoint for admin oversight
function getMetrics(req, res) {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access denied.' });
  }
  res.json({ success: true, metrics: getAIObservabilityMetrics() });
}

module.exports = {
  index,
  sendMessage,
  getMetrics
};

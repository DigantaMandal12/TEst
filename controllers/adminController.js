const Equipment = require('../models/Equipment');
const BorrowRequest = require('../models/BorrowRequest');
const User = require('../models/User');
const metricsService = require('../services/metricsService');
const { getAIObservabilityMetrics } = require('../services/aiService');

const CATEGORIES = [
  'Mechanical',
  'Civil',
  'Electrical',
  'Survey',
  'Other Engineering Equipment'
];

async function index(req, res, next) {
  try {
    const equipment = await Equipment.find().populate('owner');
    const users = await User.find();
    const activeLoans = await BorrowRequest.find({
      status: { $in: ['pending', 'approved', 'active'] }
    }).populate('equipment').populate('borrower');

    const stats = {
      totalEquipment: equipment.length,
      availableEquipment: equipment.filter(e => e.status === 'available').length,
      activeLoans: activeLoans.length,
      totalUsers: users.length,
      avgTrustScore: Math.round(users.reduce((acc, u) => acc + (u.trustScore || 85), 0) / (users.length || 1))
    };

    const categoryBreakdown = {};
    for (const cat of CATEGORIES) {
      categoryBreakdown[cat] = equipment.filter(e => e.category === cat).length;
    }

    const operationalMetrics = metricsService.getSnapshot(getAIObservabilityMetrics());

    res.render('admin/index', {
      pageTitle: 'Campus Administrator Dashboard',
      stats,
      equipment,
      users,
      activeLoans,
      categories: CATEGORIES,
      categoryBreakdown,
      metrics: operationalMetrics
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  index
};

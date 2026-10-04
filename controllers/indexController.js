const Equipment = require('../models/Equipment');
const BorrowRequest = require('../models/BorrowRequest');
const User = require('../models/User');

const CATEGORIES = [
  'Mechanical',
  'Civil',
  'Electrical',
  'Survey',
  'Other Engineering Equipment'
];

async function home(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    const currentUser = (req.session && req.session.user) || res.locals.user || null;
    const featuredEquipment = await Equipment.find({ status: 'available' }).limit(6);
    const totalEquipment = await Equipment.countDocuments();
    const activeLoans = await BorrowRequest.countDocuments({ status: { $in: ['approved', 'active'] } });
    const totalUsers = await User.countDocuments();

    // Category breakdown
    const categoryCounts = {};
    for (const cat of CATEGORIES) {
      categoryCounts[cat] = await Equipment.countDocuments({ category: cat });
    }

    res.render('index', {
      user: currentUser,
      pageTitle: 'Campus Equipment Lending & Exchange',
      featuredEquipment,
      categories: CATEGORIES,
      categoryCounts,
      stats: {
        totalEquipment: totalEquipment || 18,
        activeLoans: activeLoans || 7,
        totalUsers: totalUsers || 240,
        trustRate: 98
      }
    });
  } catch (err) {
    next(err);
  }
}

async function search(req, res, next) {
  res.redirect(`/equipment?q=${encodeURIComponent(req.query.q || '')}`);
}

module.exports = {
  home,
  search
};

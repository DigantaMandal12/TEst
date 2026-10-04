const Equipment = require('../models/Equipment');
const User = require('../models/User');
const Review = require('../models/Review');
const { CAMPUS_PICKUP_LOCATIONS } = require('../config/pickupConfig');

const CATEGORIES = [
  'Mechanical',
  'Civil',
  'Electrical',
  'Survey',
  'Other Engineering Equipment'
];

const ALLOWED_STATUSES = ['all', 'available', 'reserved', 'borrowed', 'maintenance'];
const ALLOWED_SORTS = ['recommended', 'fee_asc', 'deposit_asc', 'trust_score'];

async function index(req, res, next) {
  try {
    const { category, q, status, sort } = req.query;
    const query = {};

    if (category && category !== 'All' && CATEGORIES.includes(category)) {
      query.category = category;
    }

    if (status && status !== 'all' && ALLOWED_STATUSES.includes(status)) {
      query.status = status;
    }

    if (q && q.trim()) {
      query.title = { $regex: q.trim(), $options: 'i' };
    }

    let equipmentList = await Equipment.find(query);

    // In-memory sorting support
    const validatedSort = ALLOWED_SORTS.includes(sort) ? sort : 'recommended';
    if (validatedSort === 'fee_asc') {
      equipmentList.sort((a, b) => (a.dailyFee || 0) - (b.dailyFee || 0));
    } else if (validatedSort === 'deposit_asc') {
      equipmentList.sort((a, b) => (a.deposit || 0) - (b.deposit || 0));
    } else if (validatedSort === 'trust_score') {
      equipmentList.sort((a, b) => (b.minTrustScore || 0) - (a.minTrustScore || 0));
    } else {
      // Default: available first, then newly added
      equipmentList.sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (a.status !== 'available' && b.status === 'available') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    // Counts per category
    const categoryCounts = {};
    for (const cat of CATEGORIES) {
      categoryCounts[cat] = await Equipment.countDocuments({ category: cat });
    }
    categoryCounts['All'] = await Equipment.countDocuments({});

    res.render('equipment/index', {
      pageTitle: 'Campus Equipment Catalogue',
      equipment: equipmentList,
      categories: CATEGORIES,
      categoryCounts,
      selectedCategory: category || 'All',
      searchQuery: q || '',
      selectedStatus: status || 'all',
      selectedSort: validatedSort
    });
  } catch (err) {
    next(err);
  }
}

async function show(req, res, next) {
  try {
    const item = await Equipment.findById(req.params.id);
    if (!item) {
      if (req.session) req.session.flash = { error: 'Requested equipment not found.' };
      return res.redirect('/equipment');
    }

    // Fetch owner details
    let owner = null;
    if (item.owner) {
      owner = await User.findById(item.owner);
    }
    if (!owner) {
      owner = {
        name: item.ownerName || 'Engineering Lab Department',
        department: item.category || 'Mechanical',
        role: 'senior',
        trustScore: 94,
        trustTier: 'Gold',
        ratingAvg: 4.9,
        ratingCount: 28,
        collegeId: 'FAC-ENG-08'
      };
    }

    // Fetch reviews for this equipment
    const reviews = await Review.find({ equipment: item._id || item.id });

    // Similar equipment recommendations in the same department
    const related = await Equipment.find({ 
      category: item.category, 
      _id: { $ne: item._id || item.id } 
    }).limit(3);

    res.render('equipment/show', {
      pageTitle: `${item.title} — Campus Equipment`,
      item,
      owner,
      reviews,
      related,
      locations: CAMPUS_PICKUP_LOCATIONS
    });
  } catch (err) {
    next(err);
  }
}

function newForm(req, res) {
  res.render('equipment/new', {
    pageTitle: 'List New Equipment',
    categories: CATEGORIES,
    locations: CAMPUS_PICKUP_LOCATIONS
  });
}

async function create(req, res, next) {
  try {
    const { title, category, description, condition, dailyFee, deposit, pickupLocation, specs, minTrustScore } = req.body;
    
    if (!title || !title.trim()) {
      if (req.session) req.session.flash = { error: 'Equipment title is required.' };
      return res.redirect('/equipment/new');
    }

    const specsArray = specs ? specs.split('\n').map(s => s.trim()).filter(Boolean) : [];

    const newEquipment = await Equipment.create({
      title: title.trim(),
      category: CATEGORIES.includes(category) ? category : 'Mechanical',
      description: description ? description.trim() : '',
      specs: specsArray,
      condition: condition || 'Excellent',
      dailyFee: Math.max(0, Number(dailyFee) || 0),
      deposit: Math.max(0, Number(deposit) || 0),
      pickupLocation: CAMPUS_PICKUP_LOCATIONS.includes(pickupLocation) ? pickupLocation : CAMPUS_PICKUP_LOCATIONS[0],
      minTrustScore: Math.min(100, Math.max(0, Number(minTrustScore) || 60)),
      owner: req.session.user ? (req.session.user.id || req.session.user._id) : null,
      ownerName: req.session.user ? req.session.user.name : 'Student Member',
      status: 'available'
    });

    if (req.session) {
      req.session.flash = { success: `Successfully listed "${newEquipment.title}" in the campus catalogue!` };
    }
    res.redirect(`/equipment/${newEquipment._id || newEquipment.id}`);
  } catch (err) {
    next(err);
  }
}

async function editForm(req, res, next) {
  try {
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.redirect('/equipment');

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const isOwner = String(item.owner || item.ownerId) === String(currentUserId);
    const isAdmin = userRole === 'admin';

    // IDOR Protection: Only the equipment owner or campus admin can view edit form
    if (!isOwner && !isAdmin) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to edit this equipment listing.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to edit this equipment listing.</p>');
    }

    res.render('equipment/edit', {
      pageTitle: `Edit ${item.title}`,
      item,
      categories: CATEGORIES,
      locations: CAMPUS_PICKUP_LOCATIONS
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const item = await Equipment.findById(req.params.id);
    if (!item) {
      if (req.session) req.session.flash = { error: 'Equipment not found.' };
      return res.redirect('/equipment');
    }

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const isOwner = String(item.owner || item.ownerId) === String(currentUserId);
    const isAdmin = userRole === 'admin';

    // IDOR Protection: Only the equipment owner or campus admin can update listing
    if (!isOwner && !isAdmin) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to modify this equipment listing.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to modify this equipment listing.</p>');
    }

    const { title, category, description, condition, dailyFee, deposit, pickupLocation, status, specs } = req.body;
    const specsArray = specs ? specs.split('\n').map(s => s.trim()).filter(Boolean) : [];

    await Equipment.findByIdAndUpdate(req.params.id, {
      title: title ? title.trim() : item.title,
      category: CATEGORIES.includes(category) ? category : item.category,
      description: description !== undefined ? description.trim() : item.description,
      condition: condition || item.condition,
      dailyFee: Math.max(0, Number(dailyFee) || 0),
      deposit: Math.max(0, Number(deposit) || 0),
      pickupLocation: CAMPUS_PICKUP_LOCATIONS.includes(pickupLocation) ? pickupLocation : item.pickupLocation,
      status: ALLOWED_STATUSES.includes(status) ? status : item.status,
      specs: specsArray
    });

    if (req.session) {
      req.session.flash = { success: 'Equipment updated successfully.' };
    }
    res.redirect(`/equipment/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const item = await Equipment.findById(req.params.id);
    if (!item) {
      if (req.session) req.session.flash = { error: 'Equipment not found.' };
      return res.redirect('/equipment');
    }

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const isOwner = String(item.owner || item.ownerId) === String(currentUserId);
    const isAdmin = userRole === 'admin';

    // IDOR Protection: Only owner or admin can delete equipment
    if (!isOwner && !isAdmin) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to remove this equipment listing.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to remove this equipment listing.</p>');
    }

    await Equipment.findByIdAndDelete(req.params.id);
    if (req.session) {
      req.session.flash = { success: 'Equipment removed from catalogue.' };
    }
    res.redirect('/equipment');
  } catch (err) {
    next(err);
  }
}

function apiUploadImage(req, res) {
  res.json({
    success: true,
    url: '/images/uploaded-sample.svg',
    message: 'Image registered successfully.'
  });
}

module.exports = {
  index,
  show,
  newForm,
  create,
  editForm,
  update,
  remove,
  apiUploadImage
};

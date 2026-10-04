const Notification = require('../models/Notification');

async function index(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    let notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });

    // Seed mock initial notifications if none exist for realistic rich UI
    if (!notifications || notifications.length === 0) {
      notifications = await Notification.create([
        {
          user: userId,
          title: '🔔 YOUR PRODUCT IS READY',
          message: 'Your order is ready for pickup.\n\nProduct:\nMini Drafter\n\n📍 Central Library - Circulation Desk\n\n📅 12 October 2026\n\n⏰ 2:00 PM – 2:30 PM\n\nOrder:\n#ORD-10245\n\nPlease bring your College ID.',
          link: '/borrow/my-loans',
          category: 'pickup',
          read: false
        },
        {
          user: userId,
          title: '🔔 NEW ORDER',
          message: 'You received a new order.\n\nProduct:\nScientific Calculator\n\nBuyer:\nRahul Das\n\nOrder:\n#ORD-94812\n\nPayment:\n✅ PAID\n\nPickup Location:\nElectrical Lab - Room 304\n\nPickup Date:\n10 October 2026\n\nPickup Time:\n2:30 PM – 3:00 PM',
          link: '/borrow/lender',
          category: 'order',
          read: false
        },
        {
          user: userId,
          title: '🌟 Trust Score Increased',
          message: 'Your Trust Score rose to 92 (Tier: Gold) following on-time return verification.',
          link: '/users/profile',
          category: 'alert',
          read: true
        }
      ]);
    }

    res.render('notifications/index', {
      pageTitle: 'Campus Activity & Notifications',
      notifications
    });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const notif = await Notification.findById(req.params.id);

    // IDOR Protection: Verify notification ownership before modifying
    if (notif && String(notif.user || notif.userId) === String(userId)) {
      await Notification.findByIdAndUpdate(req.params.id, { read: true });
    }

    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const notifs = await Notification.find({ user: userId });
    for (const n of notifs) {
      await Notification.findByIdAndUpdate(n._id || n.id, { read: true });
    }
    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  index,
  markRead,
  markAllRead
};

const CAMPUS_PICKUP_LOCATIONS = [
  'Electrical Lab - Room 304',
  'Computer Lab - Tech Block 2nd Floor',
  'Central Library - Circulation Desk',
  'Main Gate - Security Post 1',
  'Department Office - Admin Block Room 102',
  'College Office - Ground Floor Help Desk',
  'Mechanical Workshop - Bay 4',
  'Science Faculty Building - Foyer'
];

const STANDARD_PICKUP_SLOTS = [
  { id: 'slot-1000-1030', label: '10:00 AM – 10:30 AM', start: '10:00', end: '10:30' },
  { id: 'slot-1100-1130', label: '11:00 AM – 11:30 AM', start: '11:00', end: '11:30' },
  { id: 'slot-1300-1330', label: '1:00 PM – 1:30 PM', start: '13:00', end: '13:30' },
  { id: 'slot-1400-1430', label: '2:00 PM – 2:30 PM', start: '14:00', end: '14:30' },
  { id: 'slot-1430-1500', label: '2:30 PM – 3:00 PM', start: '14:30', end: '15:00' },
  { id: 'slot-1500-1530', label: '3:00 PM – 3:30 PM', start: '15:00', end: '15:30' },
  { id: 'slot-1600-1630', label: '4:00 PM – 4:30 PM', start: '16:00', end: '16:30' }
];

function getAvailablePickupDates(daysAhead = 7) {
  const result = [];
  const base = new Date();
  
  for (let i = 0; i <= daysAhead; i++) {
    // Generate date at local noon to avoid DST/timezone edge-shift
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12, 0, 0);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    // new Date('YYYY-MM-DD') evaluates in UTC in Node.js
    const checkDate = new Date(dateString);
    const dayOfWeek = checkDate.getDay();
    const isSunday = dayOfWeek === 0;

    const formatted = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    result.push({
      dateString,
      formatted,
      isAvailable: !isSunday,
      statusLabel: isSunday ? 'NOT AVAILABLE' : 'AVAILABLE'
    });
  }

  return result;
}

function generateOrderNumber() {
  return `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
}

function getSellerOrderNotification(order) {
  const productTitle = (order.equipment && order.equipment.title) || order.productTitle || 'Item';
  const buyerName = (order.borrower && order.borrower.name) || order.buyerName || 'Student';
  const orderNum = order.orderNumber || order.id || 'N/A';
  const location = order.pickupLocation || 'Campus Office';
  const dateStr = order.pickupDateStr || (order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Scheduled Date');
  const timeStr = order.pickupTime || 'Standard Hours';

  return {
    title: '🔔 NEW ORDER',
    message: `You received a new order.\n\nProduct:\n${productTitle}\n\nBuyer:\n${buyerName}\n\nOrder:\n#${orderNum}\n\nPayment:\n✅ PAID\n\nPickup Location:\n${location}\n\nPickup Date:\n${dateStr}\n\nPickup Time:\n${timeStr}`
  };
}

function getBuyerReadyNotification(order) {
  const productTitle = (order.equipment && order.equipment.title) || order.productTitle || 'Item';
  const orderNum = order.orderNumber || order.id || 'N/A';
  const location = order.pickupLocation || 'Campus Office';
  const dateStr = order.pickupDateStr || (order.pickupDate ? new Date(order.pickupDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Scheduled Date');
  const timeStr = order.pickupTime || 'Standard Hours';

  return {
    title: '🔔 YOUR PRODUCT IS READY',
    message: `Your order is ready for pickup.\n\nProduct:\n${productTitle}\n\n📍 ${location}\n\n📅 ${dateStr}\n\n⏰ ${timeStr}\n\nOrder:\n#${orderNum}\n\nPlease bring your College ID.`
  };
}

function isSlotAvailable(date, slotId, bookedOrders = []) {
  return !bookedOrders.some(b => {
    const bDate = b.date || (b.pickupDate ? (typeof b.pickupDate === 'string' ? b.pickupDate : b.pickupDate.toISOString().split('T')[0]) : null);
    const bSlot = b.slotId || b.pickupSlotId;
    return bDate === date && bSlot === slotId;
  });
}

module.exports = {
  CAMPUS_PICKUP_LOCATIONS,
  STANDARD_PICKUP_SLOTS,
  getAvailablePickupDates,
  generateOrderNumber,
  getSellerOrderNotification,
  getBuyerReadyNotification,
  isSlotAvailable
};

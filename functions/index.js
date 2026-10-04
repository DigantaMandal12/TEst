/**
 * Firebase Cloud Functions Suite
 * Handles trusted server-side business operations and optional HTTPS Express routing.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');
const { getBuyerReadyNotification } = require('../config/pickupConfig');
const app = require('../app');

const db = getFirestore();

/**
 * Trusted Function: Process Senior Approval & Issue Buyer Notification
 */
async function approveBorrowRequest(orderId, seniorUid) {
  return await db.runTransaction(async (tx) => {
    const orderRef = db.collection('borrowRequests').doc(orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const orderData = orderSnap.data();
    if (orderData.status !== 'pending') {
      throw new Error(`Order ${orderId} is not in pending state.`);
    }

    // 1. Mark order approved
    tx.update(orderRef, {
      status: 'approved',
      approvedBy: seniorUid,
      approvedAt: FieldValue.serverTimestamp()
    });

    // 2. Mark equipment reserved
    if (orderData.equipmentId) {
      const equipRef = db.collection('equipment').doc(orderData.equipmentId);
      tx.update(equipRef, { status: 'reserved' });
    }

    // 3. Generate Buyer Notification
    const notifRef = db.collection('notifications').doc();
    const readyMessage = getBuyerReadyNotification({
      borrower: { name: orderData.borrowerName || 'Student' },
      orderNumber: orderData.orderNumber || orderId,
      equipment: { title: orderData.equipmentTitle || 'Equipment' },
      pickupLocation: orderData.pickupLocation,
      pickupDateStr: orderData.pickupDateStr,
      pickupTime: orderData.pickupTime
    });

    tx.set(notifRef, {
      userId: orderData.borrowerId,
      title: '🔔 YOUR PRODUCT IS READY',
      message: readyMessage,
      link: '/borrow/my-loans',
      read: false,
      category: 'order',
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, orderId, status: 'approved' };
  });
}

/**
 * Trusted Function: Verify Return, Refund Deposit & Calculate Trust Score
 */
async function verifyEquipmentReturn(orderId, inspectorUid, conditionNote = 'Clean and working') {
  return await db.runTransaction(async (tx) => {
    const orderRef = db.collection('borrowRequests').doc(orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new Error(`Order ${orderId} not found.`);

    const orderData = orderSnap.data();

    // 1. Update order status
    tx.update(orderRef, {
      status: 'returned',
      depositRefunded: true,
      conditionAtReturn: conditionNote,
      inspectedBy: inspectorUid,
      actualReturnDate: FieldValue.serverTimestamp()
    });

    // 2. Release equipment back to inventory
    if (orderData.equipmentId) {
      const equipRef = db.collection('equipment').doc(orderData.equipmentId);
      tx.update(equipRef, { status: 'available' });
    }

    // 3. Boost Borrower Trust Score (+2 points for timely clean return, capped at 100)
    if (orderData.borrowerId) {
      const userRef = db.collection('users').doc(orderData.borrowerId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists) {
        const currentScore = userSnap.data().trustScore || 85;
        const newScore = Math.min(100, currentScore + 2);
        const trustTier = newScore >= 90 ? 'Gold' : (newScore >= 75 ? 'Silver' : (newScore >= 60 ? 'Bronze' : 'New Member'));
        tx.update(userRef, {
          trustScore: newScore,
          trustTier,
          totalBorrowed: (userSnap.data().totalBorrowed || 0) + 1
        });
      }
    }

    return { success: true, orderId, status: 'returned' };
  });
}

// Export Express app as standard HTTPS cloud function entrypoint
const api = (req, res) => app(req, res);

module.exports = {
  approveBorrowRequest,
  verifyEquipmentReturn,
  api
};

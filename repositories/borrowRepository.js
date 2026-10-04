/**
 * Borrow Request Repository (Cloud Firestore)
 * Encapsulates order management and atomic slot collision prevention via Cloud Firestore transactions.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');

const db = getFirestore();
const COLLECTION = 'borrowRequests';

class BorrowRepository {
  async find(filters = {}) {
    let q = db.collection(COLLECTION);

    if (filters.status) {
      if (typeof filters.status === 'object' && filters.status.$in) {
        q = q.where('status', 'in', filters.status.$in);
      } else {
        q = q.where('status', '==', filters.status);
      }
    }

    if (filters.pickupDate) {
      q = q.where('pickupDate', '==', filters.pickupDate);
    }

    if (filters.borrower) {
      const bId = typeof filters.borrower === 'object' && filters.borrower._id ? filters.borrower._id.toString() : filters.borrower.toString();
      q = q.where('borrowerId', '==', bId);
    }

    if (filters.equipment) {
      const eqId = typeof filters.equipment === 'object' && filters.equipment._id ? filters.equipment._id.toString() : filters.equipment.toString();
      q = q.where('equipmentId', '==', eqId);
    }

    const snap = await q.get();
    return snap.docs.map(d => {
      const data = d.data();
      data.equipment = data.equipmentId;
      data.borrower = data.borrowerId;
      data.lender = data.lenderId;
      return data;
    });
  }

  async findOne(filters = {}) {
    const list = await this.find(filters);
    return list.length > 0 ? list[0] : null;
  }

  async count(filters = {}) {
    const list = await this.find(filters);
    return list.length;
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const snap = await db.collection(COLLECTION).doc(cleanId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    data.equipment = data.equipmentId;
    data.borrower = data.borrowerId;
    data.lender = data.lenderId;
    return data;
  }

  async create(data) {
    const orderNumber = data.orderNumber || ('ORD-' + Math.floor(10000 + Math.random() * 90000));
    const docId = data.id || orderNumber;
    const record = {
      ...data,
      id: docId,
      _id: docId,
      orderNumber,
      equipmentId: data.equipment ? (data.equipment._id || data.equipment).toString() : null,
      borrowerId: data.borrower ? (data.borrower._id || data.borrower).toString() : null,
      lenderId: data.lender ? (data.lender._id || data.lender).toString() : null,
      status: data.status || 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection(COLLECTION).doc(docId).set(record);
    record.equipment = record.equipmentId;
    record.borrower = record.borrowerId;
    record.lender = record.lenderId;
    return record;
  }

  async update(id, data) {
    if (!id) return null;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const docRef = db.collection(COLLECTION).doc(cleanId);

    const updatePayload = {
      ...data,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (data.equipment) updatePayload.equipmentId = (data.equipment._id || data.equipment).toString();
    if (data.borrower) updatePayload.borrowerId = (data.borrower._id || data.borrower).toString();
    if (data.lender) updatePayload.lenderId = (data.lender._id || data.lender).toString();

    await docRef.update(updatePayload);
    const snap = await docRef.get();
    const updated = snap.data();
    if (updated) {
      updated.equipment = updated.equipmentId;
      updated.borrower = updated.borrowerId;
      updated.lender = updated.lenderId;
    }
    return updated;
  }

  async delete(id) {
    if (!id) return false;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    await db.collection(COLLECTION).doc(cleanId).delete();
    return true;
  }

  /**
   * Atomic Transactional Reservation
   * Prevents two concurrent users from reserving the exact same pickup date and time slot.
   */
  async reserveSlotAtomic(requestData) {
    return await db.runTransaction(async (tx) => {
      const existingQuery = db.collection(COLLECTION)
        .where('pickupDate', '==', requestData.pickupDate)
        .where('pickupSlotId', '==', requestData.pickupSlotId)
        .where('status', 'in', ['pending', 'approved', 'active']);

      const existingSnap = await tx.get(existingQuery);
      if (!existingSnap.empty) {
        throw new Error('COLLISION_DETECTED: Selected pickup slot was just booked by another student.');
      }

      const orderNumber = requestData.orderNumber || ('ORD-' + Math.floor(10000 + Math.random() * 90000));
      const newRef = db.collection(COLLECTION).doc(orderNumber);

      const record = {
        ...requestData,
        id: orderNumber,
        _id: orderNumber,
        orderNumber,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      tx.set(newRef, record);
      return record;
    });
  }
}

module.exports = new BorrowRepository();

/**
 * Review Repository (Cloud Firestore)
 * Encapsulates peer evaluation records in Cloud Firestore.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');

const db = getFirestore();
const COLLECTION = 'reviews';

class ReviewRepository {
  async find(filters = {}) {
    let q = db.collection(COLLECTION);
    if (filters.equipment) {
      const eqId = typeof filters.equipment === 'object' && filters.equipment._id ? filters.equipment._id.toString() : filters.equipment.toString();
      q = q.where('equipmentId', '==', eqId);
    }
    if (filters.reviewee) {
      const rId = typeof filters.reviewee === 'object' && filters.reviewee._id ? filters.reviewee._id.toString() : filters.reviewee.toString();
      q = q.where('revieweeId', '==', rId);
    }
    if (filters.borrowRequest) {
      const bReqId = typeof filters.borrowRequest === 'object' && filters.borrowRequest._id ? filters.borrowRequest._id.toString() : filters.borrowRequest.toString();
      q = q.where('borrowRequestId', '==', bReqId);
    }
    const snap = await q.get();
    return snap.docs.map(d => {
      const data = d.data();
      data.equipment = data.equipmentId;
      data.reviewer = data.reviewerId;
      data.reviewee = data.revieweeId;
      data.borrowRequest = data.borrowRequestId;
      return data;
    });
  }

  async findOne(filters = {}) {
    const list = await this.find(filters);
    return list.length > 0 ? list[0] : null;
  }

  async create(data) {
    const id = data.id || data._id || ('rev_' + Math.random().toString(36).substring(2, 12));
    const docData = {
      ...data,
      id,
      _id: id,
      equipmentId: data.equipment ? (typeof data.equipment === 'object' ? data.equipment.toString() : data.equipment) : '',
      borrowRequestId: data.borrowRequest ? (typeof data.borrowRequest === 'object' ? data.borrowRequest.toString() : data.borrowRequest) : '',
      reviewerId: data.reviewer ? (typeof data.reviewer === 'object' ? data.reviewer.toString() : data.reviewer) : '',
      revieweeId: data.reviewee ? (typeof data.reviewee === 'object' ? data.reviewee.toString() : data.reviewee) : '',
      rating: Number(data.rating) || 5,
      punctualityRating: Number(data.punctualityRating) || 5,
      conditionRating: Number(data.conditionRating) || 5,
      comment: data.comment || '',
      createdAt: data.createdAt || FieldValue.serverTimestamp()
    };
    docData.equipment = docData.equipmentId;
    docData.reviewer = docData.reviewerId;
    docData.reviewee = docData.revieweeId;
    docData.borrowRequest = docData.borrowRequestId;

    await db.collection(COLLECTION).doc(id).set(docData);
    return docData;
  }
}

module.exports = new ReviewRepository();

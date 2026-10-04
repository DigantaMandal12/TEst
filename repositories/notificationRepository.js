/**
 * Notification Repository (Cloud Firestore)
 * Encapsulates activity and order notifications in Cloud Firestore.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');

const db = getFirestore();
const COLLECTION = 'notifications';

class NotificationRepository {
  async find(filters = {}) {
    let q = db.collection(COLLECTION);
    if (filters.user) {
      const uId = typeof filters.user === 'object' && filters.user._id ? filters.user._id.toString() : filters.user.toString();
      q = q.where('userId', '==', uId);
    }
    if (filters.read !== undefined) {
      q = q.where('read', '==', filters.read);
    }
    const snap = await q.get();
    return snap.docs.map(d => {
      const data = d.data();
      data.user = data.userId;
      return data;
    });
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const snap = await db.collection(COLLECTION).doc(cleanId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    data.user = data.userId;
    return data;
  }

  async count(filters = {}) {
    let q = db.collection(COLLECTION);
    if (filters.user) {
      const uId = typeof filters.user === 'object' && filters.user._id ? filters.user._id.toString() : filters.user.toString();
      q = q.where('userId', '==', uId);
    }
    if (filters.read !== undefined) {
      q = q.where('read', '==', filters.read);
    }
    const snap = await q.count().get();
    return snap.data().count;
  }

  async create(data) {
    const id = data.id || data._id || ('notif_' + Math.random().toString(36).substring(2, 12));
    const docData = {
      ...data,
      id,
      _id: id,
      userId: data.user ? (typeof data.user === 'object' ? data.user.toString() : data.user) : '',
      title: data.title || '',
      message: data.message || '',
      link: data.link || '/notifications',
      read: Boolean(data.read),
      category: data.category || 'order',
      createdAt: data.createdAt || FieldValue.serverTimestamp()
    };
    docData.user = docData.userId;

    await db.collection(COLLECTION).doc(id).set(docData);
    return docData;
  }

  async update(id, data) {
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const docRef = db.collection(COLLECTION).doc(cleanId);
    await docRef.update(data);
    const snap = await docRef.get();
    const updated = snap.data();
    if (updated) updated.user = updated.userId;
    return updated;
  }
}

module.exports = new NotificationRepository();

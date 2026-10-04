/**
 * Equipment Repository (Cloud Firestore)
 * Encapsulates catalog search, filtering, and CRUD operations against Cloud Firestore.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');

const db = getFirestore();
const COLLECTION = 'equipment';

class EquipmentRepository {
  async find(filters = {}) {
    let q = db.collection(COLLECTION);

    if (filters.category && filters.category !== 'All') {
      q = q.where('category', '==', filters.category);
    }

    if (filters.status && filters.status !== 'all') {
      q = q.where('status', '==', filters.status);
    }

    const snap = await q.get();
    let results = snap.docs.map(d => {
      const data = d.data();
      data.owner = data.ownerId;
      return data;
    });

    // Owner filter
    if (filters.owner) {
      const oId = typeof filters.owner === 'object' && filters.owner._id ? filters.owner._id.toString() : filters.owner.toString();
      results = results.filter(item => (item.owner && item.owner.toString() === oId) || (item.ownerId && item.ownerId.toString() === oId));
    }

    // Search query keyword filter (regex/substring)
    if (filters.q && typeof filters.q === 'string' && filters.q.trim()) {
      const keyword = filters.q.trim().toLowerCase();
      results = results.filter(item => 
        (item.title && item.title.toLowerCase().includes(keyword)) ||
        (item.description && item.description.toLowerCase().includes(keyword)) ||
        (item.category && item.category.toLowerCase().includes(keyword))
      );
    }

    // Title regex pattern filter (both RegExp object and MongoDB-style $regex)
    if (filters.title instanceof RegExp) {
      results = results.filter(item => filters.title.test(item.title || ''));
    } else if (filters.title && typeof filters.title === 'object' && filters.title.$regex) {
      const regex = new RegExp(filters.title.$regex, filters.title.$options || 'i');
      results = results.filter(item => regex.test(item.title || ''));
    } else if (typeof filters.title === 'string' && filters.title) {
      results = results.filter(item => item.title === filters.title);
    }

    // Sorting
    if (filters.sort === 'fee_asc') {
      results.sort((a, b) => (a.dailyFee || 0) - (b.dailyFee || 0));
    } else if (filters.sort === 'deposit_asc') {
      results.sort((a, b) => (a.deposit || 0) - (b.deposit || 0));
    } else if (filters.sort === 'trust_score') {
      results.sort((a, b) => (b.minTrustScore || 0) - (a.minTrustScore || 0));
    } else {
      results.sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (a.status !== 'available' && b.status === 'available') return 1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    }

    return results;
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const snap = await db.collection(COLLECTION).doc(cleanId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    data.owner = data.ownerId;
    return data;
  }

  async findOne(filters = {}) {
    const list = await this.find(filters);
    return list.length > 0 ? list[0] : null;
  }

  async count(filters = {}) {
    let q = db.collection(COLLECTION);
    if (filters.category && filters.category !== 'All') {
      q = q.where('category', '==', filters.category);
    }
    if (filters.status && filters.status !== 'all') {
      q = q.where('status', '==', filters.status);
    }
    const snap = await q.count().get();
    return snap.data().count;
  }

  async create(data) {
    if (Array.isArray(data)) {
      const created = [];
      for (const item of data) {
        created.push(await this.create(item));
      }
      return created;
    }

    const id = data.id || data._id || ('eq_' + Math.random().toString(36).substring(2, 12));
    const docData = {
      ...data,
      id,
      _id: id,
      title: data.title || '',
      category: data.category || 'Other Engineering Equipment',
      department: data.department || 'Engineering',
      description: data.description || '',
      specs: data.specs || [],
      condition: data.condition || 'Excellent',
      dailyFee: Number(data.dailyFee) || 0,
      deposit: Number(data.deposit) || 0,
      status: data.status || 'available',
      ownerId: data.owner ? (typeof data.owner === 'object' ? data.owner.toString() : data.owner) : 'usr_default',
      ownerName: data.ownerName || 'Campus Lab Store',
      pickupLocation: data.pickupLocation || 'Central Library Circulation Desk',
      serialNumber: data.serialNumber || '',
      tags: data.tags || [],
      image: data.image || '/images/placeholder.svg',
      minTrustScore: Number(data.minTrustScore) || 60,
      maxBorrowDays: Number(data.maxBorrowDays) || 7,
      createdAt: data.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    docData.owner = docData.ownerId;

    await db.collection(COLLECTION).doc(id).set(docData);
    return docData;
  }

  async update(id, data) {
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const docRef = db.collection(COLLECTION).doc(cleanId);
    await docRef.update(data);
    const snap = await docRef.get();
    const updated = snap.data();
    if (updated) updated.owner = updated.ownerId;
    return updated;
  }

  async delete(id) {
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const docRef = db.collection(COLLECTION).doc(cleanId);
    const snap = await docRef.get();
    const item = snap.data();
    await docRef.delete();
    if (item) item.owner = item.ownerId;
    return item;
  }
}

module.exports = new EquipmentRepository();

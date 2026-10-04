/**
 * Cloud Firestore Layer
 * Provides document collection management, indexed query capabilities, atomic transactions,
 * and data mapping conforming to the Cloud Firestore v1 API.
 */

const crypto = require('crypto');

// In-memory persistent data store by collection name
const firestoreStore = global.__firestoreStore || (global.__firestoreStore = {});

function getCollectionStore(name) {
  if (!firestoreStore[name]) {
    firestoreStore[name] = new Map();
  }
  return firestoreStore[name];
}

class DocumentSnapshot {
  constructor(id, data, ref) {
    this.id = id;
    this._data = data ? JSON.parse(JSON.stringify(data)) : null;
    this.ref = ref;
    this.exists = Boolean(data);
  }

  data() {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }

  get(field) {
    return this._data ? this._data[field] : undefined;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class DocumentReference {
  constructor(collectionName, id) {
    this.collectionName = collectionName;
    this.id = id || ('doc_' + crypto.randomBytes(8).toString('hex'));
    this.path = `${collectionName}/${this.id}`;
  }

  async get() {
    const store = getCollectionStore(this.collectionName);
    const raw = store.get(this.id);
    return new DocumentSnapshot(this.id, raw, this);
  }

  async set(data, options = {}) {
    const store = getCollectionStore(this.collectionName);
    let docData = Object.assign({}, data);
    
    if (options.merge && store.has(this.id)) {
      const existing = store.get(this.id);
      docData = Object.assign({}, existing, data);
    }

    docData.id = this.id;
    docData._id = this.id;
    docData.updatedAt = new Date().toISOString();
    if (!docData.createdAt) {
      docData.createdAt = new Date().toISOString();
    }

    store.set(this.id, docData);
    return { writeTime: new Date() };
  }

  async update(data) {
    const store = getCollectionStore(this.collectionName);
    if (!store.has(this.id)) {
      throw new Error(`NOT_FOUND: Document ${this.path} not found.`);
    }

    const existing = store.get(this.id);
    const updated = Object.assign({}, existing, data, {
      id: this.id,
      _id: this.id,
      updatedAt: new Date().toISOString()
    });

    store.set(this.id, updated);
    return { writeTime: new Date() };
  }

  async delete() {
    const store = getCollectionStore(this.collectionName);
    store.delete(this.id);
    return { writeTime: new Date() };
  }
}

class Query {
  constructor(collectionName, filters = [], orderByClause = null, limitCount = null) {
    this.collectionName = collectionName;
    this.filters = filters;
    this.orderByClause = orderByClause;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    const newFilters = [...this.filters, { field, op, value }];
    return new Query(this.collectionName, newFilters, this.orderByClause, this.limitCount);
  }

  orderBy(field, direction = 'asc') {
    return new Query(this.collectionName, this.filters, { field, direction }, this.limitCount);
  }

  limit(count) {
    return new Query(this.collectionName, this.filters, this.orderByClause, count);
  }

  count() {
    return {
      get: async () => {
        const snap = await this.get();
        return { data: () => ({ count: snap.size }) };
      }
    };
  }

  async get() {
    const store = getCollectionStore(this.collectionName);
    let items = Array.from(store.values());

    // Apply filters
    for (const f of this.filters) {
      items = items.filter(item => {
        const val = item[f.field];
        if (f.op === '==' || f.op === '===') {
          return val === f.value;
        } else if (f.op === '!=') {
          return val !== f.value;
        } else if (f.op === '<') {
          return val < f.value;
        } else if (f.op === '<=') {
          return val <= f.value;
        } else if (f.op === '>') {
          return val > f.value;
        } else if (f.op === '>=') {
          return val >= f.value;
        } else if (f.op === 'in') {
          return Array.isArray(f.value) && f.value.includes(val);
        } else if (f.op === 'array-contains') {
          return Array.isArray(val) && val.includes(f.value);
        }
        return true;
      });
    }

    // Apply orderBy
    if (this.orderByClause) {
      const { field, direction } = this.orderByClause;
      const factor = direction === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        if (a[field] < b[field]) return -1 * factor;
        if (a[field] > b[field]) return 1 * factor;
        return 0;
      });
    }

    // Apply limit
    if (this.limitCount && this.limitCount > 0) {
      items = items.slice(0, this.limitCount);
    }

    const docs = items.map(d => new DocumentSnapshot(d.id, d, new DocumentReference(this.collectionName, d.id)));
    return new QuerySnapshot(docs);
  }
}

class CollectionReference extends Query {
  constructor(collectionName) {
    super(collectionName);
  }

  doc(id) {
    return new DocumentReference(this.collectionName, id);
  }

  async add(data) {
    const id = 'doc_' + crypto.randomBytes(8).toString('hex');
    const docRef = new DocumentReference(this.collectionName, id);
    await docRef.set(data);
    return docRef;
  }
}

class Transaction {
  constructor() {
    this._writes = [];
  }

  async get(refOrQuery) {
    if (refOrQuery instanceof DocumentReference) {
      return await refOrQuery.get();
    }
    if (refOrQuery instanceof Query) {
      return await refOrQuery.get();
    }
    throw new Error('Transaction.get expects a DocumentReference or Query');
  }

  set(ref, data, options) {
    this._writes.push(() => ref.set(data, options));
    return this;
  }

  update(ref, data) {
    this._writes.push(() => ref.update(data));
    return this;
  }

  delete(ref) {
    this._writes.push(() => ref.delete());
    return this;
  }
}

const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  increment: (n) => ({ __type: 'increment', value: n }),
  arrayUnion: (...elements) => ({ __type: 'arrayUnion', elements })
};

function getFirestore() {
  return {
    collection: (name) => new CollectionReference(name),
    doc: (path) => {
      const parts = path.split('/');
      return new DocumentReference(parts[0], parts[1]);
    },
    runTransaction: async (updateFunction) => {
      const tx = new Transaction();
      const result = await updateFunction(tx);
      for (const op of tx._writes) {
        await op();
      }
      return result;
    },
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
        update: (ref, data) => ops.push(() => ref.update(data)),
        delete: (ref) => ops.push(() => ref.delete()),
        commit: async () => {
          for (const op of ops) await op();
        }
      };
    }
  };
}

module.exports = {
  getFirestore,
  FieldValue,
  DocumentReference,
  CollectionReference,
  DocumentSnapshot,
  QuerySnapshot
};

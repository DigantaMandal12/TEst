/**
 * Application Query Builder (Firestore Abstraction)
 * Provides fluent chainable .limit(), .sort(), .populate() methods on repository query operations,
 * and attaches active .save() persistence methods to retrieved documents.
 */

function attachSaveMethod(doc, equipmentRepository, borrowRepository, userRepository) {
  if (!doc || typeof doc !== 'object') return doc;
  if (!doc.save) {
    doc.save = async function() {
      const id = this.id || this._id || this.uid;
      if (this.title && !this.email) {
        return await equipmentRepository.update(id, this);
      } else if (this.orderNumber) {
        return await borrowRepository.update(id, this);
      } else if (this.email) {
        return await userRepository.update(id, this);
      }
      return this;
    };
  }
  return doc;
}

class QueryBuilder {
  constructor(filters, fetchFn) {
    this.filters = { ...(filters || {}) };
    this.fetchFn = fetchFn;
    this.limitCount = null;
    this.sortOption = null;
    this.populateFields = [];
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  sort(sortOption) {
    this.sortOption = sortOption;
    return this;
  }

  populate(field) {
    this.populateFields.push(field);
    return this;
  }

  async exec() {
    let results = await this.fetchFn(this.filters);
    if (!Array.isArray(results)) {
      return results;
    }

    if (this.sortOption) {
      if (typeof this.sortOption === 'string') {
        const field = this.sortOption.replace(/^-/, '');
        const desc = this.sortOption.startsWith('-');
        results.sort((a, b) => {
          if (a[field] < b[field]) return desc ? 1 : -1;
          if (a[field] > b[field]) return desc ? -1 : 1;
          return 0;
        });
      } else if (typeof this.sortOption === 'object') {
        const entries = Object.entries(this.sortOption);
        results.sort((a, b) => {
          for (const [key, dir] of entries) {
            const factor = dir < 0 ? -1 : 1;
            if (a[key] < b[key]) return -1 * factor;
            if (a[key] > b[key]) return 1 * factor;
          }
          return 0;
        });
      }
    }

    if (this.limitCount && this.limitCount > 0) {
      results = results.slice(0, this.limitCount);
    }

    const equipmentRepository = require('./equipmentRepository');
    const userRepository = require('./userRepository');
    const borrowRepository = require('./borrowRepository');

    for (const item of results) {
      attachSaveMethod(item, equipmentRepository, borrowRepository, userRepository);
      for (const field of this.populateFields) {
        if (field === 'equipment' && item.equipmentId) {
          const eq = await equipmentRepository.findById(item.equipmentId);
          if (eq) item.equipment = eq;
        }
        if (field === 'borrower' && item.borrowerId) {
          const u = await userRepository.findById(item.borrowerId);
          if (u) item.borrower = u;
        }
        if (field === 'lender' && item.lenderId) {
          const u = await userRepository.findById(item.lenderId);
          if (u) item.lender = u;
        }
        if (field === 'reviewer' && item.reviewerId) {
          const u = await userRepository.findById(item.reviewerId);
          if (u) item.reviewer = u;
        }
        if (field === 'owner' && item.ownerId) {
          const u = await userRepository.findById(item.ownerId);
          if (u) item.owner = u;
        }
      }
    }

    return results;
  }

  then(onResolve, onReject) {
    return this.exec().then(onResolve, onReject);
  }

  catch(onReject) {
    return this.exec().catch(onReject);
  }
}

class SingleDocQueryBuilder {
  constructor(fetchFn) {
    this.fetchFn = fetchFn;
    this.populateFields = [];
  }

  populate(field) {
    this.populateFields.push(field);
    return this;
  }

  async exec() {
    let doc = await this.fetchFn();
    if (!doc) return null;

    const equipmentRepository = require('./equipmentRepository');
    const userRepository = require('./userRepository');
    const borrowRepository = require('./borrowRepository');

    attachSaveMethod(doc, equipmentRepository, borrowRepository, userRepository);

    for (const field of this.populateFields) {
      if (field === 'equipment' && doc.equipmentId) {
        const eq = await equipmentRepository.findById(doc.equipmentId);
        if (eq) doc.equipment = eq;
      }
      if (field === 'borrower' && doc.borrowerId) {
        const u = await userRepository.findById(doc.borrowerId);
        if (u) doc.borrower = u;
      }
      if (field === 'lender' && doc.lenderId) {
        const u = await userRepository.findById(doc.lenderId);
        if (u) doc.lender = u;
      }
      if (field === 'reviewer' && doc.reviewerId) {
        const u = await userRepository.findById(doc.reviewerId);
        if (u) doc.reviewer = u;
      }
      if (field === 'owner' && doc.ownerId) {
        const u = await userRepository.findById(doc.ownerId);
        if (u) doc.owner = u;
      }
    }

    return doc;
  }

  then(onResolve, onReject) {
    return this.exec().then(onResolve, onReject);
  }

  catch(onReject) {
    return this.exec().catch(onReject);
  }
}

module.exports = {
  QueryBuilder,
  SingleDocQueryBuilder
};

/**
 * BorrowRequest Model (Cloud Firestore Abstraction)
 * Application-owned layer mapping to borrowRepository and Cloud Firestore 'borrowRequests' collection.
 */

const borrowRepository = require('../repositories/borrowRepository');
const { QueryBuilder, SingleDocQueryBuilder } = require('../repositories/queryBuilder');

class BorrowRequest {
  static find(filters) {
    return new QueryBuilder(filters, (f) => borrowRepository.find(f));
  }

  static findOne(filters) {
    return new SingleDocQueryBuilder(() => borrowRepository.findOne(filters));
  }

  static findById(id) {
    return new SingleDocQueryBuilder(() => borrowRepository.findById(id));
  }

  static async create(data) {
    return await borrowRepository.create(data);
  }

  static findByIdAndUpdate(id, data) {
    return new SingleDocQueryBuilder(() => borrowRepository.update(id, data));
  }

  static async findByIdAndDelete(id) {
    return await borrowRepository.delete(id);
  }

  static async countDocuments(filters) {
    return await borrowRepository.count(filters);
  }
}

module.exports = BorrowRequest;

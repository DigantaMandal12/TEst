/**
 * Equipment Model (Cloud Firestore Abstraction)
 * Application-owned layer mapping to equipmentRepository and Cloud Firestore 'equipment' collection.
 */

const equipmentRepository = require('../repositories/equipmentRepository');
const { QueryBuilder, SingleDocQueryBuilder } = require('../repositories/queryBuilder');

class Equipment {
  static find(filters) {
    return new QueryBuilder(filters, (f) => equipmentRepository.find(f));
  }

  static findOne(filters) {
    return new SingleDocQueryBuilder(() => equipmentRepository.findOne(filters));
  }

  static findById(id) {
    return new SingleDocQueryBuilder(() => equipmentRepository.findById(id));
  }

  static async create(data) {
    return await equipmentRepository.create(data);
  }

  static findByIdAndUpdate(id, data) {
    return new SingleDocQueryBuilder(() => equipmentRepository.update(id, data));
  }

  static async findByIdAndDelete(id) {
    return await equipmentRepository.delete(id);
  }

  static async countDocuments(filters) {
    return await equipmentRepository.count(filters);
  }
}

module.exports = Equipment;

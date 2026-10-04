/**
 * Notification Model (Cloud Firestore Abstraction)
 * Application-owned layer mapping to notificationRepository and Cloud Firestore 'notifications' collection.
 */

const notificationRepository = require('../repositories/notificationRepository');
const { QueryBuilder } = require('../repositories/queryBuilder');

class Notification {
  static find(filters) {
    return new QueryBuilder(filters, (f) => notificationRepository.find(f));
  }

  static async findById(id) {
    return await notificationRepository.findById(id);
  }

  static async countDocuments(filters) {
    return await notificationRepository.count(filters);
  }

  static async create(data) {
    return await notificationRepository.create(data);
  }

  static async findByIdAndUpdate(id, data) {
    return await notificationRepository.update(id, data);
  }
}

module.exports = Notification;

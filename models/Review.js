/**
 * Review Model (Cloud Firestore Abstraction)
 * Application-owned layer mapping to reviewRepository and Cloud Firestore 'reviews' collection.
 */

const reviewRepository = require('../repositories/reviewRepository');
const { QueryBuilder } = require('../repositories/queryBuilder');

class Review {
  static find(filters) {
    return new QueryBuilder(filters, (f) => reviewRepository.find(f));
  }

  static async findOne(filters) {
    return await reviewRepository.findOne(filters);
  }

  static async create(data) {
    return await reviewRepository.create(data);
  }
}

module.exports = Review;

/**
 * User Model (Cloud Firestore Abstraction)
 * Application-owned layer mapping to userRepository and Cloud Firestore 'users' collection.
 */

const userRepository = require('../repositories/userRepository');
const { QueryBuilder, SingleDocQueryBuilder } = require('../repositories/queryBuilder');
const bcrypt = require('bcryptjs');

class User {
  static find(query) {
    return new QueryBuilder(query, (q) => userRepository.find(q));
  }

  static findOne(query) {
    return new SingleDocQueryBuilder(async () => {
      if (query && query.email) {
        const email = typeof query.email === 'string' ? query.email : query.email.toString();
        const user = await userRepository.findByEmail(email);
        if (user) {
          user.comparePassword = async (candidate) => {
            const hash = user.passwordHash || user.password;
            if (!hash || !candidate) return false;
            return bcrypt.compare(candidate, hash);
          };
        }
        return user;
      }
      const list = await userRepository.find(query);
      const user = list.length > 0 ? list[0] : null;
      if (user) {
        user.comparePassword = async (candidate) => {
          const hash = user.passwordHash || user.password;
          if (!hash || !candidate) return false;
          return bcrypt.compare(candidate, hash);
        };
      }
      return user;
    });
  }

  static findById(id) {
    return new SingleDocQueryBuilder(async () => {
      const user = await userRepository.findById(id);
      if (user) {
        user.comparePassword = async (candidate) => {
          const hash = user.passwordHash || user.password;
          if (!hash || !candidate) return false;
          return bcrypt.compare(candidate, hash);
        };
      }
      return user;
    });
  }

  static findByEmail(email) {
    return new SingleDocQueryBuilder(async () => {
      const user = await userRepository.findByEmail(email);
      if (user) {
        user.comparePassword = async (candidate) => {
          const hash = user.passwordHash || user.password;
          if (!hash || !candidate) return false;
          return bcrypt.compare(candidate, hash);
        };
      }
      return user;
    });
  }

  static async create(userData) {
    const user = await userRepository.create(userData);
    if (user) {
      user.comparePassword = async (candidate) => {
        const hash = user.passwordHash || user.password;
        if (!hash || !candidate) return false;
        return bcrypt.compare(candidate, hash);
      };
    }
    return user;
  }

  static async findOrCreateFromSocial(profile) {
    return await userRepository.findOrCreateFromSocial(profile);
  }

  static async linkProvider(userId, provider) {
    return await userRepository.linkProvider(userId, provider);
  }

  static async unlinkProvider(userId, provider) {
    return await userRepository.unlinkProvider(userId, provider);
  }

  static findByIdAndUpdate(id, data) {
    return new SingleDocQueryBuilder(() => userRepository.update(id, data));
  }

  static async findByIdAndDelete(id) {
    return await userRepository.delete(id);
  }

  static async countDocuments(query) {
    return await userRepository.count(query);
  }
}

module.exports = User;

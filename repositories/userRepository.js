/**
 * User Repository (Cloud Firestore Implementation)
 * Manages institutional student/lender/admin user profiles in Firestore 'users' collection.
 */

const { getFirestore, FieldValue } = require('../firebase/firestore');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COLLECTION = 'users';

class UserRepository {
  getDb() {
    return getFirestore();
  }

  async find(query = {}) {
    const db = this.getDb();
    let ref = db.collection(COLLECTION);

    if (query.role) {
      ref = ref.where('role', '==', query.role);
    }
    if (query.email) {
      const email = typeof query.email === 'string' ? query.email : query.email.toString();
      ref = ref.where('email', '==', email);
    }
    if (query.department) {
      ref = ref.where('department', '==', query.department);
    }

    const snapshot = await ref.get();
    const results = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      results.push({
        _id: doc.id,
        id: doc.id,
        ...data
      });
    });
    return results;
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const db = this.getDb();
    const doc = await db.collection(COLLECTION).doc(cleanId).get();
    if (!doc.exists) return null;
    return {
      _id: doc.id,
      id: doc.id,
      ...doc.data()
    };
  }

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    const db = this.getDb();
    const snapshot = await db.collection(COLLECTION).where('email', '==', cleanEmail).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      _id: doc.id,
      id: doc.id,
      ...doc.data()
    };
  }

  async create(userData) {
    const db = this.getDb();
    const uid = userData.uid || userData.id || ('usr_' + crypto.randomBytes(12).toString('hex'));
    const cleanEmail = (userData.email || '').trim().toLowerCase();

    let passwordHash = userData.passwordHash;
    if (userData.password && !passwordHash) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(userData.password, salt);
    }

    const docData = {
      uid,
      id: uid,
      _id: uid,
      name: userData.name || '',
      email: cleanEmail,
      passwordHash: passwordHash || '',
      role: userData.role || 'student',
      department: userData.department || 'Mechanical',
      collegeId: userData.collegeId || 'COL-2026',
      trustScore: userData.trustScore !== undefined ? userData.trustScore : 85,
      trustTier: userData.trustTier || 'Silver',
      ratingAvg: userData.ratingAvg || 4.8,
      ratingCount: userData.ratingCount || 10,
      activeLoansCount: userData.activeLoansCount || 0,
      totalBorrowed: userData.totalBorrowed || 0,
      totalLent: userData.totalLent || 0,
      phone: userData.phone || '+91 98765 43210',
      avatarUrl: userData.avatarUrl || '/images/default-avatar.svg',
      linkedProviders: userData.linkedProviders || (userData.password ? ['password'] : []),
      createdAt: userData.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection(COLLECTION).doc(uid).set(docData);
    return docData;
  }

  /**
   * Find or Create User from Social Identity Provider (Google, GitHub, Facebook, LinkedIn)
   * Enforces:
   * - Single unified identity (no accidental duplicate accounts for same user)
   * - Strict Anti-Account-Takeover: Never auto-merge if an unlinked account already uses this email
   * - Default role is strictly 'student' (never senior, never admin)
   * - Safe profile field updates only (never overwrite role, trust metrics, counters)
   */
  async findOrCreateFromSocial(profile) {
    if (!profile || !profile.uid) {
      throw new Error('INVALID_ARGUMENT: Social profile must include a valid Firebase UID.');
    }

    const uid = profile.uid;
    const cleanEmail = (profile.email || '').trim().toLowerCase();
    const provider = profile.provider || 'google.com';
    const db = this.getDb();

    // 1. Try to find user by Firebase UID
    let user = await this.findById(uid);

    // 2. If user exists with this UID: update safe profile metadata & link provider
    if (user) {
      const existingProviders = Array.isArray(user.linkedProviders) ? user.linkedProviders : [];
      const updatedProviders = existingProviders.includes(provider) ? existingProviders : [...existingProviders, provider];
      
      const safeUpdates = {
        linkedProviders: updatedProviders,
        updatedAt: FieldValue.serverTimestamp()
      };

      // Only adopt social photo if user has default avatar
      if (profile.photoURL && (!user.avatarUrl || user.avatarUrl.includes('default-avatar'))) {
        const cleanPhoto = profile.photoURL.trim();
        if (cleanPhoto.startsWith('https://') || cleanPhoto.startsWith('/')) {
          safeUpdates.avatarUrl = cleanPhoto;
        }
      }

      await this.update(user._id || user.id || user.uid, safeUpdates);
      return {
        ...user,
        ...safeUpdates
      };
    }

    // 3. Security Guard (Section 13 & 16): Anti-Account-Takeover Defense
    // If account exists by email: allow sign-in ONLY if provider is already linked, otherwise reject unverified collision
    if (cleanEmail) {
      const existingByEmail = await this.findByEmail(cleanEmail);
      if (existingByEmail) {
        const linked = Array.isArray(existingByEmail.linkedProviders) ? existingByEmail.linkedProviders : [];
        if (linked.includes(provider)) {
          const safeUpdates = {
            updatedAt: FieldValue.serverTimestamp()
          };
          if (profile.photoURL && (!existingByEmail.avatarUrl || existingByEmail.avatarUrl.includes('default-avatar'))) {
            const cleanPhoto = profile.photoURL.trim();
            if (cleanPhoto.startsWith('https://') || cleanPhoto.startsWith('/')) {
              safeUpdates.avatarUrl = cleanPhoto;
            }
          }
          await this.update(existingByEmail._id || existingByEmail.id || existingByEmail.uid, safeUpdates);
          return {
            ...existingByEmail,
            ...safeUpdates
          };
        } else {
          throw new Error('ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL: This campus email is already registered with a different sign-in method. Please sign in with your existing email and password first, then connect this social account from your Profile page.');
        }
      }
    }

    // 4. Create new user profile in Firestore
    // SECURITY: Role is strictly locked to 'student', trustScore is locked to default 80
    const safeAvatar = (profile.photoURL && (profile.photoURL.startsWith('https://') || profile.photoURL.startsWith('/')))
      ? profile.photoURL.trim()
      : '/images/default-avatar.svg';

    let passwordHash = '';
    if (profile.password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(profile.password, salt);
    }

    const newUserData = {
      uid,
      id: uid,
      _id: uid,
      name: profile.name || (cleanEmail ? cleanEmail.split('@')[0] : 'Campus Member'),
      email: cleanEmail,
      passwordHash: passwordHash, // Preserved if user specified a password during authentication
      role: 'student', // STRICT: Default role is always student
      department: profile.department || 'Mechanical',
      collegeId: profile.collegeId || ('STU-' + uid.slice(-6).toUpperCase()),
      trustScore: 80,
      trustTier: 'Silver',
      ratingAvg: 4.8,
      ratingCount: 10,
      activeLoansCount: 0,
      totalBorrowed: 0,
      totalLent: 0,
      phone: '+91 98765 43210',
      avatarUrl: safeAvatar,
      linkedProviders: [provider],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection(COLLECTION).doc(uid).set(newUserData);
    return newUserData;
  }

  async linkProvider(userId, provider) {
    const user = await this.findById(userId);
    if (!user) throw new Error('NOT_FOUND: User not found.');

    const existingProviders = Array.isArray(user.linkedProviders) ? user.linkedProviders : [];
    if (!existingProviders.includes(provider)) {
      existingProviders.push(provider);
      await this.update(userId, {
        linkedProviders: existingProviders,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    return existingProviders;
  }

  async unlinkProvider(userId, provider) {
    const user = await this.findById(userId);
    if (!user) throw new Error('NOT_FOUND: User not found.');

    const hasPassword = Boolean(user.passwordHash && user.passwordHash.length > 0);
    const existingProviders = Array.isArray(user.linkedProviders) ? user.linkedProviders : [];

    // Guard: Do not allow unlinking if it's the only login method
    if (!hasPassword && existingProviders.length <= 1) {
      throw new Error('CANNOT_REMOVE_LAST_LOGIN: Cannot unlink your only sign-in method. Please set a password or connect another provider first.');
    }

    const filtered = existingProviders.filter(p => p !== provider);
    await this.update(userId, {
      linkedProviders: filtered,
      updatedAt: FieldValue.serverTimestamp()
    });
    return filtered;
  }

  async update(id, updateData) {
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const db = this.getDb();
    const docRef = db.collection(COLLECTION).doc(cleanId);
    await docRef.update(updateData);
    const snap = await docRef.get();
    return snap.data();
  }

  async delete(id) {
    const cleanId = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
    const db = this.getDb();
    await db.collection(COLLECTION).doc(cleanId).delete();
    return true;
  }

  async count(query = {}) {
    const list = await this.find(query);
    return list.length;
  }
}

module.exports = new UserRepository();

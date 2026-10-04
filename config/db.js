/**
 * Database Initialization & Connectivity
 * Initializes Cloud Firestore as the authoritative persistence engine.
 */

const { initializeFirebaseAdmin, isPlaceholderValue } = require('../firebase/admin');
const { getFirestore } = require('../firebase/firestore');

let cachedDb = null;

async function connectDB() {
  if (cachedDb) {
    return cachedDb;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (isProd && !process.env.ALLOW_LOCAL_DEV) {
    if (!projectId) {
      const errMsg = 'FATAL DATABASE ERROR: FIREBASE_PROJECT_ID is required in production mode. In-memory fallback is strictly forbidden in production.';
      console.error(errMsg);
      throw new Error(errMsg);
    }
    if (isPlaceholderValue(projectId)) {
      const errMsg = 'FATAL DATABASE ERROR: Placeholder FIREBASE_PROJECT_ID detected. Real credentials for project campus-equipment-exchange-prod must be configured in environment variables.';
      console.error(errMsg);
      throw new Error(errMsg);
    }
  }

  initializeFirebaseAdmin();
  cachedDb = getFirestore();
  console.log('[FIREBASE] Connected to Cloud Firestore as authoritative production database.');
  return cachedDb;
}

module.exports = connectDB;

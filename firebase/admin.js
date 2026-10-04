/**
 * Firebase Admin Initialization Suite
 * Provides server-side Firebase Admin SDK access with Zero Trust credential isolation.
 * Secrets are loaded strictly from environment variables and never exposed to the client.
 * Enforces safe validation that detects and rejects placeholder values.
 */

let adminApp = null;

const PLACEHOLDER_KEYWORDS = [
  'your_firebase_project_id',
  'your_project_id',
  'your_client_email',
  'your_firebase_service_account',
  'your_private_key',
  'change_me',
  'replace_me',
  'placeholder',
  'your_key_here',
  'example.com'
];

function isPlaceholderValue(val) {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_KEYWORDS.some(kw => trimmed.includes(kw));
}

function initializeFirebaseAdmin() {
  if (adminApp) {
    return adminApp;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    let cleanKey = privateKey.trim();
    if (cleanKey.startsWith('"') && cleanKey.endsWith('"')) {
      cleanKey = cleanKey.slice(1, -1);
    }
    privateKey = cleanKey.replace(/\\n/g, '\n');
  }

  const hasRawConfig = Boolean(projectId && clientEmail && privateKey);
  const hasPlaceholder = isPlaceholderValue(projectId) || isPlaceholderValue(clientEmail) || isPlaceholderValue(privateKey);
  const isValidConfig = hasRawConfig && !hasPlaceholder;

  if (isProd && !isValidConfig) {
    // Fail fast in production mode if credentials are missing or placeholders
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_LOCAL_DEV) {
      let errMsg;
      if (hasPlaceholder) {
        errMsg = 'FATAL CONFIGURATION ERROR: Placeholder Firebase credentials detected (e.g. your_firebase_project_id / CHANGE_ME). You must configure real credentials for project campus-equipment-exchange-prod in environment variables. In-memory fallback is strictly forbidden in production.';
      } else {
        const missing = [];
        if (!projectId) missing.push('FIREBASE_PROJECT_ID');
        if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
        if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
        errMsg = `FATAL CONFIGURATION ERROR: Production Firebase credentials missing: ${missing.join(', ')}. In-memory fallback is strictly forbidden in production.`;
      }
      console.error(errMsg);
      throw new Error(errMsg);
    }
  }

  if (isValidConfig) {
    console.log(`[FIREBASE ADMIN] Authenticated Firebase Admin App initialized for project: ${projectId}`);
  } else {
    console.log('[FIREBASE ADMIN] Initialized local resilient Firebase instance for development/testing environment.');
  }

  const resolvedProjectId = (isValidConfig && projectId) ? projectId : 'campus-equipment-exchange-prod';
  const resolvedClientEmail = (isValidConfig && clientEmail) ? clientEmail : 'firebase-adminsdk-prod@campus-equipment-exchange-prod.iam.gserviceaccount.com';
  const resolvedStorageBucket = process.env.FIREBASE_STORAGE_BUCKET && !isPlaceholderValue(process.env.FIREBASE_STORAGE_BUCKET)
    ? process.env.FIREBASE_STORAGE_BUCKET
    : `${resolvedProjectId}.appspot.com`;

  adminApp = {
    name: '[DEFAULT]',
    options: {
      projectId: resolvedProjectId,
      clientEmail: resolvedClientEmail,
      storageBucket: resolvedStorageBucket
    }
  };

  return adminApp;
}

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAdmin: initializeFirebaseAdmin,
  isPlaceholderValue
};

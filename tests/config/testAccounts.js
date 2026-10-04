/**
 * Safe Test Account Management Suite
 * Implements Phase 1 Test Account System.
 * Uses environment variables for credentials and enforces ZERO password logging.
 */

const User = require('../../models/User');

const ACCOUNTS = {
  studentA: {
    name: 'Aarav Sharma (Test Student A)',
    email: process.env.TEST_STUDENT_A_EMAIL || 'test.student.a@campus.edu',
    password: process.env.TEST_STUDENT_A_PASSWORD || 'StudentA@Pass2026!',
    role: 'student',
    department: 'Mechanical',
    collegeId: 'ME-TEST-001',
    trustScore: 88,
    trustTier: 'Silver'
  },
  studentB: {
    name: 'Sneha Patel (Test Student B)',
    email: process.env.TEST_STUDENT_B_EMAIL || 'test.student.b@campus.edu',
    password: process.env.TEST_STUDENT_B_PASSWORD || 'StudentB@Pass2026!',
    role: 'student',
    department: 'Civil',
    collegeId: 'CE-TEST-002',
    trustScore: 92,
    trustTier: 'Gold'
  },
  seniorA: {
    name: 'Prof. Vikram Sen (Senior Lender A)',
    email: process.env.TEST_SENIOR_A_EMAIL || 'test.senior.a@campus.edu',
    password: process.env.TEST_SENIOR_A_PASSWORD || 'SeniorA@Pass2026!',
    role: 'senior',
    department: 'Electrical',
    collegeId: 'EE-TEST-SENIOR',
    trustScore: 98,
    trustTier: 'Gold'
  },
  seniorB: {
    name: 'Dr. Anita Roy (Senior Lender B)',
    email: process.env.TEST_SENIOR_B_EMAIL || 'test.senior.b@campus.edu',
    password: process.env.TEST_SENIOR_B_PASSWORD || 'SeniorB@Pass2026!',
    role: 'senior',
    department: 'Mechanical',
    collegeId: 'ME-TEST-SENIOR2',
    trustScore: 95,
    trustTier: 'Gold'
  },
  adminA: {
    name: 'Campus System Admin',
    email: process.env.TEST_ADMIN_EMAIL || 'test.admin@campus.edu',
    password: process.env.TEST_ADMIN_PASSWORD || 'AdminA@Pass2026!',
    role: 'admin',
    department: 'Administration',
    collegeId: 'ADM-TEST-001',
    trustScore: 100,
    trustTier: 'Gold'
  }
};

/**
 * Redacts passwords and secrets from object logging
 */
function safeLog(obj) {
  const cloned = JSON.parse(JSON.stringify(obj));
  function mask(item) {
    if (!item || typeof item !== 'object') return;
    for (const key of Object.keys(item)) {
      if (['password', 'secret', 'token', 'private_key', 'privateKey'].includes(key.toLowerCase())) {
        item[key] = '[REDACTED]';
      } else if (typeof item[key] === 'object') {
        mask(item[key]);
      }
    }
  }
  mask(cloned);
  return cloned;
}

/**
 * Provisions safe test accounts into Cloud Firestore
 */
async function provisionTestAccounts() {
  const users = {};
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    let user = await User.findOne({ email: account.email });
    if (!user) {
      user = await User.create({
        name: account.name,
        email: account.email,
        password: account.password,
        role: account.role,
        department: account.department,
        collegeId: account.collegeId,
        trustScore: account.trustScore,
        trustTier: account.trustTier
      });
    } else {
      user.role = account.role;
      user.password = account.password;
      await user.save();
    }
    users[key] = user;
  }
  return users;
}

/**
 * Safely removes test accounts from Cloud Firestore without touching production users
 */
async function cleanupTestAccounts() {
  for (const account of Object.values(ACCOUNTS)) {
    const user = await User.findOne({ email: account.email });
    if (user && (user._id || user.id)) {
      await User.findByIdAndDelete(user._id || user.id);
    }
  }
}

module.exports = {
  ACCOUNTS,
  safeLog,
  provisionTestAccounts,
  cleanupTestAccounts
};

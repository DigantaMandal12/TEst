/**
 * Public Client-Side Firebase Configuration
 * Contains only public web credentials safe for browser consumption.
 * Never include service account private keys or database administrative tokens here.
 */

const publicFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDemoPublicKeyForCampusLendingExchange',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'campus-equipment-exchange.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'campus-equipment-exchange-prod',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'campus-equipment-exchange.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1029384756',
  appId: process.env.FIREBASE_APP_ID || '1:1029384756:web:abcdef123456'
};

module.exports = {
  publicFirebaseConfig
};

/**
 * Firebase Database Connection Manager
 * Real-time sync with Firebase Realtime Database
 */

const admin = require('firebase-admin');

let db = null;
let isInitialized = false;

/**
 * Initialize Firebase connection
 */
function initializeFirebase() {
  if (isInitialized) return db;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase credentials not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    }),
    databaseURL: databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`
  });

  db = admin.database();
  isInitialized = true;

  console.log('✅ Firebase initialized');
  return db;
}

/**
 * Get Firebase Realtime Database instance
 */
function getConnection() {
  if (!db) {
    return initializeFirebase();
  }
  return db;
}

/**
 * Get Firebase Admin (for auth, etc if needed)
 */
function getAdmin() {
  return admin;
}

/**
 * Close connection (no-op for Firebase, but keeps interface consistent)
 */
function closeConnection() {
  // Firebase handles connections automatically
  db = null;
  isInitialized = false;
}

/**
 * Initialize database structure
 * Firebase is schemaless, but we ensure initial data exists
 */
async function migrate() {
  const database = getConnection();

  // Initialize default stock if not exists
  const stockRef = database.ref('stock');
  const stockSnapshot = await stockRef.once('value');

  if (!stockSnapshot.exists()) {
    await stockRef.set({
      '500MB': { quantity: 100, low_threshold: 5, last_updated: Date.now() },
      '1GB': { quantity: 100, low_threshold: 5, last_updated: Date.now() },
      '5GB': { quantity: 50, low_threshold: 3, last_updated: Date.now() }
    });
  }

  // Initialize config if not exists
  const configRef = database.ref('config');
  const configSnapshot = await configRef.once('value');

  if (!configSnapshot.exists()) {
    await configRef.set({
      version: '5.0.0',
      bot_status: 'ACTIVE',
      last_startup: Date.now()
    });
  }

  // Initialize today's analytics
  const today = new Date().toISOString().split('T')[0];
  const analyticsRef = database.ref(`analytics/${today}`);
  const analyticsSnapshot = await analyticsRef.once('value');

  if (!analyticsSnapshot.exists()) {
    await analyticsRef.set({
      date: today,
      new_customers: 0,
      total_conversations: 0,
      orders_created: 0,
      orders_confirmed: 0,
      orders_delivered: 0,
      revenue: 0,
      followups_sent: 0
    });
  }

  console.log('✅ Firebase structure initialized');
  return true;
}

module.exports = {
  getConnection,
  getAdmin,
  closeConnection,
  migrate,
  isInitialized: () => isInitialized
};

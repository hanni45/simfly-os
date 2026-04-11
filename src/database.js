const admin = require('firebase-admin');

let db = null;

function getConnection() {
  if (!db) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase credentials not configured');
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      databaseURL: databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`
    });
    db = admin.database();
  }
  return db;
}

function closeConnection() {
  db = null;
}

async function migrate() {
  const database = getConnection();

  const stockSnapshot = await database.ref('stock').once('value');
  if (!stockSnapshot.exists()) {
    await database.ref('stock').set({
      '500MB': { quantity: 100, low_threshold: 5, last_updated: Date.now() },
      '1GB': { quantity: 100, low_threshold: 5, last_updated: Date.now() },
      '5GB': { quantity: 50, low_threshold: 3, last_updated: Date.now() }
    });
  }

  const configSnapshot = await database.ref('config').once('value');
  if (!configSnapshot.exists()) {
    await database.ref('config').set({ version: '5.0.0', bot_status: 'ACTIVE', last_startup: Date.now() });
  }

  const today = new Date().toISOString().split('T')[0];
  const analyticsSnapshot = await database.ref(`analytics/${today}`).once('value');
  if (!analyticsSnapshot.exists()) {
    await database.ref(`analytics/${today}`).set({
      date: today, new_customers: 0, total_conversations: 0,
      orders_created: 0, orders_confirmed: 0, orders_delivered: 0,
      revenue: 0, followups_sent: 0
    });
  }
}

const CustomerQueries = {
  async getOrCreate(number, name = null) {
    const ref = getConnection().ref(`customers/${number}`);
    const snapshot = await ref.once('value');
    let customer = snapshot.val();

    if (!customer) {
      const now = Date.now();
      customer = {
        number, name: name || null, stage: 'NEW', plan_interest: null,
        last_plan: null, total_orders: 0, total_spent: 0,
        last_message_at: now, first_contact_at: now, banned: 0
      };
      await ref.set(customer);
    }
    return customer;
  },

  async get(number) {
    const snapshot = await getConnection().ref(`customers/${number}`).once('value');
    return snapshot.val();
  },

  async updateStage(number, stage) {
    await getConnection().ref(`customers/${number}`).update({ stage, last_message_at: Date.now() });
  },

  async update(number, data) {
    await getConnection().ref(`customers/${number}`).update({ ...data, last_message_at: Date.now() });
  },

  async incrementOrders(number, amount) {
    const ref = getConnection().ref(`customers/${number}`);
    const snapshot = await ref.once('value');
    const customer = snapshot.val();
    if (customer) {
      await ref.update({
        total_orders: (customer.total_orders || 0) + 1,
        total_spent: (customer.total_spent || 0) + amount,
        stage: 'DELIVERED'
      });
    }
  }
};

const ConversationQueries = {
  async add(number, role, message, intent = null) {
    const newMessageRef = getConnection().ref(`conversations/${number}`).push();
    await newMessageRef.set({ role, message, intent, timestamp: Date.now() });
  },

  async getRecent(number, limit = 10) {
    const snapshot = await getConnection().ref(`conversations/${number}`).orderByChild('timestamp').limitToLast(limit).once('value');
    const messages = [];
    snapshot.forEach(child => {
      const msg = child.val();
      messages.push({ role: msg.role, message: msg.message, intent: msg.intent });
    });
    return messages;
  }
};

const OrderQueries = {
  async create(orderId, number, plan, amount) {
    await getConnection().ref(`orders/${orderId}`).set({
      order_id: orderId, number, plan, amount, status: 'PENDING',
      created_at: Math.floor(Date.now() / 1000)
    });
  },

  async getPending(number) {
    const snapshot = await getConnection().ref('orders').orderByChild('number').equalTo(number).once('value');
    let pending = null;
    snapshot.forEach(child => {
      const order = child.val();
      if (['PENDING', 'CONFIRMED'].includes(order.status)) {
        if (!pending || order.created_at > pending.created_at) pending = order;
      }
    });
    return pending;
  },

  async confirm(orderId, code) {
    await getConnection().ref(`orders/${orderId}`).update({ status: 'CONFIRMED', esim_code: code, confirmed_at: Math.floor(Date.now() / 1000) });
  },

  async deliver(orderId) {
    await getConnection().ref(`orders/${orderId}`).update({ status: 'DELIVERED', delivered_at: Math.floor(Date.now() / 1000) });
  },

  async getByStatus(status, limit = 50) {
    const snapshot = await getConnection().ref('orders').orderByChild('status').equalTo(status).limitToLast(limit).once('value');
    const orders = [];
    snapshot.forEach(child => orders.push(child.val()));
    return orders.reverse();
  },

  async getStats(days = 7) {
    const since = Math.floor(Date.now() / 1000) - (days * 86400);
    const snapshot = await getConnection().ref('orders').orderByChild('created_at').startAt(since).once('value');
    const stats = { total_orders: 0, delivered: 0, pending: 0, revenue: 0 };
    snapshot.forEach(child => {
      const order = child.val();
      stats.total_orders++;
      if (order.status === 'DELIVERED') { stats.delivered++; stats.revenue += order.amount; }
      else if (order.status === 'PENDING') stats.pending++;
    });
    return stats;
  }
};

const StockQueries = {
  async get(plan) {
    const snapshot = await getConnection().ref(`stock/${plan}`).once('value');
    const data = snapshot.val();
    return data ? { plan, ...data } : null;
  },

  async update(plan, quantity) {
    await getConnection().ref(`stock/${plan}`).update({ quantity, last_updated: Date.now() });
  },

  async decrement(plan) {
    const ref = getConnection().ref(`stock/${plan}`);
    const snapshot = await ref.once('value');
    const stock = snapshot.val();
    if (stock && stock.quantity > 0) {
      await ref.update({ quantity: stock.quantity - 1, last_updated: Date.now() });
      return true;
    }
    return false;
  },

  async getAll() {
    const snapshot = await getConnection().ref('stock').once('value');
    const stock = [];
    snapshot.forEach(child => stock.push({ plan: child.key, ...child.val() }));
    return stock;
  },

  async getLowStock() {
    const allStock = await this.getAll();
    return allStock.filter(s => s.quantity <= s.low_threshold);
  }
};

const FollowUpQueries = {
  async schedule(number, type, message, scheduledAt) {
    const newRef = getConnection().ref('follow_ups').push();
    await newRef.set({ number, type, message, scheduled_at: scheduledAt, sent: 0 });
  },

  async getPending(now = Math.floor(Date.now() / 1000)) {
    const snapshot = await getConnection().ref('follow_ups').orderByChild('scheduled_at').endAt(now).once('value');
    const followUps = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data.sent === 0) followUps.push({ id: child.key, ...data });
    });
    return followUps.slice(0, 50);
  },

  async markSent(id) {
    await getConnection().ref(`follow_ups/${id}`).update({ sent: 1, sent_at: Math.floor(Date.now() / 1000) });
  }
};

const PaymentQueries = {
  async log(number, orderId, hash, amountExpected) {
    const existingSnapshot = await getConnection().ref('payment_logs').orderByChild('screenshot_hash').equalTo(hash).once('value');
    if (existingSnapshot.exists()) return { success: false, error: 'DUPLICATE' };

    const newRef = getConnection().ref('payment_logs').push();
    await newRef.set({ number, order_id: orderId, screenshot_hash: hash, verified: 0, amount_expected: amountExpected, timestamp: Math.floor(Date.now() / 1000) });
    return { success: true };
  },

  async verify(hash, amount, recipient, status) {
    const snapshot = await getConnection().ref('payment_logs').orderByChild('screenshot_hash').equalTo(hash).once('value');
    if (snapshot.exists()) {
      const key = Object.keys(snapshot.val())[0];
      await getConnection().ref(`payment_logs/${key}`).update({ verified: 1, amount_detected: amount, recipient_number: recipient, payment_status: status, verified_at: Math.floor(Date.now() / 1000) });
    }
  },

  async getByHash(hash) {
    const snapshot = await getConnection().ref('payment_logs').orderByChild('screenshot_hash').equalTo(hash).once('value');
    if (snapshot.exists()) { const key = Object.keys(snapshot.val())[0]; return { id: key, ...snapshot.val()[key] }; }
    return null;
  }
};

const AnalyticsQueries = {
  async getToday() {
    const today = new Date().toISOString().split('T')[0];
    const ref = getConnection().ref(`analytics/${today}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      const data = { date: today, new_customers: 0, total_conversations: 0, orders_created: 0, orders_confirmed: 0, orders_delivered: 0, revenue: 0, followups_sent: 0 };
      await ref.set(data);
      return data;
    }
    return snapshot.val();
  },

  async increment(metric, value = 1) {
    const today = new Date().toISOString().split('T')[0];
    const ref = getConnection().ref(`analytics/${today}/${metric}`);
    const snapshot = await ref.once('value');
    await ref.set((snapshot.val() || 0) + value);
  }
};

module.exports = {
  getConnection, closeConnection, migrate,
  CustomerQueries, ConversationQueries, OrderQueries,
  StockQueries, FollowUpQueries, PaymentQueries, AnalyticsQueries
};

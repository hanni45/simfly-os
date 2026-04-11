/**
 * Firebase Database Query Helpers
 * Real-time database operations with same interface as SQLite
 */

const { getConnection } = require('./connection');

// ═══════════════════════════════════════════════════════════════
// CUSTOMER QUERIES
// ═══════════════════════════════════════════════════════════════

const CustomerQueries = {
  /**
   * Get or create customer
   */
  async getOrCreate(number, name = null) {
    const db = getConnection();
    const ref = db.ref(`customers/${number}`);
    const snapshot = await ref.once('value');
    let customer = snapshot.val();

    if (!customer) {
      const now = Date.now();
      customer = {
        number,
        name: name || null,
        stage: 'NEW',
        plan_interest: null,
        last_plan: null,
        total_orders: 0,
        total_spent: 0,
        last_message_at: now,
        first_contact_at: now,
        notes: null,
        banned: 0,
        device_model: null,
        is_compatible: null,
        reminder_count: 0,
        last_reminder_at: null
      };
      await ref.set(customer);
    }

    return customer;
  },

  /**
   * Get customer by number
   */
  async get(number) {
    const db = getConnection();
    const snapshot = await db.ref(`customers/${number}`).once('value');
    return snapshot.val();
  },

  /**
   * Update customer stage
   */
  async updateStage(number, stage) {
    const db = getConnection();
    await db.ref(`customers/${number}`).update({
      stage,
      last_message_at: Date.now()
    });
  },

  /**
   * Update customer data
   */
  async update(number, data) {
    const db = getConnection();
    const updates = {
      ...data,
      last_message_at: Date.now()
    };
    await db.ref(`customers/${number}`).update(updates);
  },

  /**
   * Get customers needing follow-up
   */
  async getFollowUpCandidates(since) {
    const db = getConnection();
    const snapshot = await db.ref('customers')
      .orderByChild('last_message_at')
      .endAt(since)
      .once('value');

    const customers = [];
    snapshot.forEach(child => {
      const customer = child.val();
      if (['INTERESTED', 'PAYMENT_PENDING'].includes(customer.stage) && customer.banned !== 1) {
        customers.push(customer);
      }
    });

    return customers.slice(0, 100);
  },

  /**
   * Increment order count
   */
  async incrementOrders(number, amount) {
    const db = getConnection();
    const ref = db.ref(`customers/${number}`);
    const snapshot = await ref.once('value');
    const customer = snapshot.val();

    if (customer) {
      await ref.update({
        total_orders: (customer.total_orders || 0) + 1,
        total_spent: (customer.total_spent || 0) + amount,
        stage: 'DELIVERED'
      });
    }
  },

  /**
   * Get all customers (paginated - Firebase doesn't support true pagination)
   */
  async getAll(limit = 50, offset = 0) {
    const db = getConnection();
    const snapshot = await db.ref('customers')
      .orderByChild('last_message_at')
      .limitToLast(limit + offset)
      .once('value');

    const customers = [];
    snapshot.forEach(child => customers.push(child.val()));
    return customers.reverse().slice(offset, offset + limit);
  }
};

// ═══════════════════════════════════════════════════════════════
// CONVERSATION QUERIES
// ═══════════════════════════════════════════════════════════════

const ConversationQueries = {
  /**
   * Add message to history
   */
  async add(number, role, message, intent = null, hasImage = false) {
    const db = getConnection();
    const messagesRef = db.ref(`conversations/${number}`);
    const newMessageRef = messagesRef.push();

    await newMessageRef.set({
      role,
      message,
      intent,
      has_image: hasImage ? 1 : 0,
      timestamp: Date.now()
    });

    // Get current messages count and trim if needed
    const snapshot = await messagesRef.once('value');
    const messages = [];
    snapshot.forEach(child => messages.push({ key: child.key, ...child.val() }));

    const maxHistory = parseInt(process.env.MAX_HISTORY) || 20;
    if (messages.length > maxHistory) {
      // Sort by timestamp and remove oldest
      messages.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = messages.slice(0, messages.length - maxHistory);
      const updates = {};
      toRemove.forEach(m => {
        updates[m.key] = null;
      });
      await messagesRef.update(updates);
    }
  },

  /**
   * Get recent conversation history
   */
  async getRecent(number, limit = 10) {
    const db = getConnection();
    const snapshot = await db.ref(`conversations/${number}`)
      .orderByChild('timestamp')
      .limitToLast(limit)
      .once('value');

    const messages = [];
    snapshot.forEach(child => {
      const msg = child.val();
      messages.push({
        role: msg.role,
        message: msg.message,
        intent: msg.intent,
        timestamp: Math.floor(msg.timestamp / 1000)
      });
    });

    return messages;
  },

  /**
   * Get conversation count for analytics
   */
  async getTodayCount() {
    const db = getConnection();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const snapshot = await db.ref('conversations').once('value');
    let count = 0;

    snapshot.forEach(numberSnapshot => {
      numberSnapshot.forEach(msgSnapshot => {
        const msg = msgSnapshot.val();
        if (msg.timestamp >= startOfDay.getTime()) {
          count++;
        }
      });
    });

    return count;
  }
};

// ═══════════════════════════════════════════════════════════════
// ORDER QUERIES
// ═══════════════════════════════════════════════════════════════

const OrderQueries = {
  /**
   * Create new order
   */
  async create(orderId, number, plan, amount) {
    const db = getConnection();
    const order = {
      order_id: orderId,
      number,
      plan,
      amount,
      status: 'PENDING',
      payment_method: null,
      esim_code: null,
      esim_provider: null,
      created_at: Math.floor(Date.now() / 1000),
      confirmed_at: null,
      delivered_at: null
    };

    await db.ref(`orders/${orderId}`).set(order);
    return order;
  },

  /**
   * Get order by ID
   */
  async getById(orderId) {
    const db = getConnection();
    const snapshot = await db.ref(`orders/${orderId}`).once('value');
    return snapshot.val();
  },

  /**
   * Get pending order for customer
   */
  async getPending(number) {
    const db = getConnection();
    const snapshot = await db.ref('orders')
      .orderByChild('number')
      .equalTo(number)
      .once('value');

    let pendingOrder = null;
    snapshot.forEach(child => {
      const order = child.val();
      if (['PENDING', 'CONFIRMED'].includes(order.status)) {
        if (!pendingOrder || order.created_at > pendingOrder.created_at) {
          pendingOrder = order;
        }
      }
    });

    return pendingOrder;
  },

  /**
   * Confirm order (after payment verification)
   */
  async confirm(orderId, esimCode, provider) {
    const db = getConnection();
    await db.ref(`orders/${orderId}`).update({
      status: 'CONFIRMED',
      esim_code: esimCode,
      esim_provider: provider,
      confirmed_at: Math.floor(Date.now() / 1000)
    });
  },

  /**
   * Mark as delivered
   */
  async deliver(orderId) {
    const db = getConnection();
    await db.ref(`orders/${orderId}`).update({
      status: 'DELIVERED',
      delivered_at: Math.floor(Date.now() / 1000)
    });
  },

  /**
   * Get all pending orders
   */
  async getPendingOrders() {
    const db = getConnection();
    const snapshot = await db.ref('orders')
      .orderByChild('status')
      .equalTo('PENDING')
      .once('value');

    const orders = [];
    snapshot.forEach(child => orders.push(child.val()));
    return orders.sort((a, b) => a.created_at - b.created_at);
  },

  /**
   * Get orders by status
   */
  async getByStatus(status, limit = 50) {
    const db = getConnection();
    const snapshot = await db.ref('orders')
      .orderByChild('status')
      .equalTo(status)
      .limitToLast(limit)
      .once('value');

    const orders = [];
    snapshot.forEach(child => orders.push(child.val()));
    return orders.reverse();
  },

  /**
   * Get today's revenue
   */
  async getTodayRevenue() {
    const db = getConnection();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = startTimestamp + 86400;

    const snapshot = await db.ref('orders')
      .orderByChild('status')
      .equalTo('DELIVERED')
      .once('value');

    let revenue = 0;
    snapshot.forEach(child => {
      const order = child.val();
      if (order.delivered_at >= startTimestamp && order.delivered_at < endTimestamp) {
        revenue += order.amount;
      }
    });

    return revenue;
  },

  /**
   * Get stats for period
   */
  async getStats(days = 7) {
    const db = getConnection();
    const since = Math.floor(Date.now() / 1000) - (days * 86400);

    const snapshot = await db.ref('orders')
      .orderByChild('created_at')
      .startAt(since)
      .once('value');

    const stats = {
      total_orders: 0,
      delivered: 0,
      pending: 0,
      confirmed: 0,
      revenue: 0
    };

    snapshot.forEach(child => {
      const order = child.val();
      stats.total_orders++;
      if (order.status === 'DELIVERED') {
        stats.delivered++;
        stats.revenue += order.amount;
      } else if (order.status === 'PENDING') {
        stats.pending++;
      } else if (order.status === 'CONFIRMED') {
        stats.confirmed++;
      }
    });

    return stats;
  }
};

// ═══════════════════════════════════════════════════════════════
// STOCK QUERIES
// ═══════════════════════════════════════════════════════════════

const StockQueries = {
  /**
   * Get stock for plan
   */
  async get(plan) {
    const db = getConnection();
    const snapshot = await db.ref(`stock/${plan}`).once('value');
    const data = snapshot.val();
    return data ? { plan, ...data } : null;
  },

  /**
   * Update stock quantity
   */
  async update(plan, quantity) {
    const db = getConnection();
    await db.ref(`stock/${plan}`).update({
      quantity,
      last_updated: Date.now()
    });
  },

  /**
   * Decrement stock (for auto-delivery)
   */
  async decrement(plan) {
    const db = getConnection();
    const ref = db.ref(`stock/${plan}`);
    const snapshot = await ref.once('value');
    const stock = snapshot.val();

    if (stock && stock.quantity > 0) {
      await ref.update({
        quantity: stock.quantity - 1,
        last_updated: Date.now()
      });
      return true;
    }
    return false;
  },

  /**
   * Get all stock levels
   */
  async getAll() {
    const db = getConnection();
    const snapshot = await db.ref('stock').once('value');

    const stock = [];
    snapshot.forEach(child => {
      stock.push({
        plan: child.key,
        ...child.val()
      });
    });

    return stock;
  },

  /**
   * Get low stock alerts
   */
  async getLowStock() {
    const allStock = await this.getAll();
    return allStock.filter(s => s.quantity <= s.low_threshold);
  }
};

// ═══════════════════════════════════════════════════════════════
// FOLLOW-UP QUERIES
// ═══════════════════════════════════════════════════════════════

const FollowUpQueries = {
  /**
   * Schedule follow-up
   */
  async schedule(number, type, message, scheduledAt) {
    const db = getConnection();
    const newRef = db.ref('follow_ups').push();
    await newRef.set({
      number,
      type,
      message,
      scheduled_at: scheduledAt,
      sent: 0,
      sent_at: null
    });
  },

  /**
   * Get pending follow-ups (ready to send)
   */
  async getPending(now = Math.floor(Date.now() / 1000)) {
    const db = getConnection();
    const snapshot = await db.ref('follow_ups')
      .orderByChild('scheduled_at')
      .endAt(now)
      .once('value');

    const followUps = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data.sent === 0) {
        followUps.push({ id: child.key, ...data });
      }
    });

    return followUps.slice(0, 50);
  },

  /**
   * Mark as sent
   */
  async markSent(id) {
    const db = getConnection();
    await db.ref(`follow_ups/${id}`).update({
      sent: 1,
      sent_at: Math.floor(Date.now() / 1000)
    });
  },

  /**
   * Cancel follow-ups for customer
   */
  async cancelForCustomer(number, type = null) {
    const db = getConnection();
    const snapshot = await db.ref('follow_ups')
      .orderByChild('number')
      .equalTo(number)
      .once('value');

    const updates = {};
    snapshot.forEach(child => {
      const data = child.val();
      if (data.sent === 0 && (!type || data.type === type)) {
        updates[child.key] = null;
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref('follow_ups').update(updates);
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// PAYMENT LOG QUERIES
// ═══════════════════════════════════════════════════════════════

const PaymentQueries = {
  /**
   * Log payment screenshot
   */
  async log(number, orderId, hash, amountExpected) {
    const db = getConnection();

    // Check for existing hash
    const existingSnapshot = await db.ref('payment_logs')
      .orderByChild('screenshot_hash')
      .equalTo(hash)
      .once('value');

    if (existingSnapshot.exists()) {
      return { success: false, error: 'DUPLICATE_SCREENSHOT' };
    }

    const newRef = db.ref('payment_logs').push();
    await newRef.set({
      number,
      order_id: orderId,
      screenshot_hash: hash,
      screenshot_path: null,
      verified: 0,
      amount_detected: null,
      amount_expected: amountExpected,
      recipient_number: null,
      payment_status: null,
      timestamp_detected: Math.floor(Date.now() / 1000),
      verified_at: null,
      verification_notes: ''
    });

    return { success: true };
  },

  /**
   * Verify payment
   */
  async verify(hash, amountDetected, recipient, status, notes = '') {
    const db = getConnection();
    const snapshot = await db.ref('payment_logs')
      .orderByChild('screenshot_hash')
      .equalTo(hash)
      .once('value');

    if (snapshot.exists()) {
      const key = Object.keys(snapshot.val())[0];
      await db.ref(`payment_logs/${key}`).update({
        verified: 1,
        amount_detected: amountDetected,
        recipient_number: recipient,
        payment_status: status,
        verified_at: Math.floor(Date.now() / 1000),
        verification_notes: notes
      });
    }
  },

  /**
   * Get payment by hash
   */
  async getByHash(hash) {
    const db = getConnection();
    const snapshot = await db.ref('payment_logs')
      .orderByChild('screenshot_hash')
      .equalTo(hash)
      .once('value');

    if (snapshot.exists()) {
      const key = Object.keys(snapshot.val())[0];
      return { id: key, ...snapshot.val()[key] };
    }
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════
// ANALYTICS QUERIES
// ═══════════════════════════════════════════════════════════════

const AnalyticsQueries = {
  /**
   * Get or create today's record
   */
  async getToday() {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    const ref = db.ref(`analytics/${today}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      const data = {
        date: today,
        new_customers: 0,
        total_conversations: 0,
        orders_created: 0,
        orders_confirmed: 0,
        orders_delivered: 0,
        revenue: 0,
        followups_sent: 0
      };
      await ref.set(data);
      return data;
    }

    return snapshot.val();
  },

  /**
   * Increment metric
   */
  async increment(metric, value = 1) {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    const ref = db.ref(`analytics/${today}/${metric}`);

    const snapshot = await ref.once('value');
    const current = snapshot.val() || 0;
    await ref.set(current + value);
  },

  /**
   * Get stats range
   */
  async getRange(days = 7) {
    const db = getConnection();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const snapshot = await db.ref('analytics')
      .orderByKey()
      .startAt(sinceStr)
      .once('value');

    const analytics = [];
    snapshot.forEach(child => analytics.push(child.val()));
    return analytics.reverse();
  }
};

module.exports = {
  CustomerQueries,
  ConversationQueries,
  OrderQueries,
  StockQueries,
  FollowUpQueries,
  PaymentQueries,
  AnalyticsQueries
};

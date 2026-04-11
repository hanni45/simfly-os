/**
 * Database Query Helpers
 * Memory-optimized prepared statements
 */

const { getConnection } = require('./connection');

// ═══════════════════════════════════════════════════════════════
// CUSTOMER QUERIES
// ═══════════════════════════════════════════════════════════════

const CustomerQueries = {
  /**
   * Get or create customer
   */
  getOrCreate(number, name = null) {
    const db = getConnection();
    let customer = db.prepare('SELECT * FROM customers WHERE number = ?').get(number);

    if (!customer) {
      db.prepare(`
        INSERT INTO customers (number, name, first_contact_at, last_message_at)
        VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
      `).run(number, name);

      customer = db.prepare('SELECT * FROM customers WHERE number = ?').get(number);
    }

    return customer;
  },

  /**
   * Get customer by number
   */
  get(number) {
    const db = getConnection();
    return db.prepare('SELECT * FROM customers WHERE number = ?').get(number);
  },

  /**
   * Update customer stage
   */
  updateStage(number, stage) {
    const db = getConnection();
    db.prepare(`
      UPDATE customers SET stage = ?, last_message_at = strftime('%s', 'now') WHERE number = ?
    `).run(stage, number);
  },

  /**
   * Update customer data
   */
  update(number, data) {
    const db = getConnection();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), number];
    db.prepare(`UPDATE customers SET ${fields}, last_message_at = strftime('%s', 'now') WHERE number = ?`)
      .run(...values);
  },

  /**
   * Get customers needing follow-up (memory-efficient streaming)
   */
  getFollowUpCandidates(since) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM customers
      WHERE last_message_at < ?
      AND stage IN ('INTERESTED', 'PAYMENT_PENDING')
      AND banned = 0
      ORDER BY last_message_at ASC
      LIMIT 100
    `).all(since);
  },

  /**
   * Increment order count
   */
  incrementOrders(number, amount) {
    const db = getConnection();
    db.prepare(`
      UPDATE customers
      SET total_orders = total_orders + 1,
          total_spent = total_spent + ?,
          stage = 'DELIVERED'
      WHERE number = ?
    `).run(amount, number);
  },

  /**
   * Get all customers (paginated)
   */
  getAll(limit = 50, offset = 0) {
    const db = getConnection();
    return db.prepare('SELECT * FROM customers ORDER BY last_message_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset);
  }
};

// ═══════════════════════════════════════════════════════════════
// CONVERSATION QUERIES
// ═══════════════════════════════════════════════════════════════

const ConversationQueries = {
  /**
   * Add message to history
   */
  add(number, role, message, intent = null, hasImage = false) {
    const db = getConnection();

    // Insert new message
    db.prepare(`
      INSERT INTO conversations (number, role, message, intent, has_image, timestamp)
      VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
    `).run(number, role, message, intent, hasImage ? 1 : 0);

    // Keep only last N messages for memory optimization
    const maxHistory = parseInt(process.env.MAX_HISTORY) || 20;
    db.prepare(`
      DELETE FROM conversations
      WHERE number = ?
      AND id NOT IN (
        SELECT id FROM conversations
        WHERE number = ?
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `).run(number, number, maxHistory);
  },

  /**
   * Get recent conversation history
   */
  getRecent(number, limit = 10) {
    const db = getConnection();
    return db.prepare(`
      SELECT role, message, intent, timestamp
      FROM conversations
      WHERE number = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(number, limit).reverse();
  },

  /**
   * Get conversation count for analytics
   */
  getTodayCount() {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM conversations
      WHERE date(datetime(timestamp, 'unixepoch')) = ?
    `).get(today);
    return result?.count || 0;
  }
};

// ═══════════════════════════════════════════════════════════════
// ORDER QUERIES
// ═══════════════════════════════════════════════════════════════

const OrderQueries = {
  /**
   * Create new order
   */
  create(orderId, number, plan, amount) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO orders (order_id, number, plan, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', strftime('%s', 'now'))
    `).run(orderId, number, plan, amount);
    return this.getById(orderId);
  },

  /**
   * Get order by ID
   */
  getById(orderId) {
    const db = getConnection();
    return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  },

  /**
   * Get pending order for customer
   */
  getPending(number) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM orders
      WHERE number = ? AND status IN ('PENDING', 'CONFIRMED')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(number);
  },

  /**
   * Confirm order (after payment verification)
   */
  confirm(orderId, esimCode, provider) {
    const db = getConnection();
    db.prepare(`
      UPDATE orders
      SET status = 'CONFIRMED',
          esim_code = ?,
          esim_provider = ?,
          confirmed_at = strftime('%s', 'now')
      WHERE order_id = ?
    `).run(esimCode, provider, orderId);
  },

  /**
   * Mark as delivered
   */
  deliver(orderId) {
    const db = getConnection();
    db.prepare(`
      UPDATE orders
      SET status = 'DELIVERED',
          delivered_at = strftime('%s', 'now')
      WHERE order_id = ?
    `).run(orderId);
  },

  /**
   * Get all pending orders
   */
  getPendingOrders() {
    const db = getConnection();
    return db.prepare(`
      SELECT o.*, c.name, c.stage
      FROM orders o
      JOIN customers c ON o.number = c.number
      WHERE o.status = 'PENDING'
      ORDER BY o.created_at ASC
    `).all();
  },

  /**
   * Get orders by status
   */
  getByStatus(status, limit = 50) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?
    `).all(status, limit);
  },

  /**
   * Get today's revenue
   */
  getTodayRevenue() {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as revenue
      FROM orders
      WHERE status = 'DELIVERED'
      AND date(datetime(delivered_at, 'unixepoch')) = ?
    `).get(today);
    return result?.revenue || 0;
  },

  /**
   * Get stats for period
   */
  getStats(days = 7) {
    const db = getConnection();
    return db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'DELIVERED' THEN amount ELSE 0 END) as revenue
      FROM orders
      WHERE created_at > strftime('%s', 'now', '-${days} days')
    `).get();
  }
};

// ═══════════════════════════════════════════════════════════════
// STOCK QUERIES
// ═══════════════════════════════════════════════════════════════

const StockQueries = {
  /**
   * Get stock for plan
   */
  get(plan) {
    const db = getConnection();
    return db.prepare('SELECT * FROM stock WHERE plan = ?').get(plan);
  },

  /**
   * Update stock quantity
   */
  update(plan, quantity) {
    const db = getConnection();
    db.prepare(`
      UPDATE stock
      SET quantity = ?, last_updated = strftime('%s', 'now')
      WHERE plan = ?
    `).run(quantity, plan);
  },

  /**
   * Decrement stock (for auto-delivery)
   */
  decrement(plan) {
    const db = getConnection();
    const result = db.prepare(`
      UPDATE stock
      SET quantity = quantity - 1,
          last_updated = strftime('%s', 'now')
      WHERE plan = ? AND quantity > 0
    `).run(plan);
    return result.changes > 0;
  },

  /**
   * Get all stock levels
   */
  getAll() {
    const db = getConnection();
    return db.prepare('SELECT * FROM stock').all();
  },

  /**
   * Get low stock alerts
   */
  getLowStock() {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM stock WHERE quantity <= low_threshold
    `).all();
  }
};

// ═══════════════════════════════════════════════════════════════
// FOLLOW-UP QUERIES
// ═══════════════════════════════════════════════════════════════

const FollowUpQueries = {
  /**
   * Schedule follow-up
   */
  schedule(number, type, message, scheduledAt) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO follow_ups (number, type, message, scheduled_at)
      VALUES (?, ?, ?, ?)
    `).run(number, type, message, scheduledAt);
  },

  /**
   * Get pending follow-ups (ready to send)
   */
  getPending(now = Math.floor(Date.now() / 1000)) {
    const db = getConnection();
    return db.prepare(`
      SELECT f.*, c.stage, c.name
      FROM follow_ups f
      JOIN customers c ON f.number = c.number
      WHERE f.sent = 0 AND f.scheduled_at <= ?
      ORDER BY f.scheduled_at ASC
      LIMIT 50
    `).all(now);
  },

  /**
   * Mark as sent
   */
  markSent(id) {
    const db = getConnection();
    db.prepare(`
      UPDATE follow_ups
      SET sent = 1, sent_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(id);
  },

  /**
   * Cancel follow-ups for customer
   */
  cancelForCustomer(number, type = null) {
    const db = getConnection();
    if (type) {
      db.prepare(`DELETE FROM follow_ups WHERE number = ? AND type = ? AND sent = 0`).run(number, type);
    } else {
      db.prepare(`DELETE FROM follow_ups WHERE number = ? AND sent = 0`).run(number);
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
  log(number, orderId, hash, amountExpected) {
    const db = getConnection();
    try {
      db.prepare(`
        INSERT INTO payment_logs (number, order_id, screenshot_hash, amount_expected, timestamp_detected)
        VALUES (?, ?, ?, ?, strftime('%s', 'now'))
      `).run(number, orderId, hash, amountExpected);
      return { success: true };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'DUPLICATE_SCREENSHOT' };
      }
      throw err;
    }
  },

  /**
   * Verify payment
   */
  verify(hash, amountDetected, recipient, status, notes = '') {
    const db = getConnection();
    db.prepare(`
      UPDATE payment_logs
      SET verified = 1,
          amount_detected = ?,
          recipient_number = ?,
          payment_status = ?,
          verified_at = strftime('%s', 'now'),
          verification_notes = ?
      WHERE screenshot_hash = ?
    `).run(amountDetected, recipient, status, notes, hash);
  },

  /**
   * Get payment by hash
   */
  getByHash(hash) {
    const db = getConnection();
    return db.prepare('SELECT * FROM payment_logs WHERE screenshot_hash = ?').get(hash);
  }
};

// ═══════════════════════════════════════════════════════════════
// ANALYTICS QUERIES
// ═══════════════════════════════════════════════════════════════

const AnalyticsQueries = {
  /**
   * Get or create today's record
   */
  getToday() {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    let record = db.prepare('SELECT * FROM analytics WHERE date = ?').get(today);

    if (!record) {
      db.prepare('INSERT INTO analytics (date) VALUES (?)').run(today);
      record = db.prepare('SELECT * FROM analytics WHERE date = ?').get(today);
    }

    return record;
  },

  /**
   * Increment metric
   */
  increment(metric, value = 1) {
    const db = getConnection();
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO analytics (date, ${metric})
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET ${metric} = ${metric} + ?
    `).run(today, value, value);
  },

  /**
   * Get stats range
   */
  getRange(days = 7) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM analytics
      WHERE date >= date('now', '-${days} days')
      ORDER BY date DESC
    `).all();
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

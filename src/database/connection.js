/**
 * Database Connection Manager
 * Memory-optimized SQLite with WAL mode
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/simfly.db';
const WAL_MODE = process.env.DB_WAL_MODE !== 'false';

let db = null;

/**
 * Initialize database connection
 * @returns {Database} SQLite database instance
 */
function getConnection() {
  if (db) return db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH, {
    verbose: process.env.LOG_LEVEL === 'debug' ? console.log : null
  });

  // Performance optimizations
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('mmap_size = 268435456'); // 256MB memory map

  return db;
}

/**
 * Close database connection
 */
function closeConnection() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run database migrations
 */
function migrate() {
  const db = getConnection();

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      number TEXT PRIMARY KEY,
      name TEXT,
      stage TEXT DEFAULT 'NEW',
      plan_interest TEXT,
      last_plan TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      last_message_at INTEGER,
      first_contact_at INTEGER DEFAULT (strftime('%s', 'now')),
      notes TEXT,
      banned INTEGER DEFAULT 0,
      device_model TEXT,
      is_compatible INTEGER,
      reminder_count INTEGER DEFAULT 0,
      last_reminder_at INTEGER
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_stage ON customers(stage)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_last_message ON customers(last_message_at)`);

  // Conversations table (limited history for memory optimization)
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      role TEXT,
      message TEXT,
      intent TEXT,
      has_image INTEGER DEFAULT 0,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (number) REFERENCES customers(number)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_number ON conversations(number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)`);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      number TEXT,
      plan TEXT,
      amount INTEGER,
      status TEXT DEFAULT 'PENDING',
      payment_method TEXT,
      esim_code TEXT,
      esim_provider TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      confirmed_at INTEGER,
      delivered_at INTEGER,
      FOREIGN KEY (number) REFERENCES customers(number)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`);

  // Payment logs with screenshot hash for duplicates
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      order_id TEXT,
      screenshot_hash TEXT UNIQUE,
      screenshot_path TEXT,
      verified INTEGER DEFAULT 0,
      amount_detected INTEGER,
      amount_expected INTEGER,
      recipient_number TEXT,
      payment_status TEXT,
      timestamp_detected INTEGER,
      verified_at INTEGER,
      verification_notes TEXT,
      FOREIGN KEY (number) REFERENCES customers(number),
      FOREIGN KEY (order_id) REFERENCES orders(order_id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_payment_logs_hash ON payment_logs(screenshot_hash)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payment_logs_number ON payment_logs(number)`);

  // Stock table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      plan TEXT PRIMARY KEY,
      quantity INTEGER DEFAULT 0,
      low_threshold INTEGER DEFAULT 3,
      last_updated INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Insert default stock
  const insertStock = db.prepare(`
    INSERT OR IGNORE INTO stock (plan, quantity, low_threshold) VALUES (?, ?, ?)
  `);
  insertStock.run('500MB', 100, 5);
  insertStock.run('1GB', 100, 5);
  insertStock.run('5GB', 50, 3);

  // Follow-ups queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      type TEXT,
      message TEXT,
      scheduled_at INTEGER,
      sent INTEGER DEFAULT 0,
      sent_at INTEGER,
      FOREIGN KEY (number) REFERENCES customers(number)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_at, sent)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_follow_ups_number ON follow_ups(number)`);

  // Waitlist
  db.exec(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      plan TEXT,
      added_at INTEGER DEFAULT (strftime('%s', 'now')),
      notified INTEGER DEFAULT 0,
      FOREIGN KEY (number) REFERENCES customers(number)
    )
  `);

  // Daily analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      date TEXT PRIMARY KEY,
      new_customers INTEGER DEFAULT 0,
      total_conversations INTEGER DEFAULT 0,
      orders_created INTEGER DEFAULT 0,
      orders_confirmed INTEGER DEFAULT 0,
      orders_delivered INTEGER DEFAULT 0,
      revenue INTEGER DEFAULT 0,
      followups_sent INTEGER DEFAULT 0
    )
  `);

  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Insert default config
  db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`)
    .run('version', '5.0.0');
  db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`)
    .run('bot_status', 'ACTIVE');

  return true;
}

module.exports = {
  getConnection,
  closeConnection,
  migrate
};

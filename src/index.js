/"""
 * ═══════════════════════════════════════════════════════════════
 * SIMFLY OS v5.0 — MEMORY OPTIMIZED PRODUCTION BUILD
 * WhatsApp Sales & Support Bot
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Internal modules
const logger = require('./utils/logger');
const { migrate, closeConnection } = require('./database/connection');
const { handleMessage } = require('./handlers/messageHandler');
const scheduler = require('./services/scheduler');
const startupSync = require('./services/startupSync');
const ai = require('./services/ai');
const vision = require('./services/vision');

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  // Don't exit immediately, try to clean up
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutting down gracefully...');

  try {
    // Stop scheduler
    scheduler.stop();

    // Close database
    closeConnection();

    // Destroy WhatsApp client
    if (client) {
      await client.destroy();
    }

    logger.info('Shutdown complete');
  } catch (err) {
    logger.error('Shutdown error', { error: err.message });
  }

  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// DATABASE SETUP
// ═══════════════════════════════════════════════════════════════

logger.info('Initializing SimFly OS v5.0...');

// Initialize database
try {
  migrate();
  logger.info('Database initialized');
} catch (err) {
  logger.error('Database initialization failed', { error: err.message });
  process.exit(1);
}

// Log service status
logger.info('Service Status', {
  ai: ai.isEnabled() ? 'ENABLED' : 'DISABLED',
  vision: vision.isEnabled() ? 'ENABLED' : 'DISABLED',
  mode: process.env.BOT_MODE || 'public'
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP CLIENT SETUP
// ═══════════════════════════════════════════════════════════════

// Puppeteer args for memory optimization
const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
  '--disable-web-security',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--memory-pressure-off'
];

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './data/session'
  }),
  puppeteer: {
    headless: true,
    args: puppeteerArgs
  },
  // Memory optimizations
  qrMaxRetries: 5,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 0
});

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

client.on('qr', (qr) => {
  logger.info('QR Code received - Scan with WhatsApp');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  logger.info('WhatsApp authenticated successfully');
});

client.on('auth_failure', (msg) => {
  logger.error('Authentication failed', { error: msg });
});

client.on('ready', async () => {
  logger.info('🚀 SimFly OS is ready!');

  // Sync existing WhatsApp chats to database (silent, no notifications)
  await startupSync.syncExistingChats(client);

  // Log sync summary
  const syncSummary = startupSync.getSyncSummary();
  logger.info('📊 Database sync summary', syncSummary);

  // Initialize scheduler
  scheduler.init(client);

  // Log startup analytics
  const { AnalyticsQueries } = require('./database/queries');
  AnalyticsQueries.increment('new_customers', 0); // Ensure today exists
});

client.on('message', async (msg) => {
  // Skip status broadcasts and groups
  if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) {
    return;
  }

  try {
    await handleMessage(msg, client);
  } catch (err) {
    logger.error('Message handling error', {
      error: err.message,
      from: msg.from
    });
  }
});

client.on('message_create', async (msg) => {
  // Handle own messages (for testing)
  if (msg.fromMe) return;
});

client.on('disconnected', (reason) => {
  logger.warn('WhatsApp disconnected', { reason });
});

client.on('change_state', (state) => {
  logger.info('State changed', { state });
});

// ═══════════════════════════════════════════════════════════════
// MEMORY MONITORING
// ═══════════════════════════════════════════════════════════════

// Log memory usage every 5 minutes
setInterval(() => {
  const usage = process.memoryUsage();
  logger.debug('Memory usage', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB'
  });

  // Warn if memory usage is high
  if (usage.heapUsed > 400 * 1024 * 1024) { // 400MB
    logger.warn('High memory usage detected', {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
    });
  }

  // Force garbage collection if available (requires --expose-gc flag)
  if (global.gc) {
    global.gc();
    logger.debug('Garbage collection triggered');
  }
}, 5 * 60 * 1000); // 5 minutes

// ═══════════════════════════════════════════════════════════════
// START BOT
// ═══════════════════════════════════════════════════════════════

logger.info('Starting WhatsApp client...');
client.initialize().catch(err => {
  logger.error('Failed to initialize client', { error: err.message });
  process.exit(1);
});

// Export for testing
module.exports = { client };

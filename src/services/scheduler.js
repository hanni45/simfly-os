/**
 * Follow-up Scheduler
 * Lightweight cron-based scheduler for automated follow-ups
 */

const cron = require('node-cron');
const { FollowUpQueries, CustomerQueries, OrderQueries } = require('../database/queries');

let client = null;
let isRunning = false;

/**
 * Initialize scheduler
 * @param {Object} whatsappClient - WhatsApp client instance
 */
function init(whatsappClient) {
  client = whatsappClient;

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await processFollowUps();
  });

  // Daily analytics update at midnight
  cron.schedule('0 0 * * *', async () => {
    await updateDailyAnalytics();
  });

  // Low stock check every hour
  cron.schedule('0 * * * *', async () => {
    await checkLowStock();
  });

  isRunning = true;
  console.log('📅 Scheduler initialized');
}

/**
 * Process pending follow-ups
 */
async function processFollowUps() {
  if (!client) return;

  const now = Math.floor(Date.now() / 1000);
  const pending = FollowUpQueries.getPending(now);

  for (const followUp of pending) {
    try {
      // Send message
      await client.sendMessage(followUp.number, followUp.message);

      // Mark as sent
      FollowUpQueries.markSent(followUp.id);

      // Update analytics
      const { AnalyticsQueries } = require('../database/queries');
      AnalyticsQueries.increment('followups_sent');

      console.log(`📤 Follow-up sent to ${followUp.number}`);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Follow-up error for ${followUp.number}:`, error.message);
    }
  }
}

/**
 * Schedule post-delivery check (24 hours after)
 * @param {string} number - Customer number
 * @param {string} plan - Plan name
 */
function schedulePostDelivery(number, plan) {
  const deliveryTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

  FollowUpQueries.schedule(
    number,
    'POST_DELIVERY',
    `Bhai ${plan} eSIM theek chal raha hai? 😊\n\nKoi issue ho toh batana — main check karke batata hoon 👍`,
    deliveryTime
  );
}

/**
 * Schedule abandoned cart recovery (2 hours after interest)
 * @param {string} number - Customer number
 */
function scheduleAbandonedCart(number) {
  // Cancel any existing abandoned cart for this customer
  FollowUpQueries.cancelForCustomer(number, 'ABANDONED_CART');

  const reminderTime = Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours

  FollowUpQueries.schedule(
    number,
    'ABANDONED_CART',
    `Bhai abhi bhi available hai — order karna tha na? 😊\n\nPlans:\n🟢 500MB - Rs 130\n🔵 1GB - Rs 350\n🟣 5GB - Rs 1,250`,
    reminderTime
  );
}

/**
 * Schedule recovery message (7 days after going silent)
 * @param {string} number - Customer number
 */
function scheduleRecovery(number) {
  const recoveryTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days

  FollowUpQueries.schedule(
    number,
    'RECOVERY',
    `Arey bhai! SimFly wala kaam karna tha? 😄\n\nAbhi bhi available hoon — kuch chahiye toh batao 👍`,
    recoveryTime
  );
}

/**
 * Update daily analytics
 */
async function updateDailyAnalytics() {
  try {
    const { AnalyticsQueries } = require('../database/queries');
    const today = AnalyticsQueries.getToday();

    // Log daily summary
    console.log(`📊 Daily Update - ${new Date().toDateString()}`);
    console.log(`   New Customers: ${today.new_customers}`);
    console.log(`   Revenue: Rs ${today.revenue}`);
    console.log(`   Orders: ${today.orders_delivered}`);
  } catch (error) {
    console.error('Analytics update error:', error);
  }
}

/**
 * Check low stock and alert admin
 */
async function checkLowStock() {
  try {
    const { StockQueries } = require('../database/queries');
    const lowStock = StockQueries.getLowStock();

    if (lowStock.length > 0) {
      const adminNumber = process.env.ADMIN_NUMBER;
      if (!adminNumber || !client) return;

      const lines = lowStock.map(s => `⚠️ ${s.plan}: ${s.quantity} left (threshold: ${s.low_threshold})`);
      const message = `*Low Stock Alert*\n\n${lines.join('\n')}\n\nRestock karo bhai! 📦`;

      await client.sendMessage(adminNumber, message);
      console.log('📦 Low stock alert sent to admin');
    }
  } catch (error) {
    console.error('Stock check error:', error);
  }
}

/**
 * Stop scheduler
 */
function stop() {
  isRunning = false;
}

module.exports = {
  init,
  stop,
  schedulePostDelivery,
  scheduleAbandonedCart,
  scheduleRecovery,
  isRunning: () => isRunning
};

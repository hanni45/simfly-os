/"""
 * Admin Commands System
 * Full control interface for admin
 */

const {
  CustomerQueries,
  OrderQueries,
  StockQueries,
  AnalyticsQueries,
  FollowUpQueries
} = require('../database/queries');

const ADMIN_NUMBER = process.env.ADMIN_NUMBER;

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle admin command
 * @param {string} text - Command text
 * @param {string} number - Sender number
 * @returns {string|null} - Response or null if not admin
 */
async function handle(text, number) {
  if (!isAdmin(number)) {
    return 'Yeh command available nahi hai 😊';
  }

  const parts = text.slice(1).trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    // Order commands
    case 'orders':
      return await handleOrders(args);
    case 'confirm':
      return await handleConfirm(args);
    case 'deliver':
      return await handleDeliver(args);
    case 'cancel':
      return await handleCancel(args);

    // Stock commands
    case 'stock':
      return await handleStock(args);

    // Customer commands
    case 'customer':
      return await handleCustomer(args);
    case 'ban':
      return await handleBan(args);
    case 'unban':
      return await handleUnban(args);

    // Bot control
    case 'pause':
      return await handlePause();
    case 'resume':
      return await handleResume();
    case 'status':
      return await handleStatus();

    // Broadcast
    case 'broadcast':
      return await handleBroadcast(args);

    // Analytics
    case 'stats':
      return await handleStats(args);

    // Help
    case 'help':
      return handleHelp();

    default:
      return `Unknown command: /${command}\n\nType /help for available commands`;
  }
}

// ═══════════════════════════════════════════════════════════════
// ORDER COMMANDS
// ═══════════════════════════════════════════════════════════════

async function handleOrders(args) {
  const status = args[0] || 'pending';
  const orders = await OrderQueries.getByStatus(status.toUpperCase(), 20);

  if (orders.length === 0) {
    return `No ${status} orders found`;
  }

  const lines = orders.map(o => {
    const time = new Date(o.created_at * 1000).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
    return `📦 ${o.order_id}\n   ${o.plan} | Rs ${o.amount} | ${time}`;
  });

  return `*${status.toUpperCase()} Orders (${orders.length})*\n\n${lines.join('\n\n')}`;
}

async function handleConfirm(args) {
  const [orderId, ...rest] = args;
  if (!orderId) return 'Usage: /confirm [order_id] [esim_code]';

  const order = await OrderQueries.getById(orderId);
  if (!order) return `Order ${orderId} not found`;

  const esimCode = rest.join(' ') || 'MANUAL';
  await OrderQueries.confirm(orderId, esimCode, 'Admin');

  return `✅ Order ${orderId} confirmed\n   Code: ${esimCode}`;
}

async function handleDeliver(args) {
  const [orderId] = args;
  if (!orderId) return 'Usage: /deliver [order_id]';

  const order = await OrderQueries.getById(orderId);
  if (!order) return `Order ${orderId} not found`;

  await OrderQueries.deliver(orderId);
  await CustomerQueries.incrementOrders(order.number, order.amount);

  return `✅ Order ${orderId} marked as delivered`;
}

async function handleCancel(args) {
  const [orderId, reason] = args;
  if (!orderId) return 'Usage: /cancel [order_id] [reason]';

  const order = await OrderQueries.getById(orderId);
  if (!order) return `Order ${orderId} not found`;

  // Update order status
  const db = require('../database/connection').getConnection();
  await db.ref(`orders/${orderId}/status`).set('CANCELLED');

  return `❌ Order ${orderId} cancelled\n   Reason: ${reason || 'Not specified'}`;
}

// ═══════════════════════════════════════════════════════════════
// STOCK COMMANDS
// ═══════════════════════════════════════════════════════════════

async function handleStock(args) {
  if (args.length === 0) {
    // Show current stock
    const stocks = await StockQueries.getAll();
    const lines = stocks.map(s => {
      const status = s.quantity <= s.low_threshold ? '🔴 LOW' : '🟢 OK';
      return `📦 ${s.plan}: ${s.quantity} left ${status}`;
    });
    return `*Current Stock*\n\n${lines.join('\n')}`;
  }

  const [plan, qty] = args;
  const quantity = parseInt(qty);

  if (!plan || isNaN(quantity)) {
    return 'Usage: /stock [plan] [quantity]\nExample: /stock 1GB 50';
  }

  const validPlans = ['500MB', '1GB', '5GB'];
  if (!validPlans.includes(plan.toUpperCase())) {
    return `Invalid plan. Use: ${validPlans.join(', ')}`;
  }

  await StockQueries.update(plan.toUpperCase(), quantity);
  return `✅ ${plan} stock updated to ${quantity}`;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER COMMANDS
// ═══════════════════════════════════════════════════════════════

async function handleCustomer(args) {
  const [number] = args;
  if (!number) return 'Usage: /customer [phone_number]';

  const customer = await CustomerQueries.get(number);
  if (!customer) return `Customer ${number} not found`;

  return `*Customer Profile*\n\n` +
    `📱 Number: ${customer.number}\n` +
    `👤 Name: ${customer.name || 'N/A'}\n` +
    `📊 Stage: ${customer.stage}\n` +
    `📦 Orders: ${customer.total_orders}\n` +
    `💰 Total Spent: Rs ${customer.total_spent}\n` +
    `🔧 Device: ${customer.device_model || 'Unknown'}\n` +
    `🚫 Banned: ${customer.banned ? 'Yes' : 'No'}\n\n` +
    `First contact: ${new Date(customer.first_contact_at * 1000).toLocaleDateString()}`;
}

async function handleBan(args) {
  const [number, ...reasonParts] = args;
  if (!number) return 'Usage: /ban [number] [reason]';

  await CustomerQueries.update(number, { banned: 1 });
  return `🚫 Customer ${number} banned\nReason: ${reasonParts.join(' ') || 'Not specified'}`;
}

async function handleUnban(args) {
  const [number] = args;
  if (!number) return 'Usage: /unban [number]';

  await CustomerQueries.update(number, { banned: 0 });
  return `✅ Customer ${number} unbanned`;
}

// ═══════════════════════════════════════════════════════════════
// BOT CONTROL
// ═══════════════════════════════════════════════════════════════

async function handlePause() {
  const db = require('../database/connection').getConnection();
  await db.ref('config/bot_status').set('PAUSED');
  return '⏸️ Bot paused. No new replies will be sent.';
}

async function handleResume() {
  const db = require('../database/connection').getConnection();
  await db.ref('config/bot_status').set('ACTIVE');
  return '▶️ Bot resumed. Normal operation restored.';
}

async function handleStatus() {
  const db = require('../database/connection').getConnection();
  const statusSnapshot = await db.ref('config/bot_status').once('value');
  const status = statusSnapshot.val();

  const today = await AnalyticsQueries.getToday();
  const stock = await StockQueries.getAll();
  const pendingOrders = await OrderQueries.getPendingOrders();

  return `*System Status*\n\n` +
    `🤖 Bot: ${status || 'UNKNOWN'}\n` +
    `📦 Pending Orders: ${pendingOrders.length}\n` +
    `💰 Today's Revenue: Rs ${today.revenue}\n` +
    `👥 New Customers Today: ${today.new_customers}\n\n` +
    `*Stock Levels*\n` +
    stock.map(s => `• ${s.plan}: ${s.quantity}`).join('\n');
}

// ═══════════════════════════════════════════════════════════════
// BROADCAST
// ═══════════════════════════════════════════════════════════════

async function handleBroadcast(args) {
  const message = args.join(' ');
  if (!message) return 'Usage: /broadcast [message]';

  // This would be handled by the main bot to actually send messages
  // Here we just prepare the broadcast
  return `📢 Broadcast queued:\n\n"${message}"\n\nUse the broadcast function in main bot to send to all customers.`;
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════

async function handleStats(args) {
  const period = args[0] || 'today';
  let days = 1;

  if (period === 'week') days = 7;
  if (period === 'month') days = 30;

  const stats = await OrderQueries.getStats(days);
  const analytics = await AnalyticsQueries.getRange(days);

  const totalConv = analytics.reduce((sum, a) => sum + (a.total_conversations || 0), 0);
  const totalRevenue = analytics.reduce((sum, a) => sum + (a.revenue || 0), 0);

  return `*Stats (${period})*\n\n` +
    `📦 Orders:\n` +
    `  • Total: ${stats.total_orders}\n` +
    `  • Delivered: ${stats.delivered}\n` +
    `  • Pending: ${stats.pending}\n\n` +
    `💰 Revenue: Rs ${totalRevenue}\n` +
    `💬 Conversations: ${totalConv}\n` +
    `📊 Conversion: ${stats.total_orders > 0 ? Math.round((stats.delivered / stats.total_orders) * 100) : 0}%`;
}

// ═══════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════

function handleHelp() {
  return `*Admin Commands*\n\n` +
    `*Orders:*\n` +
    `/orders [status] - List orders\n` +
    `/confirm [id] [code] - Confirm order\n` +
    `/deliver [id] - Mark delivered\n` +
    `/cancel [id] [reason] - Cancel order\n\n` +
    `*Stock:*\n` +
    `/stock - View stock\n` +
    `/stock [plan] [qty] - Update stock\n\n` +
    `*Customers:*\n` +
    `/customer [number] - View profile\n` +
    `/ban [number] [reason]\n` +
    `/unban [number]\n\n` +
    `*Bot:*\n` +
    `/pause - Pause bot\n` +
    `/resume - Resume bot\n` +
    `/status - System status\n\n` +
    `*Analytics:*\n` +
    `/stats [today/week/month]`;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function isAdmin(number) {
  if (!ADMIN_NUMBER) return false;

  const normalizedInput = number.replace(/\D/g, '').replace(/^92/, '0');
  const normalizedAdmin = ADMIN_NUMBER.replace(/\D/g, '').replace(/^92/, '0');

  return normalizedInput.includes(normalizedAdmin) || normalizedAdmin.includes(normalizedInput);
}

module.exports = {
  handle,
  isAdmin
};

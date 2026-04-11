#!/usr/bin/env node
/**
 * Statistics Viewer Script
 * Run: node scripts/stats.js [today|week|month]
 */

require('dotenv').config();
const { getConnection, closeConnection } = require('../src/database/connection');

const period = process.argv[2] || 'today';

console.log(`📊 SimFly OS Statistics (${period})\n`);

try {
  const db = getConnection();

  // Get date range
  let dateFilter;
  if (period === 'today') {
    dateFilter = "date = date('now')";
  } else if (period === 'week') {
    dateFilter = "date >= date('now', '-7 days')";
  } else if (period === 'month') {
    dateFilter = "date >= date('now', '-30 days')";
  } else {
    console.log('Usage: node stats.js [today|week|month]');
    process.exit(1);
  }

  // Analytics
  const analytics = db.prepare(`
    SELECT
      SUM(new_customers) as new_customers,
      SUM(total_conversations) as conversations,
      SUM(orders_created) as orders_created,
      SUM(orders_delivered) as orders_delivered,
      SUM(revenue) as revenue
    FROM analytics
    WHERE ${dateFilter}
  `).get();

  // Customers by stage
  const stages = db.prepare(`
    SELECT stage, COUNT(*) as count
    FROM customers
    GROUP BY stage
  `).all();

  // Stock levels
  const stock = db.prepare('SELECT * FROM stock').all();

  // Pending orders
  const pendingOrders = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'
  `).get();

  console.log('━'.repeat(40));
  console.log('📈 Analytics');
  console.log('━'.repeat(40));
  console.log(`New Customers:    ${analytics.new_customers || 0}`);
  console.log(`Conversations:    ${analytics.conversations || 0}`);
  console.log(`Orders Created:   ${analytics.orders_created || 0}`);
  console.log(`Orders Delivered: ${analytics.orders_delivered || 0}`);
  console.log(`Revenue:          Rs ${analytics.revenue || 0}`);

  console.log('\n' + '━'.repeat(40));
  console.log('👥 Customers by Stage');
  console.log('━'.repeat(40));
  stages.forEach(s => {
    console.log(`${s.stage.padEnd(20)} ${s.count}`);
  });

  console.log('\n' + '━'.repeat(40));
  console.log('📦 Stock Levels');
  console.log('━'.repeat(40));
  stock.forEach(s => {
    const status = s.quantity <= s.low_threshold ? '🔴 LOW' : '🟢 OK';
    console.log(`${s.plan.padEnd(10)} ${s.quantity.toString().padStart(4)} ${status}`);
  });

  console.log('\n' + '━'.repeat(40));
  console.log('⏳ Pending Orders:', pendingOrders.count);
  console.log('━'.repeat(40));

} catch (err) {
  console.error('Error:', err.message);
} finally {
  closeConnection();
}

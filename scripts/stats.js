#!/usr/bin/env node
/**
 * Statistics Viewer Script
 * Run: node scripts/stats.js [today|week|month]
 */

require('dotenv').config();
const { getConnection, closeConnection } = require('../src/database/connection');
const { StockQueries, AnalyticsQueries } = require('../src/database/queries');

const period = process.argv[2] || 'today';

console.log(`📊 SimFly OS Statistics (${period})\n`);

(async () => {
  try {
    // Ensure connection
    getConnection();

    // Get analytics
    let analytics;
    if (period === 'today') {
      analytics = [await AnalyticsQueries.getToday()];
    } else {
      const days = period === 'week' ? 7 : 30;
      analytics = await AnalyticsQueries.getRange(days);
    }

    // Aggregate stats
    const totals = analytics.reduce((acc, a) => ({
      new_customers: acc.new_customers + (a.new_customers || 0),
      conversations: acc.conversations + (a.total_conversations || 0),
      orders_created: acc.orders_created + (a.orders_created || 0),
      orders_delivered: acc.orders_delivered + (a.orders_delivered || 0),
      revenue: acc.revenue + (a.revenue || 0)
    }), {
      new_customers: 0,
      conversations: 0,
      orders_created: 0,
      orders_delivered: 0,
      revenue: 0
    });

    // Stock levels
    const stock = await StockQueries.getAll();

    console.log('━'.repeat(40));
    console.log('📈 Analytics');
    console.log('━'.repeat(40));
    console.log(`New Customers:    ${totals.new_customers}`);
    console.log(`Conversations:    ${totals.conversations}`);
    console.log(`Orders Created:   ${totals.orders_created}`);
    console.log(`Orders Delivered: ${totals.orders_delivered}`);
    console.log(`Revenue:          Rs ${totals.revenue}`);

    console.log('\n' + '━'.repeat(40));
    console.log('📦 Stock Levels');
    console.log('━'.repeat(40));
    stock.forEach(s => {
      const status = s.quantity <= s.low_threshold ? '🔴 LOW' : '🟢 OK';
      console.log(`${s.plan.padEnd(10)} ${s.quantity.toString().padStart(4)} ${status}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    closeConnection();
  }
})();

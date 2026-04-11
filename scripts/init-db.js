/#!/usr/bin/env node
/**
 * Database Initialization Script
 * Run: node scripts/init-db.js
 */

const { migrate, closeConnection } = require('../src/database/connection');

console.log('Initializing SimFly OS database...');

try {
  migrate();
  console.log('✅ Database initialized successfully');
} catch (err) {
  console.error('❌ Database initialization failed:', err.message);
  process.exit(1);
} finally {
  closeConnection();
}

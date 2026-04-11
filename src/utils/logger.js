/"""
 * Logger Utility
 * Memory-optimized logging with rotation
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || './logs/simfly.log';

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Ensure log directory exists
if (LOG_TO_FILE) {
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Format log message
 */
function format(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

/**
 * Write to console and file
 */
function output(level, message, meta = {}) {
  if (LEVELS[level] > LEVELS[LOG_LEVEL]) return;

  const formatted = format(level, message, meta);

  // Console output
  console.log(formatted);

  // File output
  if (LOG_TO_FILE) {
    try {
      fs.appendFileSync(LOG_FILE_PATH, formatted + '\n');
    } catch (err) {
      // Silently fail on file write errors
    }
  }
}

module.exports = {
  error: (msg, meta) => output('error', msg, meta),
  warn: (msg, meta) => output('warn', msg, meta),
  info: (msg, meta) => output('info', msg, meta),
  debug: (msg, meta) => output('debug', msg, meta),

  // Express middleware
  middleware: () => (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      output('info', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  }
};

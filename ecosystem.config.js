// PM2 Configuration for SimFly OS
// Run with: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'simfly-os',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    env_development: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    },
    // Auto-restart on failure
    autorestart: true,
    // Restart delay
    restart_delay: 5000,
    // Max restarts in 60 seconds
    max_restarts: 10,
    // Minimum uptime before restart considered stable
    min_uptime: '10s',
    // Log settings
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Error log
    error_file: './logs/err.log',
    // Output log
    out_file: './logs/out.log',
    // Combine logs
    merge_logs: true,
    // Log size limit (10MB)
    log_max_size: '10M',
    // Keep 5 log files
    log_max_files: 5,
    // Kill timeout
    kill_timeout: 5000,
    // Listen for shutdown signals
    listen_timeout: 10000,
    // Node args for memory optimization
    node_args: '--max-old-space-size=512 --optimize-for-size'
  }]
};

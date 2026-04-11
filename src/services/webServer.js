/**
 * Web Server
 * Serves QR code and status dashboard for Railway deployment
 */

const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// State
let currentQR = null;
let botStatus = 'INITIALIZING';
let botInfo = {};

// Middleware
app.use(express.static(path.join(__dirname, '../../public')));
app.use(express.json());

/**
 * Generate HTML page with QR code
 */
function generateHTML(qrDataUrl, status) {
  const statusColor = {
    'INITIALIZING': '#f59e0b',
    'QR_READY': '#3b82f6',
    'SCANNED': '#10b981',
    'READY': '#10b981',
    'DISCONNECTED': '#ef4444',
    'ERROR': '#ef4444'
  }[status] || '#6b7280';

  const statusMessage = {
    'INITIALIZING': 'Bot is starting up...',
    'QR_READY': 'Scan this QR code with WhatsApp',
    'SCANNED': 'QR code scanned! Connecting...',
    'READY': 'Bot is online and ready',
    'DISCONNECTED': 'Bot disconnected. Restarting...',
    'ERROR': 'An error occurred'
  }[status] || 'Unknown status';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS - WhatsApp Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-size: 32px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 10px;
        }
        .tagline {
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 30px;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 20px;
            background: ${statusColor}20;
            color: ${statusColor};
        }
        .qr-container {
            background: #f3f4f6;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 20px;
            min-height: 300px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        .qr-code {
            max-width: 256px;
            width: 100%;
            height: auto;
            border-radius: 8px;
        }
        .qr-placeholder {
            width: 256px;
            height: 256px;
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #9ca3af;
            font-size: 14px;
        }
        .instructions {
            color: #4b5563;
            font-size: 14px;
            line-height: 1.6;
        }
        .instructions ol {
            text-align: left;
            margin-top: 10px;
            padding-left: 20px;
        }
        .instructions li {
            margin: 8px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #9ca3af;
            font-size: 12px;
        }
        .refresh-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            margin-top: 10px;
            transition: background 0.2s;
        }
        .refresh-btn:hover {
            background: #2563eb;
        }
        .spinner {
            border: 4px solid #f3f4f6;
            border-top: 4px solid ${statusColor};
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">SimFly OS</div>
        <div class="tagline">WhatsApp Sales & Support Bot</div>

        <div class="status-badge" id="status">${status}</div>

        <div class="qr-container">
            ${qrDataUrl
                ? `<img src="${qrDataUrl}" alt="WhatsApp QR Code" class="qr-code" id="qr-image">`
                : status === 'INITIALIZING'
                    ? `<div class="spinner"></div><p style="margin-top:20px;color:#6b7280;">Generating QR code...</p>`
                    : `<div class="qr-placeholder">QR Code will appear here</div>`
            }
        </div>

        <div class="instructions">
            <p><strong>${statusMessage}</strong></p>
            ${status === 'QR_READY' ? `
            <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Tap Menu or Settings and select "Linked Devices"</li>
                <li>Point your phone to this screen to capture the code</li>
            </ol>
            ` : ''}
        </div>

        <button class="refresh-btn" onclick="location.reload()">Refresh Status</button>

        <div class="footer">
            SimFly Pakistan © 2025 | Fly Free, Stay Connected
        </div>
    </div>

    <script>
        // Auto-refresh every 10 seconds when waiting for QR
        const currentStatus = '${status}';
        if (currentStatus === 'INITIALIZING' || currentStatus === 'QR_READY') {
            setTimeout(() => location.reload(), 10000);
        }

        // WebSocket or SSE could be added here for real-time updates
    </script>
</body>
</html>`;
}

/**
 * Update QR code
 */
function setQR(qrText) {
  currentQR = qrText;
  botStatus = 'QR_READY';
}

/**
 * Clear QR code (when scanned)
 */
function clearQR() {
  currentQR = null;
  botStatus = 'SCANNED';
}

/**
 * Set bot status
 */
function setStatus(status, info = {}) {
  botStatus = status;
  botInfo = { ...botInfo, ...info };
}

/**
 * Start web server
 */
function start() {
  // Ensure public directory exists
  const publicDir = path.join(__dirname, '../../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Main dashboard route
  app.get('/', async (req, res) => {
    let qrDataUrl = null;

    if (currentQR) {
      try {
        qrDataUrl = await QRCode.toDataURL(currentQR, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }

    res.send(generateHTML(qrDataUrl, botStatus));
  });

  // API status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      status: botStatus,
      timestamp: new Date().toISOString(),
      ...botInfo
    });
  });

  // Health check for Railway
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} to see QR code`);
  });

  return app;
}

module.exports = {
  start,
  setQR,
  clearQR,
  setStatus
};

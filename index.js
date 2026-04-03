/**
 * SIMFLY OS v4.0 - RAILWAY EDITION
 * Production-Ready WhatsApp Bot for Railway.com
 * Optimized, Clean, Working
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

// ============================================
// CONFIG
// ============================================
const PORT = process.env.PORT || 3000;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER;

// ============================================
// STATE
// ============================================
const State = {
    isReady: false,
    status: 'INITIALIZING', // INITIALIZING, QR, AUTHENTICATED, READY, ERROR
    qrData: null,
    logs: [],
    startTime: Date.now(),
    messages: 0,
    orders: 0
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };
    State.logs.unshift(entry);
    if (State.logs.length > 100) State.logs.pop();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function startWhatsApp() {
    if (client) {
        log('Client already exists', 'warn');
        return;
    }

    log('Starting WhatsApp...');
    State.status = 'INITIALIZING';

    try {
        // Auth path for Railway (persistent storage)
        const authPath = '/app/.wwebjs_auth';
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        // Get Chrome path
        let executablePath = null;
        try {
            executablePath = await chromium.executablePath();
            log('Chrome found: ' + executablePath);
        } catch (e) {
            log('Using system Chrome', 'warn');
        }

        // Create client
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: authPath,
                clientId: 'simfly-railway'
            }),
            puppeteer: {
                headless: 'new',
                executablePath: executablePath || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        // QR Code Event
        client.on('qr', (qr) => {
            log('QR Code generated');
            State.status = 'QR';
            State.qrData = qr;

            console.log('\n=== SCAN THIS QR CODE ===\n');
            qrcode.generate(qr, { small: true });
        });

        // Authenticated
        client.on('authenticated', () => {
            log('Authenticated ✓');
            State.status = 'AUTHENTICATED';
        });

        // Ready
        client.on('ready', () => {
            log('WhatsApp READY! ✓');
            State.isReady = true;
            State.status = 'READY';
            State.qrData = null;
        });

        // Auth Failure
        client.on('auth_failure', (err) => {
            log('Auth failed: ' + err, 'error');
            State.status = 'ERROR';
        });

        // Disconnected
        client.on('disconnected', (reason) => {
            log('Disconnected: ' + reason, 'error');
            State.isReady = false;
            State.status = 'INITIALIZING';
            State.qrData = null;
            client = null;

            // Auto restart after 5 seconds
            setTimeout(startWhatsApp, 5000);
        });

        // Message Handler
        client.on('message', async (msg) => {
            if (msg.fromMe) return;
            if (!State.isReady) return;

            State.messages++;
            log(`Message from ${msg.from}: ${msg.body.slice(0, 50)}`);

            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1000));

                await msg.reply('Assalam-o-Alaikum! SimFly Pakistan 🇵🇭\nAapki kya madad kar sakte hain?');
                await chat.clearState();
            } catch (e) {
                log('Reply error: ' + e.message, 'error');
            }
        });

        // Initialize
        await client.initialize();
        log('Client initialized');

    } catch (error) {
        log('Start error: ' + error.message, 'error');
        State.status = 'ERROR';
        client = null;

        // Retry after 10 seconds
        setTimeout(startWhatsApp, 10000);
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Parse JSON
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        status: State.status,
        ready: State.isReady
    });
});

// Status API
app.get('/api/status', (req, res) => {
    res.json({
        status: State.status,
        ready: State.isReady,
        qr: State.qrData,
        messages: State.messages,
        orders: State.orders,
        logs: State.logs.slice(0, 20),
        uptime: Math.floor((Date.now() - State.startTime) / 1000)
    });
});

// Setup Page (Main)
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache">
    <title>SimFly OS - Railway Edition</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 500px; margin: 0 auto; }

        .header {
            text-align: center;
            padding: 30px 0;
        }
        .logo { font-size: 3rem; margin-bottom: 10px; }
        .title {
            font-size: 2rem;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b6b, #feca57);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            margin: 16px 0;
        }

        .status {
            text-align: center;
            padding: 20px;
        }
        .status-icon { font-size: 3rem; margin-bottom: 10px; }
        .status-title { font-size: 1.3rem; font-weight: 600; margin-bottom: 5px; }
        .status-text { color: #888; font-size: 0.9rem; }

        .status-INITIALIZING { border-color: #f39c12; }
        .status-QR { border-color: #3498db; box-shadow: 0 0 30px rgba(52,152,219,0.3); }
        .status-READY { border-color: #2ecc71; box-shadow: 0 0 30px rgba(46,204,113,0.3); }
        .status-ERROR { border-color: #e74c3c; }

        .loader {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .qr-box {
            background: #fff;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            display: none;
        }
        .qr-box.show { display: block; }
        .qr-title { color: #333; font-weight: bold; margin-bottom: 15px; }
        #qrcode { margin: 0 auto; }

        .instructions {
            margin-top: 15px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 8px;
            color: #333;
            font-size: 0.85rem;
            text-align: left;
        }
        .instructions ol { margin-left: 20px; margin-top: 8px; }
        .instructions li { margin: 5px 0; }

        .success-box {
            text-align: center;
            display: none;
        }
        .success-box.show { display: block; }
        .success-icon { font-size: 4rem; margin-bottom: 10px; }

        .logs {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 12px;
            margin-top: 20px;
            max-height: 200px;
            overflow-y: auto;
        }
        .logs-title {
            color: #888;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        .log-item {
            font-family: monospace;
            font-size: 0.8rem;
            padding: 4px 0;
            color: #aaa;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .log-item:last-child { border-bottom: none; color: #2ecc71; }
        .log-time { color: #666; margin-right: 8px; }

        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">SimFly OS</div>
            <div style="color: #888; margin-top: 5px;">Railway Edition v4.0</div>
        </div>

        <div class="card status status-INITIALIZING" id="statusCard">
            <div class="status-icon" id="statusIcon">⏳</div>
            <div class="status-title" id="statusTitle">Initializing</div>
            <div class="status-text" id="statusText">Starting WhatsApp service...</div>
            <div class="loader" id="loader"></div>
        </div>

        <div class="card qr-box" id="qrCard">
            <div class="qr-title">📱 Scan with WhatsApp</div>
            <div id="qrcode"></div>
            <div class="instructions">
                <strong>How to scan:</strong>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Go to Settings → Linked Devices</li>
                    <li>Tap "Link a Device"</li>
                    <li>Point camera at QR code</li>
                </ol>
            </div>
        </div>

        <div class="card success-box" id="successCard">
            <div class="success-icon">✅</div>
            <div class="status-title" style="color: #2ecc71;">Connected!</div>
            <div class="status-text">WhatsApp is ready to use</div>
        </div>

        <div class="card">
            <div class="logs-title">📋 Real-time Logs</div>
            <div class="logs" id="logsBox">
                <div class="log-item"><span class="log-time">--:--</span> Waiting for connection...</div>
            </div>
        </div>

        <div class="footer">
            Built for Railway.com | Status: <span id="connStatus">checking...</span>
        </div>
    </div>

    <script>
        const statusCard = document.getElementById('statusCard');
        const statusIcon = document.getElementById('statusIcon');
        const statusTitle = document.getElementById('statusTitle');
        const statusText = document.getElementById('statusText');
        const loader = document.getElementById('loader');
        const qrCard = document.getElementById('qrCard');
        const successCard = document.getElementById('successCard');
        const logsBox = document.getElementById('logsBox');
        const connStatus = document.getElementById('connStatus');

        let currentQR = null;
        let pollInterval = null;

        function updateUI(data) {
            connStatus.textContent = 'connected';
            connStatus.style.color = '#2ecc71';

            // Update logs
            if (data.logs && data.logs.length > 0) {
                logsBox.innerHTML = data.logs.map(l =>
                    '<div class="log-item"><span class="log-time">' + l.time + '</span> ' + l.msg + '</div>'
                ).join('');
            }

            // Update status card
            statusCard.className = 'card status status-' + data.status;

            switch(data.status) {
                case 'INITIALIZING':
                    statusIcon.textContent = '⏳';
                    statusTitle.textContent = 'Initializing';
                    statusText.textContent = 'Starting WhatsApp service...';
                    loader.style.display = 'block';
                    qrCard.classList.remove('show');
                    successCard.classList.remove('show');
                    break;

                case 'QR':
                    statusIcon.textContent = '📱';
                    statusTitle.textContent = 'Scan QR Code';
                    statusText.textContent = 'Open WhatsApp on your phone';
                    loader.style.display = 'none';
                    successCard.classList.remove('show');

                    // Show QR
                    if (data.qr && data.qr !== currentQR) {
                        currentQR = data.qr;
                        qrCard.classList.add('show');
                        document.getElementById('qrcode').innerHTML = '';
                        new QRCode(document.getElementById('qrcode'), {
                            text: data.qr,
                            width: 200,
                            height: 200,
                            colorDark: '#000',
                            colorLight: '#fff'
                        });
                    }
                    break;

                case 'AUTHENTICATED':
                    statusIcon.textContent = '🔐';
                    statusTitle.textContent = 'Authenticating...';
                    statusText.textContent = 'Verifying your account';
                    qrCard.classList.remove('show');
                    break;

                case 'READY':
                    statusIcon.textContent = '✅';
                    statusTitle.textContent = 'Connected!';
                    statusText.textContent = 'WhatsApp is ready';
                    loader.style.display = 'none';
                    qrCard.classList.remove('show');
                    successCard.classList.add('show');
                    if (pollInterval) clearInterval(pollInterval);
                    break;

                case 'ERROR':
                    statusIcon.textContent = '❌';
                    statusTitle.textContent = 'Error';
                    statusText.textContent = 'Something went wrong';
                    break;
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status?t=' + Date.now());
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                updateUI(data);
            } catch (e) {
                connStatus.textContent = 'disconnected';
                connStatus.style.color = '#e74c3c';
                console.error('Fetch error:', e);
            }
        }

        // Start
        console.log('SimFly OS: Starting...');
        fetchStatus();
        pollInterval = setInterval(fetchStatus, 2000);
    </script>
</body>
</html>`);
});

// Start server
const server = app.listen(PORT, () => {
    log('='.repeat(40));
    log('SimFly OS v4.0 - Railway Edition');
    log('Server running on port ' + PORT);
    log('='.repeat(40));

    // Start WhatsApp after server ready
    setTimeout(startWhatsApp, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('SIGTERM received, shutting down...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    log('SIGINT received, shutting down...');
    server.close(() => process.exit(0));
});

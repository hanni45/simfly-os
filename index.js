/**
 * SIMFLY OS v1.0.0
 * Production-Ready WhatsApp Sales Bot for Render.com Free Tier
 * Business: SimFly Pakistan - eSIM Provider for Non-PTA iPhones
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

// ============================================
// CHROME EXECUTABLE FINDER FOR RENDER
// ============================================
async function getChromeExecutablePath() {
    // First try @sparticuz/chromium (designed for Render/AWS Lambda)
    try {
        log('Trying @sparticuz/chromium...');
        const executablePath = await chromium.executablePath();
        if (executablePath && fs.existsSync(executablePath)) {
            log(`Found Chromium via @sparticuz/chromium at: ${executablePath}`);
            return executablePath;
        }
    } catch (e) {
        log(`@sparticuz/chromium not available: ${e.message}`);
    }

    // Try common Linux paths for Chrome/Chromium
    const possiblePaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/lib/chromium-browser/chromium-browser',
        '/usr/lib/chromium/chromium',
        '/usr/local/bin/chromium',
        '/snap/bin/chromium',
        '/app/.apt/usr/bin/google-chrome',
        '/app/.apt/usr/bin/chromium-browser',
    ];

    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            log(`Found Chrome at: ${chromePath}`);
            return chromePath;
        }
    }

    log('WARNING: Could not find Chrome executable', 'error');
    return null;
}

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ADMIN_NUMBER: process.env.ADMIN_NUMBER,
    RENDER_URL: process.env.RENDER_URL || `http://localhost:${process.env.PORT || 3000}`,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    BUSINESS: {
        name: 'SimFly Pakistan',
        pricing: {
            starter: { name: 'STARTER', data: '500MB', price: 'Rs. 130', validity: '2-Year', devices: 1 },
            popular: { name: 'POPULAR', data: '1GB', price: 'Rs. 400', validity: '2-Year', devices: 1 },
            mega: { name: 'MEGA', data: '5GB', price: 'Rs. 1500', validity: '4 Devices', devices: 4 }
        },
        payments: {
            easypaisa: { number: '03466544374', title: 'Shafqat' },
            jazzcash: { number: '03456754090', title: 'Shafqat' },
            sadapay: { number: '03116400376', title: 'Muhammad Abdullah Saahi', displayTitle: 'Abdullah Saahi' }
        }
    }
};

// ============================================
// IN-MEMORY DASHBOARD STATE
// ============================================
const DashboardState = {
    startTime: Date.now(),
    totalMessages: 0,
    totalOrders: 0,
    conversations: new Map(),
    adminToken: null,
    isReady: false,
    qrGenerated: false,
    qrCodeData: null,
    logs: [],
    clientState: 'INITIALIZING'
};

// Logger function that stores logs
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    DashboardState.logs.push(logEntry);
    // Keep only last 100 logs
    if (DashboardState.logs.length > 100) {
        DashboardState.logs.shift();
    }
    if (type === 'error') {
        console.error(logEntry);
    } else {
        console.log(logEntry);
    }
}

// Generate random 8-character alphanumeric token
function generateAdminToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 8; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Get memory usage in MB
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
    };
}

// Format uptime
function formatUptime() {
    const seconds = Math.floor((Date.now() - DashboardState.startTime) / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// ============================================
// EXPRESS SERVER (START FIRST FOR RENDER HEALTH CHECK)
// ============================================
const app = express();
app.use(express.json());

// Health check endpoint - MUST respond immediately
app.get('/', (req, res) => {
    const status = DashboardState.isReady ? '✅ LIVE' : '⏳ INITIALIZING';
    res.status(200).send(`SimFly OS Bot ${status} | State: ${DashboardState.clientState}`);
});

// Setup/Status page - shows QR code and setup instructions
app.get('/setup', (req, res) => {
    const mem = getMemoryUsage();
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 800px; margin: 0 auto; }
        .header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 2px solid #e94560;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5rem;
            background: linear-gradient(45deg, #e94560, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .status {
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: center;
            font-weight: bold;
        }
        .status-initializing { background: #ffa502; color: #1a1a2e; }
        .status-qr { background: #00d9ff; color: #1a1a2e; }
        .status-ready { background: #2ed573; color: #1a1a2e; }
        .qr-section {
            background: rgba(255,255,255,0.05);
            border: 2px dashed #00d9ff;
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            margin: 20px 0;
        }
        .qr-code {
            background: white;
            padding: 20px;
            border-radius: 10px;
            display: inline-block;
            margin: 20px 0;
            font-family: monospace;
            font-size: 12px;
            line-height: 12px;
            color: black;
            white-space: pre;
            letter-spacing: 1px;
        }
        .instructions {
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
        }
        .instructions h3 { color: #00d9ff; margin-bottom: 15px; }
        .instructions ol { padding-left: 20px; }
        .instructions li { margin: 10px 0; line-height: 1.6; }
        .token-box {
            background: rgba(0,217,255,0.1);
            border: 1px solid #00d9ff;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .token {
            font-size: 2rem;
            font-family: monospace;
            color: #00d9ff;
            background: rgba(0,0,0,0.3);
            padding: 10px 20px;
            border-radius: 5px;
            display: inline-block;
            margin-top: 10px;
        }
        .logs {
            background: rgba(0,0,0,0.5);
            border-radius: 10px;
            padding: 15px;
            font-family: monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            margin-top: 20px;
        }
        .log-entry { margin: 2px 0; color: #a0a0a0; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.85rem;
            margin-top: 30px;
        }
        .hidden { display: none; }
        a { color: #00d9ff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS Setup</h1>
            <p>WhatsApp Bot Configuration</p>
        </div>

        <div class="status status-${DashboardState.isReady ? 'ready' : DashboardState.qrGenerated ? 'qr' : 'initializing'}">
            Status: ${DashboardState.isReady ? '✅ CONNECTED - Bot is Live!' : DashboardState.qrGenerated ? '📱 SCAN QR CODE' : '⏳ Initializing...'}
        </div>

        ${DashboardState.qrGenerated && !DashboardState.isReady ? `
        <div class="qr-section">
            <h2>Scan this QR Code with WhatsApp</h2>
            <p>WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device</p>
            <div class="qr-code">${DashboardState.qrCodeData ? 'QR Code Generated\n(Check terminal logs for full QR)' : 'QR Code processing...'}</div>
            <p><strong>OR copy this link:</strong></p>
            <code>https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(DashboardState.qrCodeData || '')}</code>
        </div>
        ` : ''}

        ${DashboardState.isReady ? `
        <div class="token-box">
            <h3>Dashboard Access</h3>
            <p>Your admin token:</p>
            <div class="token">${DashboardState.adminToken}</div>
            <p style="margin-top: 15px;">
                <a href="${CONFIG.RENDER_URL}/dashboard/${DashboardState.adminToken}" target="_blank">
                    Open Dashboard →
                </a>
            </p>
        </div>
        ` : ''}

        <div class="instructions">
            <h3>Setup Instructions</h3>
            <ol>
                <li>Wait for QR code to appear above (or check Render Logs)</li>
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices → Link a Device</li>
                <li>Point camera at the QR code</li>
                <li>Once connected, your dashboard token will appear above</li>
                <li>You'll also receive a WhatsApp message with the dashboard link</li>
            </ol>
        </div>

        <div class="instructions">
            <h3>System Info</h3>
            <p><strong>Uptime:</strong> ${formatUptime()}</p>
            <p><strong>Memory:</strong> ${mem.heapUsed}MB / 200MB used</p>
            <p><strong>Messages:</strong> ${DashboardState.totalMessages}</p>
            <p><strong>State:</strong> ${DashboardState.clientState}</p>
        </div>

        <div class="logs">
            <h3 style="margin-bottom: 10px; color: #00d9ff;">Recent Logs</h3>
            ${DashboardState.logs.slice(-20).map(l => `<div class="log-entry">${l}</div>`).join('')}
        </div>

        <div class="footer">
            <p>SimFly Pakistan WhatsApp Sales Bot v1.0.0</p>
            <p>Memory: ${mem.heapUsed}MB | Auto-refresh: 10s</p>
        </div>
    </div>
    <script>
        setInterval(() => location.reload(), 10000);
    </script>
</body>
</html>`;
    res.send(html);
});

// API endpoint to get QR code data
app.get('/api/qr', (req, res) => {
    res.json({
        generated: DashboardState.qrGenerated,
        ready: DashboardState.isReady,
        state: DashboardState.clientState,
        qrData: DashboardState.qrCodeData
    });
});

// Dashboard endpoint
app.get('/dashboard/:token', (req, res) => {
    const { token } = req.params;

    if (!DashboardState.adminToken || token !== DashboardState.adminToken) {
        return res.status(403).send('403 - Unauthorized Access');
    }

    const mem = getMemoryUsage();
    const activeConversations = DashboardState.conversations.size;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 2px solid #e94560;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5rem;
            background: linear-gradient(45deg, #e94560, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 0.9rem;
            margin-top: 10px;
        }
        .status-live { background: #00d9ff; color: #1a1a2e; }
        .status-offline { background: #ff4757; color: #fff; }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            transition: transform 0.3s;
        }
        .card:hover { transform: translateY(-5px); }
        .card-icon {
            font-size: 2.5rem;
            margin-bottom: 15px;
        }
        .card-value {
            font-size: 2rem;
            font-weight: bold;
            color: #00d9ff;
        }
        .card-label {
            color: #a0a0a0;
            margin-top: 5px;
        }
        .memory-bar {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            height: 30px;
            margin-top: 10px;
            overflow: hidden;
        }
        .memory-fill {
            background: linear-gradient(90deg, #00d9ff, #e94560);
            height: 100%;
            border-radius: 10px;
            transition: width 0.5s;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.85rem;
        }
        @media (max-width: 600px) {
            .header h1 { font-size: 1.8rem; }
            .card { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS Dashboard</h1>
            <span class="status-badge ${DashboardState.isReady ? 'status-live' : 'status-offline'}">
                ${DashboardState.isReady ? '🟢 LIVE' : '🔴 INITIALIZING'}
            </span>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-icon">⏱️</div>
                <div class="card-value">${formatUptime()}</div>
                <div class="card-label">Uptime</div>
            </div>
            <div class="card">
                <div class="card-icon">💬</div>
                <div class="card-value">${DashboardState.totalMessages.toLocaleString()}</div>
                <div class="card-label">Messages Processed</div>
            </div>
            <div class="card">
                <div class="card-icon">📦</div>
                <div class="card-value">${DashboardState.totalOrders.toLocaleString()}</div>
                <div class="card-label">Total Orders</div>
            </div>
            <div class="card">
                <div class="card-icon">👥</div>
                <div class="card-value">${activeConversations}</div>
                <div class="card-label">Active Conversations</div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-icon">💾</div>
                <div class="card-value">${mem.heapUsed} MB</div>
                <div class="card-label">Heap Used</div>
                <div class="memory-bar">
                    <div class="memory-fill" style="width: ${Math.min((mem.heapUsed / 200) * 100, 100)}%"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-icon">🧠</div>
                <div class="card-value">${mem.rss} MB</div>
                <div class="card-label">RSS Memory</div>
            </div>
            <div class="card">
                <div class="card-icon">📊</div>
                <div class="card-value">${mem.heapTotal} MB</div>
                <div class="card-label">Heap Total</div>
            </div>
        </div>

        <div class="footer">
            <p>SimFly Pakistan WhatsApp Sales Bot v1.0.0</p>
            <p>Session: ${DashboardState.qrGenerated ? 'QR Generated' : 'Pending'} | AI: Gemini 1.5 Flash</p>
        </div>
    </div>
    <script>
        setInterval(() => location.reload(), 30000);
    </script>
</body>
</html>`;

    res.send(html);
});

// Start server immediately (Render requirement)
const server = app.listen(CONFIG.PORT, () => {
    log(`SimFly OS Express server running on port ${CONFIG.PORT}`);
});

// ============================================
// GEMINI AI SETUP
// ============================================
let genAI = null;
let geminiModel = null;

if (CONFIG.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(CONFIG.GOOGLE_API_KEY);
    const SYSTEM_INSTRUCTION = `You are a Senior Sales Manager at SimFly Pakistan, an eSIM provider for Non-PTA iPhones. Your ONLY goal is to CLOSE SALES. Be friendly, use Roman Urdu/Hinglish conversational style.

BUSINESS RULES:
1. Pricing (NO DISCOUNTS ALLOWED):
   - STARTER (500MB): Rs. 130 (2-Year Validity) ⚡
   - POPULAR (1GB): Rs. 400 (2-Year Validity) 🔥
   - MEGA (5GB): Rs. 1500 (4 Devices Support) 💎

2. Payment Methods:
   - Easypaisa: 03466544374 (Title: Shafqat)
   - JazzCash: 03456754090 (Title: Shafqat)
   - SadaPay: 03116400376 (IMPORTANT: Title shows as "Abdullah Saahi", inform customer to avoid confusion)

3. STRICT OUTPUT RULES:
   - NEVER use markdown symbols (*, **, #, _)
   - Use ONLY plain text and emojis
   - Focus on closing the sale
   - Be polite but persistent
   - Guide customers through payment process

When someone sends a screenshot, acknowledge receipt politely.`;

    geminiModel = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION
    });
    log('Gemini AI initialized successfully');
} else {
    log('WARNING: GOOGLE_API_KEY not set - AI responses disabled', 'error');
}

// ============================================
// WHATSAPP CLIENT SETUP (ASYNC)
// ============================================
let client = null;

async function initializeWhatsAppClient() {
    // Ensure auth directory exists
    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
        log(`Created auth directory: ${authPath}`);
    }

    // Find Chrome executable
    log('Searching for Chrome executable...');
    const executablePath = await getChromeExecutablePath();

    if (!executablePath) {
        log('ERROR: Chrome not found! Make sure puppeteer is installed.', 'error');
        log('Trying to continue with default settings...', 'error');
    }

    const puppeteerOptions = {
        headless: chromium.headless,
        args: [
            ...chromium.args,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
            '--no-first-run',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=AudioServiceOutOfProcess',
            '--disable-software-rasterizer'
        ],
        defaultViewport: { width: 1920, height: 1080 },
        dumpio: false
    };

    // Add executable path if found
    if (executablePath) {
        puppeteerOptions.executablePath = executablePath;
    } else {
        log('Chrome executable path not found, trying default puppeteer...', 'error');
    }

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: authPath
        }),
        puppeteer: puppeteerOptions,
        qrMaxRetries: 10,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0
    });

    // ============================================
    // WHATSAPP EVENT HANDLERS
    // ============================================
    client.on('qr', (qr) => {
        DashboardState.qrGenerated = true;
        DashboardState.qrCodeData = qr;
        DashboardState.clientState = 'QR_GENERATED';

        log('QR Code generated - Scan karein!');

        // Print to console with ANSI colors for better visibility
        console.log('\n\n' + '='.repeat(60));
        console.log('WHATSAPP QR CODE - SCAN THIS NOW!');
        console.log('='.repeat(60) + '\n');
        qrcode.generate(qr, { small: true });
        console.log('\n' + '='.repeat(60));
        console.log(`Setup URL: ${CONFIG.RENDER_URL}/setup`);
        console.log('='.repeat(60) + '\n');
    });

    client.on('authenticated', () => {
        log('WhatsApp authenticated successfully');
        DashboardState.clientState = 'AUTHENTICATED';
    });

    client.on('auth_failure', (msg) => {
        log(`Authentication failure: ${msg}`, 'error');
        DashboardState.clientState = 'AUTH_FAILED';
    });

    client.on('ready', async () => {
        log('SimFly OS Bot is READY!');
        DashboardState.isReady = true;
        DashboardState.clientState = 'READY';
        DashboardState.qrCodeData = null;

        // Generate admin token
        DashboardState.adminToken = generateAdminToken();
        log(`Admin Dashboard Token: ${DashboardState.adminToken}`);

        // Send notification to admin
        if (CONFIG.ADMIN_NUMBER) {
            const adminChatId = `${CONFIG.ADMIN_NUMBER}@c.us`;
            const dashboardUrl = `${CONFIG.RENDER_URL}/dashboard/${DashboardState.adminToken}`;
            const notificationMessage = `SimFly OS Live! 🚀\n\nDashboard Token: ${DashboardState.adminToken}\nAccess: ${dashboardUrl}\n\nBot is ready for sales! 💰`;

            try {
                await client.sendMessage(adminChatId, notificationMessage);
                log(`Admin notification sent to ${CONFIG.ADMIN_NUMBER}`);
            } catch (error) {
                log(`Failed to send admin notification: ${error.message}`, 'error');
            }
        } else {
            log('WARNING: ADMIN_NUMBER not set - no notification sent', 'error');
        }
    });

    client.on('message_create', async (msg) => {
        // Only handle incoming messages (not from self)
        if (msg.fromMe) return;
        await handleMessage(msg);
    });

    client.on('disconnected', (reason) => {
        log(`WhatsApp disconnected: ${reason}`);
        DashboardState.isReady = false;
        DashboardState.qrGenerated = false;
        DashboardState.clientState = 'DISCONNECTED';
    });

    client.on('loading_screen', (percent, message) => {
        log(`WhatsApp loading: ${percent}% - ${message}`);
        DashboardState.clientState = 'LOADING';
    });

    client.on('error', (error) => {
        log(`WhatsApp client error: ${error.message}`, 'error');
        DashboardState.clientState = 'ERROR';
    });

    // Initialize client
    log('Initializing WhatsApp client...');
    try {
        await client.initialize();
    } catch (error) {
        log(`Failed to initialize WhatsApp client: ${error.message}`, 'error');
        throw error;
    }
}

// ============================================
// MESSAGE HANDLER
// ============================================
async function handleMessage(message) {
    const chatId = message.from;
    const isGroup = chatId.endsWith('@g.us');
    const isStatus = chatId === 'status@broadcast';

    // Ignore groups and status broadcasts (RAM saver)
    if (isGroup || isStatus) return;

    DashboardState.totalMessages++;

    // Track conversation
    if (!DashboardState.conversations.has(chatId)) {
        DashboardState.conversations.set(chatId, {
            startedAt: Date.now(),
            messageCount: 0
        });
    }
    DashboardState.conversations.get(chatId).messageCount++;

    try {
        let responseText = '';

        // Check if message has media (image)
        if (message.hasMedia) {
            const media = await message.downloadMedia();

            if (media && media.mimetype && media.mimetype.startsWith('image/')) {
                // Image received - likely payment screenshot
                const imageBuffer = Buffer.from(media.data, 'base64');

                try {
                    if (genAI) {
                        // Use Gemini Vision to analyze screenshot
                        const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                        const imagePart = {
                            inlineData: {
                                data: imageBuffer.toString('base64'),
                                mimeType: media.mimetype
                            }
                        };

                        const visionResult = await visionModel.generateContent([
                            'Is this a valid mobile payment receipt or banking app screenshot? Reply with "yes" or "no" and briefly what you see.',
                            imagePart
                        ]);

                        const visionResponse = await visionResult.response;
                        const visionText = visionResponse.text().toLowerCase();

                        if (visionText.includes('yes') || visionText.includes('receipt') || visionText.includes('payment') || visionText.includes('easypaisa') || visionText.includes('jazzcash') || visionText.includes('sadapay') || visionText.includes('transaction')) {
                            responseText = 'Screenshot mil gayi hai bhai! Admin verify kar raha hai. Thori der mein plan active ho jayega Inshallah. Shukriya! ✅';
                            DashboardState.totalOrders++;
                        } else {
                            responseText = 'Image receive ho gayi hai. Agar yeh payment screenshot hai toh admin jald verify kar dega. Barah e karam wait karein. 🙏';
                        }
                    } else {
                        responseText = 'Screenshot mil gaya! Admin jald verify kar k plan activate kar dega. Thora wait karein. ✅';
                        DashboardState.totalOrders++;
                    }
                } catch (visionError) {
                    log(`Vision analysis error: ${visionError.message}`, 'error');
                    responseText = 'Screenshot mil gaya! Admin jald verify kar k plan activate kar dega. Thora wait karein. ✅';
                    DashboardState.totalOrders++;
                }
            } else if (media && media.mimetype && media.mimetype.startsWith('audio/')) {
                // Audio/Voice message
                responseText = 'Voice note mil gaya! Main text mein reply kar raha hoon. Apna question likh kar bhejein taake main behtar help kar sakon. Shukriya! 🎙️';
            } else {
                // Other media
                responseText = 'File receive ho gayi hai. Kya yeh payment proof hai? Admin check kar k reply dega. ⏳';
            }
        } else if (geminiModel) {
            // Text message - use Gemini
            const chat = geminiModel.startChat({
                history: [],
                generationConfig: {
                    maxOutputTokens: 500,
                    temperature: 0.7
                }
            });

            const result = await chat.sendMessage(message.body);
            const response = await result.response;
            responseText = response.text();

            // Clean up any markdown that might have slipped through
            responseText = responseText
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/__/g, '')
                .replace(/_/g, '')
                .replace(/#/g, '')
                .replace(/`/g, '');
        } else {
            // Fallback response if AI not available
            responseText = 'Assalam-o-Alaikum! SimFly Pakistan mein khush amdeed.\n\nHamare eSIM Plans:\n⚡ STARTER (500MB): Rs. 130\n🔥 POPULAR (1GB): Rs. 400\n💎 MEGA (5GB): Rs. 1500\n\nPayment k liye bataein kaunsa plan chahiye!';
        }

        // Send response
        if (responseText) {
            await message.reply(responseText);
            log(`Replied to ${chatId}`);
        }

    } catch (error) {
        log(`Message handling error: ${error.message}`, 'error');

        // Send fallback message on error
        try {
            await message.reply('Sorry bhai, thora system busy hai. Dobara message karein ya thora wait karein. 🙏');
        } catch (replyError) {
            log(`Failed to send error reply: ${replyError.message}`, 'error');
        }
    }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
    log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Express server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('Express server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection: ${reason}`, 'error');
});

// ============================================
// INITIALIZE WHATSAPP CLIENT
// ============================================
log('Starting SimFly OS v1.0.1...');
log(`Render URL: ${CONFIG.RENDER_URL}`);
log(`Memory limit: 200MB`);

// Start WhatsApp client after a brief delay to ensure server is up
setTimeout(() => {
    initializeWhatsAppClient().catch(error => {
        log(`Critical error initializing WhatsApp: ${error.message}`, 'error');
    });
}, 2000);

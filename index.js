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
    qrGenerated: false
};

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
    res.status(200).send('SimFly OS Bot is Live! 🚀');
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
    console.log(`[${new Date().toISOString()}] SimFly OS Express server running on port ${CONFIG.PORT}`);
});

// ============================================
// GEMINI AI SETUP
// ============================================
const genAI = new GoogleGenerativeAI(CONFIG.GOOGLE_API_KEY);

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

const geminiModel = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION
});

// ============================================
// WHATSAPP CLIENT SETUP
// ============================================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu',
            '--js-flags=--max-old-space-size=150'
        ],
        defaultViewport: { width: 1920, height: 1080 }
    }
});

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
                } catch (visionError) {
                    console.error('Vision analysis error:', visionError.message);
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
        } else {
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
        }

        // Send response
        if (responseText) {
            await message.reply(responseText);
            console.log(`[${new Date().toISOString()}] Replied to ${chatId}`);
        }

    } catch (error) {
        console.error('Message handling error:', error.message);

        // Send fallback message on error
        try {
            await message.reply('Sorry bhai, thora system busy hai. Dobara message karein ya thora wait karein. 🙏');
        } catch (replyError) {
            console.error('Failed to send error reply:', replyError.message);
        }
    }
}

// ============================================
// WHATSAPP EVENT HANDLERS
// ============================================
client.on('qr', (qr) => {
    DashboardState.qrGenerated = true;
    console.log('\n[' + new Date().toISOString() + '] QR Code generated - Scan karein:');
    qrcode.generate(qr, { small: true });
    console.log('\n');
});

client.on('authenticated', () => {
    console.log(`[${new Date().toISOString()}] WhatsApp authenticated successfully`);
});

client.on('auth_failure', (msg) => {
    console.error(`[${new Date().toISOString()}] Authentication failure:`, msg);
});

client.on('ready', async () => {
    console.log(`[${new Date().toISOString()}] SimFly OS Bot is READY! 🚀`);
    DashboardState.isReady = true;

    // Generate admin token
    DashboardState.adminToken = generateAdminToken();
    console.log(`[${new Date().toISOString()}] Admin Dashboard Token: ${DashboardState.adminToken}`);

    // Send notification to admin
    if (CONFIG.ADMIN_NUMBER) {
        const adminChatId = `${CONFIG.ADMIN_NUMBER}@c.us`;
        const dashboardUrl = `${CONFIG.RENDER_URL}/dashboard/${DashboardState.adminToken}`;
        const notificationMessage = `SimFly OS Live! 🚀\n\nDashboard Token: ${DashboardState.adminToken}\nAccess: ${dashboardUrl}\n\nBot is ready for sales! 💰`;

        try {
            await client.sendMessage(adminChatId, notificationMessage);
            console.log(`[${new Date().toISOString()}] Admin notification sent to ${CONFIG.ADMIN_NUMBER}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to send admin notification:`, error.message);
        }
    }
});

client.on('message_create', async (msg) => {
    // Only handle incoming messages (not from self)
    if (msg.fromMe) return;
    await handleMessage(msg);
});

client.on('disconnected', (reason) => {
    console.log(`[${new Date().toISOString()}] WhatsApp disconnected:`, reason);
    DashboardState.isReady = false;
    DashboardState.qrGenerated = false;
});

client.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] WhatsApp client error:`, error.message);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
    console.log(`[${new Date().toISOString()}] SIGTERM received, shutting down gracefully...`);
    server.close(() => {
        console.log('Express server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log(`[${new Date().toISOString()}] SIGINT received, shutting down gracefully...`);
    server.close(() => {
        console.log('Express server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

// ============================================
// INITIALIZE WHATSAPP CLIENT
// ============================================
console.log(`[${new Date().toISOString()}] Starting SimFly OS v1.0.0...`);
console.log(`[${new Date().toISOString()}] Render URL: ${CONFIG.RENDER_URL}`);
console.log(`[${new Date().toISOString()}] Memory limit: 200MB`);

client.initialize().catch(error => {
    console.error(`[${new Date().toISOString()}] Failed to initialize WhatsApp client:`, error.message);
});

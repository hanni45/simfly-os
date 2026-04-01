/**
 * SIMFLY OS v1.0.5 - Enhanced Edition
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
// PRE-BUILT RESPONSE TEMPLATES (Fallback when Gemini fails)
// ============================================
const RESPONSE_TEMPLATES = {
    welcome: `Assalam-o-Alaikum! SimFly Pakistan mein khush amdeed! 🇵🇰

Kya aap Non-PTA iPhone ke liye eSIM dhundh rahe hain? Hum aapki help kar sakte hain!

Hamare Plans:
⚡ STARTER (500MB) - Rs. 130 (2 Saal Validity)
🔥 POPULAR (1GB) - Rs. 400 (2 Saal Validity)
💎 MEGA (5GB) - Rs. 1500 (4 Devices Support)

Kaunsa plan dekhna chahain ge?`,

    pricing: `Hamare eSIM Plans:

⚡ STARTER Package
   - Data: 500MB
   - Price: Rs. 130 only
   - Validity: 2 Years
   - Perfect for basic use

🔥 POPULAR Package (Most Selling)
   - Data: 1GB
   - Price: Rs. 400 only
   - Validity: 2 Years
   - Best value for money

💎 MEGA Package
   - Data: 5GB
   - Price: Rs. 1500
   - Devices: 4 devices support
   - For heavy users

Kaunsa plan pasand aaya? Payment details bata dun?`,

    payment: `Payment Methods:

1️⃣ Easypaisa
   Number: 03466544374
   Title: Shafqat

2️⃣ JazzCash
   Number: 03456754090
   Title: Shafqat

3️⃣ SadaPay
   Number: 03116400376
   Title: Abdullah Saahi (Abdullah Saahi show hoga)

Payment karne ke baad screenshot bhejein taake plan activate kar sakun! ✅`,

    afterPayment: `Shukriya bhai! Screenshot mil gaya hai! 📸

Admin jald verify kar ke plan activate kar dega. Thora sabar karein...

Aap ko confirmation message mil jayega jab plan active ho jayega! ✅`,

    default: `Main samajh nahi paya... 😅

Aap ko kya chahiye?
1️⃣ eSIM Plans dekhna hain
2️⃣ Payment karna hain
3️⃣ Help chahiye

Simply 1, 2, ya 3 likh ke bhejein!`,

    thanks: `Koi baat nahi bhai! 😊

Aur kuch help chahiye ho toh zaroor poochiyein. Hum yahin hain!

SimFly Pakistan - Non-PTA iPhones ke liye #1 eSIM Provider 🇵🇰`,

    contact: `Admin se contact ke liye:

WhatsApp Business: ${CONFIG.ADMIN_NUMBER || '0300XXXXXXX'}

Ya yahin message karein, main aur admin dono dekhte hain! 📱`,

    invalidInput: `Samajh nahi aaya bhai... 🤔

Aap please clear likhein:
- "Plans" - for pricing
- "Payment" - for payment details
- "Help" - for assistance

Main AI sales manager hun aur aapki help karna chahta hun! 💪`
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
    clientState: 'INITIALIZING',
    geminiStatus: 'CHECKING',
    lastError: null
};

// ============================================
// LOGGER
// ============================================
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    DashboardState.logs.push(logEntry);
    if (DashboardState.logs.length > 100) DashboardState.logs.shift();
    console.log(logEntry);
}

// ============================================
// GEMINI AI VALIDATOR
// ============================================
let genAI = null;
let geminiModel = null;
let isGeminiWorking = false;

async function validateGeminiAPI() {
    if (!CONFIG.GOOGLE_API_KEY) {
        log('No GOOGLE_API_KEY provided, using template responses', 'warn');
        DashboardState.geminiStatus = 'NO_API_KEY';
        isGeminiWorking = false;
        return false;
    }

    log('Validating Gemini API...');
    const testGenAI = new GoogleGenerativeAI(CONFIG.GOOGLE_API_KEY);
    const testModel = testGenAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
        const result = await testModel.generateContent('Reply with: "SimFly API Test OK"');
        const response = await result.response;
        const text = response.text();

        if (text && text.includes('OK')) {
            log('Gemini API validation: SUCCESS ✓');
            DashboardState.geminiStatus = 'WORKING';
            isGeminiWorking = true;

            // Initialize main model
            genAI = testGenAI;
            geminiModel = testGenAI.getGenerativeModel({
                model: 'gemini-1.5-flash',
                systemInstruction: `You are a Senior Sales Manager at SimFly Pakistan, an eSIM provider for Non-PTA iPhones. Be friendly, use Roman Urdu/Hinglish.

STRICT RULES:
1. NO markdown (*, **, #, _)
2. NO discounts allowed
3. Focus on closing sales
4. Payment numbers: Easypaisa 03466544374, JazzCash 03456754090, SadaPay 03116400376 (shows as Abdullah Saahi)`
            });

            return true;
        }
    } catch (error) {
        log(`Gemini API validation FAILED: ${error.message}`, 'error');
    }

    DashboardState.geminiStatus = 'FAILED';
    isGeminiWorking = false;
    return false;
}

// ============================================
// SMART RESPONSE GENERATOR
// ============================================
async function generateResponse(userMessage, hasImage = false) {
    const msg = userMessage.toLowerCase().trim();

    // Image received
    if (hasImage) {
        DashboardState.totalOrders++;
        return RESPONSE_TEMPLATES.afterPayment;
    }

    // Check for Gemini first
    if (isGeminiWorking && geminiModel) {
        try {
            log('Using Gemini AI for response...');
            const chat = geminiModel.startChat({ history: [] });
            const result = await chat.sendMessage(userMessage);
            const response = await result.response;
            let text = response.text()
                .replace(/\*\*/g, '').replace(/\*/g, '')
                .replace(/__/g, '').replace(/_/g, '')
                .replace(/#/g, '').replace(/`/g, '');
            return text;
        } catch (error) {
            log(`Gemini failed, using templates: ${error.message}`, 'error');
        }
    }

    // Template-based fallback
    log('Using template response...');

    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('salam') || msg.includes('start')) {
        return RESPONSE_TEMPLATES.welcome;
    }
    if (msg.includes('price') || msg.includes('plan') || msg.includes('package') || msg.includes('rs.') || msg.includes('cost') || msg.includes('rate')) {
        return RESPONSE_TEMPLATES.pricing;
    }
    if (msg.includes('payment') || msg.includes('pay') || msg.includes('easypaisa') || msg.includes('jazzcash') || msg.includes('sadapay') || msg.includes('send money')) {
        return RESPONSE_TEMPLATES.payment;
    }
    if (msg.includes('thank') || msg.includes('shukria') || msg.includes('thanks')) {
        return RESPONSE_TEMPLATES.thanks;
    }
    if (msg.includes('contact') || msg.includes('admin') || msg.includes('call') || msg.includes('phone')) {
        return RESPONSE_TEMPLATES.contact;
    }
    if (msg.includes('help') || msg.includes('support') || msg.includes('?')) {
        return RESPONSE_TEMPLATES.welcome;
    }

    return RESPONSE_TEMPLATES.invalidInput;
}

// ============================================
// MESSAGE HANDLER
// ============================================
async function handleMessage(message) {
    const chatId = message.from;
    const isGroup = chatId.endsWith('@g.us');
    const isStatus = chatId === 'status@broadcast';

    if (isGroup || isStatus) return;

    log(`Processing message from ${chatId}: "${message.body?.substring(0, 50)}..."`);
    DashboardState.totalMessages++;

    // Track conversation
    if (!DashboardState.conversations.has(chatId)) {
        DashboardState.conversations.set(chatId, { startedAt: Date.now(), messageCount: 0 });
    }
    DashboardState.conversations.get(chatId).messageCount++;

    try {
        let responseText = '';
        let hasImage = false;

        // Check if message has media
        if (message.hasMedia) {
            log('Media received, treating as payment screenshot');
            hasImage = true;
        }

        // Generate response
        responseText = await generateResponse(message.body || '', hasImage);

        // Send response
        if (responseText) {
            await message.reply(responseText);
            log(`Reply sent to ${chatId}`);
        }
    } catch (error) {
        log(`Message handling error: ${error.message}`, 'error');
        DashboardState.lastError = error.message;
        try {
            await message.reply('Sorry bhai, thora masla aa raha hai. Dobara try karein! 🙏');
        } catch (e) {}
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateAdminToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 8; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024)
    };
}

function formatUptime() {
    const seconds = Math.floor((Date.now() - DashboardState.startTime) / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

async function getChromePath() {
    try {
        const execPath = await chromium.executablePath();
        if (execPath && fs.existsSync(execPath)) return execPath;
    } catch (e) {}

    const paths = [
        '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome',
        '/usr/lib/chromium-browser/chromium-browser', '/snap/bin/chromium'
    ];
    for (const p of paths) if (fs.existsSync(p)) return p;
    return null;
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send(`Bot: ${DashboardState.isReady ? '✅ LIVE' : '⏳ ' + DashboardState.clientState} | Gemini: ${DashboardState.geminiStatus} | Uptime: ${formatUptime()}`);
});

app.get('/setup', (req, res) => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>SimFly OS</title>
<style>
body{font-family:sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:20px}
.container{max-width:800px;margin:auto}
.status{padding:15px;border-radius:10px;text-align:center;margin:20px 0;font-weight:bold}
.status-initializing{background:#ffa502;color:#000}.status-qr{background:#00d9ff;color:#000}
.status-ready{background:#2ed573;color:#000}
.token-box{background:rgba(0,217,255,0.1);border:1px solid #00d9ff;padding:20px;text-align:center;margin:20px 0;border-radius:10px}
.token{font-size:2rem;font-family:monospace;color:#00d9ff;background:rgba(0,0,0,0.3);padding:10px 20px;display:inline-block;margin-top:10px}
.info{background:rgba(255,255,255,0.05);padding:15px;margin:10px 0;border-radius:8px}
</style></head>
<body><div class="container">
<h1 style="text-align:center;color:#e94560">SimFly OS</h1>
<div class="status status-${DashboardState.isReady ? 'ready' : DashboardState.qrGenerated ? 'qr' : 'initializing'}">
${DashboardState.isReady ? '✅ CONNECTED' : DashboardState.qrGenerated ? '📱 SCAN QR CODE' : '⏳ INITIALIZING'}
</div>
${DashboardState.isReady ? `
<div class="token-box"><h3>Dashboard Token</h3><div class="token">${DashboardState.adminToken}</div>
<p><a href="${CONFIG.RENDER_URL}/dashboard/${DashboardState.adminToken}" style="color:#00d9ff">Open Dashboard →</a></p></div>
` : DashboardState.qrGenerated ? `
<div class="token-box"><h3>Scan QR Code</h3><p>WhatsApp → Settings → Linked Devices → Link a Device</p>
<p>QR Data: ${DashboardState.qrCodeData ? 'Ready' : 'Loading...'}</p></div>
` : ''}
<div class="info"><strong>State:</strong> ${DashboardState.clientState}</div>
<div class="info"><strong>Gemini:</strong> ${DashboardState.geminiStatus}</div>
<div class="info"><strong>Messages:</strong> ${DashboardState.totalMessages} | <strong>Orders:</strong> ${DashboardState.totalOrders}</div>
<div class="info"><strong>Memory:</strong> ${getMemoryUsage().heapUsed}MB</div>
</div></body></html>`;
    res.send(html);
});

app.get('/api/status', (req, res) => {
    res.json({
        ready: DashboardState.isReady,
        state: DashboardState.clientState,
        gemini: DashboardState.geminiStatus,
        messages: DashboardState.totalMessages,
        orders: DashboardState.totalOrders,
        uptime: formatUptime(),
        memory: getMemoryUsage()
    });
});

app.get('/dashboard/:token', (req, res) => {
    if (!DashboardState.adminToken || req.params.token !== DashboardState.adminToken) {
        return res.status(403).send('403 - Unauthorized');
    }
    const mem = getMemoryUsage();
    res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Dashboard</title>
<style>
body{font-family:sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:20px}
.container{max-width:900px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin:20px 0}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:20px;text-align:center;border-radius:15px}
.card-value{font-size:2rem;color:#00d9ff;font-weight:bold}
</style></head>
<body><div class="container">
<h1 style="text-align:center">SimFly OS Dashboard</h1>
<div class="grid">
<div class="card"><div class="card-value">${formatUptime()}</div><div>Uptime</div></div>
<div class="card"><div class="card-value">${DashboardState.totalMessages}</div><div>Messages</div></div>
<div class="card"><div class="card-value">${DashboardState.totalOrders}</div><div>Orders</div></div>
<div class="card"><div class="card-value">${mem.heapUsed}MB</div><div>Memory</div></div>
</div>
<p style="text-align:center">Gemini: ${DashboardState.geminiStatus} | State: ${DashboardState.clientState}</p>
</div></body></html>`);
});

const server = app.listen(CONFIG.PORT, () => {
    log(`Express server running on port ${CONFIG.PORT}`);
});

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function sendAdminNotification() {
    if (!CONFIG.ADMIN_NUMBER || !client) return;
    const chatId = `${CONFIG.ADMIN_NUMBER}@c.us`;
    const msg = `SimFly OS Live! 🚀\nToken: ${DashboardState.adminToken}\nDashboard: ${CONFIG.RENDER_URL}/dashboard/${DashboardState.adminToken}`;

    for (let i = 0; i < 3; i++) {
        try {
            await client.sendMessage(chatId, msg);
            log('Admin notification sent');
            return;
        } catch (e) {
            log(`Admin notify attempt ${i+1} failed: ${e.message}`, 'error');
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function onBotReady() {
    if (DashboardState.isReady) return;
    log('Bot is READY!');
    DashboardState.isReady = true;
    DashboardState.clientState = 'READY';
    DashboardState.qrCodeData = null;
    DashboardState.adminToken = generateAdminToken();
    await sendAdminNotification();
}

async function initializeWhatsApp() {
    log('Starting WhatsApp initialization...');

    // Validate Gemini first
    await validateGeminiAPI();

    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const chromePath = await getChromePath();
    if (!chromePath) log('Chrome not found, will try default', 'warn');
    else log(`Chrome found: ${chromePath}`);

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: authPath }),
        puppeteer: {
            headless: chromium.headless,
            executablePath: chromePath || undefined,
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--disable-gpu', '--disable-web-security']
        },
        qrMaxRetries: 10
    });

    // EVENT HANDLERS
    client.on('qr', (qr) => {
        DashboardState.qrGenerated = true;
        DashboardState.qrCodeData = qr;
        DashboardState.clientState = 'QR_GENERATED';
        log('QR Code generated!');
        console.log('\n' + '='.repeat(50));
        qrcode.generate(qr, { small: true });
        console.log('='.repeat(50) + '\n');
    });

    client.on('authenticated', () => {
        log('WhatsApp authenticated');
        DashboardState.clientState = 'AUTHENTICATED';
    });

    client.on('auth_failure', (msg) => {
        log(`Auth failed: ${msg}`, 'error');
        DashboardState.clientState = 'AUTH_FAILED';
    });

    client.on('ready', async () => {
        log('Event: ready');
        await onBotReady();
    });

    client.on('change_state', (state) => {
        log(`State changed: ${state}`);
        DashboardState.clientState = state;
        if (state === 'OPEN' && !DashboardState.isReady) {
            setTimeout(() => onBotReady(), 2000);
        }
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;
        log(`Message from ${msg.from}: "${msg.body?.substring(0,30)}..."`);
        await handleMessage(msg);
    });

    client.on('message', async (msg) => {
        if (msg.fromMe) return;
        log(`Backup handler: Message from ${msg.from}`);
        await handleMessage(msg);
    });

    client.on('disconnected', (reason) => {
        log(`Disconnected: ${reason}`, 'error');
        DashboardState.isReady = false;
        DashboardState.qrGenerated = false;
        DashboardState.clientState = 'DISCONNECTED';
    });

    client.on('error', (error) => {
        log(`Client error: ${error.message}`, 'error');
        DashboardState.lastError = error.message;
    });

    try {
        await client.initialize();
        log('Client initialized');

        // Fallback ready trigger
        setTimeout(() => {
            if (!DashboardState.isReady) {
                log('Auto-triggering ready state');
                onBotReady();
            }
        }, 15000);
    } catch (error) {
        log(`Init failed: ${error.message}`, 'error');
    }
}

// ============================================
// SHUTDOWN HANDLERS
// ============================================
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('uncaughtException', (e) => log(`Uncaught: ${e.message}`, 'error'));
process.on('unhandledRejection', (e) => log(`Unhandled: ${e}`, 'error'));

// ============================================
// START
// ============================================
log('SimFly OS v1.0.5 starting...');
setTimeout(() => initializeWhatsApp(), 2000);

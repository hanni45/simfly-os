/**
 * SIMFLY OS v1.0.6 - GROQ Edition
 * Production-Ready WhatsApp Sales Bot for Render.com
 * Business: SimFly Pakistan - eSIM Provider for Non-PTA iPhones
 * AI: Groq API (Free Tier - 1M tokens/day)
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ADMIN_NUMBER: process.env.ADMIN_NUMBER,
    RENDER_URL: process.env.RENDER_URL || `http://localhost:${process.env.PORT || 3000}`,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
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
// FALLBACK TEMPLATES
// ============================================
const TEMPLATES = {
    welcome: `Assalam-o-Alaikum! SimFly Pakistan mein khush amdeed! 🇵🇰

Kya aap Non-PTA iPhone ke liye eSIM dhundh rahe hain?

Hamare Plans:
⚡ STARTER (500MB) - Rs. 130 (2 Saal)
🔥 POPULAR (1GB) - Rs. 400 (2 Saal)
💎 MEGA (5GB) - Rs. 1500 (4 Devices)

Kaunsa plan dekhna chahain ge?`,

    pricing: `📱 SimFly Pakistan eSIM Plans:

⚡ STARTER
   500MB @ Rs. 130
   Validity: 2 Years

🔥 POPULAR (Most Selling)
   1GB @ Rs. 400
   Validity: 2 Years

💎 MEGA
   5GB @ Rs. 1500
   4 Devices Support

Kaunsa pasand aaya?`,

    payment: `💳 Payment Methods:

1️⃣ Easypaisa
   03466544374
   Title: Shafqat

2️⃣ JazzCash
   03456754090
   Title: Shafqat

3️⃣ SadaPay
   03116400376
   Title: Abdullah Saahi

Payment ke baad screenshot bhejein! ✅`,

    screenshot: `📸 Screenshot mil gaya!

Admin verify kar raha hai. Thori der mein plan active ho jayega Inshallah.

Shukriya! 🙏`,

    default: `Main samajh nahi paya... 🤔

Options:
1️⃣ Plans dekhna
2️⃣ Payment details
3️⃣ Help chahiye

Reply with 1, 2, ya 3!`,

    thanks: `Koi baat nahi! 😊

Aur kuch help chahiye ho toh poochiyein.

SimFly Pakistan 🇵🇰`,

    error: `Sorry bhai, thora masla aa raha hai.

Dobara try karein ya admin se contact karein! 🙏`
};

// ============================================
// STATE MANAGEMENT
// ============================================
const State = {
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
    aiProvider: 'NONE', // GROQ, GEMINI, or TEMPLATE
    lastError: null
};

function log(msg, type = 'info') {
    const entry = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}`;
    State.logs.push(entry);
    if (State.logs.length > 100) State.logs.shift();
    console.log(entry);
}

// ============================================
// AI SETUP - GROQ PRIMARY, GEMINI FALLBACK
// ============================================
let groqClient = null;
let geminiModel = null;

const SYSTEM_PROMPT = `You are a Senior Sales Manager at SimFly Pakistan, an eSIM provider for Non-PTA iPhones.

BUSINESS INFO:
- STARTER: 500MB @ Rs. 130 (2 years)
- POPULAR: 1GB @ Rs. 400 (2 years) - MOST SELLING
- MEGA: 5GB @ Rs. 1500 (4 devices)

PAYMENT NUMBERS:
- Easypaisa: 03466544374 (Shafqat)
- JazzCash: 03456754090 (Shafqat)
- SadaPay: 03116400376 (Abdullah Saahi)

RULES:
1. Be friendly, use Roman Urdu/Hinglish
2. NO markdown (*, **, #, _)
3. NO discounts allowed
4. Focus on closing sales
5. Keep replies short and helpful

Current date: ${new Date().toLocaleDateString()}`;

async function initializeAI() {
    // Try Groq first (FREE & FAST)
    if (CONFIG.GROQ_API_KEY) {
        try {
            log('Initializing Groq AI...');
            groqClient = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

            // Test the API
            const test = await groqClient.chat.completions.create({
                messages: [{ role: 'user', content: 'Say "SimFly Groq Test OK"' }],
                model: 'llama3-8b-8192',
                max_tokens: 20
            });

            if (test.choices[0].message.content.includes('OK')) {
                log('Groq AI initialized SUCCESSFULLY ✓');
                State.aiProvider = 'GROQ';
                return;
            }
        } catch (e) {
            log(`Groq failed: ${e.message}`, 'error');
        }
    }

    // Fallback to Gemini
    if (CONFIG.GOOGLE_API_KEY) {
        try {
            log('Initializing Gemini AI...');
            const genAI = new GoogleGenerativeAI(CONFIG.GOOGLE_API_KEY);
            geminiModel = genAI.getGenerativeModel({
                model: 'gemini-1.5-flash',
                systemInstruction: SYSTEM_PROMPT
            });

            const test = await geminiModel.generateContent('Say OK');
            if (test.response.text().includes('OK')) {
                log('Gemini AI initialized SUCCESSFULLY ✓');
                State.aiProvider = 'GEMINI';
                return;
            }
        } catch (e) {
            log(`Gemini failed: ${e.message}`, 'error');
        }
    }

    log('No AI provider available, using templates', 'warn');
    State.aiProvider = 'TEMPLATE';
}

// ============================================
// RESPONSE GENERATOR
// ============================================
async function generateAIResponse(userMessage) {
    const msg = userMessage.toLowerCase().trim();

    // Template matching for common queries
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('salam') || msg.includes('start')) {
        return TEMPLATES.welcome;
    }
    if (msg.includes('price') || msg.includes('plan') || msg.includes('package') || msg.includes('rs.') || msg.includes('cost') || msg.includes('rate')) {
        return TEMPLATES.pricing;
    }
    if (msg.includes('payment') || msg.includes('pay') || msg.includes('easypaisa') || msg.includes('jazzcash') || msg.includes('sadapay')) {
        return TEMPLATES.payment;
    }
    if (msg.includes('thank') || msg.includes('shukria')) {
        return TEMPLATES.thanks;
    }

    // AI Response based on provider
    try {
        if (State.aiProvider === 'GROQ' && groqClient) {
            log('Using GROQ AI...');
            const chat = await groqClient.chat.completions.create({
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                model: 'llama3-8b-8192',
                max_tokens: 500,
                temperature: 0.7
            });

            let reply = chat.choices[0].message.content
                .replace(/\*\*/g, '').replace(/\*/g, '')
                .replace(/__/g, '').replace(/_/g, '')
                .replace(/#/g, '').replace(/`/g, '');

            return reply;
        }

        if (State.aiProvider === 'GEMINI' && geminiModel) {
            log('Using Gemini AI...');
            const result = await geminiModel.generateContent(userMessage);
            let reply = result.response.text()
                .replace(/\*\*/g, '').replace(/\*/g, '')
                .replace(/__/g, '').replace(/_/g, '')
                .replace(/#/g, '').replace(/`/g, '');

            return reply;
        }
    } catch (error) {
        log(`AI error: ${error.message}`, 'error');
    }

    return TEMPLATES.default;
}

// ============================================
// MESSAGE HANDLER
// ============================================
async function handleMessage(message) {
    const chatId = message.from;
    if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return;

    log(`Message from ${chatId}: "${message.body?.substring(0, 50)}..."`);
    State.totalMessages++;

    if (!State.conversations.has(chatId)) {
        State.conversations.set(chatId, { startedAt: Date.now(), count: 0 });
    }
    State.conversations.get(chatId).count++;

    try {
        let reply = '';

        if (message.hasMedia) {
            log('Payment screenshot received');
            reply = TEMPLATES.screenshot;
            State.totalOrders++;
        } else {
            reply = await generateAIResponse(message.body || '');
        }

        if (reply) {
            await message.reply(reply);
            log('Reply sent');
        }
    } catch (error) {
        log(`Error: ${error.message}`, 'error');
        try {
            await message.reply(TEMPLATES.error);
        } catch (e) {}
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send(`SimFly OS | ${State.isReady ? '✅ LIVE' : '⏳ ' + State.clientState} | AI: ${State.aiProvider} | Uptime: ${Math.floor((Date.now() - State.startTime) / 1000)}s`);
});

// SETUP PAGE WITH QR CODE DISPLAY
app.get('/setup', (req, res) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS - Setup</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 600px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #e94560; margin-bottom: 30px; }
        .header h1 { font-size: 2.5rem; background: linear-gradient(45deg, #e94560, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status { padding: 15px; border-radius: 10px; margin: 20px 0; text-align: center; font-weight: bold; font-size: 1.1rem; }
        .status-initializing { background: #ffa502; color: #000; }
        .status-qr { background: #00d9ff; color: #000; }
        .status-ready { background: #2ed573; color: #000; }
        .qr-container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            margin: 20px 0;
            display: ${State.qrGenerated && !State.isReady ? 'block' : 'none'};
        }
        #qrcode { margin: 20px auto; }
        .token-box {
            background: rgba(0,217,255,0.1);
            border: 2px solid #00d9ff;
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            margin: 20px 0;
            display: ${State.isReady ? 'block' : 'none'};
        }
        .token { font-size: 2.5rem; font-family: monospace; color: #00d9ff; background: rgba(0,0,0,0.3); padding: 15px 25px; border-radius: 10px; display: inline-block; margin: 15px 0; letter-spacing: 3px; }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
        .info-item { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; text-align: center; }
        .info-label { color: #a0a0a0; font-size: 0.9rem; margin-bottom: 5px; }
        .info-value { color: #00d9ff; font-size: 1.2rem; font-weight: bold; }
        .instructions { background: rgba(255,255,255,0.05); border-radius: 15px; padding: 25px; margin: 20px 0; }
        .instructions h3 { color: #00d9ff; margin-bottom: 15px; }
        .instructions ol { padding-left: 20px; line-height: 1.8; }
        .instructions li { margin: 10px 0; }
        .btn {
            display: inline-block;
            background: linear-gradient(45deg, #e94560, #ff6b6b);
            color: white;
            padding: 15px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 15px;
            transition: transform 0.3s;
        }
        .btn:hover { transform: translateY(-3px); }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS</h1>
            <p style="color:#a0a0a0; margin-top:10px;">WhatsApp Bot Setup</p>
        </div>

        <div class="status status-${State.isReady ? 'ready' : State.qrGenerated ? 'qr' : 'initializing'}">
            ${State.isReady ? '✅ BOT CONNECTED & READY' : State.qrGenerated ? '📱 SCAN QR CODE' : '⏳ INITIALIZING...'}
        </div>

        ${State.qrGenerated && !State.isReady ? `
        <div class="qr-container" id="qrSection">
            <h2 style="color:#1a1a2e; margin-bottom:10px;">Scan with WhatsApp</h2>
            <p style="color:#333; margin-bottom:15px;">Settings → Linked Devices → Link a Device</p>
            <div id="qrcode"></div>
            <p style="color:#666; font-size:0.9rem; margin-top:15px;">QR Code expires in ~1 minute</p>
        </div>
        ` : ''}

        ${State.isReady ? `
        <div class="token-box">
            <h3 style="color:#fff; margin-bottom:10px;">🎉 Bot is Live!</h3>
            <p style="color:#a0a0a0;">Dashboard Token:</p>
            <div class="token">${State.adminToken}</div>
            <p style="margin-top:15px;">
                <a href="${CONFIG.RENDER_URL}/dashboard/${State.adminToken}" class="btn">Open Dashboard →</a>
            </p>
            <p style="color:#00d9ff; margin-top:15px;">AI Provider: <strong>${State.aiProvider}</strong></p>
        </div>
        ` : ''}

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">AI Provider</div>
                <div class="info-value">${State.aiProvider}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Messages</div>
                <div class="info-value">${State.totalMessages}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Orders</div>
                <div class="info-value">${State.totalOrders}</div>
            </div>
            <div class="info-item">
                <div class="info-label">State</div>
                <div class="info-value">${State.clientState}</div>
            </div>
        </div>

        ${!State.isReady ? `
        <div class="instructions">
            <h3>📋 Setup Instructions</h3>
            <ol>
                <li>Wait for QR code to appear above</li>
                <li>Open WhatsApp on your phone</li>
                <li>Go to <strong>Settings → Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Point camera at the QR code</li>
                <li>Wait for "CONNECTED" status</li>
            </ol>
        </div>
        ` : ''}
    </div>

    <script>
        // Auto-refresh every 5 seconds
        setTimeout(() => location.reload(), 5000);

        // Generate QR code if data available
        ${State.qrCodeData ? `
        window.onload = function() {
            new QRCode(document.getElementById("qrcode"), {
                text: "${State.qrCodeData}",
                width: 256,
                height: 256,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        };
        ` : ''}
    </script>
</body>
</html>`;
    res.send(html);
});

app.get('/api/status', (req, res) => {
    res.json({
        ready: State.isReady,
        state: State.clientState,
        aiProvider: State.aiProvider,
        messages: State.totalMessages,
        orders: State.totalOrders,
        uptime: Math.floor((Date.now() - State.startTime) / 1000),
        memory: process.memoryUsage().heapUsed / 1024 / 1024
    });
});

app.get('/dashboard/:token', (req, res) => {
    if (!State.adminToken || req.params.token !== State.adminToken) {
        return res.status(403).send('403 - Unauthorized');
    }
    res.send(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Dashboard</title>
<style>
body{font-family:sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:20px}
.container{max-width:900px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin:20px 0}
.card{background:rgba(255,255,255,0.05);padding:20px;border-radius:15px;text-align:center;border:1px solid rgba(255,255,255,0.1)}
.card-value{font-size:2rem;color:#00d9ff;font-weight:bold}
.status{padding:10px 20px;border-radius:20px;display:inline-block;font-weight:bold}
.status-live{background:#2ed573;color:#000}
</style></head>
<body><div class="container">
<h1 style="text-align:center;margin-bottom:10px">SimFly OS Dashboard</h1>
<div style="text-align:center;margin-bottom:30px">
<span class="status ${State.isReady ? 'status-live' : ''}">${State.isReady ? '🟢 LIVE' : '🔴 ' + State.clientState}</span>
</div>
<div class="grid">
<div class="card"><div class="card-value">${Math.floor((Date.now() - State.startTime) / 1000)}s</div><div>Uptime</div></div>
<div class="card"><div class="card-value">${State.totalMessages}</div><div>Messages</div></div>
<div class="card"><div class="card-value">${State.totalOrders}</div><div>Orders</div></div>
<div class="card"><div class="card-value">${State.conversations.size}</div><div>Chats</div></div>
<div class="card"><div class="card-value">${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</div><div>Memory</div></div>
<div class="card"><div class="card-value">${State.aiProvider}</div><div>AI Provider</div></div>
</div>
<p style="text-align:center;color:#666">Token: ${State.adminToken}</p>
</div></body></html>`);
});

const server = app.listen(CONFIG.PORT, () => {
    log(`Server running on port ${CONFIG.PORT}`);
});

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function notifyAdmin() {
    if (!CONFIG.ADMIN_NUMBER || !client) return;
    const chatId = `${CONFIG.ADMIN_NUMBER}@c.us`;
    const msg = `✅ SimFly OS Connected!\n\n🤖 AI: ${State.aiProvider}\n🔗 Dashboard: ${CONFIG.RENDER_URL}/dashboard/${State.adminToken}\n📱 Token: ${State.adminToken}`;

    for (let i = 0; i < 3; i++) {
        try {
            await client.sendMessage(chatId, msg);
            log('Admin notified');
            return;
        } catch (e) {
            log(`Notify attempt ${i+1} failed`, 'error');
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function onReady() {
    if (State.isReady) return;
    log('BOT IS READY!');
    State.isReady = true;
    State.clientState = 'READY';
    State.qrCodeData = null;
    State.adminToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    await notifyAdmin();
}

async function getChromePath() {
    try {
        const p = await chromium.executablePath();
        if (fs.existsSync(p)) return p;
    } catch (e) {}
    const paths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'];
    for (const p of paths) if (fs.existsSync(p)) return p;
    return null;
}

async function initWhatsApp() {
    log('Initializing WhatsApp...');

    // Init AI first
    await initializeAI();

    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const chromePath = await getChromePath();
    log(`Chrome: ${chromePath || 'Not found, using default'}`);

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: authPath }),
        puppeteer: {
            headless: chromium.headless,
            executablePath: chromePath || undefined,
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--disable-gpu']
        },
        qrMaxRetries: 10
    });

    // EVENTS
    client.on('qr', (qr) => {
        State.qrGenerated = true;
        State.qrCodeData = qr;
        State.clientState = 'QR_GENERATED';
        log('QR Generated!');
        console.log('\n=== SCAN QR CODE ===\n');
        qrcode.generate(qr, { small: true });
        console.log('\n===================\n');
    });

    client.on('authenticated', () => {
        log('Authenticated');
        State.clientState = 'AUTHENTICATED';
    });

    client.on('ready', async () => {
        log('Event: ready');
        await onReady();
    });

    client.on('change_state', (s) => {
        log(`State: ${s}`);
        State.clientState = s;
        if (s === 'OPEN' && !State.isReady) setTimeout(onReady, 2000);
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;
        await handleMessage(msg);
    });

    client.on('message', async (msg) => {
        if (msg.fromMe) return;
        await handleMessage(msg);
    });

    client.on('disconnected', () => {
        log('Disconnected', 'error');
        State.isReady = false;
        State.qrGenerated = false;
    });

    try {
        await client.initialize();
        log('Client initialized');
        setTimeout(() => { if (!State.isReady) onReady(); }, 15000);
    } catch (e) {
        log(`Init error: ${e.message}`, 'error');
    }
}

// SHUTDOWN
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

// START
log('SimFly OS v1.0.6 starting...');
log('AI: Groq (Primary) | Gemini (Fallback) | Templates');
setTimeout(initWhatsApp, 2000);

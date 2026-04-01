/**
 * SIMFLY OS v2.0.0 - Ultimate Edition
 * Full Dashboard Control + AI Management + Delivery Confirmation
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
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
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    BUSINESS: {
        name: 'SimFly Pakistan',
        pricing: {
            starter: { name: 'STARTER', data: '500MB', price: 'Rs. 130', validity: '2-Year' },
            popular: { name: 'POPULAR', data: '1GB', price: 'Rs. 400', validity: '2-Year' },
            mega: { name: 'MEGA', data: '5GB', price: 'Rs. 1500', validity: '4 Devices' }
        },
        payments: {
            easypaisa: { number: '03466544374', title: 'Shafqat' },
            jazzcash: { number: '03456754090', title: 'Shafqat' },
            sadapay: { number: '03116400376', title: 'Abdullah Saahi' }
        }
    }
};

// ============================================
// TEMPLATES
// ============================================
const TEMPLATES = {
    welcome: `Assalam-o-Alaikum! SimFly Pakistan mein khush amdeed! 🇵🇰

Kya aap Non-PTA iPhone ke liye eSIM dhundh rahe hain?

Hamare Plans:
⚡ STARTER (500MB) - Rs. 130 (2 Saal)
🔥 POPULAR (1GB) - Rs. 400 (2 Saal) - BEST SELLER
💎 MEGA (5GB) - Rs. 1500 (4 Devices)

Kaunsa plan dekhna chahain ge?`,

    pricing: `📱 SimFly Pakistan eSIM Plans:

⚡ STARTER - Rs. 130
   500MB | 2 Years Validity

🔥 POPULAR - Rs. 400  ⭐ MOST SELLING
   1GB | 2 Years Validity

💎 MEGA - Rs. 1500
   5GB | 4 Devices Support

Bataein kaunsa plan chahiye?`,

    payment: `💳 Payment Methods:

1️⃣ Easypaisa
   📞 03466544374
   👤 Shafqat

2️⃣ JazzCash
   📞 03456754090
   👤 Shafqat

3️⃣ SadaPay
   📞 03116400376
   👤 Abdullah Saahi

⚠️ Important: SadaPay par "Abdullah Saahi" show hoga

Payment ke baad screenshot bhejein! ✅`,

    screenshot: `📸 Shukriya bhai! Screenshot mil gaya hai!

Admin verify kar raha hai. Thori der mein plan active ho jayega Inshallah.

Aap ko confirmation mil jayega! 🎉`,

    thanks: `Koi baat nahi! 😊

Aur kuch help chahiye ho toh zaroor poochiyein.

SimFly Pakistan 🇵🇰`,

    default: `Main samajh nahi paya... 🤔

Bataein kya chahiye:
• Plans dekhna
• Payment details
• Help chahiye

Ya simply "Hi" likhein! 👋`,

    error: `Sorry bhai, thora masla aa raha hai. 😔

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
    aiProvider: 'GROQ', // GROQ or TEMPLATE
    aiStatus: 'CHECKING', // CHECKING, WORKING, FAILED
    settings: {
        autoReply: true,
        sendNotifications: true,
        debugMode: false,
        responseDelay: 1000 // ms
    },
    messageQueue: [],
    lastError: null
};

function log(msg, type = 'info') {
    const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`;
    State.logs.push(entry);
    if (State.logs.length > 150) State.logs.shift();
    console.log(entry);
}

// ============================================
// AI MANAGEMENT
// ============================================
let groqClient = null;

const SYSTEM_PROMPT = `You are a friendly Sales Manager at SimFly Pakistan (eSIM for Non-PTA iPhones).

Use Roman Urdu/Hinglish. Be friendly but professional.

PRICING:
• STARTER: 500MB @ Rs. 130 (2 years)
• POPULAR: 1GB @ Rs. 400 (2 years) - MOST POPULAR
• MEGA: 5GB @ Rs. 1500 (4 devices)

PAYMENT:
• Easypaisa: 03466544374 (Shafqat)
• JazzCash: 03456754090 (Shafqat)
• SadaPay: 03116400376 (Abdullah Saahi)

RULES:
1. No markdown (*, **, _, #)
2. No discounts
3. Focus on closing sales
4. Short, helpful replies`;

async function initAI() {
    if (!CONFIG.GROQ_API_KEY) {
        log('No GROQ_API_KEY, using templates', 'warn');
        State.aiProvider = 'TEMPLATE';
        State.aiStatus = 'NO_KEY';
        return;
    }

    try {
        log('Testing Groq AI...');
        groqClient = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

        const test = await groqClient.chat.completions.create({
            messages: [{ role: 'user', content: 'Say "SimFly OK"' }],
            model: 'llama3-8b-8192',
            max_tokens: 10
        });

        if (test.choices[0].message.content.includes('OK')) {
            log('✅ Groq AI WORKING');
            State.aiStatus = 'WORKING';
            State.aiProvider = 'GROQ';
            return;
        }
    } catch (e) {
        log(`Groq failed: ${e.message}`, 'error');
    }

    log('Groq not available, switching to templates', 'warn');
    State.aiProvider = 'TEMPLATE';
    State.aiStatus = 'FAILED';
}

async function generateResponse(userMsg) {
    const msg = userMsg.toLowerCase().trim();

    // Smart template matching
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('start') || msg.includes('/start')) {
        return TEMPLATES.welcome;
    }
    if (msg.includes('price') || msg.includes('plan') || msg.includes('package') || msg.includes('rs.') || msg.includes('cost') || msg.includes('rate') || msg.includes('kitne')) {
        return TEMPLATES.pricing;
    }
    if (msg.includes('payment') || msg.includes('pay') || msg.includes('easypaisa') || msg.includes('jazzcash') || msg.includes('sadapay') || msg.includes('send') || msg.includes('number')) {
        return TEMPLATES.payment;
    }
    if (msg.includes('thank') || msg.includes('shukria') || msg.includes('thanks') || msg.includes('shukran')) {
        return TEMPLATES.thanks;
    }

    // AI Response (if enabled and working)
    if (State.settings.autoReply && State.aiProvider === 'GROQ' && State.aiStatus === 'WORKING' && groqClient) {
        try {
            const chat = await groqClient.chat.completions.create({
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMsg }
                ],
                model: 'llama3-8b-8192',
                max_tokens: 400,
                temperature: 0.7
            });

            return chat.choices[0].message.content
                .replace(/\*\*/g, '').replace(/\*/g, '')
                .replace(/__/g, '').replace(/_/g, '')
                .replace(/#/g, '').replace(/`/g, '');
        } catch (e) {
            log(`AI error: ${e.message}`, 'error');
        }
    }

    return TEMPLATES.default;
}

// ============================================
// MESSAGE HANDLER WITH DELIVERY CONFIRMATION
// ============================================
async function handleMessage(message) {
    const chatId = message.from;
    if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return;

    log(`📩 From ${chatId}: "${message.body?.substring(0, 40)}..."`);
    State.totalMessages++;

    // Track conversation
    if (!State.conversations.has(chatId)) {
        State.conversations.set(chatId, { startedAt: Date.now(), count: 0, lastMsg: '' });
    }
    const conv = State.conversations.get(chatId);
    conv.count++;
    conv.lastMsg = message.body;

    try {
        let reply = '';

        if (message.hasMedia) {
            log('📸 Screenshot received');
            reply = TEMPLATES.screenshot;
            State.totalOrders++;
        } else {
            // Add delay for mobile users
            await new Promise(r => setTimeout(r, State.settings.responseDelay));
            reply = await generateResponse(message.body || '');
        }

        if (reply) {
            // Send with delivery confirmation
            const sent = await message.reply(reply);

            if (sent && sent.id) {
                log(`✅ Message DELIVERED to ${chatId} (ID: ${sent.id.id?.slice(-10)})`);
                conv.lastReply = reply;
            } else {
                log(`⚠️ Message sent but no confirmation ID`, 'warn');
            }
        }
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'error');
        State.lastError = error.message;
        try {
            await message.reply(TEMPLATES.error);
        } catch (e) {}
    }
}

// ============================================
// EXPRESS SERVER WITH DASHBOARD SETTINGS
// ============================================
const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.send(`SimFly OS v2.0 | ${State.isReady ? '🟢 LIVE' : '⏳ ' + State.clientState} | AI: ${State.aiProvider} | Messages: ${State.totalMessages}`);
});

// API - Get Status
app.get('/api/status', (req, res) => {
    res.json({
        ready: State.isReady,
        state: State.clientState,
        aiProvider: State.aiProvider,
        aiStatus: State.aiStatus,
        settings: State.settings,
        messages: State.totalMessages,
        orders: State.totalOrders,
        conversations: State.conversations.size,
        uptime: Math.floor((Date.now() - State.startTime) / 1000),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        logs: State.logs.slice(-20),
        lastError: State.lastError
    });
});

// API - Update Settings
app.post('/api/settings', (req, res) => {
    const { autoReply, sendNotifications, debugMode, responseDelay, aiProvider } = req.body;

    if (autoReply !== undefined) State.settings.autoReply = autoReply;
    if (sendNotifications !== undefined) State.settings.sendNotifications = sendNotifications;
    if (debugMode !== undefined) State.settings.debugMode = debugMode;
    if (responseDelay !== undefined) State.settings.responseDelay = parseInt(responseDelay);
    if (aiProvider !== undefined) {
        State.aiProvider = aiProvider;
        if (aiProvider === 'GROQ') initAI(); // Re-test
    }

    log(`Settings updated: ${JSON.stringify(State.settings)}`);
    res.json({ success: true, settings: State.settings, aiProvider: State.aiProvider });
});

// API - Send Test Message
app.post('/api/send-test', async (req, res) => {
    const { number, message } = req.body;
    if (!client || !State.isReady) {
        return res.json({ success: false, error: 'Client not ready' });
    }

    try {
        const chatId = number.includes('@') ? number : `${number}@c.us`;
        const sent = await client.sendMessage(chatId, message || 'Test message from SimFly OS');
        log(`Test message sent to ${number}`);
        res.json({ success: true, messageId: sent.id });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// API - Reconnect
app.post('/api/reconnect', async (req, res) => {
    log('Manual reconnect triggered from dashboard');
    try {
        if (client) {
            await client.destroy();
        }
        setTimeout(initWhatsApp, 2000);
        res.json({ success: true, message: 'Reconnecting...' });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Setup Page with QR
app.get('/setup', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>SimFly OS - Setup</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 15px;
        }
        .container { max-width: 500px; margin: 0 auto; }
        .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #e94560; margin-bottom: 20px; }
        .header h1 { font-size: 2rem; background: linear-gradient(45deg, #e94560, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status {
            padding: 12px; border-radius: 10px; margin: 15px 0; text-align: center; font-weight: bold; font-size: 1rem;
        }
        .status-initializing { background: #ffa502; color: #000; }
        .status-qr { background: #00d9ff; color: #000; }
        .status-ready { background: #2ed573; color: #000; }
        .qr-container {
            background: white; padding: 25px; border-radius: 15px; text-align: center; margin: 15px 0;
            display: ${State.qrGenerated && !State.isReady ? 'block' : 'none'};
        }
        #qrcode { margin: 15px auto; }
        .token-box {
            background: rgba(0,217,255,0.1); border: 2px solid #00d9ff; border-radius: 15px;
            padding: 20px; text-align: center; margin: 15px 0; display: ${State.isReady ? 'block' : 'none'};
        }
        .token { font-size: 2rem; font-family: monospace; color: #00d9ff; letter-spacing: 3px; }
        .btn {
            display: inline-block; background: linear-gradient(45deg, #e94560, #ff6b6b);
            color: white; padding: 12px 25px; border-radius: 25px; text-decoration: none;
            font-weight: bold; margin-top: 15px; border: none; cursor: pointer; font-size: 1rem;
        }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 15px 0; }
        .info-item { background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; text-align: center; }
        .info-value { color: #00d9ff; font-weight: bold; font-size: 1.1rem; }
        .loader { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #00d9ff; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS</h1>
            <p style="color:#a0a0a0; margin-top:5px;">WhatsApp Sales Bot</p>
        </div>

        <div class="status status-${State.isReady ? 'ready' : State.qrGenerated ? 'qr' : 'initializing'}">
            ${State.isReady ? '✅ BOT READY' : State.qrGenerated ? '📱 SCAN QR CODE' : '⏳ INITIALIZING...'}
        </div>

        ${State.qrGenerated && !State.isReady ? `
        <div class="qr-container">
            <h2 style="color:#1a1a2e; margin-bottom:10px;">Scan with WhatsApp</h2>
            <p style="color:#333; font-size:0.9rem; margin-bottom:15px;">Settings → Linked Devices → Link Device</p>
            <div id="qrcode"></div>
            <p style="color:#666; font-size:0.8rem; margin-top:10px;">Auto-refresh in 5s</p>
        </div>
        ` : !State.isReady ? '<div class="loader"></div>' : ''}

        ${State.isReady ? `
        <div class="token-box">
            <h3 style="margin-bottom:10px;">🎉 Connected!</h3>
            <div class="token">${State.adminToken}</div>
            <p style="margin-top:10px; color:#a0a0a0;">Dashboard Token</p>
            <a href="${CONFIG.RENDER_URL}/dashboard/${State.adminToken}" class="btn">Open Dashboard</a>
        </div>
        ` : ''}

        <div class="info-grid">
            <div class="info-item"><div class="info-value">${State.aiProvider}</div><div>AI</div></div>
            <div class="info-item"><div class="info-value">${State.totalMessages}</div><div>Messages</div></div>
            <div class="info-item"><div class="info-value">${State.totalOrders}</div><div>Orders</div></div>
            <div class="info-item"><div class="info-value">${State.clientState}</div><div>State</div></div>
        </div>
    </div>

    <script>
        // Auto-refresh
        setTimeout(() => location.reload(), 5000);

        // Generate QR
        ${State.qrCodeData ? `
        new QRCode(document.getElementById("qrcode"), {
            text: "${State.qrCodeData}", width: 220, height: 220, colorDark: "#000", colorLight: "#fff", correctLevel: QRCode.CorrectLevel.H
        });
        ` : ''}
    </script>
</body>
</html>`;
    res.send(html);
});

// Dashboard with Full Settings
app.get('/dashboard/:token', (req, res) => {
    if (!State.adminToken || req.params.token !== State.adminToken) {
        return res.status(403).send('403 - Access Denied');
    }

    const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptime = Math.floor((Date.now() - State.startTime) / 1000);

    const html = `<!DOCTYPE html>
<html lang="en">
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
            padding: 15px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #e94560; margin-bottom: 20px; }
        .header h1 { font-size: 2rem; }
        .status-badge {
            display: inline-block; padding: 8px 20px; border-radius: 20px;
            font-weight: bold; margin-top: 10px;
        }
        .status-live { background: #2ed573; color: #000; }
        .status-offline { background: #ff4757; color: #fff; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .card {
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px; padding: 20px; text-align: center;
        }
        .card-value { font-size: 2rem; color: #00d9ff; font-weight: bold; }
        .card-label { color: #a0a0a0; margin-top: 5px; }

        .section {
            background: rgba(255,255,255,0.05); border-radius: 15px;
            padding: 20px; margin: 20px 0;
        }
        .section h2 { color: #00d9ff; margin-bottom: 15px; font-size: 1.3rem; }

        .setting-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .setting-item:last-child { border-bottom: none; }
        .toggle {
            width: 50px; height: 26px; background: #444; border-radius: 13px;
            position: relative; cursor: pointer; transition: 0.3s;
        }
        .toggle.active { background: #00d9ff; }
        .toggle::after {
            content: ''; position: absolute; width: 22px; height: 22px;
            background: white; border-radius: 50%; top: 2px; left: 2px;
            transition: 0.3s;
        }
        .toggle.active::after { left: 26px; }

        select, input {
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
            color: #fff; padding: 10px 15px; border-radius: 8px; font-size: 1rem;
        }

        .btn {
            background: linear-gradient(45deg, #e94560, #ff6b6b);
            color: white; padding: 12px 25px; border-radius: 8px;
            border: none; cursor: pointer; font-size: 1rem; font-weight: bold;
            margin: 5px; transition: opacity 0.3s;
        }
        .btn:hover { opacity: 0.9; }
        .btn-secondary { background: rgba(255,255,255,0.1); }

        .logs {
            background: rgba(0,0,0,0.3); border-radius: 10px; padding: 15px;
            font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;
        }
        .log-entry { margin: 2px 0; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-info { color: #00d9ff; }
        .log-error { color: #ff4757; }
        .log-warn { color: #ffa502; }

        #toast {
            position: fixed; bottom: 20px; right: 20px;
            background: #2ed573; color: #000; padding: 15px 25px;
            border-radius: 10px; font-weight: bold; display: none; z-index: 1000;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS Dashboard</h1>
            <span class="status-badge ${State.isReady ? 'status-live' : 'status-offline'}">
                ${State.isReady ? '🟢 LIVE' : '🔴 OFFLINE'}
            </span>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-value">${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m</div>
                <div class="card-label">Uptime</div>
            </div>
            <div class="card">
                <div class="card-value">${State.totalMessages}</div>
                <div class="card-label">Messages</div>
            </div>
            <div class="card">
                <div class="card-value">${State.totalOrders}</div>
                <div class="card-label">Orders</div>
            </div>
            <div class="card">
                <div class="card-value">${State.conversations.size}</div>
                <div class="card-label">Chats</div>
            </div>
            <div class="card">
                <div class="card-value">${mem}MB</div>
                <div class="card-label">Memory</div>
            </div>
            <div class="card">
                <div class="card-value">${State.aiProvider}</div>
                <div class="card-label">AI Provider</div>
            </div>
        </div>

        <div class="section">
            <h2>⚙️ Bot Settings</h2>

            <div class="setting-item">
                <div>
                    <strong>AI Provider</strong><br>
                    <small style="color:#a0a0a0">GROQ (Free) or Templates</small>
                </div>
                <select id="aiProvider" onchange="updateSettings()">
                    <option value="GROQ" ${State.aiProvider === 'GROQ' ? 'selected' : ''}>Groq AI (Free)</option>
                    <option value="TEMPLATE" ${State.aiProvider === 'TEMPLATE' ? 'selected' : ''}>Templates Only</option>
                </select>
            </div>

            <div class="setting-item">
                <div>
                    <strong>Auto Reply</strong><br>
                    <small style="color:#a0a0a0">Automatically respond to messages</small>
                </div>
                <div class="toggle ${State.settings.autoReply ? 'active' : ''}" onclick="toggleSetting('autoReply')"></div>
            </div>

            <div class="setting-item">
                <div>
                    <strong>Send Notifications</strong><br>
                    <small style="color:#a0a0a0">Notify admin on new orders</small>
                </div>
                <div class="toggle ${State.settings.sendNotifications ? 'active' : ''}" onclick="toggleSetting('sendNotifications')"></div>
            </div>

            <div class="setting-item">
                <div>
                    <strong>Response Delay</strong><br>
                    <small style="color:#a0a0a0">Delay before replying (ms)</small>
                </div>
                <input type="number" id="responseDelay" value="${State.settings.responseDelay}" min="0" max="5000" step="100" onchange="updateSettings()" style="width:100px">
            </div>
        </div>

        <div class="section">
            <h2>🔧 Actions</h2>
            <button class="btn" onclick="reconnect()">🔄 Reconnect WhatsApp</button>
            <button class="btn btn-secondary" onclick="sendTest()">📱 Send Test Message</button>
            <button class="btn btn-secondary" onclick="location.reload()">🔄 Refresh Page</button>
        </div>

        <div class="section">
            <h2>📝 Recent Logs</h2>
            <div class="logs" id="logs">
                ${State.logs.slice(-15).map(l => {
                    const type = l.includes('[ERROR]') ? 'log-error' : l.includes('[WARN]') ? 'log-warn' : 'log-info';
                    return `<div class="log-entry ${type}">${l.replace(/\[.*?\]/g, m => `<span style="opacity:0.6">${m}</span>`)}</div>`;
                }).join('')}
            </div>
        </div>

        <div style="text-align:center; color:#666; padding:20px; font-size:0.9rem">
            Token: ${State.adminToken} | AI Status: ${State.aiStatus} | v2.0.0
        </div>
    </div>

    <div id="toast">Settings Saved!</div>

    <script>
        const settings = ${JSON.stringify(State.settings)};
        let aiProvider = '${State.aiProvider}';

        function toggleSetting(key) {
            settings[key] = !settings[key];
            updateSettings();
        }

        async function updateSettings() {
            const aiSelect = document.getElementById('aiProvider');
            if (aiSelect) aiProvider = aiSelect.value;

            const delayInput = document.getElementById('responseDelay');
            if (delayInput) settings.responseDelay = parseInt(delayInput.value);

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({...settings, aiProvider})
                });
                const data = await res.json();
                if (data.success) showToast('Settings Saved!');
            } catch (e) {
                showToast('Error saving settings');
            }
        }

        async function reconnect() {
            if (!confirm('Reconnect WhatsApp? This will require scanning QR again.')) return;
            try {
                const res = await fetch('/api/reconnect', {method: 'POST'});
                const data = await res.json();
                showToast(data.message);
            } catch (e) {
                showToast('Error: ' + e.message);
            }
        }

        async function sendTest() {
            const num = prompt('Enter number (e.g., 923001234567):');
            if (!num) return;
            try {
                const res = await fetch('/api/send-test', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({number: num, message: 'Test from SimFly Dashboard'})
                });
                const data = await res.json();
                showToast(data.success ? 'Message Sent!' : 'Failed: ' + data.error);
            } catch (e) {
                showToast('Error: ' + e.message);
            }
        }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.style.display = 'block';
            setTimeout(() => t.style.display = 'none', 3000);
        }

        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>`;
    res.send(html);
});

const server = app.listen(CONFIG.PORT, () => {
    log(`SimFly OS v2.0 running on port ${CONFIG.PORT}`);
});

// ============================================
// WHATSAPP CLIENT WITH DELIVERY CONFIRMATION
// ============================================
let client = null;

async function sendAdminNotification() {
    if (!CONFIG.ADMIN_NUMBER || !client || !State.isReady) {
        log('Cannot notify: Missing number, client, or not ready', 'error');
        return false;
    }

    if (!State.settings.sendNotifications) {
        log('Notifications disabled in settings');
        return false;
    }

    // Format number
    let adminNum = CONFIG.ADMIN_NUMBER.trim().replace(/\D/g, '');
    if (adminNum.startsWith('0')) adminNum = '92' + adminNum.substring(1);
    if (!adminNum.startsWith('92')) adminNum = '92' + adminNum;

    const chatId = `${adminNum}@c.us`;
    const msg = `✅ SimFly OS Connected!\n\n🤖 AI: ${State.aiProvider}\n💬 Messages: ${State.totalMessages}\n📦 Orders: ${State.totalOrders}\n\n🔗 Dashboard:\n${CONFIG.RENDER_URL}/dashboard/${State.adminToken}\n\n📱 Token: ${State.adminToken}`;

    log(`Sending notification to ${chatId}...`);

    // Wait for client to be fully ready
    let attempts = 0;
    while ((!client.info || !client.pupPage) && attempts < 10) {
        log(`Waiting for client ready (attempt ${attempts + 1})...`);
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }

    for (let i = 0; i < 5; i++) {
        try {
            const sent = await client.sendMessage(chatId, msg);

            if (sent && sent.id) {
                log(`✅ Admin notification DELIVERED (ID: ${sent.id.id?.slice(-8)})`);
                return true;
            }
        } catch (e) {
            log(`❌ Attempt ${i + 1} failed: ${e.message}`, 'error');
            if (i < 4) await new Promise(r => setTimeout(r, 3000));
        }
    }

    log('All notification attempts failed', 'error');
    return false;
}

async function onBotReady() {
    if (State.isReady) return;

    log('========================================');
    log('BOT IS FULLY READY!');
    log('========================================');

    State.isReady = true;
    State.clientState = 'READY';
    State.qrCodeData = null;
    State.adminToken = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Wait 8 seconds for complete stabilization
    log('Waiting 8 seconds for full stabilization...');
    await new Promise(r => setTimeout(r, 8000));

    // Send notification
    const notified = await sendAdminNotification();

    if (!notified) {
        log('Initial notification failed, will retry in 60s...', 'error');
        setTimeout(sendAdminNotification, 60000);
    }
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
    await initAI();

    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const chromePath = await getChromePath();
    log(`Chrome: ${chromePath || 'using default'}`);

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: authPath }),
        puppeteer: {
            headless: chromium.headless,
            executablePath: chromePath || undefined,
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--disable-gpu']
        },
        qrMaxRetries: 10
    });

    // EVENT HANDLERS
    client.on('qr', (qr) => {
        State.qrGenerated = true;
        State.qrCodeData = qr;
        State.clientState = 'QR_GENERATED';
        log('QR Generated! Scan now');
        console.log('\n=== QR CODE ===\n');
        qrcode.generate(qr, { small: true });
        console.log('\n==============\n');
    });

    client.on('authenticated', () => {
        log('✅ Authenticated');
        State.clientState = 'AUTHENTICATED';
    });

    client.on('ready', async () => {
        log('Event: ready');
        // Delay to ensure fully ready
        setTimeout(onBotReady, 5000);
    });

    client.on('change_state', (s) => {
        log(`State: ${s}`);
        State.clientState = s;
        if (s === 'OPEN' && !State.isReady) {
            setTimeout(onBotReady, 8000);
        }
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;
        // Small delay for mobile users
        await new Promise(r => setTimeout(r, 500));
        await handleMessage(msg);
    });

    client.on('message', async (msg) => {
        if (msg.fromMe) return;
        await handleMessage(msg);
    });

    client.on('disconnected', () => {
        log('Disconnected!', 'error');
        State.isReady = false;
        State.qrGenerated = false;
    });

    try {
        await client.initialize();
        log('Client initialized');
        // Fallback ready trigger
        setTimeout(() => { if (!State.isReady) onBotReady(); }, 20000);
    } catch (e) {
        log(`Init error: ${e.message}`, 'error');
    }
}

// SHUTDOWN
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

// START
log('========================================');
log('SimFly OS v2.0 Starting...');
log('Priority: GROQ → Templates');
log('========================================');

setTimeout(initWhatsApp, 3000);

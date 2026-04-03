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
// STATE MANAGEMENT - OPTIMIZED FOR MEMORY
// ============================================
const State = {
    startTime: Date.now(),
    totalMessages: 0,
    totalOrders: 0,
    conversations: new Map(),
    adminToken: null,
    loginCode: null,        // 8-digit numeric code for easy login
    isReady: false,
    qrGenerated: false,
    qrCodeData: null,
    logs: [],
    clientState: 'INITIALIZING',
    aiProvider: 'GROQ',
    aiStatus: 'CHECKING',
    settings: {
        autoReply: true,
        sendNotifications: true,
        debugMode: false,
        responseDelay: 800
    },
    messageQueue: [],
    lastError: null,
    sessionId: null,
    clientInfo: {
        name: null,
        platform: null,
        connectedAt: null
    }
};

// Active login sessions (code -> expiry)
const activeSessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// MEMORY LIMITS
const MEMORY_CONFIG = {
    maxLogs: 30,           // Keep only 30 logs
    maxConversations: 50,  // Keep only 50 recent conversations
    maxProcessedMsgs: 50,  // Keep only 50 processed message IDs
    cleanupInterval: 300000 // Cleanup every 5 minutes
};

function log(msg, type = 'info') {
    const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`;
    State.logs.push(entry);
    // Keep only recent logs to save memory
    if (State.logs.length > MEMORY_CONFIG.maxLogs) {
        State.logs = State.logs.slice(-MEMORY_CONFIG.maxLogs);
    }
    console.log(entry);
}

// Memory cleanup function
function cleanupMemory() {
    // Clean old conversations
    if (State.conversations.size > MEMORY_CONFIG.maxConversations) {
        const entries = Array.from(State.conversations.entries());
        const toKeep = entries.slice(-MEMORY_CONFIG.maxConversations);
        State.conversations.clear();
        toKeep.forEach(([k, v]) => State.conversations.set(k, v));
        log(`Memory cleaned: conversations reduced to ${State.conversations.size}`);
    }

    // Clean old processed messages
    if (processedMessages.size > MEMORY_CONFIG.maxProcessedMsgs) {
        const arr = Array.from(processedMessages);
        processedMessages.clear();
        arr.slice(-MEMORY_CONFIG.maxProcessedMsgs).forEach(id => processedMessages.add(id));
    }

    // Force garbage collection if available
    if (global.gc) {
        global.gc();
        log('Garbage collection triggered');
    }
}

// ============================================
// AI MANAGEMENT - SALES FOCUSED
// ============================================
let groqClient = null;

// Conversation memory per chat (lightweight)
const conversationMemory = new Map();

const MEGA_SYSTEM_PROMPT = `You are the EXPERT Sales Manager at SimFly Pakistan - Pakistan's #1 eSIM Provider for Non-PTA iPhones.

YOUR MISSION: Convert every inquiry into a PAID order. You MUST push customers to buy!

📦 PRODUCTS (ONLY SELL THESE):
⚡ STARTER: 500MB Data = Rs. 130 (2 Years Validity) - Budget option
🔥 POPULAR: 1GB Data = Rs. 400 (2 Years Validity) - BEST SELLER, Most Popular
💎 MEGA: 5GB Data = Rs. 1500 (Supports 4 Devices) - Premium Package

💳 PAYMENT METHODS:
1️⃣ Easypaisa: 03466544374 (Name: Shafqat)
2️⃣ JazzCash: 03456754090 (Name: Shafqat)
3️⃣ SadaPay: 03116400376 (Name: Abdullah Saahi)

⚠️ IMPORTANT: SadaPay shows "Abdullah Saahi" as receiver name!

🎯 SALES STRATEGY - FOLLOW THIS STRICTLY:

STEP 1 - GREETING:
- Warm welcome in Roman Urdu
- Ask: "Kaunsa iPhone hai aapka?" (Build rapport)
- Mention: "Non-PTA ke liye perfect solution hai!"

STEP 2 - UNDERSTAND NEED:
- Ask about their data usage
- Kitna internet use karte hain?
- 1 device ya multiple devices?

STEP 3 - RECOMMEND PRODUCT:
- Low usage (500MB/month) → STARTER
- Normal usage (1GB/month) → POPULAR (Push this!)
- Heavy usage/Multiple devices → MEGA

STEP 4 - PUSH FOR PAYMENT:
- After they show interest, IMMEDIATELY say:
  "Bhai abhi payment kar lo, instant activation ho jayega! 😊"
- Give ONE payment method at a time
- Easypaisa pehle recommend karo

STEP 5 - CLOSE THE DEAL:
- Payment ka screenshot manga
- "Jaldi bhejo bhai, stock limited hai! 🔥"
- After screenshot → Thank + Confirm activation

🚫 STRICT RULES - NEVER BREAK:
1. Reply in ROMAN URDU/HINGLISH only
2. Keep replies SHORT (2-4 lines max)
3. Use emojis in EVERY message
4. NO markdown (*, **, _, #)
5. NO discounts - prices are fixed
6. NO off-topic discussion - ONLY eSIM/payment/activation
7. Always stay FRIENDLY but PERSISTENT
8. Push for IMMEDIATE payment - "Abhi kar lo bhai!"
9. Create urgency - "Offer limited hai!"
10. Ask questions to keep conversation going

📝 CONVERSATION FLOW:
- Greeting → Product Info → Push Payment → Screenshot → Thank
- If they delay: "Bhai jaldi karo, stock khatam hone wala hai! 😊"
- If they hesitate: "400 mein 1GB, 2 saal ka sukoon! 💪"

❌ IF ASKED NON-BUSINESS QUESTIONS:
Reply: "Bhai main sirf eSIM plans ke baare mein help kar sakta hoon. Konsa plan lena hai? 😊"

✅ ALWAYS END WITH:
- A question OR
- Payment instruction OR
- Urgency statement

Never let conversation die! Keep pushing for SALE!`;

let SYSTEM_PROMPT = MEGA_SYSTEM_PROMPT;

async function initAI() {
    if (!CONFIG.GROQ_API_KEY) {
        log('No GROQ_API_KEY, using templates', 'warn');
        State.aiProvider = 'TEMPLATE';
        State.aiStatus = 'NO_KEY';
        return;
    }

    try {
        log('Testing Groq AI with llama-3.1-8b-instant...');
        groqClient = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

        const test = await groqClient.chat.completions.create({
            messages: [{ role: 'user', content: 'Say "SimFly OK"' }],
            model: 'llama-3.1-8b-instant',
            max_tokens: 10
        });

        if (test.choices[0].message.content.includes('OK')) {
            log('✅ Groq AI WORKING (llama-3.1-8b-instant)');
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

async function generateResponse(userMsg, chatId) {
    const msg = userMsg.toLowerCase().trim();

    // Quick template matching for common keywords
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('start')) {
        // Initialize conversation memory
        conversationMemory.set(chatId, { stage: 'greeting', history: [], lastUpdate: Date.now() });
        return TEMPLATES.welcome;
    }

    // AI Response with conversation memory
    if (State.settings.autoReply && State.aiProvider === 'GROQ' && State.aiStatus === 'WORKING' && groqClient) {
        try {
            // Get conversation context
            let convContext = conversationMemory.get(chatId);
            if (!convContext) {
                convContext = { stage: 'new', history: [], lastUpdate: Date.now() };
                conversationMemory.set(chatId, convContext);
            }

            // Keep only last 3 messages for memory efficiency
            convContext.history.push({ role: 'user', content: userMsg });
            if (convContext.history.length > 3) {
                convContext.history.shift();
            }

            // Build messages with context
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...convContext.history.slice(0, -1).map(h => ({ role: h.role, content: h.content })),
                { role: 'user', content: userMsg }
            ];

            const chat = await groqClient.chat.completions.create({
                messages: messages,
                model: 'llama-3.1-8b-instant',
                max_tokens: 250, // Reduced for faster response
                temperature: 0.6, // Slightly more focused
                stream: false
            });

            let response = chat.choices[0].message.content
                .replace(/\*\*/g, '').replace(/\*/g, '')
                .replace(/__/g, '').replace(/_/g, '')
                .replace(/#/g, '').replace(/`/g, '');

            // Store bot response
            convContext.history.push({ role: 'assistant', content: response });
            convContext.lastUpdate = Date.now();

            return response;
        } catch (e) {
            log(`AI error: ${e.message}`, 'error');
            // Fallback to templates
            if (msg.includes('price') || msg.includes('plan') || msg.includes('kitne')) return TEMPLATES.pricing;
            if (msg.includes('payment') || msg.includes('pay') || msg.includes('easypaisa') || msg.includes('jazzcash') || msg.includes('sadapay')) return TEMPLATES.payment;
            if (msg.includes('thank') || msg.includes('shukria')) return TEMPLATES.thanks;
        }
    } else {
        // Template-only mode
        if (msg.includes('price') || msg.includes('plan') || msg.includes('rs.') || msg.includes('cost') || msg.includes('rate') || msg.includes('kitne')) {
            return TEMPLATES.pricing;
        }
        if (msg.includes('payment') || msg.includes('pay') || msg.includes('easypaisa') || msg.includes('jazzcash') || msg.includes('sadapay') || msg.includes('send') || msg.includes('number')) {
            return TEMPLATES.payment;
        }
        if (msg.includes('thank') || msg.includes('shukria') || msg.includes('thanks') || msg.includes('shukran')) {
            return TEMPLATES.thanks;
        }
    }

    return TEMPLATES.default;
}

// ============================================
// MESSAGE HANDLER WITH TYPING INDICATOR
// ============================================
const processedMessages = new Set();
const messageQueue = new Map();

async function handleMessage(message) {
    const chatId = message.from;

    // Skip groups and status
    if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return;

    // DEDUPLICATION: Skip if already processed
    const msgId = message.id?._serialized || `${chatId}-${message.timestamp}`;
    if (processedMessages.has(msgId)) {
        log(`⏩ Duplicate message skipped: ${msgId.slice(-15)}`);
        return;
    }
    processedMessages.add(msgId);

    // Clean up old message IDs (keep last 50)
    if (processedMessages.size > MEMORY_CONFIG.maxProcessedMsgs) {
        const iterator = processedMessages.values();
        processedMessages.delete(iterator.next().value);
    }

    log(`📩 From ${chatId}: "${message.body?.substring(0, 40)}..."`);
    State.totalMessages++;

    // Track conversation
    if (!State.conversations.has(chatId)) {
        State.conversations.set(chatId, { startedAt: Date.now(), count: 0, lastMsg: '', processing: false });
    }
    const conv = State.conversations.get(chatId);
    conv.count++;
    conv.lastMsg = message.body;

    // QUEUE messages per chat to prevent race conditions
    if (!messageQueue.has(chatId)) {
        messageQueue.set(chatId, []);
    }
    messageQueue.get(chatId).push(message);

    // Process queue
    await processMessageQueue(chatId, conv);
}

async function processMessageQueue(chatId, conv) {
    const queue = messageQueue.get(chatId);
    if (!queue || queue.length === 0 || conv.processing) return;

    conv.processing = true;

    while (queue.length > 0) {
        const message = queue.shift();
        await processSingleMessage(message, chatId, conv);
    }

    conv.processing = false;
}

async function processSingleMessage(message, chatId, conv) {
    try {
        let reply = '';
        const chat = await message.getChat();

        if (message.hasMedia) {
            log('📸 Screenshot received');
            reply = TEMPLATES.screenshot;
            State.totalOrders++;

            // Clear conversation memory after order
            conversationMemory.delete(chatId);
        } else {
            // Show typing indicator
            await chat.sendStateTyping();

            // Generate response with delay
            await new Promise(r => setTimeout(r, State.settings.responseDelay));
            reply = await generateResponse(message.body || '', chatId);

            // Stop typing before sending
            await chat.clearState();
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
        lastError: State.lastError,
        qrGenerated: State.qrGenerated,
        qrData: State.qrCodeData,
        adminToken: State.adminToken
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

// ============================================
// 8-DIGIT CODE LOGIN SYSTEM
// ============================================

// API - Verify 8-digit code
app.post('/api/login/verify', (req, res) => {
    const { code } = req.body;

    if (!code || !/^\d{8}$/.test(code)) {
        return res.json({ success: false, error: 'Please enter valid 8-digit code' });
    }

    // Check if code matches current login code
    if (code === State.loginCode) {
        const expiry = activeSessions.get(code);
        if (expiry && expiry > Date.now()) {
            return res.json({
                success: true,
                token: State.adminToken,
                redirectUrl: `${CONFIG.RENDER_URL}/dashboard/${State.adminToken}`
            });
        } else {
            return res.json({ success: false, error: 'Code expired. Please check latest code.' });
        }
    }

    // Check if code is an old but valid session
    const expiry = activeSessions.get(code);
    if (expiry && expiry > Date.now()) {
        return res.json({
            success: true,
            token: State.adminToken,
            redirectUrl: `${CONFIG.RENDER_URL}/dashboard/${State.adminToken}`,
            message: 'Welcome back!'
        });
    }

    res.json({ success: false, error: 'Invalid code. Please check your WhatsApp message.' });
});

// Login Page with 8-digit Code Entry
app.get('/login', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS - Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary: #e94560;
            --secondary: #00d9ff;
            --success: #2ed573;
            --bg-dark: #1a1a2e;
            --bg-darker: #16213e;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-darker) 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .login-container {
            width: 100%;
            max-width: 400px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 40px 30px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        .logo {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .title {
            font-size: 1.8rem;
            background: linear-gradient(45deg, var(--primary), #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .subtitle {
            color: #888;
            font-size: 0.95rem;
            margin-bottom: 30px;
        }
        .code-inputs {
            display: flex;
            gap: 8px;
            justify-content: center;
            margin: 30px 0;
        }
        .code-input {
            width: 42px;
            height: 52px;
            background: rgba(255,255,255,0.1);
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 12px;
            color: #fff;
            font-size: 1.5rem;
            font-weight: bold;
            text-align: center;
            transition: all 0.3s;
        }
        .code-input:focus {
            outline: none;
            border-color: var(--secondary);
            background: rgba(0,217,255,0.1);
            transform: scale(1.05);
        }
        .code-input.filled {
            border-color: var(--success);
            background: rgba(46,213,115,0.1);
        }
        .login-btn {
            width: 100%;
            padding: 16px;
            background: linear-gradient(45deg, var(--primary), #ff6b6b);
            color: #fff;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 20px;
        }
        .login-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(233,69,96,0.4);
        }
        .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error-msg {
            color: #ff4757;
            font-size: 0.9rem;
            margin-top: 15px;
            min-height: 20px;
        }
        .success-msg {
            color: var(--success);
            font-size: 0.9rem;
            margin-top: 15px;
        }
        .help-text {
            color: #666;
            font-size: 0.85rem;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        .help-text strong {
            color: var(--secondary);
        }
        .loader {
            display: none;
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(46,213,115,0.1);
            border: 1px solid rgba(46,213,115,0.3);
            border-radius: 20px;
            color: var(--success);
            font-size: 0.85rem;
            margin-bottom: 20px;
        }
        .status-indicator.offline {
            background: rgba(255,71,87,0.1);
            border-color: rgba(255,71,87,0.3);
            color: #ff4757;
        }
        .dot {
            width: 8px;
            height: 8px;
            background: currentColor;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .paste-btn {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: #fff;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-bottom: 15px;
            transition: all 0.3s;
        }
        .paste-btn:hover {
            background: rgba(255,255,255,0.2);
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🤖</div>
        <h1 class="title">SimFly OS</h1>
        <p class="subtitle">Enter 8-Digit Access Code</p>

        <div id="statusIndicator" class="status-indicator ${State.isReady ? '' : 'offline'}">
            <span class="dot"></span>
            <span>${State.isReady ? 'Bot Online' : 'Bot Offline'}</span>
        </div>

        <button class="paste-btn" onclick="pasteCode()">📋 Paste Code</button>

        <div class="code-inputs" id="codeInputs">
            <input type="text" class="code-input" maxlength="1" data-index="0">
            <input type="text" class="code-input" maxlength="1" data-index="1">
            <input type="text" class="code-input" maxlength="1" data-index="2">
            <input type="text" class="code-input" maxlength="1" data-index="3">
            <input type="text" class="code-input" maxlength="1" data-index="4">
            <input type="text" class="code-input" maxlength="1" data-index="5">
            <input type="text" class="code-input" maxlength="1" data-index="6">
            <input type="text" class="code-input" maxlength="1" data-index="7">
        </div>

        <input type="hidden" id="fullCode" value="">

        <button class="login-btn" id="loginBtn" onclick="verifyCode()">
            <span id="btnText">🔓 Access Dashboard</span>
            <div class="loader" id="btnLoader"></div>
        </button>

        <div id="message" class="error-msg"></div>

        <div class="help-text">
            💡 Code sent to admin WhatsApp <strong>${State.loginCode ? '••••' + State.loginCode.slice(-4) : 'XXXX'}</strong><br>
            Valid for 24 hours
        </div>
    </div>

    <script>
        const inputs = document.querySelectorAll('.code-input');
        const fullCodeInput = document.getElementById('fullCode');
        const loginBtn = document.getElementById('loginBtn');
        const btnText = document.getElementById('btnText');
        const btnLoader = document.getElementById('btnLoader');
        const message = document.getElementById('message');

        // Setup input handling
        inputs.forEach((input, index) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace') {
                    if (input.value === '' && index > 0) {
                        inputs[index - 1].focus();
                    }
                }
            });

            input.addEventListener('input', (e) => {
                const val = e.target.value;

                // Only allow numbers
                if (!/^\d*$/.test(val)) {
                    input.value = '';
                    return;
                }

                if (val.length === 1) {
                    input.classList.add('filled');
                    // Auto-focus next
                    if (index < 7) {
                        inputs[index + 1].focus();
                    }
                } else if (val.length === 0) {
                    input.classList.remove('filled');
                }

                updateFullCode();
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);

                if (pasteData.length > 0) {
                    pasteData.split('').forEach((char, i) => {
                        if (i < 8) {
                            inputs[i].value = char;
                            inputs[i].classList.add('filled');
                        }
                    });

                    // Focus last filled or next empty
                    const focusIndex = Math.min(pasteData.length, 7);
                    inputs[focusIndex].focus();
                    updateFullCode();
                }
            });
        });

        function updateFullCode() {
            const code = Array.from(inputs).map(i => i.value).join('');
            fullCodeInput.value = code;

            // Auto-submit when 8 digits entered
            if (code.length === 8) {
                setTimeout(() => verifyCode(), 300);
            }
        }

        async function pasteCode() {
            try {
                const text = await navigator.clipboard.readText();
                const cleanCode = text.replace(/\D/g, '').slice(0, 8);

                if (cleanCode.length === 8) {
                    cleanCode.split('').forEach((char, i) => {
                        inputs[i].value = char;
                        inputs[i].classList.add('filled');
                    });
                    updateFullCode();
                    message.textContent = '';
                } else {
                    message.textContent = 'Clipboard does not contain valid 8-digit code';
                    message.className = 'error-msg';
                }
            } catch (e) {
                message.textContent = 'Cannot access clipboard. Please paste manually.';
                message.className = 'error-msg';
            }
        }

        async function verifyCode() {
            const code = fullCodeInput.value;

            if (code.length !== 8) {
                message.textContent = 'Please enter all 8 digits';
                message.className = 'error-msg';
                return;
            }

            // Show loading
            btnText.style.display = 'none';
            btnLoader.style.display = 'block';
            loginBtn.disabled = true;
            message.textContent = '';

            try {
                const res = await fetch('/api/login/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await res.json();

                if (data.success) {
                    message.textContent = 'Success! Redirecting...';
                    message.className = 'success-msg';
                    setTimeout(() => {
                        window.location.href = data.redirectUrl;
                    }, 800);
                } else {
                    message.textContent = data.error || 'Invalid code';
                    message.className = 'error-msg';
                    btnText.style.display = 'inline';
                    btnLoader.style.display = 'none';
                    loginBtn.disabled = false;
                }
            } catch (e) {
                message.textContent = 'Network error. Please try again.';
                message.className = 'error-msg';
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
                loginBtn.disabled = false;
            }
        }

        // Focus first input on load
        inputs[0].focus();
    </script>
</body>
</html>`;
    res.send(html);
});

// Setup Page with Real-time Updates
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
        :root {
            --primary: #e94560;
            --secondary: #00d9ff;
            --success: #2ed573;
            --warning: #ffa502;
            --bg-dark: #1a1a2e;
            --bg-darker: #16213e;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-darker) 100%);
            color: #fff;
            min-height: 100vh;
            padding: 15px;
        }
        .container { max-width: 480px; margin: 0 auto; }

        /* Header */
        .header { text-align: center; padding: 25px 0; border-bottom: 2px solid var(--primary); margin-bottom: 25px; }
        .header h1 { font-size: 2.2rem; background: linear-gradient(45deg, var(--primary), #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header p { color: #a0a0a0; margin-top: 8px; font-size: 0.95rem; }

        /* Connection Status Card */
        .status-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            padding: 25px;
            margin: 20px 0;
            text-align: center;
            transition: all 0.3s ease;
        }
        .status-card.initializing { border-color: var(--warning); }
        .status-card.qr { border-color: var(--secondary); box-shadow: 0 0 20px rgba(0,217,255,0.2); }
        .status-card.ready { border-color: var(--success); box-shadow: 0 0 20px rgba(46,213,115,0.2); }

        .status-icon { font-size: 3.5rem; margin-bottom: 15px; }
        .status-title { font-size: 1.3rem; font-weight: bold; margin-bottom: 8px; }
        .status-subtitle { color: #a0a0a0; font-size: 0.9rem; }

        /* Live Indicator */
        .live-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(46,213,115,0.1);
            color: var(--success);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            margin-top: 15px;
        }
        .live-dot {
            width: 8px;
            height: 8px;
            background: var(--success);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }

        /* QR Container */
        .qr-section {
            background: white;
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin: 20px 0;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            display: none;
        }
        .qr-section.active { display: block; animation: slideUp 0.5s ease; }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .qr-title { color: #1a1a2e; font-size: 1.4rem; font-weight: bold; margin-bottom: 10px; }
        .qr-subtitle { color: #666; font-size: 0.9rem; margin-bottom: 20px; }
        #qrcode { margin: 20px auto; padding: 15px; background: white; border-radius: 10px; }
        .qr-timer { color: #999; font-size: 0.85rem; margin-top: 15px; }
        .qr-timer span { color: var(--primary); font-weight: bold; }

        /* Token Section */
        .token-section {
            background: linear-gradient(135deg, rgba(0,217,255,0.1), rgba(233,69,96,0.1));
            border: 2px solid var(--secondary);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin: 20px 0;
            display: none;
        }
        .token-section.active { display: block; animation: slideUp 0.5s ease; }
        .success-icon { font-size: 3rem; margin-bottom: 15px; }
        .token-label { color: #a0a0a0; font-size: 0.9rem; margin-bottom: 10px; }
        .token-display {
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 15px 25px;
            font-size: 1.8rem;
            font-family: 'Courier New', monospace;
            color: var(--secondary);
            letter-spacing: 3px;
            margin: 15px 0;
            word-break: break-all;
        }
        .btn-dashboard {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(45deg, var(--primary), #ff6b6b);
            color: white;
            padding: 14px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 15px;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-dashboard:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(233,69,96,0.4); }

        /* Loading State */
        .loading-section {
            text-align: center;
            padding: 40px 20px;
        }
        .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top-color: var(--secondary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { color: #a0a0a0; font-size: 1rem; }
        .loading-dots::after {
            content: '';
            animation: dots 1.5s infinite;
        }
        @keyframes dots {
            0%, 20% { content: '.'; }
            40% { content: '..'; }
            60%, 100% { content: '...'; }
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin: 20px 0;
        }
        .stat-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 15px;
            padding: 18px;
            text-align: center;
            transition: all 0.3s;
        }
        .stat-card:hover { background: rgba(255,255,255,0.06); transform: translateY(-2px); }
        .stat-icon { font-size: 1.5rem; margin-bottom: 8px; }
        .stat-value {
            font-size: 1.6rem;
            font-weight: bold;
            color: var(--secondary);
            transition: all 0.3s;
        }
        .stat-label { color: #888; font-size: 0.85rem; margin-top: 5px; }

        /* Log Section */
        .log-section {
            background: rgba(0,0,0,0.2);
            border-radius: 15px;
            padding: 15px;
            margin-top: 20px;
        }
        .log-title { color: #888; font-size: 0.85rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .log-container {
            font-family: 'Courier New', monospace;
            font-size: 0.75rem;
            max-height: 150px;
            overflow-y: auto;
            color: #aaa;
        }
        .log-entry { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-entry:last-child { border-bottom: none; color: var(--secondary); }

        /* Last Updated */
        .last-updated {
            text-align: center;
            color: #666;
            font-size: 0.75rem;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SimFly OS</h1>
            <p>WhatsApp Business Bot</p>
        </div>

        <!-- Status Card -->
        <div id="statusCard" class="status-card initializing">
            <div id="statusIcon" class="status-icon">⏳</div>
            <div id="statusTitle" class="status-title">Initializing...</div>
            <div id="statusSubtitle" class="status-subtitle">Setting up WhatsApp connection</div>
            <div id="liveIndicator" class="live-indicator" style="display:none;">
                <span class="live-dot"></span>
                <span>LIVE</span>
            </div>
        </div>

        <!-- Loading State -->
        <div id="loadingSection" class="loading-section">
            <div class="spinner"></div>
            <div class="loading-text">Starting Bot<span class="loading-dots"></span></div>
        </div>

        <!-- QR Section -->
        <div id="qrSection" class="qr-section">
            <div class="qr-title">📱 Scan with WhatsApp</div>
            <div class="qr-subtitle">Settings → Linked Devices → Link Device</div>
            <div id="qrcode"></div>
            <div class="qr-timer">⏱️ Refreshing in <span id="timer">5</span>s</div>
        </div>

        <!-- Token Section -->
        <div id="tokenSection" class="token-section">
            <div class="success-icon">🎉</div>
            <div class="token-label">8-Digit Access Code</div>
            <div id="codeDisplay" class="token-display" style="color:#2ed573;letter-spacing:8px;">-</div>
            <div style="color:#888;font-size:0.85rem;margin:10px 0;">Or use full token</div>
            <div id="tokenDisplay" class="token-display" style="font-size:1rem;padding:10px 15px;">-</div>
            <a id="dashboardLink" href="#" class="btn-dashboard">
                <span>🚀</span> Open Dashboard
            </a>
            <div style="margin-top:15px;">
                <a href="/login" style="color:#00d9ff;text-decoration:none;font-size:0.9rem;">🔑 Login with Code →</a>
            </div>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">🤖</div>
                <div id="statAI" class="stat-value">-</div>
                <div class="stat-label">AI Provider</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">💬</div>
                <div id="statMessages" class="stat-value">0</div>
                <div class="stat-label">Messages</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📦</div>
                <div id="statOrders" class="stat-value">0</div>
                <div class="stat-label">Orders</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div id="statState" class="stat-value">-</div>
                <div class="stat-label">Status</div>
            </div>
        </div>

        <!-- Live Log -->
        <div class="log-section">
            <div class="log-title">📋 Live Activity</div>
            <div id="logContainer" class="log-container">
                <div class="log-entry">Waiting for connection...</div>
            </div>
        </div>

        <div class="last-updated">
            Last updated: <span id="lastUpdate">-</span>
        </div>
    </div>

    <script>
        let qrGenerated = false;
        let countdown = 5;
        let refreshInterval;
        let timerInterval;

        // Initial QR data from server
        const initialQR = '${State.qrCodeData || ''}';

        // If QR already exists on page load, show it immediately
        if (initialQR) {
            console.log('Initial QR found, displaying immediately...');
            setTimeout(() => {
                document.getElementById('qrcode').innerHTML = '';
                new QRCode(document.getElementById('qrcode'), {
                    text: initialQR,
                    width: 220,
                    height: 220,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
                qrGenerated = true;
                startTimer();
            }, 500);
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                updateUI(data);
            } catch (e) {
                console.error('Fetch error:', e);
            }
        }

        function updateUI(data) {
            // Update status card
            const statusCard = document.getElementById('statusCard');
            const statusIcon = document.getElementById('statusIcon');
            const statusTitle = document.getElementById('statusTitle');
            const statusSubtitle = document.getElementById('statusSubtitle');
            const loadingSection = document.getElementById('loadingSection');
            const qrSection = document.getElementById('qrSection');
            const tokenSection = document.getElementById('tokenSection');
            const liveIndicator = document.getElementById('liveIndicator');

            // Update stats
            document.getElementById('statAI').textContent = data.aiProvider || '-';
            document.getElementById('statMessages').textContent = data.messages || 0;
            document.getElementById('statOrders').textContent = data.orders || 0;
            document.getElementById('statState').textContent = data.state || '-';

            // Update logs
            if (data.logs && data.logs.length > 0) {
                const logContainer = document.getElementById('logContainer');
                logContainer.innerHTML = data.logs.slice(-5).map(log => {
                    const parts = log.split('] ');
                    const msg = parts[parts.length - 1];
                    return '<div class="log-entry">' + msg + '</div>';
                }).join('');
                logContainer.scrollTop = logContainer.scrollHeight;
            }

            // Update timestamp
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

            // Handle states
            if (data.ready) {
                // BOT READY
                statusCard.className = 'status-card ready';
                statusIcon.textContent = '✅';
                statusTitle.textContent = 'Bot Connected!';
                statusSubtitle.textContent = 'WhatsApp is live and ready';
                liveIndicator.style.display = 'inline-flex';

                loadingSection.style.display = 'none';
                qrSection.classList.remove('active');
                tokenSection.classList.add('active');

                // Update code and token
                if (data.loginCode) {
                    document.getElementById('codeDisplay').textContent = data.loginCode;
                    document.getElementById('dashboardLink').href = '${CONFIG.RENDER_URL}/dashboard/' + data.loginCode;
                }
                if (data.adminToken) {
                    document.getElementById('tokenDisplay').textContent = data.adminToken;
                }

                // Stop refreshing
                clearInterval(refreshInterval);

            } else if (data.qrGenerated || data.qrData) {
                // QR CODE AVAILABLE
                statusCard.className = 'status-card qr';
                statusIcon.textContent = '📱';
                statusTitle.textContent = 'Scan QR Code';
                statusSubtitle.textContent = 'Open WhatsApp and scan to connect';

                loadingSection.style.display = 'none';
                qrSection.classList.add('active');

                // Generate QR code - ALWAYS update when qrData changes
                const currentQR = data.qrData || initialQR;
                if (currentQR) {
                    const qrContainer = document.getElementById('qrcode');
                    // Clear previous QR
                    qrContainer.innerHTML = '';
                    // Generate new QR
                    new QRCode(qrContainer, {
                        text: currentQR,
                        width: 220,
                        height: 220,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    console.log('QR Code updated:', currentQR.slice(0, 20) + '...');

                    // Reset timer when new QR generated
                    if (!qrGenerated) {
                        qrGenerated = true;
                        startTimer();
                    }
                }

            } else {
                // INITIALIZING
                statusCard.className = 'status-card initializing';
                statusIcon.textContent = '⏳';
                statusTitle.textContent = 'Initializing...';
                statusSubtitle.textContent = 'Setting up WhatsApp connection';
            }
        }

        function startTimer() {
            countdown = 5;
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                countdown--;
                document.getElementById('timer').textContent = countdown;
                if (countdown <= 0) countdown = 5;
            }, 1000);
        }

        // Start fetching
        fetchStatus();
        refreshInterval = setInterval(fetchStatus, 2000);

        // Cleanup on page hide
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(refreshInterval);
            } else {
                refreshInterval = setInterval(fetchStatus, 2000);
            }
        });
    </script>
</body>
</html>`;
    res.send(html);
});

// Dashboard with Full Settings
app.get('/dashboard/:token', (req, res) => {
    const provided = req.params.token;

    // Check token OR 8-digit code
    const isTokenValid = State.adminToken && provided === State.adminToken;
    const isCodeValid = State.loginCode && provided === State.loginCode;
    const isOldCodeValid = activeSessions.has(provided) && activeSessions.get(provided) > Date.now();

    if (!isTokenValid && !isCodeValid && !isOldCodeValid) {
        return res.status(403).send('<!DOCTYPE html><html><head><style>body{background:#1a1a2e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style></head><body><div><h1>🔒 Access Denied</h1><p>Invalid token or expired code.</p><br><a href="/login" style="color:#00d9ff;text-decoration:none;">← Go to Login</a></div></body></html>');
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
    if (!CONFIG.ADMIN_NUMBER || !client) {
        log('Cannot notify: Missing number or client not initialized', 'error');
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
    const sessionInfo = State.sessionId ? `\n📱 Session: ${State.sessionId.slice(-8)}` : '';
    const msg = `✅ SimFly OS Connected!${sessionInfo}\n\n🤖 AI: ${State.aiProvider}\n💬 Messages: ${State.totalMessages}\n📦 Orders: ${State.totalOrders}\n\n🔗 Dashboard:\n${CONFIG.RENDER_URL}/dashboard/${State.adminToken}\n\n🔑 8-Digit Code: ${State.loginCode}\n📱 Token: ${State.adminToken}`;

    log(`Sending notification to ${chatId}...`);

    // Try to send immediately, if fails retry
    for (let i = 0; i < 5; i++) {
        try {
            if (!client.sendMessage) {
                log(`Client not ready (attempt ${i+1}), waiting...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }

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

    // Generate 8-digit numeric login code (easy to type)
    State.loginCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    activeSessions.set(State.loginCode, Date.now() + SESSION_DURATION);
    log(`Login credentials generated - Token: ${State.adminToken.slice(0,4)}... | Code: ${State.loginCode.slice(0,4)}****`);

    // Store session info if available
    try {
        if (client.info) {
            State.clientInfo.name = client.info.pushname || 'Unknown';
            State.clientInfo.platform = client.info.platform || 'Unknown';
            State.clientInfo.connectedAt = new Date().toISOString();
            State.sessionId = client.info.wid?._serialized || Date.now().toString();
            log(`Session stored: ${State.sessionId.slice(-8)} | User: ${State.clientInfo.name}`);
        }
    } catch (e) {
        log('Could not store session info: ' + e.message, 'warn');
    }

    // Wait 5 seconds for complete stabilization
    log('Waiting 5 seconds for stabilization...');
    await new Promise(r => setTimeout(r, 5000));

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
        log('QR Code ready for scanning - visit /setup to see it');
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

    // SINGLE message handler - no duplicates
    const processedMessages = new Set();

    client.on('message', async (msg) => {
        if (msg.fromMe) return;
        if (!msg.body && !msg.hasMedia) return;

        // Prevent duplicate processing
        const msgId = msg.id?.id || msg.id?._serialized;
        if (msgId && processedMessages.has(msgId)) {
            log(`Skipping duplicate message: ${msgId.slice(-8)}`);
            return;
        }
        if (msgId) processedMessages.add(msgId);

        // Keep set size manageable
        if (processedMessages.size > 100) {
            const first = processedMessages.values().next().value;
            processedMessages.delete(first);
        }

        // Show typing indicator
        let chat = null;
        try {
            chat = await msg.getChat();
            chat.sendStateTyping();
        } catch (e) {}

        // Process message with understanding delay
        await new Promise(r => setTimeout(r, 1000)); // 1 second "thinking" time
        await handleMessage(msg);

        // Stop typing
        try {
            if (chat) chat.clearState();
        } catch (e) {}
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

// Memory cleanup interval (every 5 minutes)
setInterval(cleanupMemory, MEMORY_CONFIG.cleanupInterval);

// ============================================
// 24/7 KEEP-ALIVE (Self-ping)
// ============================================
if (CONFIG.RENDER_URL && CONFIG.RENDER_URL.includes('onrender.com')) {
    const https = require('https');
    const http = require('http');

    setInterval(() => {
        const url = CONFIG.RENDER_URL;
        const protocol = url.startsWith('https') ? https : http;

        const req = protocol.get(url, (res) => {
            log(`Self-ping: ${res.statusCode} OK`);
        });
        req.on('error', (e) => {
            log(`Self-ping: ${e.message}`, 'warn');
        });
        req.setTimeout(5000, () => req.abort());
    }, 600000); // Every 10 minutes

    log('24/7 Self-ping enabled for Render');
}

// START
log('========================================');
log('SimFly OS v2.1 - LIGHTWEIGHT EDITION');
log('Memory Optimized | 24/7 Ready | Sales AI');
log('========================================');

// Log memory stats every 10 minutes
setInterval(() => {
    const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    log(`Memory: ${mem}MB heap | ${rss}MB RSS`);
}, 600000);

setTimeout(initWhatsApp, 3000);

/**
 * SIMFLY OS v5.0 - FIREBASE + GROQ EDITION
 * Complete WhatsApp Bot with AI & Database
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const Groq = require('groq-sdk');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ADMIN_NUMBER: process.env.ADMIN_NUMBER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    // Firebase Config (from env or default)
    FIREBASE: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    }
};

// ============================================
// GROQ AI SETUP
// ============================================
let groqClient = null;
if (CONFIG.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: CONFIG.GROQ_API_KEY });
    console.log('✓ Groq AI initialized');
} else {
    console.warn('✗ GROQ_API_KEY not set - AI responses disabled');
}

// AI System Prompt
const SYSTEM_PROMPT = `You are SimFly Pakistan's WhatsApp Sales Assistant.

BUSINESS INFO:
- SimFly Pakistan sells eSIM for Non-PTA iPhones
- Location: Pakistan
- Languages: Reply in Roman Urdu/Hinglish mixed with English

ESIM PLANS:
⚡ STARTER: 500MB @ Rs. 130 (2 years)
🔥 POPULAR: 1GB @ Rs. 400 (2 years) - MOST POPULAR
💎 MEGA: 5GB @ Rs. 1500 (4 devices)

PAYMENT METHODS:
💳 Easypaisa: 03466544374 (Shafqat)
💳 JazzCash: 03456754090 (Shafqat)
💳 SadaPay: 03116400376 (Abdullah Saahi)

RULES:
1. Use emojis in every response
2. Keep replies SHORT (2-3 lines max)
3. No markdown formatting
4. No discounts allowed
5. Focus on closing sales
6. If asked non-business topics: "Sorry bhai, main sirf SimFly ke eSIM plans ke bare mein help kar sakta hoon. 😊"
7. Always stay professional but friendly

TONE: Friendly Pakistani bhai style, helpful, sales-oriented`;

// ============================================
// FIREBASE SETUP (Using Firebase Admin SDK)
// ============================================
let db = null;
let firebaseInitialized = false;

// Check for Firebase service account
if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT !== 'your_base64_encoded_service_account_here') {
    try {
        const admin = require('firebase-admin');

        // Clean the base64 string (remove newlines/spaces)
        const cleanBase64 = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\s/g, '');

        // Decode base64
        const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');

        // Parse JSON
        const serviceAccount = JSON.parse(decoded);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        db = admin.firestore();
        firebaseInitialized = true;
        console.log('✓ Firebase initialized with service account');
    } catch (e) {
        console.error('✗ Firebase init failed:', e.message);
        console.log('→ Falling back to local JSON storage');
    }
} else {
    console.log('→ No FIREBASE_SERVICE_ACCOUNT found, using local JSON storage');
}

// Fallback: Simple JSON-based storage
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB = {
    conversations: {}, // chatId -> messages array
    stats: {
        totalMessages: 0,
        totalOrders: 0,
        dailyStats: {}
    },
    users: {} // phone -> user data
};

// Firebase DB Helper Functions
async function saveConversation(chatId, message) {
    if (firebaseInitialized && db) {
        try {
            const admin = require('firebase-admin');
            const convoRef = db.collection('conversations').doc(chatId);
            const doc = await convoRef.get();
            let messages = [];
            if (doc.exists) {
                messages = doc.data().messages || [];
            }
            messages.push(message);
            if (messages.length > 50) messages = messages.slice(-50);
            await convoRef.set({ messages, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (e) {
            console.error('Firebase save error:', e.message);
        }
    }
    // Also save to local
    if (!DB.conversations[chatId]) DB.conversations[chatId] = [];
    DB.conversations[chatId].push(message);
    if (DB.conversations[chatId].length > 50) {
        DB.conversations[chatId] = DB.conversations[chatId].slice(-50);
    }
}

async function updateUser(chatId, userData) {
    if (firebaseInitialized && db) {
        try {
            await db.collection('users').doc(chatId).set(userData, { merge: true });
        } catch (e) {
            console.error('Firebase user update error:', e.message);
        }
    }
    if (!DB.users[chatId]) DB.users[chatId] = {};
    Object.assign(DB.users[chatId], userData);
}

async function incrementStats(field) {
    if (firebaseInitialized && db) {
        try {
            const admin = require('firebase-admin');
            const statsRef = db.collection('stats').doc('global');
            await statsRef.update({ [field]: admin.firestore.FieldValue.increment(1) });
        } catch (e) {
            try {
                await db.collection('stats').doc('global').set({ [field]: 1 }, { merge: true });
            } catch (err) {}
        }
    }
    DB.stats[field] = (DB.stats[field] || 0) + 1;
}

async function getConversation(chatId) {
    if (firebaseInitialized && db) {
        try {
            const doc = await db.collection('conversations').doc(chatId).get();
            if (doc.exists) return doc.data().messages || [];
        } catch (e) {}
    }
    return DB.conversations[chatId] || [];
}

async function getAllStats() {
    if (firebaseInitialized && db) {
        try {
            const doc = await db.collection('stats').doc('global').get();
            if (doc.exists) return doc.data();
        } catch (e) {}
    }
    return DB.stats;
}

// Local backup
const DB_FILE = path.join(DATA_DIR, 'database.json');
function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            Object.assign(DB, data);
        }
    } catch (e) {}
    console.log(firebaseInitialized ? '✓ Firebase + Local JSON backup active' : '✓ Local JSON database active');
}

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
    } catch (e) {}
}

setInterval(saveDB, 30000);
loadDB();

// ============================================
// STATE
// ============================================
const State = {
    isReady: false,
    status: 'INITIALIZING',
    qrData: null,
    logs: [],
    startTime: Date.now()
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };
    State.logs.unshift(entry);
    if (State.logs.length > 100) State.logs.pop();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// AI RESPONSE FUNCTION
// ============================================
async function generateAIResponse(userMessage, chatId) {
    // Check for keywords first
    const msg = userMessage.toLowerCase();

    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam')) {
        return `Assalam-o-Alaikum! 👋 SimFly Pakistan mein khush amdeed!\n\nMain aapki kya madad kar sakta hoon? 😊`;
    }

    if (msg.includes('price') || msg.includes('plan') || msg.includes('rate') || msg.includes('kitne')) {
        return `Hamare eSIM Plans:\n\n⚡ 500MB - Rs. 130\n🔥 1GB - Rs. 400 (Most Popular)\n💎 5GB - Rs. 1500\n\nKaunsa plan pasand hai? 🤔`;
    }

    if (msg.includes('payment') || msg.includes('pay') || msg.includes('jazzcash') || msg.includes('easypaisa')) {
        return `Payment Methods:\n\n💳 Easypaisa: 03466544374\n💳 JazzCash: 03456754090\n💳 SadaPay: 03116400376\n\nPayment karne ke baad screenshot bhejain! 📱`;
    }

    // If Groq is available, use AI
    if (groqClient) {
        try {
            // Get conversation history from Firebase
            const history = await getConversation(chatId);
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history.slice(-5).map(m => ({
                    role: m.fromMe ? 'assistant' : 'user',
                    content: m.body
                })),
                { role: 'user', content: userMessage }
            ];

            const response = await groqClient.chat.conpletions.create({
                model: 'llama-3.1-8b-instant',
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            });

            return response.choices[0].message.content;
        } catch (error) {
            log(`Groq error: ${error.message}`, 'error');
            // Fallback to template
        }
    }

    // Default responses
    if (msg.includes('order') || msg.includes('buy') || msg.includes('purchase')) {
        return `Order karne ke liye:\n\n1️⃣ Plan select karein\n2️⃣ Payment karein\n3️⃣ Screenshot bhejain\n\nAap kaunsa plan lena chahte hain? 📦`;
    }

    if (msg.includes('thank') || msg.includes('shukria') || msg.includes('thanks')) {
        return `Koi baat nahi! 😊 Agar koi aur sawal ho toh pooch sakte hain. Hum yahan hain help ke liye! 👍`;
    }

    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?`;
}

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function startWhatsApp() {
    if (client) return;

    log('Starting WhatsApp...');
    State.status = 'INITIALIZING';

    try {
        const authPath = '/app/.wwebjs_auth';
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        let executablePath = null;
        try {
            executablePath = await chromium.executablePath();
            log('Chrome found: ' + executablePath);
        } catch (e) {
            log('Using system Chrome', 'warn');
        }

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath, clientId: 'simfly' }),
            puppeteer: {
                headless: 'new',
                executablePath: executablePath || undefined,
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', '--single-process', '--disable-gpu'
                ]
            }
        });

        client.on('qr', (qr) => {
            log('QR Code generated');
            State.status = 'QR';
            State.qrData = qr;
            qrcode.generate(qr, { small: true });
        });

        client.on('authenticated', () => {
            log('Authenticated ✓');
            State.status = 'AUTHENTICATED';
        });

        client.on('ready', () => {
            log('WhatsApp READY! ✓');
            State.isReady = true;
            State.status = 'READY';
            State.qrData = null;

            // Notify admin
            if (CONFIG.ADMIN_NUMBER) {
                const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                client.sendMessage(adminChat, '🤖 SimFly Bot is now ONLINE and ready! ✅\n\nFeatures active:\n✓ Groq AI: ' + (groqClient ? 'ON' : 'OFF') + '\n✓ Firebase DB: LOCAL\n✓ Message Handler: ACTIVE');
            }
        });

        client.on('auth_failure', (err) => {
            log('Auth failed: ' + err, 'error');
            State.status = 'ERROR';
        });

        client.on('disconnected', (reason) => {
            log('Disconnected: ' + reason, 'error');
            State.isReady = false;
            State.status = 'INITIALIZING';
            State.qrData = null;
            client = null;
            saveDB();
            setTimeout(startWhatsApp, 5000);
        });

        // MESSAGE HANDLER WITH AI & DATABASE
        client.on('message_create', async (msg) => {
            // Skip if from me
            if (msg.fromMe) return;

            const chatId = msg.from;
            const body = msg.body;

            // Log message
            log(`[${chatId}] ${body.slice(0, 50)}...`);

            // Update stats (Firebase + Local)
            await incrementStats('totalMessages');

            // Store in Firebase + Local
            await saveConversation(chatId, {
                body: body,
                fromMe: false,
                timestamp: Date.now()
            });

            // Store user info
            await updateUser(chatId, {
                firstSeen: DB.users[chatId]?.firstSeen || Date.now(),
                messageCount: (DB.users[chatId]?.messageCount || 0) + 1,
                lastSeen: Date.now()
            });

            // Only reply if ready
            if (!State.isReady) return;

            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();

                // Generate AI response
                const reply = await generateAIResponse(body, chatId);

                await new Promise(r => setTimeout(r, 1000));
                const sent = await msg.reply(reply);
                await chat.clearState();

                // Store bot response
                if (sent) {
                    await saveConversation(chatId, {
                        body: reply,
                        fromMe: true,
                        timestamp: Date.now()
                    });
                }

                // Check if it's a payment screenshot
                if (msg.hasMedia && (body.toLowerCase().includes('payment') || body.toLowerCase().includes('screenshot') || body.toLowerCase().includes('sent'))) {
                    // Notify admin
                    if (CONFIG.ADMIN_NUMBER) {
                        const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        client.sendMessage(adminChat, `💰 Payment received from: ${chatId}\n\nCheck dashboard for details.`);
                    }
                    await incrementStats('totalOrders');
                }

            } catch (e) {
                log('Message error: ' + e.message, 'error');
            }
        });

        await client.initialize();
        log('Client initialized');

    } catch (error) {
        log('Start error: ' + error.message, 'error');
        State.status = 'ERROR';
        client = null;
        setTimeout(startWhatsApp, 10000);
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    next();
});

app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({ ok: true, status: State.status, ready: State.isReady });
});

// Status API
app.get('/api/status', (req, res) => {
    res.json({
        status: State.status,
        ready: State.isReady,
        qr: State.qrData,
        stats: {
            messages: DB.stats.totalMessages,
            orders: DB.stats.totalOrders,
            users: Object.keys(DB.users).length
        },
        logs: State.logs.slice(0, 20),
        groqEnabled: !!groqClient
    });
});

// Get all conversations
app.get('/api/conversations', (req, res) => {
    res.json({
        total: Object.keys(DB.conversations).length,
        conversations: DB.conversations
    });
});

// Get specific conversation
app.get('/api/conversation/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    res.json({
        chatId,
        messages: DB.conversations[chatId] || [],
        user: DB.users[chatId] || null
    });
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getAllStats();
        res.json({
            stats: stats || DB.stats,
            users: Object.keys(DB.users).length,
            uptime: Math.floor((Date.now() - State.startTime) / 1000),
            firebase: firebaseInitialized
        });
    } catch (e) {
        res.json({
            stats: DB.stats,
            users: Object.keys(DB.users).length,
            uptime: Math.floor((Date.now() - State.startTime) / 1000),
            firebase: false,
            error: e.message
        });
    }
});

// Send message via API
app.post('/api/send', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ error: 'number and message required' });
    }
    if (!State.isReady) {
        return res.status(503).json({ error: 'WhatsApp not ready' });
    }

    try {
        const chatId = number.includes('@') ? number : `${number.replace(/\D/g, '')}@c.us`;
        const sent = await client.sendMessage(chatId, message);
        res.json({ success: true, messageId: sent.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Main Page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS v5.0 - Firebase + Groq</title>
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
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 0; }
        .logo { font-size: 3rem; margin-bottom: 10px; }
        .title {
            font-size: 2rem;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b6b, #feca57);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle { color: #888; margin-top: 5px; }
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            margin: 16px 0;
        }
        .status-box {
            text-align: center;
            padding: 20px;
        }
        .status-icon { font-size: 3rem; margin-bottom: 10px; }
        .status-title { font-size: 1.3rem; font-weight: 600; }
        .status-text { color: #888; font-size: 0.9rem; margin-top: 5px; }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            margin: 0 5px;
        }
        .badge-green { background: #2ecc71; color: #000; }
        .badge-red { background: #e74c3c; color: #fff; }
        .badge-yellow { background: #f39c12; color: #000; }
        .loader {
            width: 40px; height: 40px;
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
        #qrcode { margin: 0 auto; }
        .success-box { text-align: center; display: none; }
        .success-box.show { display: block; }
        .logs { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto; }
        .logs-title { color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 8px; }
        .log-item { font-family: monospace; font-size: 0.8rem; padding: 4px 0; color: #aaa; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-item:last-child { border-bottom: none; color: #2ecc71; }
        .log-time { color: #666; margin-right: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; }
        .stat-value { font-size: 2rem; font-weight: bold; color: #feca57; }
        .stat-label { font-size: 0.8rem; color: #888; margin-top: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">SimFly OS v5.0</div>
            <div class="subtitle">Firebase + Groq AI Edition</div>
            <div style="margin-top: 10px;">
                <span class="badge" id="aiBadge">...</span>
                <span class="badge" id="dbBadge">...</span>
            </div>
        </div>

        <div class="card">
            <div class="status-box" id="statusBox">
                <div class="status-icon" id="statusIcon">⏳</div>
                <div class="status-title" id="statusTitle">Initializing...</div>
                <div class="status-text" id="statusText">Starting WhatsApp service</div>
                <div class="loader" id="loader"></div>
            </div>
            <div class="qr-box" id="qrCard">
                <div style="color: #333; font-weight: bold; margin-bottom: 15px;">📱 Scan with WhatsApp</div>
                <div id="qrcode"></div>
                <div style="color: #666; font-size: 0.85rem; margin-top: 15px;">
                    Settings → Linked Devices → Link a Device
                </div>
            </div>
            <div class="success-box" id="successCard">
                <div class="status-icon">✅</div>
                <div class="status-title" style="color: #2ecc71;">Connected!</div>
                <div class="status-text">WhatsApp + AI + Database ready</div>
            </div>
        </div>

        <div class="card">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="msgCount">0</div>
                    <div class="stat-label">Messages</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="orderCount">0</div>
                    <div class="stat-label">Orders</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="userCount">0</div>
                    <div class="stat-label">Users</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="logs-title">📋 Real-time Logs</div>
            <div class="logs" id="logsBox">
                <div class="log-item"><span class="log-time">--:--</span> Loading...</div>
            </div>
        </div>

        <div class="footer">
            Built for Railway.com | Data stored in Firebase (JSON mode)
        </div>
    </div>

    <script>
        const statusBox = document.getElementById('statusBox');
        const statusIcon = document.getElementById('statusIcon');
        const statusTitle = document.getElementById('statusTitle');
        const statusText = document.getElementById('statusText');
        const loader = document.getElementById('loader');
        const qrCard = document.getElementById('qrCard');
        const successCard = document.getElementById('successCard');
        const logsBox = document.getElementById('logsBox');
        const aiBadge = document.getElementById('aiBadge');
        const dbBadge = document.getElementById('dbBadge');

        let currentQR = null;
        let pollInterval = null;

        function updateUI(data) {
            // Update badges
            aiBadge.className = 'badge ' + (data.groqEnabled ? 'badge-green' : 'badge-red');
            aiBadge.textContent = data.groqEnabled ? 'AI: ON' : 'AI: OFF';
            dbBadge.className = 'badge badge-green';
            dbBadge.textContent = 'DB: JSON';

            // Update stats
            document.getElementById('msgCount').textContent = data.stats?.messages || 0;
            document.getElementById('orderCount').textContent = data.stats?.orders || 0;
            document.getElementById('userCount').textContent = data.stats?.users || 0;

            // Update logs
            if (data.logs && data.logs.length > 0) {
                logsBox.innerHTML = data.logs.map(l =>
                    '<div class="log-item"><span class="log-time">' + l.time + '</span> ' + l.msg + '</div>'
                ).join('');
            }

            // Update status
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
                    if (data.qr && data.qr !== currentQR) {
                        currentQR = data.qr;
                        qrCard.classList.add('show');
                        document.getElementById('qrcode').innerHTML = '';
                        new QRCode(document.getElementById('qrcode'), { text: data.qr, width: 200, height: 200 });
                    }
                    break;
                case 'AUTHENTICATED':
                    statusIcon.textContent = '🔐';
                    statusTitle.textContent = 'Authenticating...';
                    qrCard.classList.remove('show');
                    break;
                case 'READY':
                    statusIcon.textContent = '✅';
                    statusTitle.textContent = 'Connected!';
                    statusText.textContent = 'AI Bot + Database active';
                    loader.style.display = 'none';
                    qrCard.classList.remove('show');
                    successCard.classList.add('show');
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = setInterval(fetchStatus, 5000);
                    break;
                case 'ERROR':
                    statusIcon.textContent = '❌';
                    statusTitle.textContent = 'Error';
                    break;
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status?t=' + Date.now());
                if (!res.ok) throw new Error('HTTP ' + res.status);
                updateUI(await res.json());
            } catch (e) {
                console.error('Fetch error:', e);
            }
        }

        fetchStatus();
        pollInterval = setInterval(fetchStatus, 2000);
    </script>
</body>
</html>`);
});

// Start server
const server = app.listen(CONFIG.PORT, () => {
    log('='.repeat(50));
    log('SimFly OS v5.0 - Firebase + Groq Edition');
    log('AI: ' + (groqClient ? 'ENABLED ✓' : 'DISABLED ✗'));
    log('Firebase: ' + (firebaseInitialized ? 'CONNECTED ✓' : 'LOCAL MODE'));
    log('Server: http://localhost:' + CONFIG.PORT);
    log('='.repeat(50));
    // Start WhatsApp after server is ready
    setTimeout(startWhatsApp, 3000);
});

process.on('SIGTERM', () => { log('SIGTERM received'); saveDB(); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { log('SIGINT received'); saveDB(); server.close(() => process.exit(0)); });

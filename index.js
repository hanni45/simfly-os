/**
 * SIMFLY OS v3.0.0 - FLAWLESS EDITION
 * Production-Ready WhatsApp Sales Bot
 * Complete Rewrite - Clean & Optimized
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
};

// ============================================
// STATE - SINGLE SOURCE OF TRUTH
// ============================================
const State = {
    isReady: false,
    clientState: 'INITIALIZING', // INITIALIZING, QR_READY, PAIRING_CODE_READY, AUTHENTICATED, READY, ERROR
    qrData: null,
    pairingCode: null,
    pairingNumber: null,
    qrGeneratedAt: null,
    logs: [],
    startTime: Date.now(),
    stats: {
        messages: 0,
        orders: 0
    }
};

// ============================================
// LOGGER - CLEAN & SIMPLE
// ============================================
function log(msg, type = 'info') {
    const entry = {
        time: new Date().toLocaleTimeString(),
        type,
        msg
    };
    State.logs.unshift(entry);
    if (State.logs.length > 50) State.logs.pop();
    console.log(`[${entry.time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;
let isInitializing = false;

async function initWhatsApp() {
    if (isInitializing || client) {
        log('Already initializing or running', 'warn');
        return;
    }

    isInitializing = true;
    log('Starting WhatsApp initialization...');
    State.clientState = 'INITIALIZING';

    try {
        const authPath = path.join(__dirname, '.wwebjs_auth');
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        let chromePath = null;
        try {
            chromePath = await chromium.executablePath();
        } catch (e) {
            log('Using system Chrome', 'warn');
        }

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath }),
            puppeteer: {
                headless: true,
                executablePath: chromePath || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process'
                ]
            },
            qrMaxRetries: 5
        });

        // QR CODE EVENT - Most Important!
        client.on('qr', (qr) => {
            log('QR Code generated successfully');
            State.clientState = 'QR_READY';
            State.qrData = qr;
            State.qrGeneratedAt = Date.now();

            // Show in console too
            console.log('\n╔════════════════════════════════════╗');
            console.log('║      SCAN QR CODE BELOW           ║');
            console.log('╚════════════════════════════════════╝\n');
            qrcode.generate(qr, { small: true });
        });

        // PAIRING CODE EVENT (for phone number linking)
        client.on('code', (code) => {
            log(`Pairing code generated: ${code}`);
            State.pairingCode = code;
        });

        // AUTHENTICATED
        client.on('authenticated', () => {
            log('WhatsApp authenticated ✓');
            State.clientState = 'AUTHENTICATED';
        });

        // READY
        client.on('ready', () => {
            log('WhatsApp client READY!');
            State.isReady = true;
            State.clientState = 'READY';
            State.qrData = null; // Clear QR when ready
        });

        // AUTH FAILURE
        client.on('auth_failure', (msg) => {
            log(`Auth failed: ${msg}`, 'error');
            State.clientState = 'ERROR';
        });

        // DISCONNECTED
        client.on('disconnected', (reason) => {
            log(`Disconnected: ${reason}`, 'error');
            State.isReady = false;
            State.clientState = 'INITIALIZING';
            State.qrData = null;
            client = null;
            isInitializing = false;
        });

        // MESSAGE HANDLER
        client.on('message', async (msg) => {
            if (msg.fromMe) return;
            if (!State.isReady) return;

            State.stats.messages++;

            // Show typing
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();

                // Simple reply for now
                await new Promise(r => setTimeout(r, 1000));
                await msg.reply('Assalam-o-Alaikum! SimFly Pakistan mein khush amdeed! 🇵🇭\n\nHum aapki kya madad kar sakte hain?');

                await chat.clearState();
            } catch (e) {
                log(`Message error: ${e.message}`, 'error');
            }
        });

        // Initialize
        await client.initialize();
        log('Client initialize() called');

    } catch (error) {
        log(`Init error: ${error.message}`, 'error');
        State.clientState = 'ERROR';
        isInitializing = false;
    }
}

// ============================================
// EXPRESS SERVER - CLEAN & SIMPLE
// ============================================
const app = express();
app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.json({
        status: State.clientState,
        ready: State.isReady,
        uptime: Math.floor((Date.now() - State.startTime) / 1000)
    });
});

// API: Get Status
app.get('/api/status', (req, res) => {
    res.json({
        state: State.clientState,
        ready: State.isReady,
        qrGenerated: !!State.qrData,
        qrData: State.qrData,
        pairingCode: State.pairingCode,
        pairingNumber: State.pairingNumber,
        stats: State.stats,
        logs: State.logs.slice(0, 10)
    });
});

// API: Request Pairing Code (Link with phone number)
app.post('/api/pairing-code', express.json(), async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber || !phoneNumber.match(/^\+?\d{10,15}$/)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid phone number. Please include country code (e.g., +923001234567)'
        });
    }

    if (!client || State.isReady) {
        return res.status(400).json({
            success: false,
            error: 'Client not ready for pairing'
        });
    }

    try {
        // Format number (remove + if present)
        const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
        State.pairingNumber = phoneNumber;

        // Request pairing code from WhatsApp
        const code = await client.requestPairingCode(formattedNumber);

        State.clientState = 'PAIRING_CODE_READY';
        State.pairingCode = code;

        log(`Pairing code requested for ${phoneNumber}`);

        res.json({
            success: true,
            code: code,
            phoneNumber: phoneNumber,
            message: 'Enter this code in WhatsApp app: Settings > Linked Devices > Link with Phone Number'
        });
    } catch (error) {
        log(`Pairing code error: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// SETUP PAGE - FLAWLESS FRONTEND
// ============================================
app.get('/setup', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS - WhatsApp Setup</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 450px;
            margin: 0 auto;
        }

        /* Header */
        .header {
            text-align: center;
            padding: 30px 0;
        }

        .logo {
            font-size: 3rem;
            margin-bottom: 10px;
        }

        .title {
            font-size: 1.8rem;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b6b, #feca57);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            color: #aaa;
            margin-top: 8px;
            font-size: 0.95rem;
        }

        /* Status Box */
        .status-box {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            margin: 20px 0;
            transition: all 0.3s ease;
        }

        .status-box.state-initializing { border-color: #f39c12; }
        .status-box.state-qr { border-color: #3498db; box-shadow: 0 0 30px rgba(52, 152, 219, 0.3); }
        .status-box.state-ready { border-color: #2ecc71; box-shadow: 0 0 30px rgba(46, 204, 113, 0.3); }
        .status-box.state-error { border-color: #e74c3c; }

        .status-icon {
            font-size: 3rem;
            margin-bottom: 12px;
        }

        .status-title {
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .status-desc {
            color: #888;
            font-size: 0.9rem;
        }

        /* Loader */
        .loader-container {
            text-align: center;
            padding: 40px;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top-color: #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: #888;
        }

        .loading-text span {
            animation: dots 1.5s infinite;
        }

        @keyframes dots {
            0%, 20% { content: '.'; }
            40% { content: '..'; }
            60%, 100% { content: '...'; }
        }

        /* Alternative Link Options */
        .link-options {
            margin: 20px 0;
            text-align: center;
        }

        .link-divider {
            display: flex;
            align-items: center;
            margin: 20px 0;
            color: #666;
            font-size: 0.85rem;
        }

        .link-divider::before,
        .link-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255,255,255,0.2);
        }

        .link-divider span {
            padding: 0 15px;
        }

        .phone-link-container {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            margin: 20px 0;
            display: none;
        }

        .phone-link-container.show {
            display: block;
            animation: fadeIn 0.5s ease;
        }

        .phone-link-title {
            font-size: 1.1rem;
            margin-bottom: 8px;
            color: #fff;
        }

        .phone-link-desc {
            color: #888;
            font-size: 0.85rem;
            margin-bottom: 20px;
        }

        .phone-input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }

        .phone-input {
            flex: 1;
            padding: 14px 18px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 12px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.3s;
        }

        .phone-input:focus {
            border-color: #3498db;
        }

        .phone-input::placeholder {
            color: #666;
        }

        .btn-secondary {
            padding: 14px 24px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 12px;
            background: transparent;
            color: #fff;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-secondary:hover {
            border-color: #3498db;
            background: rgba(52, 152, 219, 0.1);
        }

        .btn-secondary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .pairing-code-display {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin-top: 20px;
        }

        .pairing-code-label {
            font-size: 0.85rem;
            opacity: 0.9;
            margin-bottom: 8px;
        }

        .pairing-code {
            font-size: 2rem;
            font-weight: bold;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }

        .pairing-instructions {
            margin-top: 15px;
            padding: 15px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            text-align: left;
            font-size: 0.85rem;
            color: #ddd;
        }

        .pairing-instructions ol {
            margin-left: 20px;
            margin-top: 8px;
        }

        .pairing-instructions li {
            margin: 5px 0;
        }

        .error-message {
            color: #e74c3c;
            font-size: 0.85rem;
            margin-top: 10px;
        }

        /* QR Section */
        .qr-container {
            background: #fff;
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin: 20px 0;
            display: none;
            animation: fadeIn 0.5s ease;
        }

        .qr-container.show {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .qr-title {
            color: #1a1a2e;
            font-size: 1.3rem;
            font-weight: bold;
            margin-bottom: 8px;
        }

        .qr-subtitle {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 20px;
        }

        #qrcode {
            margin: 0 auto;
            padding: 15px;
            background: white;
            border-radius: 10px;
            display: inline-block;
        }

        .qr-instructions {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            color: #444;
            font-size: 0.85rem;
            text-align: left;
        }

        .qr-instructions ol {
            margin-left: 20px;
            margin-top: 8px;
        }

        .qr-instructions li {
            margin: 5px 0;
        }

        /* Success Section */
        .success-container {
            background: linear-gradient(135deg, rgba(46, 204, 113, 0.1), rgba(39, 174, 96, 0.1));
            border: 2px solid #2ecc71;
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin: 20px 0;
            display: none;
            animation: fadeIn 0.5s ease;
        }

        .success-container.show {
            display: block;
        }

        .success-icon {
            font-size: 4rem;
            margin-bottom: 15px;
        }

        .success-title {
            font-size: 1.5rem;
            font-weight: bold;
            margin-bottom: 10px;
            color: #2ecc71;
        }

        .success-text {
            color: #aaa;
            margin-bottom: 20px;
        }

        .btn-primary {
            display: inline-block;
            background: linear-gradient(45deg, #ff6b6b, #feca57);
            color: #fff;
            padding: 14px 32px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: 600;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(255, 107, 107, 0.4);
        }

        /* Logs Section */
        .logs-section {
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 15px;
            margin-top: 20px;
        }

        .logs-title {
            color: #888;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }

        #logsList {
            font-family: 'Courier New', monospace;
            font-size: 0.75rem;
            max-height: 150px;
            overflow-y: auto;
        }

        .log-entry {
            padding: 4px 0;
            color: #aaa;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .log-entry:last-child {
            border-bottom: none;
            color: #2ecc71;
        }

        .log-time {
            color: #666;
            margin-right: 8px;
        }

        /* Footer */
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.8rem;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 20px;
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">SimFly OS</div>
            <div class="subtitle">WhatsApp Business Bot</div>
        </div>

        <!-- Status Box -->
        <div id="statusBox" class="status-box state-initializing">
            <div id="statusIcon" class="status-icon">⏳</div>
            <div id="statusTitle" class="status-title">Initializing</div>
            <div id="statusDesc" class="status-desc">Starting WhatsApp service...</div>
        </div>

        <!-- Loading -->
        <div id="loadingSection" class="loader-container">
            <div class="spinner"></div>
            <div class="loading-text">Connecting to WhatsApp<span>...</span></div>
        </div>

        <!-- QR Code -->
        <div id="qrSection" class="qr-container">
            <div class="qr-title">📱 Scan QR Code</div>
            <div class="qr-subtitle">Open WhatsApp on your phone</div>
            <div id="qrcode"></div>
            <div class="qr-instructions">
                <strong>How to scan:</strong>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap <strong>Settings</strong> (bottom right)</li>
                    <li>Tap <strong>Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong></li>
                    <li>Point camera at this QR code</li>
                </ol>
            </div>

            <!-- Alternative: Link with Phone Number -->
            <div class="link-divider">
                <span>OR</span>
            </div>

            <button class="btn-secondary" onclick="showPhoneLink()">
                📞 Link with Phone Number
            </button>
        </div>

        <!-- Phone Number Link Section -->
        <div id="phoneLinkSection" class="phone-link-container">
            <div class="phone-link-title">📞 Link with Phone Number</div>
            <div class="phone-link-desc">Enter your WhatsApp number to receive a pairing code</div>

            <div class="phone-input-group">
                <input type="tel" id="phoneInput" class="phone-input" placeholder="+923001234567" maxlength="16">
                <button class="btn-primary" id="getCodeBtn" onclick="requestPairingCode()">Get Code</button>
            </div>

            <div id="phoneError" class="error-message" style="display: none;"></div>

            <div id="pairingCodeDisplay" style="display: none;">
                <div class="pairing-code-display">
                    <div class="pairing-code-label">Your Pairing Code</div>
                    <div class="pairing-code" id="pairingCodeValue">------</div>
                </div>
                <div class="pairing-instructions">
                    <strong>How to use this code:</strong>
                    <ol>
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link with Phone Number</strong></li>
                        <li>Enter this 6-digit code</li>
                        <li>Tap <strong>Link Device</strong></li>
                    </ol>
                </div>
            </div>

            <button class="btn-secondary" onclick="showQRCode()" style="margin-top: 15px;">
                ← Back to QR Code
            </button>
        </div>

        <!-- Success -->
        <div id="successSection" class="success-container">
            <div class="success-icon">✅</div>
            <div class="success-title">Connected!</div>
            <div class="success-text">Your WhatsApp is now linked and ready.</div>
            <button class="btn-primary" onclick="location.reload()">Go to Dashboard</button>
        </div>

        <!-- Logs -->
        <div class="logs-section">
            <div class="logs-title">📋 Activity Log</div>
            <div id="logsList">
                <div class="log-entry"><span class="log-time">--:--:--</span> Waiting for connection...</div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            SimFly OS v3.1 | Real-time Updates | <span id="lastUpdate">--:--</span>
        </div>
    </div>

    <script>
        // DOM Elements
        const statusBox = document.getElementById('statusBox');
        const statusIcon = document.getElementById('statusIcon');
        const statusTitle = document.getElementById('statusTitle');
        const statusDesc = document.getElementById('statusDesc');
        const loadingSection = document.getElementById('loadingSection');
        const qrSection = document.getElementById('qrSection');
        const phoneLinkSection = document.getElementById('phoneLinkSection');
        const successSection = document.getElementById('successSection');
        const logsList = document.getElementById('logsList');
        const lastUpdate = document.getElementById('lastUpdate');
        const phoneInput = document.getElementById('phoneInput');
        const phoneError = document.getElementById('phoneError');
        const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
        const pairingCodeValue = document.getElementById('pairingCodeValue');
        const getCodeBtn = document.getElementById('getCodeBtn');

        let currentQR = null;
        let checkInterval = null;

        // Show phone link section
        function showPhoneLink() {
            qrSection.classList.remove('show');
            phoneLinkSection.classList.add('show');
            phoneInput.focus();
        }

        // Show QR code section
        function showQRCode() {
            phoneLinkSection.classList.remove('show');
            if (currentQR) {
                qrSection.classList.add('show');
            }
        }

        // Request pairing code from server
        async function requestPairingCode() {
            const phoneNumber = phoneInput.value.trim();

            // Validate phone number
            if (!phoneNumber || !phoneNumber.match(/^\+?\d{10,15}$/)) {
                phoneError.textContent = 'Please enter a valid phone number with country code (e.g., +923001234567)';
                phoneError.style.display = 'block';
                return;
            }

            phoneError.style.display = 'none';
            getCodeBtn.disabled = true;
            getCodeBtn.textContent = 'Sending...';

            try {
                const res = await fetch('/api/pairing-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber })
                });

                const data = await res.json();

                if (data.success) {
                    pairingCodeValue.textContent = data.code;
                    pairingCodeDisplay.style.display = 'block';
                    logActivity('Pairing code generated for ' + phoneNumber);
                } else {
                    phoneError.textContent = data.error || 'Failed to generate code. Please try again.';
                    phoneError.style.display = 'block';
                }
            } catch (e) {
                phoneError.textContent = 'Network error. Please try again.';
                phoneError.style.display = 'block';
            } finally {
                getCodeBtn.disabled = false;
                getCodeBtn.textContent = 'Get Code';
            }
        }

        // Allow Enter key to submit
        phoneInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') requestPairingCode();
        });

        // Helper to log activity
        function logActivity(msg) {
            console.log('[Activity]', msg);
        }

        // Update UI based on state
        function updateUI(data) {
            lastUpdate.textContent = new Date().toLocaleTimeString();

            // Update logs
            if (data.logs && data.logs.length > 0) {
                logsList.innerHTML = data.logs.map(log => {
                    return '<div class="log-entry"><span class="log-time">' + (log.time || '--:--:--') + '</span> ' + log.msg + '</div>';
                }).join('');
                logsList.scrollTop = 0;
            }

            // State handling
            switch(data.state) {
                case 'INITIALIZING':
                    statusBox.className = 'status-box state-initializing';
                    statusIcon.textContent = '⏳';
                    statusTitle.textContent = 'Initializing';
                    statusDesc.textContent = 'Starting WhatsApp service...';
                    loadingSection.style.display = 'block';
                    qrSection.classList.remove('show');
                    successSection.classList.remove('show');
                    break;

                case 'QR_READY':
                    statusBox.className = 'status-box state-qr';
                    statusIcon.textContent = '📱';
                    statusTitle.textContent = 'Scan QR Code';
                    statusDesc.textContent = 'Use WhatsApp on your phone to scan';
                    loadingSection.style.display = 'none';
                    successSection.classList.remove('show');
                    phoneLinkSection.classList.remove('show');

                    // Show and generate QR
                    if (data.qrData && data.qrData !== currentQR) {
                        currentQR = data.qrData;
                        qrSection.classList.add('show');
                        document.getElementById('qrcode').innerHTML = '';
                        new QRCode(document.getElementById('qrcode'), {
                            text: data.qrData,
                            width: 220,
                            height: 220,
                            colorDark: '#000000',
                            colorLight: '#ffffff',
                            correctLevel: QRCode.CorrectLevel.H
                        });
                        console.log('✅ QR Code displayed successfully');
                    }
                    break;

                case 'PAIRING_CODE_READY':
                    statusBox.className = 'status-box state-qr';
                    statusIcon.textContent = '🔢';
                    statusTitle.textContent = 'Enter Pairing Code';
                    statusDesc.textContent = 'Use Link with Phone Number option in WhatsApp';
                    loadingSection.style.display = 'none';
                    qrSection.classList.remove('show');

                    // Show pairing code if received
                    if (data.pairingCode && data.pairingCode !== pairingCodeValue.textContent) {
                        pairingCodeValue.textContent = data.pairingCode;
                        pairingCodeDisplay.style.display = 'block';
                        phoneLinkSection.classList.add('show');
                    }
                    break;

                case 'AUTHENTICATED':
                    statusBox.className = 'status-box state-qr';
                    statusIcon.textContent = '🔐';
                    statusTitle.textContent = 'Authenticating...';
                    statusDesc.textContent = 'Verifying your account';
                    qrSection.classList.remove('show');
                    phoneLinkSection.classList.remove('show');
                    loadingSection.style.display = 'block';
                    break;

                case 'READY':
                    statusBox.className = 'status-box state-ready';
                    statusIcon.textContent = '✅';
                    statusTitle.textContent = 'Connected!';
                    statusDesc.textContent = 'WhatsApp is ready to use';
                    loadingSection.style.display = 'none';
                    qrSection.classList.remove('show');
                    phoneLinkSection.classList.remove('show');
                    successSection.classList.add('show');

                    // Stop checking
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    break;

                case 'ERROR':
                    statusBox.className = 'status-box state-error';
                    statusIcon.textContent = '❌';
                    statusTitle.textContent = 'Error';
                    statusDesc.textContent = 'Something went wrong. Retrying...';
                    break;
            }
        }

        // Check status
        async function checkStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                updateUI(data);
            } catch (e) {
                console.error('Failed to fetch status:', e);
            }
        }

        // Start checking
        checkStatus();
        checkInterval = setInterval(checkStatus, 2000);
    </script>
</body>
</html>`);
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(CONFIG.PORT, () => {
    log(`========================================`);
    log(`SimFly OS v3.0.0 Started`);
    log(`Server running on port ${CONFIG.PORT}`);
    log(`========================================`);

    // Start WhatsApp after server is ready
    setTimeout(initWhatsApp, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Shutting down...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    log('Shutting down...');
    server.close(() => process.exit(0));
});
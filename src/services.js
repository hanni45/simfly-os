/**
 * Services - AI, Vision, Scheduler, WebServer, StartupSync, IssueHandler
 * All services in one file
 */

const axios = require('axios');
const cron = require('node-cron');
const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const sharp = require('sharp');

const { FollowUpQueries, StockQueries, AnalyticsQueries } = require('./database');

// ═══════════════════════════════════════════════════════════════
// LOGGER (Simple)
// ═══════════════════════════════════════════════════════════════
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const logger = {
  error: (msg, meta = {}) => { if (LEVELS.error <= LEVELS[LOG_LEVEL]) console.log(`[${new Date().toISOString()}] ERROR: ${msg}`, meta); },
  warn: (msg, meta = {}) => { if (LEVELS.warn <= LEVELS[LOG_LEVEL]) console.log(`[${new Date().toISOString()}] WARN: ${msg}`, meta); },
  info: (msg, meta = {}) => { if (LEVELS.info <= LEVELS[LOG_LEVEL]) console.log(`[${new Date().toISOString()}] INFO: ${msg}`, meta); },
  debug: (msg, meta = {}) => { if (LEVELS.debug <= LEVELS[LOG_LEVEL]) console.log(`[${new Date().toISOString()}] DEBUG: ${msg}`, meta); }
};

// ═══════════════════════════════════════════════════════════════
// AI SERVICE (Groq)
// ═══════════════════════════════════════════════════════════════

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

let circuitBreaker = { failures: 0, lastFailure: null, threshold: 5, timeout: 60000, state: 'CLOSED' };

function canMakeRequest() {
  if (circuitBreaker.state === 'CLOSED') return true;
  if (circuitBreaker.state === 'OPEN') {
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.timeout) {
      circuitBreaker.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }
  return true;
}

function recordResult(success) {
  if (success) { circuitBreaker.failures = 0; circuitBreaker.state = 'CLOSED'; }
  else { circuitBreaker.failures++; circuitBreaker.lastFailure = Date.now(); if (circuitBreaker.failures >= circuitBreaker.threshold) circuitBreaker.state = 'OPEN'; }
}

function buildSystemPrompt(customerContext = {}) {
  return `You are SimFly OS — official WhatsApp sales rep for SimFly Pakistan.
BUSINESS INFO:
- Name: SimFly Pakistan
- WhatsApp: +1 7826662232
- STRICT PLANS (ONLY THESE THREE):
1. STARTER: 500MB - Rs 130 - Validity: 2 YEARS
2. STANDARD: 1GB - Rs 350 - Validity: 2 YEARS
3. PRO: 5GB - Rs 1,250 - Validity: 2 YEARS
PAYMENT DETAILS:
JazzCash: 03456754090, EasyPaisa: 03466544374, SadaPay: 03116400376
RULES:
1. Speak in natural Hinglish (Roman Urdu + English mix)
2. Short replies — max 4-5 lines
3. Be warm, professional, helpful
4. Never mention you're AI
5. Never reveal supplier/backend details
CUSTOMER CONTEXT: ${JSON.stringify(customerContext)}
Respond as SimFly Pakistan sales rep:`;
}

async function generateResponse(message, history = [], context = {}) {
  if (!GROQ_API_KEY || !canMakeRequest()) return null;
  try {
    const response = await axios.post(GROQ_URL, {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        ...history.map(h => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.message })),
        { role: 'user', content: message }
      ],
      temperature: 0.7, max_tokens: 300, top_p: 0.9
    }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 });

    recordResult(true);
    return response.data.choices[0]?.message?.content?.trim();
  } catch (error) {
    recordResult(false);
    console.error('Groq API error:', error.message);
    return null;
  }
}

async function detectIntent(message) {
  if (!GROQ_API_KEY) return detectIntentLocal(message);
  try {
    const response = await axios.post(GROQ_URL, {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'Classify intent. Reply with ONLY ONE word: GREET, PRICE_ASK, PLAN_INTEREST, COMPAT_CHECK, ORDER_READY, PAYMENT_SENT, SCREENSHOT, SUPPORT, FOLLOW_UP, REFUND_ASK, ABUSE, RANDOM' },
        { role: 'user', content: message }
      ],
      temperature: 0.1, maxOutputTokens: 20
    }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 5000 });
    return response.data.choices[0]?.message?.content?.trim().toUpperCase() || 'RANDOM';
  } catch (error) { return detectIntentLocal(message); }
}

function detectIntentLocal(message) {
  const lower = message.toLowerCase();
  const intents = [
    { name: 'GREET', keywords: ['hi', 'hello', 'assalam', 'salam', 'hey', 'aoa', 'start'] },
    { name: 'PRICE_ASK', keywords: ['price', 'rate', 'kitna', 'cost', 'plan', 'rs', 'pese'] },
    { name: 'ORDER_READY', keywords: ['buy', 'order', 'lena', 'purchase', 'chahiye', 'book'] },
    { name: 'PAYMENT_SENT', keywords: ['sent', 'kar diya', 'bhej diya', 'pay', 'transfer'] },
    { name: 'SUPPORT', keywords: ['help', 'problem', 'issue', 'masla', 'not working', 'support'] },
    { name: 'COMPAT_CHECK', keywords: ['iphone', 'samsung', 'pixel', 'device', 'phone', 'work', 'compatible'] },
    { name: 'REFUND_ASK', keywords: ['refund', 'wapas', 'return', 'paisa wapas'] },
    { name: 'BYE', keywords: ['bye', 'allah hafiz', 'khuda hafiz'] }
  ];
  for (const intent of intents) { if (intent.keywords.some(k => lower.includes(k))) return intent.name; }
  return 'RANDOM';
}

// ═══════════════════════════════════════════════════════════════
// VISION SERVICE (Gemini)
// ═══════════════════════════════════════════════════════════════

const GEMINI_KEYS = [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(Boolean);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';
let currentKeyIndex = 0;
let keyFailures = new Map();

function getNextKey() {
  if (GEMINI_KEYS.length === 0) return null;
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const idx = (currentKeyIndex + i) % GEMINI_KEYS.length;
    if ((keyFailures.get(idx) || 0) < 3) { currentKeyIndex = (idx + 1) % GEMINI_KEYS.length; return GEMINI_KEYS[idx]; }
  }
  keyFailures.clear(); currentKeyIndex = 0; return GEMINI_KEYS[0];
}

function recordKeyFailure() {
  const idx = (currentKeyIndex - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length;
  keyFailures.set(idx, (keyFailures.get(idx) || 0) + 1);
}

async function optimizeImage(imageBuffer) {
  try {
    return await sharp(imageBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, progressive: true }).toBuffer();
  } catch (err) { return imageBuffer; }
}

function calculateHash(imageBuffer) {
  return crypto.createHash('md5').update(imageBuffer).digest('hex');
}

async function analyzeScreenshot(imageBuffer, expectedAmount = null) {
  if (GEMINI_KEYS.length === 0) return { isPaymentScreenshot: false, error: 'VISION_NOT_CONFIGURED', confidence: 0 };
  try {
    const optimizedBuffer = await optimizeImage(imageBuffer);
    const imageHash = calculateHash(optimizedBuffer);
    const base64Image = optimizedBuffer.toString('base64');
    const prompt = 'Analyze this payment screenshot. Reply ONLY in JSON: {"is_payment_screenshot": true/false, "app": "JazzCash/EasyPaisa/SadaPay/Unknown", "amount": number or null, "recipient_number": "string", "status": "Successful/Failed/Pending", "timestamp": "string", "suspicious": true/false, "confidence": 0.0 to 1.0}';

    const apiKey = getNextKey();
    if (!apiKey) throw new Error('No Gemini API keys available');

    const response = await axios.post(`${GEMINI_URL}?key=${apiKey}`, {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const result = JSON.parse(jsonMatch[0]);

    return {
      isPaymentScreenshot: result.is_payment_screenshot === true,
      app: result.app || 'Unknown', amount: result.amount ? parseInt(result.amount) : null,
      recipientNumber: result.recipient_number || null, status: result.status || 'Unknown',
      timestamp: result.timestamp || null, suspicious: result.suspicious === true,
      confidence: result.confidence || 0.5, hash: imageHash
    };
  } catch (error) {
    recordKeyFailure();
    console.error('Vision analysis error:', error.message);
    return { isPaymentScreenshot: false, error: 'ANALYSIS_FAILED', confidence: 0 };
  }
}

function verifyPayment(analysis, expectedAmount, expectedRecipient) {
  if (!analysis.isPaymentScreenshot) return { valid: false, reason: 'NOT_PAYMENT_SCREENSHOT', message: 'Bhai clear screenshot bhejo — crop karke try karo' };
  if (analysis.status !== 'Successful') return { valid: false, reason: 'PAYMENT_FAILED', message: 'Bhai transaction successful nahi — retry karo aur successful screenshot bhejo' };
  if (expectedAmount && analysis.amount && analysis.amount < expectedAmount) return { valid: false, reason: 'AMOUNT_MISMATCH', message: `Bhai amount kam hai — Rs ${expectedAmount} chahiye, Rs ${analysis.amount} aaya` };
  if (expectedRecipient && analysis.recipientNumber) {
    const normalizedExpected = expectedRecipient.replace(/\D/g, '').replace(/^92/, '0');
    const normalizedReceived = analysis.recipientNumber.replace(/\D/g, '').replace(/^92/, '0');
    if (!normalizedReceived.includes(normalizedExpected) && !normalizedExpected.includes(normalizedReceived)) return { valid: false, reason: 'WRONG_RECIPIENT', message: `Bhai galat account pe gayi — humara number ${expectedRecipient} hai` };
  }
  if (analysis.suspicious) return { valid: false, reason: 'SUSPICIOUS', message: 'Bhai screenshot check ho raha hai — fresh screenshot bhejo' };
  return { valid: true, reason: null, message: 'Payment verified successfully' };
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════

let whatsappClient = null;
let isSchedulerRunning = false;

function initScheduler(client) {
  whatsappClient = client;
  cron.schedule('*/5 * * * *', processFollowUps);
  cron.schedule('0 0 * * *', updateDailyAnalytics);
  cron.schedule('0 * * * *', checkLowStock);
  isSchedulerRunning = true;
  console.log('📅 Scheduler initialized');
}

async function processFollowUps() {
  if (!whatsappClient) return;
  const now = Math.floor(Date.now() / 1000);
  const pending = await FollowUpQueries.getPending(now);
  for (const followUp of pending) {
    try {
      await whatsappClient.sendMessage(followUp.number, followUp.message);
      await FollowUpQueries.markSent(followUp.id);
      await AnalyticsQueries.increment('followups_sent');
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) { console.error(`Follow-up error:`, error.message); }
  }
}

async function updateDailyAnalytics() {
  try {
    const today = await AnalyticsQueries.getToday();
    console.log(`📊 Daily Update: ${today.new_customers} customers, Rs ${today.revenue} revenue`);
  } catch (error) { console.error('Analytics update error:', error); }
}

async function checkLowStock() {
  try {
    const lowStock = await StockQueries.getLowStock();
    if (lowStock.length > 0) {
      const adminNumber = process.env.ADMIN_NUMBER;
      if (!adminNumber || !whatsappClient) return;
      const lines = lowStock.map(s => `⚠️ ${s.plan}: ${s.quantity} left`);
      await whatsappClient.sendMessage(adminNumber, `*Low Stock Alert*\n\n${lines.join('\n')}`);
    }
  } catch (error) { console.error('Stock check error:', error); }
}

// ═══════════════════════════════════════════════════════════════
// WEB SERVER
// ═══════════════════════════════════════════════════════════════

const app = express();
const PORT = process.env.PORT || 3000;
let currentQR = null;
let botStatus = 'INITIALIZING';
let botInfo = {};

function generateHTML(qrDataUrl, status) {
  const statusColor = { 'INITIALIZING': '#f59e0b', 'QR_READY': '#3b82f6', 'SCANNED': '#10b981', 'READY': '#10b981', 'DISCONNECTED': '#ef4444', 'ERROR': '#ef4444' }[status] || '#6b7280';
  const statusMessage = { 'INITIALIZING': 'Bot is starting up...', 'QR_READY': 'Scan this QR code with WhatsApp', 'SCANNED': 'QR code scanned! Connecting...', 'READY': 'Bot is online and ready', 'DISCONNECTED': 'Bot disconnected', 'ERROR': 'An error occurred' }[status] || 'Unknown';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SimFly OS</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}
.container{background:white;border-radius:20px;padding:40px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);max-width:500px;width:100%;text-align:center}
.logo{font-size:32px;font-weight:bold;color:#1f2937;margin-bottom:10px}.tagline{color:#6b7280;font-size:16px;margin-bottom:30px}
.status-badge{display:inline-block;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;margin-bottom:20px;background:${statusColor}20;color:${statusColor}}
.qr-container{background:#f3f4f6;border-radius:16px;padding:30px;margin-bottom:20px;min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center}
.qr-code{max-width:256px;width:100%;height:auto;border-radius:8px}.spinner{border:4px solid #f3f4f6;border-top:4px solid ${statusColor};border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.refresh-btn{background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;margin-top:10px}.refresh-btn:hover{background:#2563eb}
.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px}
.instructions{color:#4b5563;font-size:14px;line-height:1.6}.instructions ol{text-align:left;margin-top:10px;padding-left:20px}
</style></head><body><div class="container"><div class="logo">SimFly OS</div><div class="tagline">WhatsApp Sales & Support Bot</div>
<div class="status-badge">${status}</div><div class="qr-container">${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-code">` : status === 'INITIALIZING' ? `<div class="spinner"></div><p style="margin-top:20px;color:#6b7280;">Generating QR...</p>` : 'QR will appear here'}</div>
<div class="instructions"><strong>${statusMessage}</strong>${status === 'QR_READY' ? '<ol><li>Open WhatsApp on your phone</li><li>Tap Menu → "Linked Devices"</li><li>Point phone to capture code</li></ol>' : ''}</div>
<button class="refresh-btn" onclick="location.reload()">Refresh</button><div class="footer">SimFly Pakistan © 2025</div></div>
<script>if('${status}'==='INITIALIZING'||'${status}'==='QR_READY')setTimeout(()=>location.reload(),10000);</script></body></html>`;
}

function setQR(qrText) { currentQR = qrText; botStatus = 'QR_READY'; }
function clearQR() { currentQR = null; botStatus = 'SCANNED'; }
function setStatus(status, info = {}) { botStatus = status; botInfo = { ...botInfo, ...info }; }

function startWebServer() {
  app.get('/', async (req, res) => {
    let qrDataUrl = null;
    if (currentQR) { try { qrDataUrl = await QRCode.toDataURL(currentQR, { width: 256, margin: 2 }); } catch (err) {} }
    res.send(generateHTML(qrDataUrl, botStatus));
  });

  app.get('/api/status', (req, res) => res.json({ status: botStatus, timestamp: new Date().toISOString(), ...botInfo }));
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// STARTUP SYNC
// ═══════════════════════════════════════════════════════════════

async function syncExistingChats(client) {
  logger.info('🔄 Starting chat history sync...');
  try {
    const chats = await client.getChats();
    const privateChats = chats.filter(chat => !chat.isGroup && chat.id._serialized.includes('@c.us')).slice(0, 200);
    logger.info(`📱 Processing ${privateChats.length} private chats`);

    let synced = 0, messages = 0;
    for (const chat of privateChats) {
      const number = chat.id._serialized.replace('@c.us', '');
      const existed = await CustomerQueries.get(number);
      if (existed) continue;

      const contact = await chat.getContact();
      const customer = await CustomerQueries.getOrCreate(number, contact.pushname || contact.name);

      const msgs = await chat.fetchMessages({ limit: 50 });
      let msgCount = 0;
      for (const msg of msgs.sort((a, b) => a.timestamp - b.timestamp)) {
        if (!msg.body || msg.type !== 'chat') continue;
        await ConversationQueries.add(number, msg.fromMe ? 'bot' : 'user', msg.body, msg.fromMe ? 'REPLY' : detectIntentLocal(msg.body), msg.hasMedia && msg.type === 'image');
        msgCount++;
      }
      synced++; messages += msgCount;
    }
    logger.info('✅ Sync complete', { newCustomers: synced, messages });
  } catch (err) { logger.error('Chat sync failed', { error: err.message }); }
}

// ═══════════════════════════════════════════════════════════════
// ISSUE HANDLER
// ═══════════════════════════════════════════════════════════════

const issues = [];

function logIssue(type, message, context = {}) {
  const issue = {
    id: `ISS-${Date.now()}`,
    type,
    message,
    context,
    timestamp: new Date().toISOString(),
    resolved: false
  };
  issues.push(issue);
  logger.error(`Issue logged: ${type}`, { message, context });

  // Send to admin if critical
  if (type === 'CRITICAL' && whatsappClient && process.env.ADMIN_NUMBER) {
    const alert = `🚨 *CRITICAL ISSUE*\n\nID: ${issue.id}\nType: ${type}\nMessage: ${message}\nTime: ${issue.timestamp}`;
    whatsappClient.sendMessage(process.env.ADMIN_NUMBER, alert).catch(() => {});
  }

  return issue.id;
}

function resolveIssue(issueId) {
  const issue = issues.find(i => i.id === issueId);
  if (issue) {
    issue.resolved = true;
    issue.resolvedAt = new Date().toISOString();
    return true;
  }
  return false;
}

function getIssues(filter = {}) {
  let result = issues;
  if (filter.resolved !== undefined) result = result.filter(i => i.resolved === filter.resolved);
  if (filter.type) result = result.filter(i => i.type === filter.type);
  return result;
}

function clearOldIssues(days = 7) {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const before = issues.length;
  for (let i = issues.length - 1; i >= 0; i--) {
    if (new Date(issues[i].timestamp).getTime() < cutoff && issues[i].resolved) {
      issues.splice(i, 1);
    }
  }
  logger.info('Cleared old issues', { cleared: before - issues.length });
}

module.exports = {
  logger, generateResponse, detectIntent, detectIntentLocal,
  analyzeScreenshot, verifyPayment, calculateHash,
  initScheduler, setQR, clearQR, setStatus, startWebServer, syncExistingChats,
  logIssue, resolveIssue, getIssues, clearOldIssues
};

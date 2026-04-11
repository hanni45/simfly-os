const axios = require('axios');
const cron = require('node-cron');
const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const sharp = require('sharp');

const db = require('./database');

const logger = {
  error: (msg, meta = {}) => console.log(`[${new Date().toISOString()}] ERROR: ${msg}`, meta),
  warn: (msg, meta = {}) => console.log(`[${new Date().toISOString()}] WARN: ${msg}`, meta),
  info: (msg, meta = {}) => console.log(`[${new Date().toISOString()}] INFO: ${msg}`, meta)
};

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateResponse(message, history = [], context = {}) {
  if (!GROQ_API_KEY) return null;
  try {
    const response = await axios.post(GROQ_URL, {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `You are SimFly OS — official WhatsApp sales rep for SimFly Pakistan.\nPLANS: 500MB-Rs130, 1GB-Rs350, 5GB-Rs1250 (All 2 years).\nPayment: JazzCash 03456754090, EasyPaisa 03466544374, SadaPay 03116400376.\nSpeak Hinglish. Short replies max 4-5 lines. Be warm, never mention you're AI.\nContext: ${JSON.stringify(context)}` },
        ...history.map(h => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.message })),
        { role: 'user', content: message }
      ],
      temperature: 0.7, max_tokens: 300
    }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data.choices[0]?.message?.content?.trim();
  } catch (error) {
    console.error('Groq error:', error.message);
    return null;
  }
}

async function detectIntent(message) {
  if (!GROQ_API_KEY) return detectIntentLocal(message);
  try {
    const response = await axios.post(GROQ_URL, {
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: 'Classify intent. Reply ONLY ONE word: GREET, PRICE_ASK, PLAN_INTEREST, COMPAT_CHECK, ORDER_READY, PAYMENT_SENT, SUPPORT, REFUND_ASK, RANDOM' }, { role: 'user', content: message }],
      temperature: 0.1, max_tokens: 20
    }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 5000 });
    return response.data.choices[0]?.message?.content?.trim().toUpperCase() || 'RANDOM';
  } catch (error) { return detectIntentLocal(message); }
}

function detectIntentLocal(message) {
  const lower = message.toLowerCase();
  if (['hi', 'hello', 'assalam', 'salam', 'hey', 'aoa'].some(k => lower.includes(k))) return 'GREET';
  if (['price', 'rate', 'kitna', 'cost', 'plan'].some(k => lower.includes(k))) return 'PRICE_ASK';
  if (['buy', 'order', 'lena', 'purchase', 'chahiye'].some(k => lower.includes(k))) return 'ORDER_READY';
  if (['sent', 'kar diya', 'pay', 'transfer'].some(k => lower.includes(k))) return 'PAYMENT_SENT';
  if (['help', 'problem', 'issue', 'masla'].some(k => lower.includes(k))) return 'SUPPORT';
  if (['iphone', 'samsung', 'pixel', 'device'].some(k => lower.includes(k))) return 'COMPAT_CHECK';
  if (['refund', 'wapas'].some(k => lower.includes(k))) return 'REFUND_ASK';
  return 'RANDOM';
}

const GEMINI_KEYS = [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(Boolean);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';
let currentKeyIndex = 0;

function getNextKey() {
  if (GEMINI_KEYS.length === 0) return null;
  const key = GEMINI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
  return key;
}

async function analyzeScreenshot(imageBuffer, expectedAmount = null) {
  if (GEMINI_KEYS.length === 0) return { isPaymentScreenshot: false, error: 'VISION_NOT_CONFIGURED' };
  try {
    const optimized = await sharp(imageBuffer).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
    const hash = crypto.createHash('md5').update(optimized).digest('hex');
    const base64Image = optimized.toString('base64');

    const apiKey = getNextKey();
    const response = await axios.post(`${GEMINI_URL}?key=${apiKey}`, {
      contents: [{ parts: [{ text: 'Analyze payment screenshot. Reply JSON: {"is_payment_screenshot": true/false, "app": "JazzCash/EasyPaisa/SadaPay", "amount": number, "status": "Successful/Failed", "suspicious": true/false}' }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error('No JSON');
    const result = JSON.parse(json[0]);

    return {
      isPaymentScreenshot: result.is_payment_screenshot === true,
      app: result.app || 'Unknown',
      amount: result.amount ? parseInt(result.amount) : null,
      status: result.status || 'Unknown',
      suspicious: result.suspicious === true,
      hash
    };
  } catch (error) {
    console.error('Vision error:', error.message);
    return { isPaymentScreenshot: false, error: 'ANALYSIS_FAILED' };
  }
}

function verifyPayment(analysis, expectedAmount) {
  if (!analysis.isPaymentScreenshot) return { valid: false, message: 'Bhai clear screenshot bhejo' };
  if (analysis.status !== 'Successful') return { valid: false, message: 'Bhai transaction successful nahi' };
  if (expectedAmount && analysis.amount && analysis.amount < expectedAmount) return { valid: false, message: `Bhai amount kam hai — Rs ${expectedAmount} chahiye` };
  if (analysis.suspicious) return { valid: false, message: 'Bhai screenshot check ho raha hai' };
  return { valid: true };
}

let whatsappClient = null;

function initScheduler(client) {
  whatsappClient = client;
  cron.schedule('*/5 * * * *', processFollowUps);
  cron.schedule('0 0 * * *', updateDailyAnalytics);
  cron.schedule('0 * * * *', checkLowStock);
  logger.info('Scheduler initialized');
}

async function processFollowUps() {
  if (!whatsappClient) return;
  const now = Math.floor(Date.now() / 1000);
  const pending = await db.FollowUpQueries.getPending(now);
  for (const followUp of pending) {
    try {
      await whatsappClient.sendMessage(followUp.number, followUp.message);
      await db.FollowUpQueries.markSent(followUp.id);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) { console.error('Follow-up error:', e.message); }
  }
}

async function updateDailyAnalytics() {
  try {
    const today = await db.AnalyticsQueries.getToday();
    logger.info(`Daily: ${today.new_customers} customers, Rs ${today.revenue} revenue`);
  } catch (e) { console.error('Analytics error:', e.message); }
}

async function checkLowStock() {
  try {
    const lowStock = await db.StockQueries.getLowStock();
    if (lowStock.length > 0 && whatsappClient && process.env.ADMIN_NUMBER) {
      const lines = lowStock.map(s => `⚠️ ${s.plan}: ${s.quantity} left`);
      await whatsappClient.sendMessage(process.env.ADMIN_NUMBER, `*Low Stock*\n\n${lines.join('\n')}`);
    }
  } catch (e) { console.error('Stock error:', e.message); }
}

const app = express();
const PORT = process.env.PORT || 3000;
let currentQR = null;
let botStatus = 'INITIALIZING';

function generateHTML(qrDataUrl, status) {
  const colors = { 'INITIALIZING': '#f59e0b', 'QR_READY': '#3b82f6', 'READY': '#10b981', 'DISCONNECTED': '#ef4444' };
  const msgs = { 'INITIALIZING': 'Starting...', 'QR_READY': 'Scan QR with WhatsApp', 'READY': 'Bot online', 'DISCONNECTED': 'Disconnected' };
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SimFly OS</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}.container{background:white;border-radius:20px;padding:40px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);max-width:400px;width:100%;text-align:center}.logo{font-size:28px;font-weight:bold;color:#1f2937;margin-bottom:10px}.status{display:inline-block;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;margin-bottom:20px;background:${colors[status] || '#6b7280'}20;color:${colors[status] || '#6b7280'}}.qr{background:#f3f4f6;border-radius:16px;padding:20px;margin-bottom:20px}.qr img{max-width:200px;width:100%}</style></head><body><div class="container"><div class="logo">SimFly OS</div><div class="status">${status}</div><div class="qr">${qrDataUrl ? `<img src="${qrDataUrl}">` : '<p>Loading...</p>'}</div><p>${msgs[status] || ''}</p></div></body></html>`;
}

function setQR(qrText) { currentQR = qrText; botStatus = 'QR_READY'; }
function clearQR() { currentQR = null; botStatus = 'SCANNED'; }
function setStatus(status) { botStatus = status; }

function startWebServer() {
  app.get('/', async (req, res) => {
    let qrDataUrl = null;
    if (currentQR) { try { qrDataUrl = await QRCode.toDataURL(currentQR, { width: 200 }); } catch (e) {} }
    res.send(generateHTML(qrDataUrl, botStatus));
  });
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
  app.listen(PORT, '0.0.0.0', () => logger.info(`Web server on port ${PORT}`));
}

const issues = [];

function logIssue(type, message, context = {}) {
  const issue = { id: `ISS-${Date.now()}`, type, message, context, timestamp: new Date().toISOString(), resolved: false };
  issues.push(issue);
  logger.error(`Issue: ${type}`, { message });
  if (type === 'CRITICAL' && whatsappClient && process.env.ADMIN_NUMBER) {
    whatsappClient.sendMessage(process.env.ADMIN_NUMBER, `🚨 *CRITICAL*\n\n${message}`).catch(() => {});
  }
  return issue.id;
}

function resolveIssue(issueId) {
  const issue = issues.find(i => i.id === issueId);
  if (issue) { issue.resolved = true; return true; }
  return false;
}

function getIssues(filter = {}) {
  let result = issues;
  if (filter.resolved !== undefined) result = result.filter(i => i.resolved === filter.resolved);
  return result;
}

module.exports = {
  logger, generateResponse, detectIntent, detectIntentLocal,
  analyzeScreenshot, verifyPayment,
  initScheduler, setQR, clearQR, setStatus, startWebServer,
  logIssue, resolveIssue, getIssues
};

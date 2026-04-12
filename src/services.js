const express = require('express');
const QRCode = require('qrcode');
const db = require('./database');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const logger = {
  error: (msg, meta = {}) => console.log(`${COLORS.red}✖ ERROR${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`, Object.keys(meta).length ? meta : ''),
  warn: (msg, meta = {}) => console.log(`${COLORS.yellow}⚠ WARN${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`, Object.keys(meta).length ? meta : ''),
  info: (msg, meta = {}) => console.log(`${COLORS.cyan}ℹ INFO${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`, Object.keys(meta).length ? meta : ''),
  success: (msg, meta = {}) => console.log(`${COLORS.green}✔ SUCCESS${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`, Object.keys(meta).length ? meta : ''),
  bot: (msg) => console.log(`${COLORS.magenta}🤖 BOT${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`),
  db: (msg) => console.log(`${COLORS.blue}🗄️  DB${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`),
  http: (msg) => console.log(`${COLORS.green}🌐 HTTP${COLORS.reset} ${COLORS.dim}${new Date().toLocaleTimeString()}${COLORS.reset} ${msg}`)
};

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function generateResponse(message, history = []) {
  if (!GROQ_API_KEY) return null;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are SimFly OS — WhatsApp sales rep for SimFly Pakistan. Plans: 500MB-Rs130, 1GB-Rs350, 5GB-Rs1250 (2 years). Payment: JazzCash 03456754090, EasyPaisa 03466544374. Speak Hinglish, max 4 lines, be warm.' },
          ...history.map(h => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.message })),
          { role: 'user', content: message }
        ],
        temperature: 0.7, max_tokens: 300
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  } catch (e) { return null; }
}

async function detectIntent(message) {
  if (!GROQ_API_KEY) return detectIntentLocal(message);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: 'Reply ONE word: GREET, PRICE_ASK, ORDER_READY, PAYMENT_SENT, SUPPORT, REFUND_ASK, RANDOM' }, { role: 'user', content: message }],
        temperature: 0.1, max_tokens: 10
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'RANDOM';
  } catch (e) { return detectIntentLocal(message); }
}

function detectIntentLocal(message) {
  const lower = message.toLowerCase();
  if (/hi|hello|assalam|salam|hey|aoa/.test(lower)) return 'GREET';
  if (/price|rate|kitna|cost|plan/.test(lower)) return 'PRICE_ASK';
  if (/buy|order|lena|purchase|chahiye/.test(lower)) return 'ORDER_READY';
  if (/sent|kar diya|pay/.test(lower)) return 'PAYMENT_SENT';
  if (/help|problem|issue|masla/.test(lower)) return 'SUPPORT';
  if (/refund|wapas/.test(lower)) return 'REFUND_ASK';
  return 'RANDOM';
}

const GEMINI_KEYS = [process.env.GEMINI_API_KEY_1].filter(Boolean);
let currentKeyIndex = 0;

function getNextKey() {
  if (GEMINI_KEYS.length === 0) return null;
  return GEMINI_KEYS[currentKeyIndex++ % GEMINI_KEYS.length];
}

async function analyzeScreenshot(imageBuffer, expectedAmount = null) {
  if (GEMINI_KEYS.length === 0) return { isPaymentScreenshot: false };
  try {
    const base64Image = imageBuffer.toString('base64');
    const hash = require('crypto').createHash('md5').update(imageBuffer).digest('hex');
    const apiKey = getNextKey();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply JSON: {"is_payment_screenshot":true/false,"app":"JazzCash/EasyPaisa","amount":number,"status":"Successful/Failed"}' }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error('No JSON');
    const result = JSON.parse(json[0]);

    return {
      isPaymentScreenshot: result.is_payment_screenshot === true,
      app: result.app || 'Unknown',
      amount: result.amount || null,
      status: result.status || 'Unknown',
      hash
    };
  } catch (e) {
    return { isPaymentScreenshot: false };
  }
}

function verifyPayment(analysis, expectedAmount) {
  if (!analysis.isPaymentScreenshot) return { valid: false, message: 'Bhai clear screenshot bhejo' };
  if (analysis.status !== 'Successful') return { valid: false, message: 'Transaction successful nahi' };
  if (expectedAmount && analysis.amount && analysis.amount < expectedAmount) return { valid: false, message: `Amount kam hai — Rs ${expectedAmount} chahiye` };
  return { valid: true };
}

let whatsappClient = null;

function initScheduler(client) {
  whatsappClient = client;
  setInterval(processFollowUps, 5 * 60 * 1000);
  setInterval(checkLowStock, 60 * 60 * 1000);
  logger.success('⏰ Scheduler initialized (follow-ups: 5min, stock check: 1hr)');
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
    } catch (e) {}
  }
}

async function checkLowStock() {
  if (!whatsappClient || !process.env.ADMIN_NUMBER) return;
  const lowStock = await db.StockQueries.getLowStock();
  if (lowStock.length > 0) {
    const lines = lowStock.map(s => `⚠️ ${s.plan}: ${s.quantity} left`);
    await whatsappClient.sendMessage(process.env.ADMIN_NUMBER, `*Low Stock*\n\n${lines.join('\n')}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
let currentQR = null;
let botStatus = 'INITIALIZING';

function generateHTML(qrDataUrl, status) {
  const colors = { 'INITIALIZING': '#f59e0b', 'QR_READY': '#3b82f6', 'READY': '#10b981', 'DISCONNECTED': '#ef4444' };
  const qr = qrDataUrl ? `<img src="${qrDataUrl}" style="max-width:200px">` : '<p>Loading...</p>';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SimFly OS</title><style>body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center;margin:0}.container{background:white;border-radius:20px;padding:40px;text-align:center;max-width:400px}.logo{font-size:28px;font-weight:bold}.status{color:${colors[status] || '#666'};margin:10px 0}.qr{background:#f3f4f6;padding:20px;border-radius:16px}</style></head><body><div class="container"><div class="logo">SimFly OS</div><div class="status">${status}</div><div class="qr">${qr}</div></div></body></html>`;
}

function setQR(qr) { currentQR = qr; botStatus = 'QR_READY'; }
function clearQR() { currentQR = null; }
function setStatus(s) { botStatus = s; }

function startWebServer() {
  app.get('/', async (req, res) => {
    const qrDataUrl = currentQR ? await QRCode.toDataURL(currentQR, { width: 200 }).catch(() => null) : null;
    res.send(generateHTML(qrDataUrl, botStatus));
  });
  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
  app.listen(PORT, () => logger.http(`🌐 Dashboard running on port ${PORT}`));
}

const issues = [];

function logIssue(type, message, context = {}) {
  const issue = { id: `ISS-${Date.now()}`, type, message, context, timestamp: new Date().toISOString(), resolved: false };
  issues.push(issue);
  logger.error(`Issue: ${type}`, { message });
  return issue.id;
}

function resolveIssue(issueId) {
  const issue = issues.find(i => i.id === issueId);
  if (issue) { issue.resolved = true; return true; }
  return false;
}

function getIssues(filter = {}) {
  return filter.resolved !== undefined ? issues.filter(i => i.resolved === filter.resolved) : issues;
}

module.exports = {
  logger, generateResponse, detectIntent, detectIntentLocal,
  analyzeScreenshot, verifyPayment,
  initScheduler, setQR, clearQR, setStatus, startWebServer,
  logIssue, resolveIssue, getIssues
};

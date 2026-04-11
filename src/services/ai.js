/**
 * AI Service - Groq Integration
 * Memory-optimized with circuit breaker pattern
 */

const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Circuit breaker state
let circuitBreaker = {
  failures: 0,
  lastFailure: null,
  threshold: 5,
  timeout: 60000, // 1 minute
  state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
};

/**
 * Check if circuit breaker allows requests
 */
function canMakeRequest() {
  if (circuitBreaker.state === 'CLOSED') return true;

  if (circuitBreaker.state === 'OPEN') {
    const now = Date.now();
    if (now - circuitBreaker.lastFailure > circuitBreaker.timeout) {
      circuitBreaker.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Record success/failure for circuit breaker
 */
function recordResult(success) {
  if (success) {
    circuitBreaker.failures = 0;
    circuitBreaker.state = 'CLOSED';
  } else {
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();
    if (circuitBreaker.failures >= circuitBreaker.threshold) {
      circuitBreaker.state = 'OPEN';
    }
  }
}

/**
 * Build system prompt with current context
 */
function buildSystemPrompt(customerContext = {}) {
  return `You are SimFly OS — official WhatsApp sales rep for SimFly Pakistan.

BUSINESS INFO:
- Name: SimFly Pakistan
- WhatsApp: +1 7826662232
- Tagline: Fly Free, Stay Connected

STRICT PLANS (Only these three):
1. STARTER: 500MB - Rs 130 - 2 Years Validity - Auto Delivery
2. STANDARD: 1GB - Rs 350 - 2 Years Validity - Auto Delivery
3. PRO: 5GB - Rs 1,250 - 2 Years Validity - Manual Delivery

PAYMENT NUMBERS:
- JazzCash: 03456754090
- EasyPaisa: 03466544374
- SadaPay: 03116400376

DEVICE COMPATIBILITY:
✅ Supported: iPhone XS+, Samsung S20+, Pixel 3+, Fold/Flip (Non-PTA only)
❌ Not supported: PTA-registered phones, Budget Android, iPhone X or below

ACTIVATION CODES:
- 500MB: AS48928
- 1GB: SA1GB
- 5GB: FAMILY5G

RULES:
1. Speak in natural Hinglish (Roman Urdu + English mix)
2. Short replies — max 4-5 lines
3. Be warm, professional, helpful
4. Never mention you're AI
5. Always push toward sale naturally
6. Never reveal supplier/backend details
7. Never offer discounts unless authorized

CUSTOMER CONTEXT:
${JSON.stringify(customerContext, null, 2)}

Respond as SimFly Pakistan sales rep:`;
}

/**
 * Generate AI response
 * @param {string} message - User message
 * @param {Array} history - Recent conversation history
 * @param {Object} context - Customer context
 * @returns {Promise<string>}
 */
async function generateResponse(message, history = [], context = {}) {
  if (!GROQ_API_KEY || !canMakeRequest()) {
    return null; // Fallback to templates
  }

  try {
    const messages = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history.map(h => ({
        role: h.role === 'bot' ? 'assistant' : 'user',
        content: h.message
      })),
      { role: 'user', content: message }
    ];

    const response = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 300,
        top_p: 0.9
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    recordResult(true);
    return response.data.choices[0]?.message?.content?.trim();

  } catch (error) {
    recordResult(false);
    console.error('Groq API error:', error.message);
    return null;
  }
}

/**
 * Detect intent from message
 * @param {string} message
 * @returns {Promise<string>}
 */
async function detectIntent(message) {
  if (!GROQ_API_KEY) {
    return detectIntentLocal(message);
  }

  try {
    const response = await axios.post(
      GROQ_URL,
      {
        model: 'llama-3.1-8b-instant', // Faster model for intent
        messages: [
          {
            role: 'system',
            content: `Classify the user's intent. Reply with ONLY ONE word from:
GREET, PRICE_ASK, PLAN_INTEREST, COMPAT_CHECK, ORDER_READY, PAYMENT_SENT, SCREENSHOT, SUPPORT, FOLLOW_UP, REFUND_ASK, ABUSE, RANDOM`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 20
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    return response.data.choices[0]?.message?.content?.trim().toUpperCase() || 'RANDOM';

  } catch (error) {
    return detectIntentLocal(message);
  }
}

/**
 * Local intent detection (fallback)
 * Memory-efficient keyword matching
 */
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

  for (const intent of intents) {
    if (intent.keywords.some(k => lower.includes(k))) {
      return intent.name;
    }
  }

  return 'RANDOM';
}

module.exports = {
  generateResponse,
  detectIntent,
  detectIntentLocal,
  isEnabled: () => !!GROQ_API_KEY && circuitBreaker.state !== 'OPEN'
};

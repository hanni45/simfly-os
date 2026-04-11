/"""
 * Message Handler
 * Processes incoming WhatsApp messages with intent detection
 */

const ai = require('../services/ai');
const vision = require('../services/vision');
const salesFlow = require('./salesFlow');
const adminCommands = require('./adminCommands');
const { CustomerQueries, ConversationQueries, OrderQueries, StockQueries } = require('../database/queries');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGES = {
  NEW: 'NEW',
  INTERESTED: 'INTERESTED',
  ORDERING: 'ORDERING',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAYMENT_SENT: 'PAYMENT_SENT',
  DELIVERED: 'DELIVERED',
  SUPPORT: 'SUPPORT',
  CHURNED: 'CHURNED',
  BANNED: 'BANNED'
};

const PLANS = {
  '500MB': { name: 'STARTER', data: '500MB', price: 130, auto: true, code: 'AS48928' },
  '1GB': { name: 'STANDARD', data: '1GB', price: 350, auto: true, code: 'SA1GB' },
  '5GB': { name: 'PRO', data: '5GB', price: 1250, auto: false, code: 'FAMILY5G' }
};

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Process incoming message
 * @param {Object} message - WhatsApp message object
 * @param {Object} client - WhatsApp client instance
 */
async function handleMessage(message, client) {
  const number = message.from;
  const text = message.body?.trim() || '';
  const hasImage = message.hasMedia;

  // Skip group messages
  if (number.includes('@g.us')) return;

  // Get or create customer
  const customer = CustomerQueries.getOrCreate(number, message.notifyName);

  // Check if banned
  if (customer.banned) return;

  // Check for admin commands first
  if (text.startsWith('/') && isAdmin(number)) {
    const response = await adminCommands.handle(text, number);
    if (response) {
      await sendMessage(client, number, response);
    }
    return;
  }

  // Handle image (payment screenshot)
  if (hasImage) {
    await handleImage(message, client, customer);
    return;
  }

  // Skip empty messages
  if (!text) return;

  // Detect intent
  const intent = await ai.detectIntent(text);

  // Log conversation
  ConversationQueries.add(number, 'user', text, intent, false);

  // Route based on intent and stage
  const response = await routeMessage(text, intent, customer);

  // Send response
  if (response) {
    await sendMessage(client, number, response);
    ConversationQueries.add(number, 'bot', response, intent, false);
  }
}

/**
 * Route message based on intent and customer stage
 */
async function routeMessage(text, intent, customer) {
  const stage = customer.stage;

  // Handle returning customers
  if (stage === STAGES.DELIVERED || stage === STAGES.SUPPORT) {
    return handleSupportQuery(text, customer);
  }

  // Handle ongoing order flow
  if (stage === STAGES.ORDERING || stage === STAGES.AWAITING_PAYMENT) {
    return salesFlow.continueFlow(text, intent, customer);
  }

  // Handle payment verification pending
  if (stage === STAGES.PAYMENT_SENT) {
    return `Payment verify ho raha hai bhai. Thora wait karo 😊`;
  }

  // Route by intent
  switch (intent) {
    case 'GREET':
      return salesFlow.welcome(customer);

    case 'PRICE_ASK':
      return salesFlow.showPlans();

    case 'PLAN_INTEREST':
      return salesFlow.showPlanDetails(text);

    case 'COMPAT_CHECK':
      return salesFlow.checkCompatibility(text, customer);

    case 'ORDER_READY':
      CustomerQueries.updateStage(customer.number, STAGES.ORDERING);
      return salesFlow.startOrder(customer);

    case 'SUPPORT':
      CustomerQueries.updateStage(customer.number, STAGES.SUPPORT);
      return handleSupportQuery(text, customer);

    case 'REFUND_ASK':
      return handleRefundRequest(text, customer);

    case 'BYE':
      return `Allah Hafiz bhai! Kuch chahiye ho toh message karna 👋`;

    case 'RANDOM':
    default:
      // Try AI response if available
      const history = ConversationQueries.getRecent(customer.number, 5);
      const aiResponse = await ai.generateResponse(text, history, {
        stage: customer.stage,
        plan: customer.plan_interest
      });

      if (aiResponse) return aiResponse;

      // Fallback to default
      return `Bhai samajh nahi aaya 😅\n\nKya aap:\n1️⃣ Plans dekhna chahte hain\n2️⃣ eSIM lena chahte hain\n3️⃣ Help chahiye`;
  }
}

/**
 * Handle image (payment screenshot)
 */
async function handleImage(message, client, customer) {
  try {
    // Download media
    const media = await message.downloadMedia();
    if (!media || !media.data) {
      await sendMessage(client, message.from, 'Image download nahi hui — dobara bhejo');
      return;
    }

    const imageBuffer = Buffer.from(media.data, 'base64');

    // Get pending order
    const pendingOrder = OrderQueries.getPending(customer.number);
    if (!pendingOrder) {
      await sendMessage(client, message.from,
        'Bhai pehle plan select karo — konsa plan lena hai?\n\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250');
      return;
    }

    const plan = PLANS[pendingOrder.plan];
    if (!plan) return;

    // Analyze screenshot
    const analysis = await vision.analyzeScreenshot(imageBuffer, plan.price);

    // Check for duplicate
    const { PaymentQueries } = require('../database/queries');
    const existing = PaymentQueries.getByHash(analysis.hash);
    if (existing) {
      await sendMessage(client, message.from,
        'Bhai yeh screenshot pehle use ho chuki hai — fresh payment bhejo');
      return;
    }

    // Log payment attempt
    PaymentQueries.log(customer.number, pendingOrder.order_id, analysis.hash, plan.price);

    // Verify payment
    const verification = vision.verifyPayment(analysis, plan.price, null);

    if (!verification.valid) {
      await sendMessage(client, message.from, verification.message);
      return;
    }

    // Payment verified!
    PaymentQueries.verify(analysis.hash, analysis.amount, analysis.recipientNumber, analysis.status);

    // Confirm order
    OrderQueries.confirm(pendingOrder.order_id, plan.code, 'eSIM Provider');

    // Update customer
    CustomerQueries.updateStage(customer.number, STAGES.PAYMENT_SENT);

    // Deliver eSIM
    const delivery = await salesFlow.deliverESIM(customer, pendingOrder, plan);
    await sendMessage(client, message.from, delivery);

    // Update to delivered
    OrderQueries.deliver(pendingOrder.order_id);
    CustomerQueries.incrementOrders(customer.number, plan.price);
    CustomerQueries.updateStage(customer.number, STAGES.DELIVERED);

  } catch (error) {
    console.error('Image handling error:', error);
    await sendMessage(client, message.from,
      'Bhai screenshot process nahi ho rahi — dobara bhejo ya text se batao');
  }
}

/**
 * Handle support queries
 */
function handleSupportQuery(text, customer) {
  const lower = text.toLowerCase();

  // Common support issues
  if (lower.includes('activate') || lower.includes('chalu') || lower.includes('install')) {
    return `Koi baat nahi! Try karo:\n\n1️⃣ Settings → Mobile Data\n2️⃣ "Add eSIM" tap karo\n3️⃣ QR scan karo\n4️⃣ Data Roaming ON karo\n\nPhone model batao agar nahi chalta toh specific guide bhejta hoon 👍`;
  }

  if (lower.includes('slow') || lower.includes('speed')) {
    return `eSIM ki speed waisi hi hoti hai jo local network deta hai.\n\nCheck karo:\n• Signal strength achi hai?\n• Data Roaming ON hai?\n• Flight mode on/off karo\n\nAgar issue hai toh screenshot bhejo speed test ka`;
  }

  if (lower.includes('data') && lower.includes('khatam')) {
    return `Data khatam ho gaya? 😔\n\nNaya plan lena padega:\n📦 500MB - Rs 130\n📦 1GB - Rs 350\n📦 5GB - Rs 1,250\n\nKaunsa lena hai?`;
  }

  if (lower.includes('not working') || lower.includes('nahi chal')) {
    return `Bhai detail batao:\n1. Phone model kya hai?\n2. Kahan stuck ho rahe ho?\n3. Koi error aa raha hai?\n\nScreenshot bhejo toh better samajh aayega 🙏`;
  }

  // Default support response
  return `Main check karke batata hoon bhai.\n\nPhone model: ${customer.device_model || 'Unknown'}\nLast order: ${customer.last_plan || 'None'}\n\nExact problem batao kya ho raha hai?`;
}

/**
 * Handle refund requests
 */
function handleRefundRequest(text, customer) {
  const pendingOrder = OrderQueries.getPending(customer.number);

  if (!pendingOrder) {
    return `Bhai refund ke liye order confirm hona chahiye.\n\nAapka koi pending order nahi dikh raha.\nNumber check karke batao: ${customer.number}`;
  }

  if (pendingOrder.status === 'DELIVERED') {
    return `Bhai eSIM already deliver ho chuki hai.\n\nRefund tabhi possible hai jab:\n• eSIM activate nahi hoti\n• Technical issue hamari taraf se\n\nAgar eSIM use nahi ki toh admin se baat karwata hoon. Kuch time do 🙏`;
  }

  return `Refund request note kar li hai bhai.\n\nAdmin check karega aur 24-48 hours mein response aayega.\nOriginal account mein wapas aa jayega 🙏`;
}

/**
 * Send message with typing indicator
 */
async function sendMessage(client, number, text) {
  try {
    // Simulate typing
    await client.sendPresenceUpdate('composing', number);

    // Response delay
    const delay = parseInt(process.env.RESPONSE_DELAY) || 1000;
    await new Promise(r => setTimeout(r, delay));

    // Send message
    await client.sendMessage(number, text);

    // Stop typing
    await client.sendPresenceUpdate('paused', number);
  } catch (error) {
    console.error('Send message error:', error);
  }
}

/**
 * Check if number is admin
 */
function isAdmin(number) {
  const adminNumber = process.env.ADMIN_NUMBER;
  if (!adminNumber) return false;

  // Normalize numbers for comparison
  const normalizedInput = number.replace(/\D/g, '').replace(/^92/, '0');
  const normalizedAdmin = adminNumber.replace(/\D/g, '').replace(/^92/, '0');

  return normalizedInput.includes(normalizedAdmin) || normalizedAdmin.includes(normalizedInput);
}

module.exports = {
  handleMessage,
  sendMessage,
  isAdmin
};

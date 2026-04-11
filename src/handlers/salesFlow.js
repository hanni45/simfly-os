/"""
 * Sales Flow Engine
 * Complete sales funnel with state management
 */

const { CustomerQueries, OrderQueries, StockQueries, FollowUpQueries } = require('../database/queries');

// ═══════════════════════════════════════════════════════════════
// PLAN CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const PLANS = {
  '500MB': {
    id: '500MB',
    name: 'STARTER',
    data: '500MB',
    price: 130,
    validity: '2 Years',
    auto: true,
    code: 'AS48928',
    icon: '📦',
    devices: 1
  },
  '1GB': {
    id: '1GB',
    name: 'STANDARD',
    data: '1GB',
    price: 350,
    validity: '2 Years',
    auto: true,
    code: 'SA1GB',
    icon: '📦',
    devices: 1
  },
  '5GB': {
    id: '5GB',
    name: 'PRO',
    data: '5GB',
    price: 1250,
    validity: '2 Years',
    auto: false,
    code: 'FAMILY5G',
    icon: '💎',
    devices: 4
  }
};

const PAYMENT_METHODS = {
  jazzcash: { number: '03456754090', name: 'JazzCash' },
  easypaisa: { number: '03466544374', name: 'EasyPaisa' },
  sadapay: { number: '03116400376', name: 'SadaPay' }
};

// ═══════════════════════════════════════════════════════════════
// WELCOME & PLANS
// ═══════════════════════════════════════════════════════════════

/**
 * Welcome message for new/returning customers
 */
function welcome(customer) {
  // Returning customer
  if (customer.total_orders > 0) {
    return `Welcome back bhai! 😊\n\nPehle aapne ${customer.last_plan || 'plan'} liya tha.\n\nKya chahiye aaj?\n1️⃣ Naya plan\n2️⃣ Support\n3️⃣ Balance check`;
  }

  // New customer
  return `Assalam o Alaikum! 👋\nSimFly Pakistan mein khush aamdeed! 🇵🇰\n\nHumare plans yeh hain:\n\n🟢 STARTER  — 500MB | Rs 130 | 2 Saal\n🔵 STANDARD — 1GB   | Rs 350 | 2 Saal  \n🟣 PRO      — 5GB   | Rs 1,250 | 2 Saal\n\nKaun sa plan pasand hai? 😊`;
}

/**
 * Show all plans
 */
function showPlans() {
  return `📦 SimFly Pakistan Plans:\n\n` +
    `🟢 STARTER\n   500MB | Rs 130 | 2 Saal Validity\n\n` +
    `🔵 STANDARD\n   1GB | Rs 350 | 2 Saal Validity\n   ⭐ Most Popular\n\n` +
    `🟣 PRO\n   5GB | Rs 1,250 | 2 Saal Validity\n   4 Devices | Family Pack\n\n` +
    `Kaunsa lena hai bhai?`;
}

/**
 * Show specific plan details
 */
function showPlanDetails(text) {
  const lower = text.toLowerCase();

  // Detect which plan they're asking about
  if (lower.includes('500') || lower.includes('130') || lower.includes('starter')) {
    return planDetails('500MB');
  }
  if (lower.includes('1gb') || lower.includes('350') || lower.includes('standard')) {
    return planDetails('1GB');
  }
  if (lower.includes('5gb') || lower.includes('1250') || lower.includes('pro')) {
    return planDetails('5GB');
  }

  // Show all if unclear
  return showPlans();
}

/**
 * Get plan details
 */
function planDetails(planId) {
  const plan = PLANS[planId];
  if (!plan) return showPlans();

  return `${plan.icon} *${plan.name} Plan Details*\n\n` +
    `📊 Data: ${plan.data}\n` +
    `💰 Price: Rs ${plan.price}\n` +
    `⏱️ Validity: ${plan.validity}\n` +
    `📱 Devices: ${plan.devices}\n` +
    `🚀 Delivery: ${plan.auto ? 'Auto (Instant)' : 'Manual (Few mins)'}\n\n` +
    `✅ *Best Value:* Sirf Rs ${Math.round(plan.price / 730)} per day over 2 years!\n\n` +
    `Lena hai bhai?`;
}

// ═══════════════════════════════════════════════════════════════
// DEVICE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════

/**
 * Check device compatibility
 */
function checkCompatibility(text, customer) {
  const lower = text.toLowerCase();

  // Extract model
  let device = null;
  const patterns = [
    /(iphone\s*\d+[\w\s]*)/i,
    /(samsung\s*\w+)/i,
    /(pixel\s*\d+)/i,
    /(galaxy\s*\w+)/i,
    /(fold|flip)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      device = match[1].trim();
      break;
    }
  }

  // If no device found, ask
  if (!device) {
    return `Bhai aapka kaunsa phone model hai?\n\n` +
      `✅ Supported:\n` +
      `📱 iPhone XS, XR, 11, 12, 13, 14, 15, 16\n` +
      `📱 Samsung S20+, S21+, S22+, S23+, S24+\n` +
      `📱 Google Pixel 3+\n` +
      `📱 Fold/Flip series\n\n` +
      `❌ Not supported:\n` +
      `🚫 PTA-registered phones\n` +
      `🚫 iPhone X or below\n` +
      `🚫 Budget Android (Tecno, Infinix, etc)`;
  }

  // Check compatibility
  const deviceLower = device.toLowerCase();
  let compatible = false;
  let notes = '';

  // iPhone checks
  if (deviceLower.includes('iphone')) {
    // Check if XS or above
    const model = deviceLower.match(/iphone\s*(\d+|[xsxr]+)/);
    if (model) {
      const modelStr = model[1];
      if (modelStr === 'xs' || modelStr === 'xr' || modelStr === '11' ||
          modelStr === '12' || modelStr === '13' || modelStr === '14' ||
          modelStr === '15' || modelStr === '16' ||
          (parseInt(modelStr) >= 11)) {
        compatible = true;
      }
    }
    if (deviceLower.includes('x') && !deviceLower.includes('xs') && !deviceLower.includes('xr')) {
      compatible = false;
      notes = 'iPhone X eSIM support nahi karta ❌';
    }
  }

  // Samsung checks
  if (deviceLower.includes('samsung') || deviceLower.includes('galaxy')) {
    const model = deviceLower.match(/s(\d+)/);
    if (model && parseInt(model[1]) >= 20) {
      compatible = true;
    }
    if (deviceLower.includes('fold') || deviceLower.includes('flip')) {
      compatible = true;
    }
  }

  // Pixel checks
  if (deviceLower.includes('pixel')) {
    const model = deviceLower.match(/pixel\s*(\d+)/);
    if (model && parseInt(model[1]) >= 3) {
      compatible = true;
    }
  }

  // Save device info
  CustomerQueries.update(customer.number, {
    device_model: device,
    is_compatible: compatible ? 1 : 0
  });

  // Response
  if (compatible) {
    return `✅ *${device}* supported hai bhai!\n\n` +
      `eSIM kaam karegi smoothly 👍\n\n` +
      `Ab konsa plan lena hai?\n` +
      `🟢 500MB - Rs 130\n` +
      `🔵 1GB - Rs 350\n` +
      `🟣 5GB - Rs 1,250`;
  } else {
    return `❌ *${device}* pe eSIM work nahi karegi bhai\n\n` +
      `${notes || 'Ya toh PTA-registered hai ya eSIM support nahi hai'}\n\n` +
      `✅ Supported devices:\n` +
      `• iPhone XS/XR aur above\n` +
      `• Samsung S20+ aur above\n` +
      `• Google Pixel 3+\n\n` +
      `Aur koi Non-PTA device hai aapke paas?`;
  }
}

// ═══════════════════════════════════════════════════════════════
// ORDER FLOW
// ═══════════════════════════════════════════════════════════════

/**
 * Start order flow
 */
function startOrder(customer) {
  // Check if already has pending order
  const pending = OrderQueries.getPending(customer.number);
  if (pending) {
    return `Bhai aapka ek order already pending hai:\n` +
      `📦 ${pending.plan} - Rs ${pending.amount}\n` +
      `Status: ${pending.status}\n\n` +
      `Naya order ke liye pehle wala complete hona chahiye.`;
  }

  return `Perfect bhai! 👍\n\n` +
    `Kaunsa plan lena hai?\n\n` +
    `1️⃣ 500MB - Rs 130 (2 Saal)\n` +
    `2️⃣ 1GB - Rs 350 (2 Saal)\n` +
    `3️⃣ 5GB - Rs 1,250 (2 Saal - 4 Devices)\n\n` +
    `Number batao (1, 2, ya 3)`;
}

/**
 * Continue order flow from message
 */
function continueFlow(text, intent, customer) {
  const lower = text.toLowerCase().trim();

  // Detect plan selection
  let selectedPlan = null;

  if (lower.includes('1') || lower.includes('500') || lower.includes('130')) {
    selectedPlan = '500MB';
  } else if (lower.includes('2') || lower.includes('1gb') || lower.includes('350')) {
    selectedPlan = '1GB';
  } else if (lower.includes('3') || lower.includes('5gb') || lower.includes('1250')) {
    selectedPlan = '5GB';
  } else if (lower.includes('starter')) {
    selectedPlan = '500MB';
  } else if (lower.includes('standard')) {
    selectedPlan = '1GB';
  } else if (lower.includes('pro')) {
    selectedPlan = '5GB';
  }

  if (!selectedPlan) {
    return `Bhai samajh nahi aaya 😅\n\n` +
      `1, 2, ya 3 batao:\n` +
      `1️⃣ 500MB - Rs 130\n` +
      `2️⃣ 1GB - Rs 350\n` +
      `3️⃣ 5GB - Rs 1,250`;
  }

  const plan = PLANS[selectedPlan];

  // Check stock
  const stock = StockQueries.get(selectedPlan);
  if (stock.quantity <= 0) {
    // Add to waitlist
    const { FollowUpQueries } = require('../database/queries');
    // (waitlist logic handled separately)
    return `Bhai ${plan.name} (${plan.data}) abhi stock mein nahi hai 😔\n\n` +
      `Main aapko notify kar dunga jab available ho.\n` +
      `Aur koi plan chalega?\n` +
      `🟢 500MB - Rs 130\n` +
      `🔵 1GB - Rs 350`;
  }

  // Create order
  const orderId = `SF${Date.now().toString(36).toUpperCase()}`;
  OrderQueries.create(orderId, customer.number, selectedPlan, plan.price);

  // Update customer
  CustomerQueries.update(customer.number, {
    stage: 'AWAITING_PAYMENT',
    plan_interest: selectedPlan,
    last_plan: selectedPlan
  });

  // Schedule payment reminder
  const reminderTime = Math.floor(Date.now() / 1000) + (45 * 60); // 45 mins
  FollowUpQueries.schedule(
    customer.number,
    'PAYMENT_PENDING',
    `Bhai ${plan.name} ka payment ho gaya? Screenshot bhejni thi 📸`,
    reminderTime
  );

  return `✅ *${plan.name} Selected*\n\n` +
    `📦 Plan: ${plan.data}\n` +
    `💰 Amount: Rs ${plan.price}\n` +
    `⏱️ Validity: ${plan.validity}\n\n` +
    `Payment karo bhai:\n\n` +
    `💚 JazzCash: ${PAYMENT_METHODS.jazzcash.number}\n` +
    `💙 EasyPaisa: ${PAYMENT_METHODS.easypaisa.number}\n` +
    `💜 SadaPay: ${PAYMENT_METHODS.sadapay.number}\n\n` +
    `(Account Name: SimFly Pakistan)\n\n` +
    `Payment ke baad *screenshot bhejo* yahan 📸`;
}

// ═══════════════════════════════════════════════════════════════
// DELIVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Deliver eSIM after payment verification
 */
async function deliverESIM(customer, order, plan) {
  // Build activation guide
  const guide = buildActivationGuide(plan);

  // Auto-deliver for 500MB and 1GB
  if (plan.auto) {
    // Decrement stock
    StockQueries.decrement(plan.id);

    return `🎉 *Payment Verified!* ✅\n\n` +
      `${guide}\n\n` +
      `Koi problem ho toh seedha "support" likh ke bhejo 👍`;
  }

  // Manual delivery for 5GB (notify admin)
  return `🎉 *Payment Verified!* ✅\n\n` +
    `5GB plan manual delivery hota hai bhai.\n\n` +
    `Admin ko notify kar diya hai —\n` +
    `Aapko 5-10 minutes mein details mil jayengi 📧\n\n` +
    `Shukriya SimFly Pakistan choose karne ke liye! 🙏`;
}

/**
 * Build activation guide
 */
function buildActivationGuide(plan) {
  const isMultiDevice = plan.devices > 1;

  return `━━━━━━━━━━━━━━━━━━━\n` +
    `📱 *YOUR eSIM DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Plan: ${plan.name}\n` +
    `📊 Data: ${plan.data}\n` +
    `⏱️ Validity: ${plan.validity}\n` +
    `${isMultiDevice ? `📱 Devices: ${plan.devices} (Simultaneous)\n` : ''}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 *PROMO CODE*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Code: *${plan.code}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📲 *ACTIVATION STEPS*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ Settings → Mobile Data\n` +
    `2️⃣ "Add eSIM" tap karo\n` +
    `3️⃣ Enter code: *${plan.code}*\n` +
    `4️⃣ Data Roaming ON karo ✅\n` +
    `5️⃣ 1-2 minute wait karo\n\n` +
    `⚠️ Data Roaming MUST be ON!`;
}

// ═══════════════════════════════════════════════════════════════
// STOCK MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Check if plan is available
 */
function isPlanAvailable(planId) {
  const stock = StockQueries.get(planId);
  return stock && stock.quantity > 0;
}

/**
 * Get stock status message
 */
function getStockStatus() {
  const stocks = StockQueries.getAll();
  return stocks.map(s => {
    const plan = PLANS[s.plan];
    const status = s.quantity <= s.low_threshold ? '⚠️ LOW' : '✅ OK';
    return `${plan.icon} ${plan.name}: ${s.quantity} left ${status}`;
  }).join('\n');
}

module.exports = {
  welcome,
  showPlans,
  showPlanDetails,
  planDetails,
  checkCompatibility,
  startOrder,
  continueFlow,
  deliverESIM,
  isPlanAvailable,
  getStockStatus,
  PLANS
};

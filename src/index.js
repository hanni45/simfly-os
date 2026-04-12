const { Client, LocalAuth } = require('whatsapp-web.js');
const db = require('./database');
const sv = require('./services');

const PLANS = {
  '500MB': { name: 'STARTER', data: '500MB', price: 130, auto: true, code: 'AS48928', icon: '📦' },
  '1GB': { name: 'STANDARD', data: '1GB', price: 350, auto: true, code: 'SA1GB', icon: '📦' },
  '5GB': { name: 'PRO', data: '5GB', price: 1250, auto: false, code: 'FAMILY5G', icon: '💎' }
};

const PAYMENT_METHODS = {
  jazzcash: { number: '03456754090', name: 'JazzCash' },
  easypaisa: { number: '03466544374', name: 'EasyPaisa' },
  sadapay: { number: '03116400376', name: 'SadaPay' }
};

console.log(`${'\x1b[35m'}╔═══════════════════════════════════════════════════╗${'\x1b[0m'}`);
console.log(`${'\x1b[35m'}║${'\x1b[0m'}${'\x1b[1m'}      🤖 SimFly OS v5.0 - WhatsApp Bot 🤖${'\x1b[0m'}${'\x1b[35m'}      ║${'\x1b[0m'}`);
console.log(`${'\x1b[35m'}╚═══════════════════════════════════════════════════╝${'\x1b[0m'}\n`);

sv.setStatus('INITIALIZING');

sv.logger.info('🚀 Initializing SimFly OS v5.0...');

db.migrate().then(() => sv.logger.success('✅ Database connected and migrated')).catch(err => {
  sv.logger.error('❌ Database connection failed', { error: err.message });
  process.exit(1);
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  sv.logger.bot('📱 QR code generated - Scan with WhatsApp');
  sv.setQR(qr);
  sv.setStatus('QR_READY');
});

client.on('authenticated', () => {
  sv.logger.success('🔐 WhatsApp authenticated');
  sv.clearQR();
  sv.setStatus('AUTHENTICATED');
});

client.on('ready', () => {
  sv.logger.success('✅ SimFly OS is ready and listening!');
  sv.setStatus('READY');
  sv.initScheduler(client);
});

client.on('message_create', async (message) => {
  try {
    if (message.fromMe) return;

    const number = message.from;
    const text = message.body?.trim() || '';

    if (number.includes('@g.us')) return;

    sv.logger.bot(`📩 Message from ${number.split('@')[0]}: ${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`);

    const customer = await db.CustomerQueries.getOrCreate(number, message.notifyName);
    if (customer.banned) {
      sv.logger.warn(`⛔ Blocked message from banned user: ${number}`);
      return;
    }

    if (text.startsWith('/') && isAdmin(number)) {
      sv.logger.bot(`🔧 Admin command: ${text}`);
      const response = await handleAdminCommand(text);
      if (response) await client.sendMessage(number, response);
      return;
    }

    if (message.hasMedia) {
      sv.logger.bot(`🖼️  Image received from ${number.split('@')[0]}`);
      await handleImage(message, customer);
      return;
    }

    if (!text) return;

    const intent = await sv.detectIntent(text);
    await db.ConversationQueries.add(number, 'user', text, intent, false);
    const response = await handleMessage(text, intent, customer);
    if (response) {
      await client.sendMessage(number, response);
      await db.ConversationQueries.add(number, 'bot', response, intent, false);
      sv.logger.bot(`📤 Reply sent to ${number.split('@')[0]}`);
    }
  } catch (err) {
    sv.logger.error('Message handling error', { error: err.message });
  }
});

client.on('disconnected', (reason) => {
  sv.logger.warn('⚠️  WhatsApp disconnected', { reason });
  sv.setStatus('DISCONNECTED');
});

async function handleMessage(text, intent, customer) {
  const stage = customer.stage;

  if (stage === 'DELIVERED' || stage === 'SUPPORT') return handleSupport(text, customer);
  if (stage === 'ORDERING' || stage === 'AWAITING_PAYMENT') return continueOrder(text, customer);
  if (stage === 'PAYMENT_SENT') return 'Payment verify ho raha hai bhai. Thora wait karo 😊';

  switch (intent) {
    case 'GREET': return welcome(customer);
    case 'PRICE_ASK': return showPlans();
    case 'PLAN_INTEREST': return planDetails(text);
    case 'COMPAT_CHECK': return checkDevice(text, customer);
    case 'ORDER_READY':
      await db.CustomerQueries.updateStage(customer.number, 'ORDERING');
      return startOrder(customer);
    case 'SUPPORT':
      await db.CustomerQueries.updateStage(customer.number, 'SUPPORT');
      return handleSupport(text, customer);
    case 'REFUND_ASK': return handleRefund(customer);
    case 'BYE': return 'Allah Hafiz bhai! 👋';
    default:
      const history = await db.ConversationQueries.getRecent(customer.number, 5);
      const ai = await sv.generateResponse(text, history);
      return ai || `Bhai samajh nahi aaya 😅\n\n1️⃣ Plans dekhna\n2️⃣ eSIM lena\n3️⃣ Help`;
  }
}

async function handleImage(message, customer) {
  try {
    const media = await message.downloadMedia();
    if (!media || !media.data) {
      await client.sendMessage(message.from, 'Image download nahi hui — dobara bhejo');
      return;
    }

    const imageBuffer = Buffer.from(media.data, 'base64');
    const pendingOrder = await db.OrderQueries.getPending(customer.number);
    if (!pendingOrder) {
      await client.sendMessage(message.from, 'Pehle plan select karo:\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250');
      return;
    }

    const plan = PLANS[pendingOrder.plan];
    if (!plan) return;

    const analysis = await sv.analyzeScreenshot(imageBuffer, plan.price);
    const existing = await db.PaymentQueries.getByHash(analysis.hash);
    if (existing) {
      await client.sendMessage(message.from, 'Yeh screenshot pehle use ho chuki hai');
      return;
    }

    await db.PaymentQueries.log(customer.number, pendingOrder.order_id, analysis.hash, plan.price);
    const verification = sv.verifyPayment(analysis, plan.price);
    if (!verification.valid) {
      await client.sendMessage(message.from, verification.message);
      return;
    }

    await db.PaymentQueries.verify(analysis.hash, analysis.amount, analysis.recipientNumber, analysis.status);
    await db.OrderQueries.confirm(pendingOrder.order_id, plan.code);
    await db.CustomerQueries.updateStage(customer.number, 'PAYMENT_SENT');

    const delivery = await deliverESIM(plan, pendingOrder.plan);
    await client.sendMessage(message.from, delivery);

    await db.OrderQueries.deliver(pendingOrder.order_id);
    await db.CustomerQueries.incrementOrders(customer.number, plan.price);
    await db.CustomerQueries.updateStage(customer.number, 'DELIVERED');

  } catch (err) {
    sv.logger.error('Image error', { error: err.message });
    await client.sendMessage(message.from, 'Screenshot process nahi ho rahi');
  }
}

function welcome(customer) {
  if (customer.total_orders > 0) {
    return `Welcome back! 😊\n\nKya chahiye?\n1️⃣ Naya plan\n2️⃣ Support`;
  }
  return `Assalam o Alaikum! 👋 SimFly Pakistan! 🇵🇰\n\n🟢 500MB — Rs 130\n🔵 1GB — Rs 350\n🟣 5GB — Rs 1,250\n\nKaun sa plan?`;
}

function showPlans() {
  return `📦 SimFly Plans:\n\n🟢 500MB — Rs 130 | 2 Saal\n🔵 1GB — Rs 350 | 2 Saal\n🟣 5GB — Rs 1,250 | 2 Saal\n\nKaunsa?`;
}

function planDetails(text) {
  const lower = text.toLowerCase();
  let planId = null;
  if (/500|130|starter/.test(lower)) planId = '500MB';
  else if (/1gb|350|standard/.test(lower)) planId = '1GB';
  else if (/5gb|1250|pro/.test(lower)) planId = '5GB';

  if (!planId) return showPlans();
  const plan = PLANS[planId];
  return `${plan.icon} *${plan.name}*\n\n📊 ${plan.data}\n💰 Rs ${plan.price}\n⏱️ 2 Saal\n\nLena hai?`;
}

function checkDevice(text, customer) {
  const device = text.match(/(iphone\s*\d+|samsung\s*\w+|pixel\s*\d+)/i)?.[0];

  if (!device) {
    return `Phone model?\n\n✅ iPhone XS/11+\n✅ Samsung S20+\n✅ Pixel 3+`;
  }

  const dl = device.toLowerCase();
  let compatible = false;
  if (/iphone/.test(dl) && /xs|xr|\d+/.test(dl)) {
    const m = dl.match(/(\d+|xs|xr)/)?.[0];
    if (m === 'xs' || m === 'xr' || parseInt(m) >= 11) compatible = true;
  }
  if (/samsung/.test(dl) && dl.match(/s(\d+)/)?.[1] >= 20) compatible = true;
  if (/pixel/.test(dl) && dl.match(/(\d+)/)?.[1] >= 3) compatible = true;

  db.CustomerQueries.update(customer.number, { device_model: device, is_compatible: compatible ? 1 : 0 });

  if (compatible) {
    return `✅ *${device}* supported!\n\nKaunsa plan?\n🟢 500MB\n🔵 1GB\n🟣 5GB`;
  }
  return `❌ *${device}* not supported\n\n✅ iPhone XS+/S20+/Pixel 3+`;
}

async function startOrder(customer) {
  const pending = await db.OrderQueries.getPending(customer.number);
  if (pending) {
    return `Order already pending:\n📦 ${pending.plan} - Rs ${pending.amount}`;
  }
  return `Kaunsa plan?\n\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250`;
}

async function continueOrder(text, customer) {
  const lower = text.toLowerCase().trim();
  let selectedPlan = null;

  if (/1|500|130/.test(lower)) selectedPlan = '500MB';
  else if (/2|1gb|350/.test(lower)) selectedPlan = '1GB';
  else if (/3|5gb|1250/.test(lower)) selectedPlan = '5GB';

  if (!selectedPlan) {
    return `1, 2, ya 3 batao:\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250`;
  }

  const plan = PLANS[selectedPlan];
  const stock = await db.StockQueries.get(selectedPlan);
  if (!stock || stock.quantity <= 0) {
    return `${plan.name} out of stock 😔`;
  }

  const orderId = `SF${Date.now().toString(36).toUpperCase()}`;
  await db.OrderQueries.create(orderId, customer.number, selectedPlan, plan.price);
  await db.CustomerQueries.update(customer.number, {
    stage: 'AWAITING_PAYMENT',
    plan_interest: selectedPlan,
    last_plan: selectedPlan
  });

  return `✅ *${plan.name}*\n\n📦 ${plan.data}\n💰 Rs ${plan.price}\n\nPayment:\n💚 JazzCash: ${PAYMENT_METHODS.jazzcash.number}\n💙 EasyPaisa: ${PAYMENT_METHODS.easypaisa.number}\n💜 SadaPay: ${PAYMENT_METHODS.sadapay.number}\n\nScreenshot bhejo 📸`;
}

async function deliverESIM(plan, planKey) {
  const guide = `━━━━━━━━━━━━━━━\n📱 *eSIM*\n━━━━━━━━━━━━━━━\n📦 ${plan.name} | ${plan.data}\n🎁 Code: *${plan.code}*\n\n📲 Activation:\n1️⃣ Settings → Mobile Data\n2️⃣ Add eSIM\n3️⃣ Code: *${plan.code}*\n4️⃣ Data Roaming ON ✅`;

  if (plan.auto) {
    await db.StockQueries.decrement(planKey);
    return `🎉 *Verified!* ✅\n\n${guide}`;
  }
  return `🎉 *Verified!* ✅\n\nAdmin notify kar diya — details 5-10 min mein 📧`;
}

function handleSupport(text, customer) {
  const lower = text.toLowerCase();
  if (/activate|chalu/.test(lower)) {
    return `Try:\n1️⃣ Settings → Mobile Data\n2️⃣ Add eSIM\n3️⃣ Code enter\n4️⃣ Data Roaming ON ✅`;
  }
  if (/slow|speed/.test(lower)) {
    return `Check:\n• Signal strength?\n• Data Roaming ON?\n• Flight mode on/off?`;
  }
  return `Phone: ${customer.device_model || 'Unknown'}\nLast: ${customer.last_plan || 'None'}\n\nProblem batao?`;
}

async function handleRefund(customer) {
  const pending = await db.OrderQueries.getPending(customer.number);
  if (!pending) return `Koi pending order nahi.`;
  if (pending.status === 'DELIVERED') return `eSIM deliver ho chuki hai. Refund nahi possible.`;
  return `Refund request note kar li. Admin 24-48 hours mein response dega 🙏`;
}

async function handleAdminCommand(text) {
  const parts = text.slice(1).trim().split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'orders': {
      const orders = await db.OrderQueries.getByStatus('PENDING', 20);
      return orders.length === 0 ? 'No pending orders' : `*Pending (${orders.length})*\n\n${orders.map(o => `📦 ${o.order_id} | ${o.plan}`).join('\n')}`;
    }
    case 'stock': {
      if (args.length === 0) {
        const stocks = await db.StockQueries.getAll();
        return `*Stock*\n\n${stocks.map(s => `📦 ${s.plan}: ${s.quantity}`).join('\n')}`;
      }
      await db.StockQueries.update(args[0].toUpperCase(), parseInt(args[1]));
      return `✅ ${args[0]} = ${args[1]}`;
    }
    case 'customer': {
      const customer = await db.CustomerQueries.get(args[0]);
      return customer ? `*Customer*\n📱 ${customer.number}\n👤 ${customer.name || 'N/A'}\n📦 ${customer.total_orders} orders` : 'Not found';
    }
    case 'ban': { await db.CustomerQueries.update(args[0], { banned: 1 }); return `🚫 Banned ${args[0]}`; }
    case 'unban': { await db.CustomerQueries.update(args[0], { banned: 0 }); return `✅ Unbanned ${args[0]}`; }
    case 'stats': {
      const stats = await db.OrderQueries.getStats(7);
      return `*Stats (7d)*\n📦 Total: ${stats.total_orders}\n✅ Delivered: ${stats.delivered}\n💰 Revenue: Rs ${stats.revenue}`;
    }
    case 'help': return `*Admin Commands*\n/orders, /stock, /customer, /ban, /unban, /stats`;
    default: return `Unknown: /${cmd}. Type /help`;
  }
}

function isAdmin(number) {
  const admin = process.env.ADMIN_NUMBER;
  if (!admin) return false;
  const n1 = number.replace(/\D/g, '').replace(/^92/, '0');
  const n2 = admin.replace(/\D/g, '').replace(/^92/, '0');
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

sv.startWebServer();

sv.logger.info('⏳ Waiting 3 seconds before WhatsApp initialization...');
setTimeout(() => {
  sv.logger.info('🔄 Starting WhatsApp client...');
  client.initialize().catch(err => {
    sv.logger.error('💥 Initialization failed', { error: err.message });
    process.exit(1);
  });
}, 3000);

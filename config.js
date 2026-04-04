/**
 * SIMFLY OS v8.0 — MASTER BOT CONFIGURATION
 * Sab kuch yahan set karo — .env ki zaroorat nahi!
 * ═══════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════
// GROQ AI — console.groq.com se FREE key lo
// ═══════════════════════════════════════════════════════
const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // ya 'llama-3.1-8b-instant' for faster

// ═══════════════════════════════════════════════════════
// ADMIN WHATSAPP NUMBER
// Format: 923057258561 (92 = Pakistan code, baki number)
// ═══════════════════════════════════════════════════════
const ADMIN_NUMBER = 'YOUR_WHATSAPP_NUMBER_HERE';

// ═══════════════════════════════════════════════════════
// FIREBASE SETTINGS
// firebase.google.com > Project Settings > Service Accounts
// ═══════════════════════════════════════════════════════
const FIREBASE = {
  // Project Settings se milay ga
  projectId: 'YOUR_FIREBASE_PROJECT_ID',

  // Service Account JSON mein "client_email"
  clientEmail: 'YOUR_FIREBASE_CLIENT_EMAIL',

  // Service Account JSON mein "private_key" (poora key yahan paste karein)
  privateKey: `-----BEGIN PRIVATE KEY-----
YOUR_FIREBASE_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----`,

  // Realtime Database URL
  databaseURL: 'YOUR_FIREBASE_DATABASE_URL'
};

// ═══════════════════════════════════════════════════════
// APP / WEBHOOK URL (Railway/Render URL deploy ke baad)
// ═══════════════════════════════════════════════════════
const APP_URL = 'YOUR_APP_URL_HERE';

// ═══════════════════════════════════════════════════════
// SIMFLY BUSINESS CONFIG
// ═══════════════════════════════════════════════════════
const BUSINESS = {
  name: 'SimFly Pakistan',
  tagline: 'eSIM for Non-PTA iPhones',
  location: 'Pakistan',

  // eSIM Plans
  plans: [
    { id: 'plan_500mb', name: '500MB', data: '500MB', price: 130, duration: '2 Years', icon: '⚡', popular: false, label: 'STARTER', auto: true },
    { id: 'plan_1gb', name: '1GB', data: '1GB', price: 400, duration: '2 Years', icon: '🔥', popular: true, label: 'POPULAR', auto: true },
    { id: 'plan_5gb', name: '5GB', data: '5GB', price: 1500, duration: '2 Years', icon: '💎', popular: false, label: 'MEGA', devices: 4, auto: false }
  ],

  // Payment Methods
  payments: {
    jazzcash: { number: 'YOUR_JAZZCASH_NUMBER', name: 'JazzCash', accountName: 'YOUR_NAME' },
    easypaisa: { number: 'YOUR_EASYPAISA_NUMBER', name: 'EasyPaisa', accountName: 'YOUR_NAME' },
    sadapay: { number: 'YOUR_SADAPAY_NUMBER', name: 'SadaPay', accountName: 'YOUR_NAME' }
  },

  // FAQs
  faqs: {
    pta: 'eSIM sirf Non-PTA devices pe work karti hai. PTA registered pe nahi chalegi.',
    compatibility: 'Supported: iPhone XS/XR+, Samsung S20+, Pixel 4+. Non-PTA required.',
    activation: 'QR code scan karne ke baad 2-5 minutes mein activate ho jati hai.',
    refund: 'Refund policy: Agar eSIM activate nahi hoti toh full refund within 24 hours.',
    validity: 'Saare plans 2 saal ki validity ke saath hain.',
    devices: '500MB/1GB 1 device pe, 5GB 4 devices pe simultaneously use kar sakte hain.'
  }
};

// ═══════════════════════════════════════════════════════
// BOT BEHAVIOR SETTINGS
// ═══════════════════════════════════════════════════════
const BOT_CONFIG = {
  // Server port
  port: process.env.PORT || 3000,

  // Response delay (ms) - kitni dair baad jawab aaye
  responseDelay: 1000,

  // Typing indicator show karna hai?
  showTyping: true,

  // AI use karna hai agar Groq configured hai?
  useAI: true,

  // Template responses fallback
  useTemplates: true,

  // Maximum reply length
  maxMessageLength: 1000
};

// ═══════════════════════════════════════════════════════
// AI SYSTEM PROMPT (Groq AI ke liye)
// ═══════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are "Bhai" - SimFly Pakistan's friendly WhatsApp Sales Assistant.

BUSINESS INFO:
- SimFly Pakistan sells eSIM for Non-PTA iPhones
- Location: Pakistan
- Style: Friendly Pakistani brother ("Bhai")

ESIM PLANS:
⚡ 500MB - Rs. 130 (2 years)
🔥 1GB - Rs. 400 (Most Popular, 2 years)
💎 5GB - Rs. 1500 (4 devices, 2 years)

PAYMENT METHODS:
💳 JazzCash: 03466544374
💳 EasyPaisa: 03456754090
💳 SadaPay: 03116400376

RULES:
1. Reply in Roman Urdu + English mix
2. Use emojis (1-3 per response)
3. Keep replies SHORT (1-3 lines)
4. Be friendly Pakistani bhai style
5. NEVER give discounts
6. Focus on closing sales
7. For non-business topics: "Bhai, main sirf SimFly ke eSIM plans ke bare mein help kar sakta hoon. 😊"

BEHAVIOR:
- Be helpful and welcoming
- Ask for screenshot after payment mention
- Guide step-by-step for orders`;

// ═══════════════════════════════════════════════════════
// KEYWORD RESPONSES (Template-based, AI ke baghair bhi chalay)
// ═══════════════════════════════════════════════════════
const KEYWORD_RESPONSES = {
  greeting: {
    keywords: ['hi', 'hello', 'assalam', 'salam', 'hey', 'aoa', 'aslam'],
    responses: [
      `Assalam-o-Alaikum bhai! 👋 SimFly Pakistan mein khush amdeed! Main aapki kya madad kar sakta hoon? 😊`,
      `Walaikum Assalam! 🤝 Kaise hain bhai? SimFly ke eSIM plans dekhne hain?`,
      `Salam bhai! 👋 Aaj kya plan lena hai? 500MB, 1GB ya 5GB?`
    ]
  },

  plans: {
    keywords: ['plan', 'price', 'rate', 'kitne', 'cost', 'rs', 'pese', '500mb', '1gb', '5gb'],
    responses: [
      `Hamare eSIM Plans:\n\n⚡ 500MB - Rs. 130\n🔥 1GB - Rs. 400 (Most Popular)\n💎 5GB - Rs. 1500 (4 devices)\n\nSab plans 2 saal ke liye! 📱\n\nKaunsa plan pasand hai bhai? 🤔`
    ]
  },

  payment: {
    keywords: ['payment', 'pay', 'jazzcash', 'easypaisa', 'sadapay', 'transfer', 'bhejo', 'screenshot'],
    responses: [
      `Payment Methods:\n\n💳 JazzCash: 03466544374\n💳 EasyPaisa: 03456754090\n💳 SadaPay: 03116400376\n\nPayment karke screenshot bhej dein bhai! 📱 Jaldi process kar deta hoon! ⚡`
    ]
  },

  order: {
    keywords: ['buy', 'order', 'lena', 'purchase', 'kharid', 'chahiye', 'book'],
    responses: [
      `Order karne ke liye bhai:\n\n1️⃣ Plan select karein\n2️⃣ Payment karein\n3️⃣ Screenshot bhej dein\n\nKaunsa plan lena hai? 🛒`,
      `Bhai bas ye bata dein:\n- Kaunsa plan (500MB/1GB/5GB)?\n- Kis number pe chahiye?\n\nPayment confirm hote hi eSIM bana deta hoon! ⚡`
    ]
  },

  jv: {
    keywords: ['jv', 'japanese', 'work', 'chalega', 'compatible', 'support'],
    responses: [
      `Han bhai! JV (Japanese Version) iPhone pe bilkul work karti hai! ✅\n\nBas dekh lain:\n📱 iPhone XS/XR se upar\n📱 Device Non-PTA\n\nKaunsa iPhone hai? 🤔`
    ]
  },

  pta: {
    keywords: ['pta', 'registered'],
    responses: [
      `Bhai, eSIM sirf Non-PTA devices pe work karti hai.\n\n❌ PTA registered = Nahi chalay gi\n✅ Non-PTA iPhone XS+ = Chalay gi\n\nAapka device Non-PTA hai? 🤔`
    ]
  },

  install: {
    keywords: ['install', 'setup', 'activate', 'kaise', 'lagaye', 'qr'],
    responses: [
      `eSIM install simple hai:\n\n1️⃣ QR code scan karein\n2️⃣ Settings > Cellular > Add eSIM\n3️⃣ Activate\n\nDone! ✅ Main guide bhi bhej deta hoon!`
    ]
  },

  thanks: {
    keywords: ['thank', 'shukria', 'shukriya', 'jazak'],
    responses: [
      `Koi baat nahi bhai! 😊 Allah Pak aapko khush rakhe! 🙏`,
      `Welcome bhai! 🤗 Referral se order karwa sakte hain, commission milta hai! 💰`
    ]
  },

  bye: {
    keywords: ['bye', 'allah hafiz', 'khuda hafiz', 'alvida'],
    responses: [
      `Allah Hafiz bhai! 🙏 Kabhi bhi help chahiye ho, message kar dein! 📱`
    ]
  },

  help: {
    keywords: ['help', 'madad', 'support', 'guide', 'kya', 'how'],
    responses: [
      `Main aapki kya help kar sakta hoon? 🤔\n\n📱 Plans dekhne hain?\n💳 Payment methods?\n🛒 Order karna hai?\n❓ Koi aur sawal?`
    ]
  },

  human: {
    keywords: ['human', 'agent', 'real', 'person', 'admin'],
    responses: [
      `Bhai, main hi human hoon SimFly ka sales assistant! 😊\n\nKya chahiye bhai? Bata dein! 👍`
    ]
  },

  device: {
    keywords: ['iphone', 'samsung', 'pixel', 'mobile', 'phone', 'device'],
    responses: [
      `Supported Devices:\n\n📱 iPhone XS/XR and above\n📱 iPhone 11/12/13/14/15/16\n📱 Samsung S20/S21/S22/S23/S24\n📱 Google Pixel 4+\n\nNon-PTA required! ✅`
    ]
  }
};

// ═══════════════════════════════════════════════════════
// DATABASE SETTINGS
// ═══════════════════════════════════════════════════════
const DB_CONFIG = {
  // Local database folder
  dataDir: './data',
  dbFile: 'database.json',
  autoSaveInterval: 30000, // 30 seconds
  maxMessagesPerChat: 50,
  maxLogs: 50
};

// ═══════════════════════════════════════════════════════
// PUPPETEER SETTINGS (WhatsApp Web ke liye)
// ═══════════════════════════════════════════════════════
const PUPPETEER_CONFIG = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--single-process',
    '--no-zygote',
    '--disable-web-security'
  ]
};

// ═══════════════════════════════════════════════════════
// EXPORTS — Sab kuch export karo
// ═══════════════════════════════════════════════════════
module.exports = {
  // Config
  GROQ_API_KEY,
  GROQ_MODEL,
  ADMIN_NUMBER,
  FIREBASE,
  APP_URL,
  BUSINESS,
  BOT_CONFIG,

  // Content
  SYSTEM_PROMPT,
  KEYWORD_RESPONSES,

  // Settings
  DB_CONFIG,
  PUPPETEER_CONFIG,

  // Helpers
  isGroqEnabled: () => GROQ_API_KEY && GROQ_API_KEY.length > 10,
  isFirebaseEnabled: () => FIREBASE && FIREBASE.projectId && FIREBASE.privateKey
};

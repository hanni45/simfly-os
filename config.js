/**
 * ═══════════════════════════════════════════════════════
 * SIMFLY OS v4.0 — MASTER PRODUCTION BUILD
 * ═══════════════════════════════════════════════════════
 *
 * WhatsApp Sales Bot for SimFly Pakistan (eSIM Provider)
 * July 2026 Release — Final Production Build
 *
 * 🎯 AI System:
 *    • Primary Chat: Groq (llama-3.3-70b-versatile)
 *    • Media Analysis: Gemini (10-key rotation)
 *
 * 🔥 Database: Firebase Realtime
 * 📱 WhatsApp: whatsapp-web.js
 * 🌐 Dashboard: Railway-hosted
 *
 * API KEYS: Set in Environment Variables
 * ═══════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════
// GROQ AI — console.groq.com se FREE key lo
// Environment Variable: GROQ_API_KEY
// ═══════════════════════════════════════════════════════
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // ya 'llama-3.1-8b-instant' for faster

// ═══════════════════════════════════════════════════════
// GEMINI AI — makersuite.google.com se FREE API keys lo
// Environment Variables: GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
// ═══════════════════════════════════════════════════════
const GEMINI_APIS = [
  { key: 'GEMINI_API_KEY_1', name: 'Gemini-2.5-Flash', model: 'models/gemini-2.5-flash' },
  { key: 'GEMINI_API_KEY_2', name: 'Gemini-2.5-Pro', model: 'models/gemini-2.5-pro' },
  { key: 'GEMINI_API_KEY_3', name: 'Gemini-2.0-Flash', model: 'models/gemini-2.0-flash' },
  { key: 'GEMINI_API_KEY_4', name: 'Gemini-2.0-Flash-001', model: 'models/gemini-2.0-flash-001' },
  { key: 'GEMINI_API_KEY_5', name: 'Gemini-2.0-Flash-Lite-001', model: 'models/gemini-2.0-flash-lite-001' },
  { key: 'GEMINI_API_KEY_6', name: 'Gemini-2.0-Flash-Lite', model: 'models/gemini-2.0-flash-lite' },
  { key: 'GEMINI_API_KEY_7', name: 'Gemini-2.5-Flash-Lite', model: 'models/gemini-2.5-flash-lite' },
  { key: 'GEMINI_API_KEY_8', name: 'Gemini-2.5-Flash-Backup', model: 'models/gemini-2.5-flash' },
  { key: 'GEMINI_API_KEY_9', name: 'Gemini-2.0-Flash-Backup', model: 'models/gemini-2.0-flash' },
  { key: 'GEMINI_API_KEY_10', name: 'Gemini-2.5-Pro-Backup', model: 'models/gemini-2.5-pro' }
];

// Get Gemini API keys from Environment Variables ONLY
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY_7,
  process.env.GEMINI_API_KEY_8,
  process.env.GEMINI_API_KEY_9,
  process.env.GEMINI_API_KEY_10
].filter(Boolean); // Remove undefined/null keys

// ═══════════════════════════════════════════════════════
// ADMIN WHATSAPP NUMBER
// Environment Variable: ADMIN_NUMBER
// Format: 923057258561 (92 = Pakistan code, baki number)
// ═══════════════════════════════════════════════════════
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '';

// ═══════════════════════════════════════════════════════
// TEST BOARD / PRIVATE MODE — Only whitelisted numbers can use bot
// ═══════════════════════════════════════════════════════
const TEST_BOARD = {
  // Set to true to enable private mode (only whitelisted users can use bot)
  enabled: false,

  // Whitelist — Add numbers that can use bot during testing
  // Format: ['923001234567', '923001234568']
  whitelist: [],

  // Message to show non-whitelisted users
  message: '🚫 Bot is currently in testing mode. Please wait for public launch! 🚀'
};

// ═══════════════════════════════════════════════════════
// BOT MODE — Test vs Public
// ═══════════════════════════════════════════════════════
const BOT_MODE = {
  // 'test' = Only admin/whitelist can use
  // 'public' = Everyone can use
  mode: 'public',

  // When in test mode, store non-whitelist messages for later review
  saveExternalMessages: true
};

// ═══════════════════════════════════════════════════════
// FIREBASE SETTINGS
// Environment Variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL
// firebase.google.com > Project Settings > Service Accounts
// ═══════════════════════════════════════════════════════
const FIREBASE = {
  // Project ID from Firebase
  projectId: process.env.FIREBASE_PROJECT_ID || '',

  // Service Account "client_email"
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',

  // Service Account "private_key" - Render pe multiline support hota hai
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',

  // Realtime Database URL
  databaseURL: process.env.FIREBASE_DATABASE_URL || ''
};

// ═══════════════════════════════════════════════════════
// APP / WEBHOOK URL (Railway/Render URL deploy ke baad)
// Environment Variable: APP_URL
// ═══════════════════════════════════════════════════════
const APP_URL = process.env.APP_URL || '';

// ═══════════════════════════════════════════════════════
// AUTOMATION SETTINGS
// ═══════════════════════════════════════════════════════
const AUTOMATION = {
  // Daily Report Time (24-hour format)
  dailyReportTime: '21:00', // 9 PM every night

  // Abandoned Cart Recovery
  abandonedCartDelay: 30 * 60 * 1000, // 30 minutes
  abandonedCartEnabled: true,

  // Auto-escalation after failed attempts
  escalationAfterAttempts: 3,
  escalationEnabled: true,

  // FB Ads Tracking
  fbTrackingEnabled: true,
  fbCampaignCodes: ['simfly_ad1', 'simfly_ad2', 'simfly_spring'],

  // Stock Alert Threshold
  stockAlertThreshold: 10, // Alert if > 10 orders in a day
  stockAlertEnabled: true,

  // Scheduled Promotions
  promotionsEnabled: true,
  promotionSchedule: [
    { time: '12:00', message: '☀️ Lunch Break Offer! Order abhi aur jaldi activate karein!' },
    { time: '21:00', message: '🌙 Raat ka Special! Aaj order karein, kal morning mein activate!' }
  ],

  // Customer Tagging
  autoTaggingEnabled: true,

  // Study Mode (Admin - reduced notifications)
  studyModeEnabled: false,
  studyModeHours: '08:00-18:00', // Admin notifications silenced during these hours

  // Auto-Backup
  autoBackupEnabled: true,
  backupTime: '23:00', // 11 PM daily

  // Conversion Recovery
  conversionRecoveryEnabled: true,
  recoveryDelay: 24 * 60 * 60 * 1000, // 24 hours
  recoveryDiscount: '10%' // Offer discount
};

// ═══════════════════════════════════════════════════════
// SIMFLY BUSINESS CONFIG v4.0 — MASTER SYSTEM
// ═══════════════════════════════════════════════════════
const BUSINESS = {
  name: 'SimFly Pakistan',
  tagline: 'Fly Free, Stay Connected',
  location: 'Pakistan',
  whatsapp: '+1 7826662232',
  email: 'simflypakistan@gmail.com',
  website: 'https://simfly.lovable.app',
  compatibilityUrl: 'https://simfly.lovable.app/compatible-devices',

  // eSIM Plans — STRICT: ONLY THESE THREE PLANS
  plans: [
    { id: 'plan_500mb', name: 'STARTER', data: '500MB', price: 130, duration: '2 YEARS', icon: '📦', popular: false, label: 'STARTER', auto: true, promoCode: 'AS48928' },
    { id: 'plan_1gb', name: 'STANDARD', data: '1GB', price: 350, duration: '2 YEARS', icon: '📦', popular: true, label: 'STANDARD', auto: true, promoCode: 'SA1GB' },
    { id: 'plan_5gb', name: 'PRO', data: '5GB', price: 1250, duration: '2 YEARS', icon: '📦', popular: false, label: 'PRO', devices: 4, auto: false, promoCode: 'FAMILY5G' }
  ],

  // Payment Methods — STRICT NUMBERS
  payments: {
    jazzcash: { number: '03456754090', name: 'JazzCash', accountName: 'SimFly Pakistan' },
    easypaisa: { number: '03466544374', name: 'EasyPaisa', accountName: 'SimFly Pakistan' },
    sadapay: { number: '03116400376', name: 'SadaPay', accountName: 'SimFly Pakistan' }
  },

  // Supported Devices
  supportedDevices: {
    ios: ['iPhone XS', 'iPhone XR', 'iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16'],
    samsung: ['Samsung S20+', 'Samsung S21+', 'Samsung S22+', 'Samsung S23+', 'Samsung S24+'],
    pixel: ['Pixel 3+', 'Pixel 4+', 'Pixel 5+', 'Pixel 6+', 'Pixel 7+', 'Pixel 8+'],
    fold: ['Fold devices', 'Flip devices']
  },

  // Not Supported
  notSupported: [
    'PTA-approved phones',
    'Budget Android',
    'iPhone X or below'
  ],

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
// EDITABLE eSIM GUIDES — Admin can edit these via commands
// ═══════════════════════════════════════════════════════
const ESIIM_GUIDES = {
  // 500MB Plan Guide - Provider hidden until after purchase
  '500MB': {
    enabled: true,
    promoCode: 'AS48928',
    provider: 'eSIM Provider',
    iosAppLink: 'Link will be provided after purchase',
    androidAppLink: 'Link will be provided after purchase',
    qrCodeData: '500MB_PLAN_QR_CODE_DATA',
    // Full guide template — sent AFTER payment
    template: `🎉 *Payment Verified! Welcome to SimFly Pakistan!*

━━━━━━━━━━━━━━━━━━━
📱 *YOUR eSIM DETAILS*
━━━━━━━━━━━━━━━━━━━
📦 Plan: {{planName}}
📊 Data: {{data}}
💰 Price: Rs. {{price}}
⏱️ Validity: {{duration}}
📱 Devices: {{devices}} Device

━━━━━━━━━━━━━━━━━━━
🔗 *APP DOWNLOAD*
━━━━━━━━━━━━━━━━━━━
📲 iOS: App Store pe "eSIM" search karein
📲 Android: Play Store pe "eSIM" search karein

━━━━━━━━━━━━━━━━━━━
🎁 *PROMO CODE*
━━━━━━━━━━━━━━━━━━━
Code: *{{promoCode}}*

━━━━━━━━━━━━━━━━━━━
📲 *ACTIVATION STEPS*
━━━━━━━━━━━━━━━━━━━

*Step 1: Download App*
➜ eSIM app download karein from app store

*Step 2: Create Account*
➜ Open app → Sign up with your number
➜ Enter promo code: *{{promoCode}}*

*Step 3: Add eSIM*
➜ Settings → Cellular/Mobile Data
➜ Tap "Add eSIM" or "Add Cellular Plan"
➜ Scan QR code OR enter details manually

*Step 4: Activate*
➜ Wait 1-2 minutes for activation
➜ You'll see signal bars 📶

*Step 5: Enable Data Roaming*
➜ Settings → Cellular → Data Roaming: ON ✅

━━━━━━━━━━━━━━━━━━━
⚠️ *IMPORTANT NOTES*
━━━━━━━━━━━━━━━━━━━
✅ Device must support eSIM
✅ iPhone XS/XR or above
✅ Data Roaming MUST be ON
✅ Activation takes 2-5 minutes
✅ QR code valid for 24 hours

━━━━━━━━━━━━━━━━━━━
❓ *NEED HELP?*
━━━━━━━━━━━━━━━━━━━
Type "support" for assistance

*Shukriya SimFly Pakistan choose karne ke liye! 🙏*`
  },

  // 1GB Plan Guide
  '1GB': {
    enabled: true,
    promoCode: 'SA1GB',
    provider: 'eSIM Provider',
    iosAppLink: 'Link will be provided after purchase',
    androidAppLink: 'Link will be provided after purchase',
    qrCodeData: '1GB_PLAN_QR_CODE_DATA',
    template: `🎉 *Payment Verified! Welcome to SimFly Pakistan!*

━━━━━━━━━━━━━━━━━━━
📱 *YOUR eSIM DETAILS*
━━━━━━━━━━━━━━━━━━━
📦 Plan: {{planName}} (MOST POPULAR) 🔥
📊 Data: {{data}}
💰 Price: Rs. {{price}}
⏱️ Validity: {{duration}}
📱 Devices: {{devices}} Device

━━━━━━━━━━━━━━━━━━━
🔗 *{{provider}} APP DOWNLOAD*
━━━━━━━━━━━━━━━━━━━
📲 iOS: {{iosLink}}
📲 Android: {{androidLink}}

━━━━━━━━━━━━━━━━━━━
🎁 *PROMO CODE*
━━━━━━━━━━━━━━━━━━━
Code: *{{promoCode}}*

━━━━━━━━━━━━━━━━━━━
📲 *ACTIVATION STEPS*
━━━━━━━━━━━━━━━━━━━

*Step 1: Download App*
➜ Download {{provider}} App from above links

*Step 2: Create Account*
➜ Open app → Sign up with your number
➜ Enter promo code: *{{promoCode}}*

*Step 3: Add eSIM*
➜ Settings → Cellular/Mobile Data
➜ Tap "Add eSIM" or "Add Cellular Plan"
➜ Scan QR code OR enter details manually

*Step 4: Activate*
➜ Wait 1-2 minutes for activation
➜ You'll see signal bars 📶

*Step 5: Enable Data Roaming*
➜ Settings → Cellular → Data Roaming: ON ✅

━━━━━━━━━━━━━━━━━━━
⚠️ *IMPORTANT NOTES*
━━━━━━━━━━━━━━━━━━━
✅ Device must be Non-PTA
✅ iPhone XS/XR or above
✅ Data Roaming MUST be ON
✅ Activation takes 2-5 minutes

━━━━━━━━━━━━━━━━━━━
❓ *NEED HELP?*
━━━━━━━━━━━━━━━━━━━
Type "support" for assistance

*Shukriya SimFly Pakistan choose karne ke liye! 🙏*`
  },

  // 5GB Plan Guide (Manual - Admin sends)
  '5GB': {
    enabled: true,
    promoCode: 'FAMILY5G',
    provider: 'eSIM Provider',
    iosAppLink: 'Link will be provided after purchase',
    androidAppLink: 'Link will be provided after purchase',
    qrCodeData: '5GB_PLAN_QR_CODE_DATA',
    manualSend: true, // Admin must manually send this
    template: `🎉 *Payment Verified! Welcome to SimFly Pakistan!*

━━━━━━━━━━━━━━━━━━━
📱 *YOUR eSIM DETAILS*
━━━━━━━━━━━━━━━━━━━
📦 Plan: {{planName}} (FAMILY PACK) 💎
📊 Data: {{data}}
💰 Price: Rs. {{price}}
⏱️ Validity: {{duration}}
📱 Devices: {{devices}} Devices (Simultaneous)

━━━━━━━━━━━━━━━━━━━
🔗 *{{provider}} APP DOWNLOAD*
━━━━━━━━━━━━━━━━━━━
📲 iOS: {{iosLink}}
📲 Android: {{androidLink}}

━━━━━━━━━━━━━━━━━━━
🎁 *PROMO CODE*
━━━━━━━━━━━━━━━━━━━
Code: *{{promoCode}}*

━━━━━━━━━━━━━━━━━━━
📲 *ACTIVATION STEPS*
━━━━━━━━━━━━━━━━━━━

*Step 1: Download App*
➜ Download {{provider}} App on all 4 devices

*Step 2: Create Account*
➜ Same account se login karein sab devices pe
➜ Enter promo code: *{{promoCode}}*

*Step 3: Add eSIM on Each Device*
➜ Settings → Cellular → Add eSIM
➜ Scan QR code OR enter details manually

*Step 4: Activate*
➜ Sab devices pe 1-2 min wait karein

*Step 5: Enable Data Roaming*
➜ Settings → Cellular → Data Roaming: ON ✅

━━━━━━━━━━━━━━━━━━━
⚠️ *IMPORTANT NOTES*
━━━━━━━━━━━━━━━━━━━
✅ 4 devices simultaneously use kar sakte hain
✅ Same promo code works on all devices
✅ Data Roaming MUST be ON
✅ Device must be Non-PTA

━━━━━━━━━━━━━━━━━━━
❓ *NEED HELP?*
━━━━━━━━━━━━━━━━━━━
Type "support" for assistance

*Shukriya SimFly Pakistan choose karne ke liye! 🙏*`
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
// AI SYSTEM PROMPT v4.0 — SIMFLY OS MASTER SYSTEM
// ═══════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are SimFly OS, a smart, calm, and human-like WhatsApp assistant for SimFly Pakistan.

🎯 CORE BEHAVIOR RULES:
✅ Calm, clean, not rushed
✅ Short but complete replies
✅ Always 1 message only
✅ No unnecessary info
✅ No robotic replies
✅ Think → then reply

🗣️ LANGUAGE:
- Speak in natural Hinglish (Roman Urdu + English)
- Like a professional Pakistani sales rep
- Use "bhai", "sir", "janab" naturally where appropriate

🏢 BUSINESS IDENTITY:
Name: SimFly Pakistan
Tagline: Fly Free, Stay Connected
WhatsApp: +1 7826662232
Email: simflypakistan@gmail.com
Website: simfly.lovable.app

📦 STRICT PLANS (ONLY THESE THREE):
1. STARTER: 500MB - Rs 130 - Validity: 2 YEARS - Delivery: Auto
2. STANDARD: 1GB - Rs 350 - Validity: 2 YEARS - Delivery: Auto
3. PRO: 5GB - Rs 1,250 - Validity: 2 YEARS - Delivery: Manual

❗ Never show any other plan.

📱 DEVICE COMPATIBILITY:
✅ Works on: iPhone XS+, Samsung S20+, Pixel 3+, Fold/Flip
❌ Not supported: PTA-approved phones, Budget Android, iPhone X or below

💰 PAYMENT DETAILS:
JazzCash: 03456754090
EasyPaisa: 03466544374
SadaPay: 03116400376

🤖 ACTIVATION GUIDES:
500MB Code: AS48928
1GB Code: SA1GB
5GB Code: FAMILY5G

⚠️ IMPORTANT NOTES:
- Validity ALWAYS mention: 2 YEARS
- Keep guides clean, not messy
- Provider details hidden until after purchase

💸 REFUND RULES:
✅ Allowed: Not activated, Wrong delivery, System issue
❌ Not allowed: Used, Wrong device, Data finished

🔐 STRICT SECURITY:
Never reveal: Supplier, Backend, APIs, Admin number, AI system details

📋 CONVERSATION FLOW:
NEW CUSTOMER:
"Assalam-o-Alaikum! SimFly Pakistan mein khush aamdeed 🇵🇰

Aap kya karna chahte hain?
1️⃣ Plans dekhna
2️⃣ Device check
3️⃣ eSIM info
4️⃣ Buy karna"

PAYMENT RECEIVED:
"Shukriya! Payment verify ho rahi hai. 2 minute mein guide bhejta hoon."

WHEN CONFUSED:
"Main check karke batata hoon" (escalate to admin)

FOLLOW-UP (after 24h):
"Aapka eSIM theek chal raha hai? 😊"

❌ NEVER:
- Use multiple messages for one reply
- Send long paragraphs
- Sound robotic or scripted
- Be pushy for sales
- Ignore customer's actual question`;

// ═══════════════════════════════════════════════════════
// FIREBASE COLLECTIONS SCHEMA v4.0
// ═══════════════════════════════════════════════════════
const CUSTOMER_SCHEMA = {
  chatId: 'string',
  name: 'string',           // Customer name
  device: 'string',         // Device model
  deviceCompatible: 'boolean',
  isJV: 'boolean',          // SIM Locked
  firstSeen: 'timestamp',
  lastSeen: 'timestamp',
  messageCount: 'number',
  purchased: 'boolean',
  planType: 'string',       // Which plan they bought
  errors: 'array',          // Any errors they faced
  source: 'string'          // 'instagram', 'facebook', 'organic'
};

// ═══════════════════════════════════════════════════════
// KEYWORD RESPONSES (Template-based, AI ke baghair bhi chalay)
// ═══════════════════════════════════════════════════════
const KEYWORD_RESPONSES = {
  greeting: {
    keywords: ['hi', 'hello', 'assalam', 'salam', 'hey', 'aoa', 'aslam', 'start'],
    responses: [
      `Assalam-o-Alaikum bhai! ❤️ SimFly Pakistan mein khush amdeed!\n\nAapka device kaunsa hai?\n\n📱 *iPhone XS/XR*\n📱 *iPhone 11/12*\n📱 *iPhone 13/14*\n📱 *iPhone 15/16*\n📱 *Samsung S20+*\n📱 *Google Pixel 4+*\n\nModel batain taake compatibility check kar sakon! 👍`,
      `Welcome bhai! ❤️ SimFly Pakistan here!\n\nAapka phone kaunsa model hai? Check kar ke batata hoon ke eSIM support karti hai ya nahi! 📱`,
      `Salam bhai! ❤️\n\nKaunsa device use kar rahe hain? iPhone XS+ ya Samsung S20+ required hai for eSIM.\n\nAapka model batain! 👍`
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
    keywords: ['iphone', 'samsung', 'pixel', 'mobile', 'phone', 'device', 'model', 'xs', 'xr', '11', '12', '13', '14', '15'],
    responses: [
      `✅ *SUPPORTED DEVICES:*\n\n📱 iPhone XS/XR and above\n📱 iPhone 11/12/13/14/15/16\n📱 Samsung S20/S21/S22/S23/S24\n📱 Google Pixel 4+\n\n⚠️ *Non-PTA required!*\n⚠️ *JV iPhone XS+ pe work karti hai (500MB trial recommended)*\n\nAapka kaunsa model hai bhai? ❤️`,
      `Bhai device check kar lein:\n\n✅ iPhone XS/XR se upar\n✅ Samsung S20+\n✅ Pixel 4+\n✅ Non-PTA hona chahiye\n\nAapka model batain! ❤️`
    ]
  },

  returning: {
    keywords: ['problem', 'issue', 'masla', 'error', 'nahi chal', 'not working', 'stuck', 'failed', 'help'],
    responses: [
      `Welcome back bhai! ❤️ Kaunsa error aa raha hai? Bataein detail mein taake help kar sakon! 🙏`,
      `Bhai, kya issue aa raha hai? ❤️ Detail mein batain:\n\n• Phone model?\n• Konsa step pe problem hai?\n• Screenshot bhejein agar ho sake\n\nHelp kar sakta hoon! 👍`,
      `Issue samajh sakta hoon bhai! ❤️\n\nKaunsa error aa raha hai?\n\n1️⃣ QR scan nahi ho raha?\n2️⃣ Activation fail ho raha?\n3️⃣ Signal nahi aa rahe?\n4️⃣ Kuch aur?\n\nBataein! 🙏`
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
  AUTOMATION,
  TEST_BOARD,
  BOT_MODE,

  // Gemini AI Config
  GEMINI_APIS,
  GEMINI_API_KEYS,

  // Content
  SYSTEM_PROMPT,
  KEYWORD_RESPONSES,
  ESIIM_GUIDES,

  // Settings
  DB_CONFIG,
  PUPPETEER_CONFIG,

  // Helpers
  isGroqEnabled: () => GROQ_API_KEY && GROQ_API_KEY.length > 10,
  isFirebaseEnabled: () => FIREBASE && FIREBASE.projectId && FIREBASE.privateKey,
  isGeminiEnabled: () => GEMINI_API_KEYS.some(key => key && key.length > 10 && !key.includes('YOUR_GEMINI'))
};

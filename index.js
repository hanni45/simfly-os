/**
 * ═══════════════════════════════════════════════════════
 * SIMFLY OS v4.0 — MASTER PRODUCTION BUILD
 * WhatsApp Sales Bot for SimFly Pakistan (eSIM Provider)
 * July 2026 Release — Final Production Build
 * ═══════════════════════════════════════════════════════
 *
 * 🤖 AI System:
 *    • Primary Chat: Groq (llama-3.3-70b-versatile)
 *    • Media Analysis: Gemini (10-key rotation)
 *
 * 🔥 Database: Firebase Realtime
 * 📱 WhatsApp: whatsapp-web.js
 * 🌐 Dashboard: Railway-hosted
 * ═══════════════════════════════════════════════════════
 */

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const axios = require('axios');

// Import all configuration from config.js
const {
    GROQ_API_KEY,
    GROQ_MODEL,
    GEMINI_API_KEYS,
    ADMIN_NUMBER,
    FIREBASE,
    APP_URL,
    BUSINESS,
    BOT_CONFIG,
    AUTOMATION,
    ANALYTICS,
    MARKETING,
    SECURITY,
    ADMIN_TOOLS,
    INVENTORY,
    RETENTION,
    SYSTEM_PROMPT,
    KEYWORD_RESPONSES,
    DB_CONFIG,
    PUPPETEER_CONFIG,
    ESIIM_GUIDES,
    TEST_BOARD,
    BOT_MODE,
    isGroqEnabled,
    isFirebaseEnabled,
    isGeminiEnabled
} = require('./config');

// ═══════════════════════════════════════════════════════
// 🔧 STARTUP CONFIGURATION CHECK
// ═══════════════════════════════════════════════════════
console.log('🔧 SimFly OS Configuration Check:');
console.log('═══════════════════════════════════');
console.log(`📱 ADMIN_NUMBER: ${ADMIN_NUMBER ? '✓ Set' : '✗ NOT SET'}`);
console.log(`🤖 GROQ_API_KEY: ${GROQ_API_KEY && GROQ_API_KEY.length > 10 ? '✓ Set (' + GROQ_API_KEY.slice(0, 10) + '...)' : '✗ NOT SET'}`);
console.log(`🔑 GEMINI_API_KEYS: ${GEMINI_API_KEYS.length} keys configured`);
console.log(`🔥 FIREBASE: ${isFirebaseEnabled() ? '✓ Enabled' : '✗ Disabled'}`);
console.log(`🌐 APP_URL: ${APP_URL || 'Not set'}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════
// WHITELIST / PRIVATE MODE HELPERS
// ═══════════════════════════════════════════════════════
function isWhitelisted(chatId) {
    if (!TEST_BOARD.enabled) return true;
    const number = chatId.replace(/\D/g, '');
    return TEST_BOARD.whitelist.some(w => number.includes(w) || w.includes(number));
}

function isAdmin(chatId) {
    return chatId.includes(ADMIN_NUMBER.replace(/\D/g, ''));
}

// Shutdown control
let shutdownRequested = false;

// ═══════════════════════════════════════════════════════
// CUSTOM GUIDES STORAGE — Admin editable guides (stored in memory + file)
// ═══════════════════════════════════════════════════════
let customGuides = {};
const GUIDES_FILE = './data/custom_guides.json';

// Load custom guides from file on startup
function loadCustomGuides() {
    try {
        if (fs.existsSync(GUIDES_FILE)) {
            const data = fs.readFileSync(GUIDES_FILE, 'utf8');
            customGuides = JSON.parse(data);
            if (typeof log === 'function') log('Custom guides loaded from file', 'info');
        } else {
            // Initialize with default guides
            customGuides = JSON.parse(JSON.stringify(ESIIM_GUIDES));
            saveCustomGuidesInternal();
        }
    } catch (e) {
        if (typeof log === 'function') log('Error loading custom guides: ' + e.message, 'error');
        customGuides = JSON.parse(JSON.stringify(ESIIM_GUIDES));
    }
}

// Internal save function (no logging)
function saveCustomGuidesInternal() {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(GUIDES_FILE, JSON.stringify(customGuides, null, 2));
    } catch (e) {
        // Silent fail
    }
}

// Save custom guides to file
function saveCustomGuides() {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(GUIDES_FILE, JSON.stringify(customGuides, null, 2));
    } catch (e) {
        if (typeof log === 'function') log('Error saving custom guides: ' + e.message, 'error');
    }
}

// Get guide (custom or default)
function getGuide(planType) {
    return customGuides[planType] || ESIIM_GUIDES[planType] || null;
}

// Update guide field
function updateGuide(planType, field, value) {
    if (!customGuides[planType]) {
        customGuides[planType] = JSON.parse(JSON.stringify(ESIIM_GUIDES[planType] || {}));
    }
    customGuides[planType][field] = value;
    saveCustomGuidesInternal();
    return true;
}

// ═══════════════════════════════════════════════════════
// 🤖 HUMAN-LIKE CONVERSATION SYSTEM — 30 Features
// ═══════════════════════════════════════════════════════

// Feature 1,2,3: Typing Speed Variation + Random Delays + Thinking Status
const HUMAN_CONFIG = {
    enabled: true,
    baseTypingSpeed: 30, // ms per character
    typingVariation: 0.4, // ±40% variation
    minDelay: 500, // minimum response delay
    maxDelay: 8000, // maximum response delay
    messageBreakupThreshold: 400, // characters
    breakupDelay: 2000, // delay between message parts
    typoChance: 0.08, // 8% chance of typo
    emojiFrequency: 0.6, // 60% of messages have emojis
    silentHoursStart: 1, // 1 AM
    silentHoursEnd: 7, // 7 AM
    casualPhrases: ['yar', 'bhai', 'acha', 'hmm', 'dekho', 'sunain', 'theek hai', 'koi baat nahi'],
    pakistaniSlang: ['Jazbaati na ho', 'Chill karein', 'Masla nahi', 'Baat sunain', 'Ho jayega'],
    nameAskThreshold: 3 // Ask name after 3 messages
};

// Feature 5: Intentional Typos Dictionary
const TYPO_DICTIONARY = {
    'haan': ['han', 'haan', 'hn'],
    'bhejo': ['bhej', 'bhejo', 'bhejein'],
    'theek': ['theek', 'tek', 'tik'],
    'main': ['mein', 'main', 'mn'],
    'aap': ['ap', 'aap', 'aapko'],
    'kya': ['kya', 'kia', 'ka'],
    'hai': ['hai', 'he', 'hy'],
    'nahi': ['nahi', 'nai', 'nh'],
    'bhai': ['bhai', 'bhaijan', 'bhae'],
    'jaldi': ['jaldi', 'jld', 'jldi']
};

// Feature 10,11: User Profile & Context Memory
const userProfiles = new Map();
const conversationMemory = new Map();
const messageHistory = new Map(); // For repeat detection

// Feature 12: Purchase Stage Tracking
const PURCHASE_STAGES = {
    NEW: 'new',
    GREETED: 'greeted',
    DEVICE_CHECK: 'device_check',
    PLAN_VIEW: 'plan_view',
    PRICE_INQUIRY: 'price_inquiry',
    PAYMENT_PENDING: 'payment_pending',
    PAYMENT_SENT: 'payment_sent',
    PURCHASED: 'purchased',
    POST_PURCHASE: 'post_purchase',
    SUPPORT: 'support'
};

// Feature 14: User Profile Builder
class UserProfile {
    constructor(chatId) {
        this.chatId = chatId;
        this.name = null;
        this.device = null;
        this.deviceCompatible = null;
        this.location = null;
        this.preferredPlan = null;
        this.purchaseStage = PURCHASE_STAGES.NEW;
        this.messageCount = 0;
        this.firstSeen = Date.now();
        this.lastSeen = Date.now();
        this.conversationHistory = [];
        this.mood = 'neutral'; // happy, frustrated, confused, urgent
        this.sentiment = 0; // -10 to +10
        this.urgency = 0; // 0-10
        this.paymentIntent = 0; // 0-100
        this.languageStyle = 'mixed'; // urdu, english, mixed
        this.lastGreeting = null;
        this.abandonedCartTime = null;
        this.questionsAsked = new Set();
        this.imagesSent = []; // Feature 26: Image context memory
        this.typoStyle = Math.random() > 0.5; // Some users get more typos
    }

    updateMood(message) {
        const lower = message.toLowerCase();

        // Feature 11: Mood Detection
        if (lower.match(/jaldi|urgent|kal chalna|aaj chahiye|emergency/)) {
            this.mood = 'urgent';
            this.urgency = 8;
        } else if (lower.match(/problem|masla|error|nahi chal|issue/)) {
            this.mood = 'frustrated';
            this.sentiment -= 2;
        } else if (lower.match(/shukriya|thanks|jazakallah|nice|great/)) {
            this.mood = 'happy';
            this.sentiment += 2;
        } else if (lower.match(/samajh nahi|confused|kya karna|kaise/)) {
            this.mood = 'confused';
        }

        // Feature 20: Payment Intent Scoring
        if (lower.match(/buy|purchase|order|lena hai|book|payment/)) this.paymentIntent += 20;
        if (lower.match(/price|kitne|cost|rate/)) this.paymentIntent += 10;
        if (lower.match(/device|iphone|samsung/)) this.paymentIntent += 5;
        if (lower.match(/screenshot bheja|payment kar|transfer/)) this.paymentIntent += 30;

        // Cap values
        this.sentiment = Math.max(-10, Math.min(10, this.sentiment));
        this.urgency = Math.max(0, Math.min(10, this.urgency));
        this.paymentIntent = Math.max(0, Math.min(100, this.paymentIntent));
    }

    detectLanguageStyle(message) {
        const urduWords = /(hai|kya|kaise|nahi|acha|theek|shukriya|bhai|aap)/gi;
        const englishWords = /(what|how|why|when|where|is|are|do|does|can|will)/gi;

        const urduCount = (message.match(urduWords) || []).length;
        const englishCount = (message.match(englishWords) || []).length;

        if (urduCount > englishCount * 2) this.languageStyle = 'urdu';
        else if (englishCount > urduCount * 2) this.languageStyle = 'english';
        else this.languageStyle = 'mixed';
    }

    getGreeting() {
        const hour = new Date().getHours();
        const isFirstToday = !this.lastGreeting || (Date.now() - this.lastGreeting) > 86400000;

        // Feature 22: Custom Greetings
        if (isFirstToday) {
            this.lastGreeting = Date.now();
            if (hour < 12) return this.name ? `Assalam-o-Alaikum ${this.name} bhai! 🌅` : 'Assalam-o-Alaikum! 🌅';
            if (hour < 17) return this.name ? `Assalam-o-Alaikum ${this.name} bhai! ☀️` : 'Assalam-o-Alaikum! ☀️';
            return this.name ? `Assalam-o-Alaikum ${this.name} bhai! 🌙` : 'Assalam-o-Alaikum! 🌙';
        }
        return null;
    }
}

// Feature 9: Name Memory
function getUserProfile(chatId) {
    if (!userProfiles.has(chatId)) {
        userProfiles.set(chatId, new UserProfile(chatId));
    }
    return userProfiles.get(chatId);
}

// Helper for repeat detection - get last bot answer
function getLastAnswer(chatId) {
    const history = messageHistory.get(chatId);
    if (history && history.length > 0) {
        return history[history.length - 1];
    }
    return null;
}

// Feature 4: Message Breakup
function splitMessage(message) {
    if (message.length <= HUMAN_CONFIG.messageBreakupThreshold) return [message];

    // Split at natural boundaries
    const parts = [];
    let current = '';
    const sentences = message.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
        if ((current + sentence).length > HUMAN_CONFIG.messageBreakupThreshold && current.length > 100) {
            parts.push(current.trim());
            current = sentence;
        } else {
            current += ' ' + sentence;
        }
    }
    if (current.trim()) parts.push(current.trim());

    return parts;
}

// Feature 5: Add Intentional Typos
function addHumanTypos(text, profile) {
    if (!profile.typoStyle) return text;
    if (Math.random() > HUMAN_CONFIG.typoChance) return text;

    let result = text;
    for (const [correct, variants] of Object.entries(TYPO_DICTIONARY)) {
        const regex = new RegExp(`\\b${correct}\\b`, 'gi');
        if (regex.test(result) && Math.random() < 0.3) {
            const typo = variants[Math.floor(Math.random() * variants.length)];
            result = result.replace(regex, typo);
        }
    }
    return result;
}

// Feature 6: Casual Language Insertion
function addCasualLanguage(text, profile) {
    const casual = HUMAN_CONFIG.casualPhrases;
    const slang = HUMAN_CONFIG.pakistaniSlang;

    // Add at beginning occasionally
    if (Math.random() < 0.3 && !text.startsWith('Assalam')) {
        const phrase = casual[Math.floor(Math.random() * casual.length)];
        text = `${phrase}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    // Add slang occasionally
    if (Math.random() < 0.15 && profile.mood === 'frustrated') {
        const phrase = slang[Math.floor(Math.random() * slang.length)];
        text += ` ${phrase} 😊`;
    }

    return text;
}

// Feature 7: Emoji Pattern (not every message)
function controlEmojis(text) {
    if (Math.random() > HUMAN_CONFIG.emojiFrequency) {
        // Remove emojis
        return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
    }
    return text;
}

// Feature 8: Previous Chat Memory
async function getPreviousContext(chatId, profile) {
    const history = await getHistory(chatId);
    const lastConversation = history.filter(m => Date.now() - m.time < 86400000); // Last 24h

    if (lastConversation.length > 0 && profile.messageCount === 1) {
        const lastTopic = lastConversation[lastConversation.length - 1].body;
        if (lastTopic.includes('device') && profile.device) {
            return `Waise aapka ${profile.device} ka issue solve hogaya?`;
        }
        if (lastTopic.includes('plan') && profile.preferredPlan) {
            return `Waise ${profile.preferredPlan} plan ke bare mein socha?`;
        }
    }
    return null;
}

// Feature 17: Silent Hours Check
function isSilentHours() {
    const hour = new Date().getHours();
    return hour >= HUMAN_CONFIG.silentHoursStart && hour < HUMAN_CONFIG.silentHoursEnd;
}

// Feature 18: Repeat Question Detection
function isRepeatQuestion(chatId, question) {
    const history = messageHistory.get(chatId) || [];
    const normalized = question.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const prev of history.slice(-10)) {
        const prevNormalized = prev.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalized === prevNormalized || (normalized.length > 10 && prevNormalized.includes(normalized.substring(0, 10)))) {
            return true;
        }
    }

    // Add to history
    history.push(question);
    if (history.length > 20) history.shift();
    messageHistory.set(chatId, history);

    return false;
}

// Feature 19: Abandoned Cart Recovery
async function checkAbandonedCart() {
    for (const [chatId, profile] of userProfiles) {
        if (profile.purchaseStage === PURCHASE_STAGES.PLAN_VIEW &&
            profile.abandonedCartTime &&
            Date.now() - profile.abandonedCartTime > 2 * 60 * 60 * 1000) { // 2 hours

            if (client && client.sendMessage) {
                await client.sendMessage(chatId, `${profile.name || 'Bhai'}, aapne ${profile.preferredPlan || 'plan'} dekha tha. Koi sawal hai toh pooch sakte hain! 🤔`);
                profile.abandonedCartTime = null; // Reset
            }
        }
    }
}

// Feature 23: Contextual Follow-ups
function getContextualFollowup(profile) {
    if (profile.purchaseStage === PURCHASE_STAGES.PLAN_VIEW && profile.paymentIntent > 30) {
        return `Aapne ${profile.preferredPlan || 'plan'} dekha tha, soch lia?`;
    }
    if (profile.purchaseStage === PURCHASE_STAGES.PAYMENT_PENDING) {
        return `Bhai, payment verification ho gaya hai. Guide chahiye toh "guide" likhein!`;
    }
    return null;
}

// Feature 25: Plan Recommendations
function getPlanRecommendation(profile) {
    if (profile.device && profile.device.includes('iPhone')) {
        if (profile.device.match(/14|15|16/)) return '1GB';
        return '500MB';
    }
    if (profile.device && profile.device.includes('Samsung')) {
        return '1GB';
    }
    return '500MB';
}

// Feature 28: Multi-Turn Reasoning
async function analyzeConversationDeep(chatId, profile, currentMessage) {
    const history = await getHistory(chatId);
    const recentMessages = history.slice(-5).map(m => m.body);

    // Detect patterns across multiple messages
    const allText = recentMessages.join(' ').toLowerCase();

    if (allText.includes('price') && allText.includes('device') && !profile.preferredPlan) {
        return { insight: 'user_comparing', action: 'show_comparison' };
    }

    if (allText.includes('problem') && allText.includes('again')) {
        return { insight: 'recurring_issue', action: 'escalate' };
    }

    if (profile.paymentIntent > 60 && profile.purchaseStage === PURCHASE_STAGES.PRICE_INQUIRY) {
        return { insight: 'ready_to_buy', action: 'push_payment' };
    }

    return { insight: 'none', action: 'normal' };
}

// Feature 29: Personality Adaptation
function adaptTone(profile, response) {
    if (profile.languageStyle === 'urdu') {
        // More Urdu words
        response = response.replace(/\bis\b/gi, 'hai').replace(/\bwhat\b/gi, 'kya');
    }

    if (profile.mood === 'frustrated') {
        response = `Bhai, ${response} Masla nahi, solve kar dete hain! 💪`;
    }

    if (profile.mood === 'urgent') {
        response = `Jaldi karte hain! ${response}`;
    }

    return response;
}

// Feature 30: Sentiment Analysis Auto-Escalation
function shouldEscalate(profile) {
    return profile.sentiment < -5 || profile.urgency > 7 || profile.mood === 'frustrated';
}

// ═══════════════════════════════════════════════════════
// 📊 ANALYTICS & INSIGHTS SYSTEM v4.0
// ═══════════════════════════════════════════════════════

// Analytics Data Storage
const analyticsData = {
    hourlyActivity: new Array(24).fill(0),
    sourceBreakdown: {},
    funnelData: {},
    topCustomers: [],
    dailyStats: {
        date: new Date().toDateString(),
        totalMessages: 0,
        orders: 0,
        revenue: 0,
        conversions: 0
    }
};

// Track customer source
function trackCustomerSource(chatId, source) {
    if (!ANALYTICS.trackPeakHours) return;
    const profile = getUserProfile(chatId);
    if (!profile.source) {
        profile.source = source || 'organic';
        analyticsData.sourceBreakdown[source] = (analyticsData.sourceBreakdown[source] || 0) + 1;
    }
}

// Track peak hours
function trackPeakHour() {
    if (!ANALYTICS.trackPeakHours) return;
    const hour = new Date().getHours();
    analyticsData.hourlyActivity[hour]++;
}

// Track funnel stage
function trackFunnelStage(chatId, stage) {
    if (!ANALYTICS.funnelStages.includes(stage)) return;
    analyticsData.funnelData[stage] = (analyticsData.funnelData[stage] || 0) + 1;
}

// Generate daily report
function generateDailyReport() {
    const hour = new Date().getHours();
    if (hour !== 21) return null; // Only at 9 PM

    const peakHour = analyticsData.hourlyActivity.indexOf(Math.max(...analyticsData.hourlyActivity));
    const topSource = Object.entries(analyticsData.sourceBreakdown)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return `📊 *DAILY REPORT*

💬 Total Messages: ${analyticsData.dailyStats.totalMessages}
🛒 Orders Today: ${analyticsData.dailyStats.orders}
💰 Revenue: Rs ${analyticsData.dailyStats.revenue}
📈 Conversions: ${analyticsData.dailyStats.conversions}

⏰ Peak Hour: ${peakHour}:00
📱 Top Source: ${topSource}

📊 Funnel:
${Object.entries(analyticsData.funnelData).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`;
}

// ═══════════════════════════════════════════════════════
// 🎯 MARKETING AUTOMATION SYSTEM v4.0
// ═══════════════════════════════════════════════════════

// Referral System
const referralCodes = new Map();
const referralRewards = new Map();

function generateReferralCode(chatId) {
    if (!MARKETING.referral.enabled) return null;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    referralCodes.set(code, { referrer: chatId, used: false });
    return code;
}

function processReferral(code, newCustomerChatId) {
    if (!MARKETING.referral.enabled) return false;
    const referral = referralCodes.get(code);
    if (!referral || referral.used) return false;

    referral.used = true;
    referralRewards.set(referral.referrer, (referralRewards.get(referral.referrer) || 0) + MARKETING.referral.rewardAmount);
    return true;
}

// Abandoned Cart Recovery
const abandonedCarts = new Map();

function trackAbandonedCart(chatId, planType) {
    if (!MARKETING.abandonedCart.enabled) return;
    abandonedCarts.set(chatId, {
        plan: planType,
        timestamp: Date.now(),
        remindersSent: 0
    });
}

function checkAbandonedCarts() {
    if (!MARKETING.abandonedCart.enabled) return [];
    const now = Date.now();
    const toRemind = [];

    for (const [chatId, data] of abandonedCarts) {
        if (data.remindersSent < MARKETING.abandonedCart.maxReminders &&
            now - data.timestamp > MARKETING.abandonedCart.delay) {
            toRemind.push({ chatId, plan: data.plan });
            data.remindersSent++;
            data.timestamp = now;
        }
    }
    return toRemind;
}

// Loyalty Program
function getLoyaltyTier(ordersCount) {
    if (!MARKETING.loyalty.enabled) return null;
    for (let i = MARKETING.loyalty.tiers.length - 1; i >= 0; i--) {
        if (ordersCount >= MARKETING.loyalty.tiers[i].orders) {
            return MARKETING.loyalty.tiers[i];
        }
    }
    return MARKETING.loyalty.tiers[0];
}

function calculateLoyaltyDiscount(ordersCount) {
    const tier = getLoyaltyTier(ordersCount);
    return tier ? tier.discount : 0;
}

// ═══════════════════════════════════════════════════════
// 🛡️ SECURITY & ANTI-FRAUD SYSTEM v4.0
// ═══════════════════════════════════════════════════════

// Screenshot Hash Storage
const processedScreenshots = new Set();
const messageHistory = new Map(); // chatId -> [{ message, timestamp }]
const failedAttempts = new Map();
const blacklist = new Set();

// Duplicate Detection (simplified hash)
function generateImageHash(imageData) {
    if (!SECURITY.duplicateDetection.enabled) return null;
    // Simple hash - first 100 chars of base64
    return imageData.substring(0, 100);
}

function isDuplicateScreenshot(imageData) {
    if (!SECURITY.duplicateDetection.enabled) return false;
    const hash = generateImageHash(imageData);
    if (processedScreenshots.has(hash)) return true;
    processedScreenshots.add(hash);
    return false;
}

// Spam Protection
function checkSpam(chatId, message) {
    if (!SECURITY.spamProtection.enabled) return { isSpam: false };

    const now = Date.now();
    const history = messageHistory.get(chatId) || [];

    // Clean old messages (older than 1 minute)
    const recentMessages = history.filter(m => now - m.timestamp < 60000);

    // Check rate
    if (recentMessages.length >= SECURITY.spamProtection.maxMessagesPerMinute) {
        return { isSpam: true, reason: 'rate_limit' };
    }

    // Check for similar messages
    const similarCount = recentMessages.filter(m =>
        similarity(m.message, message) > SECURITY.spamProtection.similarMessageThreshold
    ).length;

    if (similarCount >= 3) {
        return { isSpam: true, reason: 'duplicate_content' };
    }

    recentMessages.push({ message, timestamp: now });
    messageHistory.set(chatId, recentMessages);

    return { isSpam: false };
}

function similarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const distance = editDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

function editDistance(str1, str2) {
    const costs = [];
    for (let i = 0; i <= str1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= str2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (str1[i - 1] !== str2[j - 1])
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[str2.length] = lastValue;
    }
    return costs[str2.length];
}

// Suspicious Activity Detection
function trackFailedPayment(chatId) {
    if (!SECURITY.suspiciousActivity.enabled) return;
    const attempts = (failedAttempts.get(chatId) || 0) + 1;
    failedAttempts.set(chatId, attempts);

    if (attempts >= SECURITY.suspiciousActivity.maxFailedPayments) {
        return { suspicious: true, reason: 'multiple_failed_payments', attempts };
    }
    return { suspicious: false };
}

// Blacklist System
function isBlacklisted(chatId) {
    if (!SECURITY.blacklist.enabled) return false;
    return blacklist.has(chatId);
}

function addToBlacklist(chatId, reason) {
    if (!SECURITY.blacklist.enabled) return;
    blacklist.add(chatId);
    log(`Blacklisted ${chatId}: ${reason}`, 'warn');
}

// ═══════════════════════════════════════════════════════
// 🔧 ADMIN TOOLS SYSTEM v4.0
// ═══════════════════════════════════════════════════════

// Customer Notes
const customerNotes = new Map();

function addCustomerNote(chatId, note, category = 'general') {
    if (!ADMIN_TOOLS.customerNotes.enabled) return false;
    if (note.length > ADMIN_TOOLS.customerNotes.maxLength) return false;

    const notes = customerNotes.get(chatId) || [];
    notes.push({ note, category, timestamp: Date.now(), author: 'admin' });
    customerNotes.set(chatId, notes);
    return true;
}

function getCustomerNotes(chatId) {
    return customerNotes.get(chatId) || [];
}

// Quick Replies
function getQuickReply(key) {
    if (!ADMIN_TOOLS.quickReplies.enabled) return null;
    return ADMIN_TOOLS.quickReplies.templates.find(t => t.key === key)?.message || null;
}

// Broadcast System
const broadcastQueue = [];
let broadcastInProgress = false;

async function sendBroadcast(message, segment = 'all') {
    if (!ADMIN_TOOLS.broadcast.enabled) return { sent: 0, failed: 0 };

    let targets = [];
    for (const [chatId, profile] of userProfiles) {
        if (segment === 'all') targets.push(chatId);
        else if (segment === 'purchased' && profile.purchased) targets.push(chatId);
        else if (segment === 'not_purchased' && !profile.purchased) targets.push(chatId);
    }

    let sent = 0, failed = 0;
    for (const chatId of targets) {
        try {
            await client.sendMessage(chatId, message);
            sent++;
            await delay(60000 / ADMIN_TOOLS.broadcast.rateLimit); // Rate limiting
        } catch (e) {
            failed++;
        }
    }
    return { sent, failed };
}

// Export Data
function exportCustomerData(format = 'json') {
    if (!ADMIN_TOOLS.export.enabled) return null;

    const data = [];
    for (const [chatId, profile] of userProfiles) {
        data.push({
            chatId,
            name: profile.name,
            device: profile.device,
            purchased: profile.purchased,
            planType: profile.preferredPlan,
            firstSeen: profile.firstSeen,
            lastSeen: profile.lastSeen,
            notes: getCustomerNotes(chatId)
        });
    }

    if (format === 'csv') {
        const headers = ['chatId', 'name', 'device', 'purchased', 'planType', 'firstSeen', 'lastSeen'];
        const csv = [headers.join(','), ...data.map(row =>
            headers.map(h => JSON.stringify(row[h] || '')).join(',')
        )].join('\n');
        return csv;
    }

    return JSON.stringify(data, null, 2);
}

// ═══════════════════════════════════════════════════════
// 📦 INVENTORY MANAGEMENT SYSTEM v4.0
// ═══════════════════════════════════════════════════════

const stockLevels = {
    '500mb': 50,
    '1gb': 50,
    '5gb': 20
};

const stockHistory = [];

// Update stock
function updateStock(planType, quantity) {
    if (!stockLevels[planType]) return false;
    stockLevels[planType] = Math.max(0, quantity);
    stockHistory.push({ plan: planType, quantity, timestamp: Date.now() });
    return true;
}

// Check stock
function getStock(planType) {
    return stockLevels[planType] || 0;
}

// Predict stock depletion (simple linear)
function predictStockDepletion(planType) {
    if (!INVENTORY.prediction.enabled) return null;

    const planHistory = stockHistory.filter(h => h.plan === planType);
    if (planHistory.length < 3) return null;

    // Simple average consumption
    const dailyConsumption = planHistory.length / 7; // Assuming a week of data
    const currentStock = getStock(planType);
    const daysLeft = Math.floor(currentStock / dailyConsumption);

    return {
        plan: planType,
        currentStock,
        daysLeft,
        willDepleteOn: new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toDateString()
    };
}

// Check if reorder needed
function checkReorderNeeded() {
    if (!INVENTORY.autoReorder.enabled) return [];

    const alerts = [];
    for (const [plan, level] of Object.entries(stockLevels)) {
        if (level <= INVENTORY.autoReorder.threshold) {
            alerts.push({ plan, currentLevel: level });
        }
    }
    return alerts;
}

// ═══════════════════════════════════════════════════════
// 🎁 CUSTOMER RETENTION SYSTEM v4.0
// ═══════════════════════════════════════════════════════

const customerBirthdays = new Map();
const lastPurchaseDate = new Map();
const feedbackCollected = new Set();
const vipCustomers = new Set();

// Set customer birthday
function setCustomerBirthday(chatId, birthday) {
    if (!RETENTION.birthday.enabled) return;
    customerBirthdays.set(chatId, birthday); // MM-DD format
}

// Check for birthday offers
function checkBirthdayOffers() {
    if (!RETENTION.birthday.enabled) return [];

    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
    const birthdayCustomers = [];

    for (const [chatId, birthday] of customerBirthdays) {
        if (birthday === today) {
            birthdayCustomers.push({
                chatId,
                message: RETENTION.birthday.messageTemplate.replace('{discount}', RETENTION.birthday.discount)
            });
        }
    }
    return birthdayCustomers;
}

// Track last purchase for win-back
function trackPurchase(chatId, amount) {
    lastPurchaseDate.set(chatId, Date.now());

    // Check VIP status
    const profile = getUserProfile(chatId);
    if (profile.ordersCount >= RETENTION.vip.criteria.orders ||
        profile.totalSpent >= RETENTION.vip.criteria.amount) {
        vipCustomers.add(chatId);
    }
}

// Check win-back candidates
function checkWinBackCandidates() {
    if (!RETENTION.winback.enabled) return [];

    const now = Date.now();
    const candidates = [];

    for (const [chatId, lastDate] of lastPurchaseDate) {
        const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
        if (daysSince >= RETENTION.winback.triggerDays && daysSince <= RETENTION.winback.triggerDays + 7) {
            candidates.push({
                chatId,
                message: RETENTION.winback.message,
                daysSince: Math.floor(daysSince)
            });
        }
    }
    return candidates;
}

// Request feedback
function shouldRequestFeedback(chatId) {
    if (!RETENTION.feedback.enabled) return false;
    if (feedbackCollected.has(chatId)) return false;

    const profile = getUserProfile(chatId);
    if (!profile.purchased) return false;

    const daysSince = (Date.now() - profile.lastSeen) / (1000 * 60 * 60 * 24);
    return daysSince >= RETENTION.feedback.delayDays;
}

function markFeedbackCollected(chatId) {
    feedbackCollected.add(chatId);
    const profile = getUserProfile(chatId);
    profile.feedbackGiven = true;
}

// Check VIP status
function isVIPCustomer(chatId) {
    if (!RETENTION.vip.enabled) return false;
    return vipCustomers.has(chatId);
}

function getVIPBenefits() {
    return RETENTION.vip.benefits;
}

// Helper delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════
// 📱 ORDER TRACKING SYSTEM
// ═══════════════════════════════════════════════════════

const orders = new Map();

function createOrder(chatId, planType, amount) {
    const orderId = `ORD${Date.now()}`;
    orders.set(orderId, {
        id: orderId,
        chatId,
        plan: planType,
        amount,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    return orderId;
}

function updateOrderStatus(orderId, status) {
    const order = orders.get(orderId);
    if (!order) return false;
    order.status = status;
    order.updatedAt = Date.now();
    return true;
}

function getOrderStatus(orderId) {
    const order = orders.get(orderId);
    if (!order) return null;
    return {
        id: order.id,
        plan: order.plan,
        amount: order.amount,
        status: order.status,
        created: new Date(order.createdAt).toLocaleString(),
        updated: new Date(order.updatedAt).toLocaleString()
    };
}

function getCustomerOrders(chatId) {
    return Array.from(orders.values()).filter(o => o.chatId === chatId);
}

// ═══════════════════════════════════════════════════════
// 🌍 URDU SCRIPT SUPPORT
// ═══════════════════════════════════════════════════════

const URDU_KEYWORDS = {
    'سلام': 'greeting',
    'ہیلو': 'greeting',
    'پلان': 'plan',
    'قیمت': 'price',
    'ادائیگی': 'payment',
    'آرڈر': 'order',
    'مدد': 'help',
    'شکریہ': 'thanks',
    'الوداع': 'bye'
};

function detectUrduScript(message) {
    const urduRange = /[\u0600-\u06FF]/;
    return urduRange.test(message);
}

function translateUrduIntent(message) {
    for (const [urdu, intent] of Object.entries(URDU_KEYWORDS)) {
        if (message.includes(urdu)) return intent;
    }
    return null;
}

// ============================================
// GEMINI AI IMAGE ANALYSIS SYSTEM with AUTO MODEL SELECTION
// ============================================
const geminiState = {
    currentApiIndex: 0,
    failures: new Map(),
    lastUsed: null,
    workingModels: new Map() // apiKey -> { model: string, tested: boolean }
};

// Vision-capable model patterns (models that support image input)
const VISION_MODEL_PATTERNS = [
    /gemini-2\.5-pro/i,
    /gemini-2\.5-flash/i,
    /gemini-2\.0-pro/i,
    /gemini-2\.0-flash/i,
    /gemini-1\.5-pro/i,
    /gemini-1\.5-flash/i,
    /gemini-pro-vision/i
];

// Models to exclude (embedding, audio only, etc.)
const EXCLUDED_MODEL_PATTERNS = [
    /embedding/i,
    /aqa/i,
    /tts/i,
    /stt/i,
    /audio/i,
    /text-embedding/i
];

// ════════════════════════════════════════════════════════════════════════════
// 🔍 AUTO MODEL SELECTION SYSTEM for Gemini API
// Automatically discovers and uses vision-capable models
// ════════════════════════════════════════════════════════════════════════════

// Fetch available models from Gemini API
async function fetchGeminiModels(apiKey) {
    try {
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
            { timeout: 10000 }
        );

        if (response.data?.models) {
            return response.data.models.map(m => ({
                name: m.name,
                displayName: m.displayName || m.name,
                description: m.description || '',
                supportedGenerationMethods: m.supportedGenerationMethods || [],
                inputTokenLimit: m.inputTokenLimit,
                outputTokenLimit: m.outputTokenLimit
            }));
        }
        return [];
    } catch (e) {
        log(`Failed to fetch models: ${e.message}`, 'error');
        return [];
    }
}

// Filter for vision-capable models
function filterVisionModels(models) {
    return models.filter(model => {
        const name = model.name.toLowerCase();

        // Check if it's a vision model
        const isVisionModel = VISION_MODEL_PATTERNS.some(pattern => pattern.test(name));

        // Check if it's excluded
        const isExcluded = EXCLUDED_MODEL_PATTERNS.some(pattern => pattern.test(name));

        // Check if it supports generateContent (required for image analysis)
        const supportsGeneration = model.supportedGenerationMethods?.includes('generateContent');

        return isVisionModel && !isExcluded && supportsGeneration;
    });
}

// Test if a model can actually analyze images
async function testVisionModel(apiKey, modelName) {
    try {
        // Simple test with a minimal image (1x1 transparent pixel)
        const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`,
            {
                contents: [{
                    parts: [
                        { text: 'What is in this image? Reply with one word.' },
                        {
                            inline_data: {
                                mime_type: 'image/png',
                                data: testImage
                            }
                        }
                    ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
            },
            { timeout: 10000 }
        );

        const hasResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return !!hasResponse;
    } catch (e) {
        log(`Model ${modelName} test failed: ${e.response?.status || e.message}`, 'warn');
        return false;
    }
}

// Get or discover working vision model for an API key
async function getWorkingVisionModel(apiKey) {
    // Check cache first
    if (geminiState.workingModels.has(apiKey)) {
        const cached = geminiState.workingModels.get(apiKey);
        if (cached.tested && cached.model) {
            log(`Using cached working model: ${cached.model}`, 'info');
            return cached.model;
        }
    }

    log('🔍 Auto-discovering vision-capable models...', 'info');

    // Step 1: Fetch all available models
    const allModels = await fetchGeminiModels(apiKey);
    if (allModels.length === 0) {
        // Fallback to hardcoded models if API fails
        return 'models/gemini-2.0-flash';
    }

    log(`Found ${allModels.length} total models`, 'info');

    // Step 2: Filter for vision models
    const visionModels = filterVisionModels(allModels);
    log(`Found ${visionModels.length} vision-capable models`, 'info');

    if (visionModels.length === 0) {
        log('No vision models found, using fallback', 'warn');
        return 'models/gemini-2.0-flash';
    }

    // Step 3: Sort by preference (newer models first)
    const preferredModels = [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-pro',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash'
    ];

    visionModels.sort((a, b) => {
        const aIndex = preferredModels.findIndex(p => a.name.includes(p));
        const bIndex = preferredModels.findIndex(p => b.name.includes(p));
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    // Step 4: Test models until one works
    for (const model of visionModels.slice(0, 5)) { // Test top 5
        log(`Testing model: ${model.name}...`, 'info');
        const works = await testVisionModel(apiKey, model.name);

        if (works) {
            log(`✅ Working model found: ${model.name}`, 'info');
            geminiState.workingModels.set(apiKey, { model: model.name, tested: true });
            return model.name;
        }
    }

    // Fallback if none work
    log('No working vision model found, using fallback', 'warn');
    geminiState.workingModels.set(apiKey, { model: 'models/gemini-2.0-flash', tested: true });
    return 'models/gemini-2.0-flash';
}

// Clear cached models (useful for forcing rediscovery)
function clearWorkingModelsCache() {
    geminiState.workingModels.clear();
    log('Working models cache cleared', 'info');
}

// Get model discovery status for admin
function getModelDiscoveryStatus() {
    const status = [];
    for (const [apiKey, info] of geminiState.workingModels) {
        const maskedKey = apiKey.slice(0, 10) + '...' + apiKey.slice(-5);
        status.push({
            key: maskedKey,
            model: info.model,
            tested: info.tested
        });
    }
    return status;
}

async function analyzeImageWithGemini(imageData, mimeType, chatId, userMessage) {
    if (!isGeminiEnabled || !isGeminiEnabled()) {
        log('Gemini not configured, using manual verification', 'warn');
        return { type: 'unknown', confidence: 0, text: null };
    }

    const prompt = `Analyze this image carefully. Determine if it is:

1. A PAYMENT SCREENSHOT - Shows payment confirmation
2. AN ISSUE/PROBLEM screenshot - Shows errors or problems

Respond format:
TYPE: [PAYMENT or ISSUE or UNKNOWN]
CONFIDENCE: [0-100]
DESCRIPTION: [Brief description]
TEXT_EXTRACTED: [Important text]
AMOUNT: [If payment, amount?]
METHOD: [Payment method?]`;

    // Try each API key with auto model selection
    for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
        const apiIndex = (geminiState.currentApiIndex + i) % GEMINI_API_KEYS.length;
        const apiKey = GEMINI_API_KEYS[apiIndex];

        if (!apiKey || apiKey.length < 20 || apiKey.includes('YOUR_GEMINI')) continue;

        try {
            log(`🔍 Trying Gemini API ${apiIndex + 1}/${GEMINI_API_KEYS.length} with auto model selection...`, 'info');

            // 🔥 AUTO MODEL SELECTION: Discover working vision model
            const workingModel = await getWorkingVisionModel(apiKey);

            if (!workingModel) {
                log(`No working vision model found for API key ${apiIndex + 1}`, 'warn');
                continue;
            }

            log(`📸 Using model: ${workingModel} for screenshot analysis`, 'info');

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/${workingModel}:generateContent?key=${apiKey}`,
                {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: imageData
                                }
                            }
                        ]
                    }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
                },
                { timeout: 15000 }
            );

            const resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const analysis = parseGeminiResponse(resultText);

            // Cache this working model for future use
            geminiState.currentApiIndex = apiIndex;
            geminiState.lastUsed = Date.now();

            log(`✅ Gemini analysis successful using ${workingModel}: ${analysis.type}`, 'info');
            return analysis;

        } catch (error) {
            const statusCode = error.response?.status;
            const errorMsg = error.response?.data?.error?.message || error.message;

            log(`❌ Gemini API ${apiIndex + 1} failed: ${statusCode} - ${errorMsg}`, 'error');

            // If model not found or invalid, clear cache and try next
            if (statusCode === 404 || statusCode === 400) {
                geminiState.workingModels.delete(apiKey);
            }

            continue;
        }
    }

    return { type: 'unknown', confidence: 0, text: null, error: 'All APIs failed' };
}

function parseGeminiResponse(text) {
    const result = { type: 'unknown', confidence: 0, description: '', textExtracted: '', amount: null, method: null };
    try {
        const typeMatch = text.match(/TYPE:\s*(\w+)/i);
        if (typeMatch) {
            const type = typeMatch[1].toUpperCase();
            if (type === 'PAYMENT') result.type = 'payment';
            else if (type === 'ISSUE') result.type = 'issue';
        }
        const confMatch = text.match(/CONFIDENCE:\s*(\d+)/i);
        if (confMatch) result.confidence = parseInt(confMatch[1]);
        const descMatch = text.match(/DESCRIPTION:\s*([^\n]+)/i);
        if (descMatch) result.description = descMatch[1].trim();
        const textMatch = text.match(/TEXT_EXTRACTED:\s*([^\n]+)/i);
        if (textMatch) result.textExtracted = textMatch[1].trim();
        const amountMatch = text.match(/AMOUNT:\s*Rs?\.?\s*(\d+)/i);
        if (amountMatch) result.amount = parseInt(amountMatch[1]);
        const methodMatch = text.match(/METHOD:\s*([^\n]+)/i);
        if (methodMatch) {
            const method = methodMatch[1].trim().toLowerCase();
            if (method.includes('jazzcash')) result.method = 'JazzCash';
            else if (method.includes('easypaisa')) result.method = 'EasyPaisa';
            else if (method.includes('sadapay')) result.method = 'SadaPay';
        }
    } catch (e) {
        log('Error parsing Gemini response: ' + e.message, 'error');
    }
    return result;
}

// ════════════════════════════════════════════════════════════════════════════
// 📸 ENHANCED SCREENSHOT DETECTION & PAYMENT VERIFICATION SYSTEM v2.0
// ════════════════════════════════════════════════════════════════════════════

// Payment Verification State
const PaymentVerificationSystem = {
    queue: new Map(), // chatId -> verification data
    verifiedCustomers: new Set(), // Customers with successful payments
    suspiciousActivity: new Map(), // chatId -> count of suspicious attempts
    dailyStats: {
        totalScreenshots: 0,
        verifiedPayments: 0,
        rejectedPayments: 0,
        pendingReviews: 0
    }
};

// Screenshot types for classification
const SCREENSHOT_TYPES = {
    PAYMENT: 'payment',
    ISSUE: 'issue',
    CHAT: 'chat',
    RANDOM: 'random',
    DUPLICATE: 'duplicate',
    SUSPICIOUS: 'suspicious'
};

// Enhanced screenshot analyzer with detailed classification
async function analyzeScreenshotEnhanced(imageData, mimeType, chatId, userMessage, chatHistory) {
    log(`🔍 Analyzing screenshot from ${chatId}...`, 'info');

    const result = {
        type: SCREENSHOT_TYPES.RANDOM,
        confidence: 0,
        isPayment: false,
        isIssue: false,
        isSuspicious: false,
        extractedText: '',
        amount: null,
        paymentMethod: null,
        transactionId: null,
        timestamp: null,
        reasons: [],
        shouldNotifyAdmin: false,
        shouldReplyToCustomer: false,
        autoApprove: false
    };

    // Step 1: Use Gemini AI for initial classification
    let geminiAnalysis = null;
    if (isGeminiEnabled && isGeminiEnabled()) {
        try {
            geminiAnalysis = await analyzeImageWithGemini(imageData, mimeType, chatId, userMessage);
            result.extractedText = geminiAnalysis.textExtracted || '';
            result.amount = geminiAnalysis.amount;
            result.paymentMethod = geminiAnalysis.method;
        } catch (e) {
            log('Gemini analysis failed, using fallback', 'warn');
        }
    }

    // Step 2: Text-based heuristics
    const lowerMessage = userMessage.toLowerCase();
    const extractedText = result.extractedText.toLowerCase();

    // Payment keywords in message or extracted text
    const paymentIndicators = [
        'payment', 'paid', 'send', 'sent', 'transfer', 'rs.', 'rs ', 'pkr',
        'jazzcash', 'easypaisa', 'sadapay', 'transaction', 'successful',
        'received', 'amount', 'bhej', 'payment sent', 'screenshot'
    ];

    const hasPaymentIndicators = paymentIndicators.some(kw =>
        lowerMessage.includes(kw) || extractedText.includes(kw)
    );

    // Check for transaction patterns
    const transactionPatterns = [
        /trx\s*id[:\s]*([a-z0-9]+)/i,
        /transaction\s*id[:\s]*([a-z0-9]+)/i,
        /ref[:\s]*([a-z0-9]+)/i,
        /\b\d{6,}\b/ // 6+ digit numbers (likely transaction IDs)
    ];

    for (const pattern of transactionPatterns) {
        const match = extractedText.match(pattern) || lowerMessage.match(pattern);
        if (match) {
            result.transactionId = match[1] || match[0];
            break;
        }
    }

    // Amount detection
    if (!result.amount) {
        const amountPatterns = [
            /rs\.?\s*(\d+)/i,
            /amount[:\s]*rs?\.?\s*(\d+)/i,
            /pkr\s*(\d+)/i,
            /\b(130|400|1500)\b/ // Specific plan amounts
        ];

        for (const pattern of amountPatterns) {
            const match = extractedText.match(pattern) || lowerMessage.match(pattern);
            if (match) {
                const amt = parseInt(match[1]);
                if ([130, 400, 1500].includes(amt)) {
                    result.amount = amt;
                    break;
                }
            }
        }
    }

    // Payment method detection
    if (!result.paymentMethod) {
        const methodPatterns = [
            { name: 'JazzCash', patterns: ['jazzcash', 'jazz', 'jazz cash'] },
            { name: 'EasyPaisa', patterns: ['easypaisa', 'easy paisa', 'easypaisa'] },
            { name: 'SadaPay', patterns: ['sadapay', 'sada pay'] }
        ];

        for (const method of methodPatterns) {
            if (method.patterns.some(p => lowerMessage.includes(p) || extractedText.includes(p))) {
                result.paymentMethod = method.name;
                break;
            }
        }
    }

    // Step 3: Classify screenshot type
    if (geminiAnalysis) {
        if (geminiAnalysis.type === 'payment' && geminiAnalysis.confidence >= 50) {
            result.type = SCREENSHOT_TYPES.PAYMENT;
            result.isPayment = true;
            result.confidence = geminiAnalysis.confidence;
        } else if (geminiAnalysis.type === 'issue' && geminiAnalysis.confidence >= 50) {
            result.type = SCREENSHOT_TYPES.ISSUE;
            result.isIssue = true;
            result.confidence = geminiAnalysis.confidence;
        }
    }

    // Fallback classification
    if (result.type === SCREENSHOT_TYPES.RANDOM && hasPaymentIndicators) {
        if (result.amount && result.paymentMethod) {
            result.type = SCREENSHOT_TYPES.PAYMENT;
            result.isPayment = true;
            result.confidence = 60;
        }
    }

    // Step 4: Fraud/Suspicious detection
    const fraudChecks = checkForFraud(chatId, result, chatHistory);
    result.isSuspicious = fraudChecks.isSuspicious;
    result.reasons = fraudChecks.reasons;

    // Step 5: Duplicate detection
    const isDuplicate = checkDuplicateScreenshot(chatId, imageData);
    if (isDuplicate) {
        result.type = SCREENSHOT_TYPES.DUPLICATE;
        result.isPayment = false;
        result.reasons.push('Duplicate screenshot detected');
    }

    // Step 6: Determine actions
    if (result.isPayment && !result.isSuspicious && !isDuplicate) {
        result.shouldNotifyAdmin = true;

        // Auto-approve for trusted customers
        if (PaymentVerificationSystem.verifiedCustomers.has(chatId) &&
            result.confidence >= 80 &&
            result.amount &&
            result.paymentMethod) {
            result.autoApprove = true;
        }
    }

    // Update stats
    PaymentVerificationSystem.dailyStats.totalScreenshots++;

    return result;
}

// Fraud detection system
function checkForFraud(chatId, analysis, chatHistory) {
    const result = {
        isSuspicious: false,
        reasons: []
    };

    // Check for rapid multiple submissions
    const recentSubmissions = PaymentVerificationSystem.suspiciousActivity.get(chatId) || 0;
    if (recentSubmissions > 3) {
        result.isSuspicious = true;
        result.reasons.push(`Multiple submissions (${recentSubmissions} in short time)`);
    }

    // Check for amount mismatches
    if (analysis.amount) {
        const validAmounts = [130, 400, 1500];
        if (!validAmounts.includes(analysis.amount)) {
            result.isSuspicious = true;
            result.reasons.push(`Unusual amount: Rs. ${analysis.amount}`);
        }
    }

    // Check for missing critical info
    if (analysis.isPayment && (!analysis.amount || !analysis.paymentMethod)) {
        result.isSuspicious = true;
        result.reasons.push('Missing payment details');
    }

    // Check message context
    if (chatHistory && chatHistory.length > 0) {
        const recentMessages = chatHistory.slice(-5);
        const hasPlanDiscussion = recentMessages.some(m =>
            /\b(500mb|1gb|5gb|plan|price)\b/i.test(m.body)
        );

        if (analysis.isPayment && !hasPlanDiscussion) {
            result.isSuspicious = true;
            result.reasons.push('Payment without plan discussion');
        }
    }

    // Update suspicious activity counter
    if (result.isSuspicious) {
        PaymentVerificationSystem.suspiciousActivity.set(chatId, recentSubmissions + 1);
    }

    return result;
}

// Duplicate screenshot detection using simple hash
const screenshotHashes = new Map(); // chatId -> Set of hashes

function checkDuplicateScreenshot(chatId, imageData) {
    // Simple hash of first 100 chars of base64
    const hash = imageData.slice(0, 100);

    if (!screenshotHashes.has(chatId)) {
        screenshotHashes.set(chatId, new Set());
    }

    const userHashes = screenshotHashes.get(chatId);

    if (userHashes.has(hash)) {
        return true;
    }

    userHashes.add(hash);

    // Cleanup old hashes (keep last 10)
    if (userHashes.size > 10) {
        const first = userHashes.values().next().value;
        userHashes.delete(first);
    }

    return false;
}

// Payment verification queue management
async function addToVerificationQueue(chatId, analysis, mediaData, msgId) {
    const queueItem = {
        chatId,
        timestamp: Date.now(),
        status: 'pending', // pending, approved, rejected
        analysis,
        mediaData,
        msgId,
        attempts: 0,
        adminNotified: false
    };

    PaymentVerificationSystem.queue.set(chatId, queueItem);
    PaymentVerificationSystem.dailyStats.pendingReviews++;

    log(`Payment added to queue: ${chatId}, Amount: Rs. ${analysis.amount}`, 'info');

    // Notify admin
    await notifyAdminAboutPayment(chatId, analysis, 'pending');
}

// Admin notification with rich details
async function notifyAdminAboutPayment(chatId, analysis, status) {
    if (!ADMIN_NUMBER || !client) return;

    const number = chatId.replace(/\D/g, '').substring(0, 12);
    const amount = analysis.amount || 'Unknown';
    const method = analysis.paymentMethod || 'Unknown';
    const transactionId = analysis.transactionId || 'N/A';
    const confidence = analysis.confidence || 0;

    let statusEmoji = '⏳';
    let statusText = 'PENDING REVIEW';

    if (status === 'approved') {
        statusEmoji = '✅';
        statusText = 'APPROVED';
    } else if (status === 'rejected') {
        statusEmoji = '❌';
        statusText = 'REJECTED';
    }

    const planType = analysis.amount === 130 ? '500MB' :
                    analysis.amount === 400 ? '1GB' :
                    analysis.amount === 1500 ? '5GB' : 'Unknown';

    const notification = `${statusEmoji} *PAYMENT ${statusText}*

👤 Customer: ${number}
📱 Chat: ${chatId}

💰 *Amount:* Rs. ${amount}
📦 *Plan:* ${planType}
💳 *Method:* ${method}
🆔 *Transaction ID:* ${transactionId}
🎯 *AI Confidence:* ${confidence}%

${analysis.isSuspicious ? '⚠️ *SUSPICIOUS:* ' + analysis.reasons.join(', ') : ''}

*Actions:*
Reply:
• !approve ${number} - Verify payment
• !reject ${number} [reason] - Reject with reason
• !check ${number} - View details`;

    try {
        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(adminChat, notification);

        // If there's media, send it to admin too
        if (analysis.mediaData && status === 'pending') {
            const media = new MessageMedia('image/jpeg', analysis.mediaData);
            await client.sendMessage(adminChat, media, { caption: `📸 Screenshot from ${number}` });
        }

        // Mark as notified
        const queueItem = PaymentVerificationSystem.queue.get(chatId);
        if (queueItem) {
            queueItem.adminNotified = true;
        }
    } catch (e) {
        log('Failed to notify admin: ' + e.message, 'error');
    }
}

// Customer notification based on verification status
async function notifyCustomerAboutPayment(chatId, status, reason = '') {
    // Safety check - client must be initialized
    if (!client) {
        log('Cannot notify customer - client not initialized', 'error');
        return;
    }

    let message = '';

    if (status === 'approved') {
        message = `✅ *Payment Verified Successfully!* ❤️

Bhai, aapki payment confirm ho gai hai!

⏳ Ab main aapko eSIM guide bhej raha hoon...

*2 minutes mein aapko:*
📱 App download link
🎁 Promo code
📲 Activation steps

*Shukriya bhai!* 🙏❤️`;

        // Add to verified customers
        PaymentVerificationSystem.verifiedCustomers.add(chatId);
        PaymentVerificationSystem.dailyStats.verifiedPayments++;

    } else if (status === 'rejected') {
        message = `❌ *Payment Verification Issue* ❤️

Bhai, payment verify nahi ho saki.

*Reason:* ${reason || 'Screenshot unclear ya details missing'}

*Kya karein:*
1️⃣ Screenshot dubara bhejein (clear ho)
2️⃣ Payment details saath likhein
3️⃣ Ya direct admin se baat karein

*Koi tension nahi, hum hain na!* 👍❤️`;

        PaymentVerificationSystem.dailyStats.rejectedPayments++;
    } else if (status === 'pending') {
        message = `⏳ *Verification in Process* ❤️

Bhai, screenshot mil gaya hai!

🔍 Admin check kar raha hai...
⏱️ 2-5 minutes mein confirm hoga

*Aap wait karein, main update deta rahoon ga!* 👍`;
    }

    try {
        await client.sendMessage(chatId, message);
        await saveMessage(chatId, { body: message, fromMe: true, time: Date.now() });
    } catch (e) {
        log('Failed to notify customer: ' + e.message, 'error');
    }
}

// Process verification approval/rejection
async function processVerificationDecision(chatId, decision, reason = '', adminId) {
    const queueItem = PaymentVerificationSystem.queue.get(chatId);

    if (!queueItem) {
        return { success: false, error: 'No pending verification found for this customer' };
    }

    if (decision === 'approve') {
        queueItem.status = 'approved';
        queueItem.approvedBy = adminId;
        queueItem.approvedAt = Date.now();

        // Notify customer
        await notifyCustomerAboutPayment(chatId, 'approved');

        // Send plan guide
        const planType = queueItem.analysis.amount === 130 ? '500MB' :
                        queueItem.analysis.amount === 400 ? '1GB' :
                        queueItem.analysis.amount === 1500 ? '5GB' : null;

        if (planType) {
            setTimeout(async () => {
                await sendPlanDetailsAfterVerification(chatId, planType);
            }, 2000);
        }

        // Update queue
        PaymentVerificationSystem.queue.delete(chatId);
        PaymentVerificationSystem.dailyStats.pendingReviews--;

        log(`Payment approved for ${chatId} by ${adminId}`, 'admin');

        return {
            success: true,
            message: `✅ Payment approved for ${chatId}\n📦 Plan: ${planType || 'Unknown'}\n💰 Amount: Rs. ${queueItem.analysis.amount}`
        };

    } else if (decision === 'reject') {
        queueItem.status = 'rejected';
        queueItem.rejectedBy = adminId;
        queueItem.rejectedAt = Date.now();
        queueItem.rejectionReason = reason;

        // Notify customer
        await notifyCustomerAboutPayment(chatId, 'rejected', reason);

        // Update queue
        PaymentVerificationSystem.queue.delete(chatId);
        PaymentVerificationSystem.dailyStats.pendingReviews--;

        log(`Payment rejected for ${chatId} by ${adminId}. Reason: ${reason}`, 'admin');

        return {
            success: true,
            message: `❌ Payment rejected for ${chatId}\nReason: ${reason || 'Not specified'}`
        };
    }

    return { success: false, error: 'Invalid decision' };
}

// Get verification stats for admin
function getVerificationStats() {
    return {
        ...PaymentVerificationSystem.dailyStats,
        pendingQueue: PaymentVerificationSystem.queue.size,
        verifiedCustomers: PaymentVerificationSystem.verifiedCustomers.size,
        suspiciousCustomers: PaymentVerificationSystem.suspiciousActivity.size
    };
}

// Auto-cleanup old queue items (older than 24 hours)
function cleanupVerificationQueue() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [chatId, item] of PaymentVerificationSystem.queue) {
        if (now - item.timestamp > maxAge) {
            PaymentVerificationSystem.queue.delete(chatId);
            log(`Old verification item cleaned up: ${chatId}`, 'info');
        }
    }
}

// Run cleanup every hour
setInterval(cleanupVerificationQueue, 60 * 60 * 1000);

async function handleImageWithAIAnalysis(msg, chatId, body) {
    try {
        if (!msg.hasMedia) return null;
        const media = await msg.downloadMedia();
        if (!media || !media.data) return null;

        log(`Analyzing image from ${chatId} with Gemini AI...`, 'info');
        const analysis = await analyzeImageWithGemini(media.data, media.mimetype, chatId, body);

        if (analysis.type === 'payment' && analysis.confidence >= 60) {
            let planType = null;
            if (analysis.amount === 130) planType = '500MB';
            else if (analysis.amount === 400) planType = '1GB';
            else if (analysis.amount === 1500) planType = '5GB';

            return {
                isPayment: true,
                isIssue: false,
                planType: planType,
                amount: analysis.amount,
                method: analysis.method,
                confidence: analysis.confidence,
                extractedText: analysis.textExtracted,
                mediaData: media.data,
                mediaType: media.mimetype
            };
        } else if (analysis.type === 'issue' && analysis.confidence >= 50) {
            return {
                isPayment: false,
                isIssue: true,
                description: analysis.description,
                extractedText: analysis.textExtracted,
                confidence: analysis.confidence
            };
        }

        return {
            isPayment: true,
            isIssue: false,
            planType: null,
            amount: null,
            method: null,
            confidence: analysis.confidence,
            extractedText: analysis.textExtracted,
            mediaData: media.data,
            mediaType: media.mimetype
        };
    } catch (e) {
        log('Image AI analysis error: ' + e.message, 'error');
        return null;
    }
}

async function resolveIssueWithAI(extractedText, description, chatId) {
    try {
        const issuePrompt = `Customer issue: ${description}
Extracted text: ${extractedText}
Provide solution in Roman Urdu + English mix, 2-3 lines, with emojis.`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: 'You are SimFly Pakistan support assistant.' },
                { role: 'user', content: issuePrompt }
            ],
            max_tokens: 300,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data.choices[0].message.content;
    } catch (e) {
        return `Bhai, samajh nahi aaya. 😅

*Try:*
1️⃣ Data Roaming ON
2️⃣ Device restart
3️⃣ Settings > Cellular > Add eSIM

Agar masla ho toh "support" likhein!`;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 🔍 DEEP CHAT ANALYSIS — Analyze conversation before replying
// ════════════════════════════════════════════════════════════════════════════
async function analyzeChatBeforeReply(chatId, userMessage, history, profile) {
    const analysis = {
        isNewCustomer: false,
        isReturningCustomer: false,
        hasIssue: false,
        issueType: null,
        deviceMentioned: null,
        deviceCompatible: null,
        isJVDevice: false,
        nameShared: null,
        purchaseStage: profile.purchaseStage || 'new',
        lastTopic: null,
        sentiment: 'neutral',
        shouldAskDevice: false,
        shouldAskName: false,
        shouldSuggestTrial: false,
        needsPaymentVerification: false,
        hasMedia: false,
        returningCustomerIssue: null
    };

    // Check if new customer (no history or very little)
    if (history.length <= 2) {
        analysis.isNewCustomer = true;
    } else {
        analysis.isReturningCustomer = true;
    }

    // Check for device mentions
    const devicePatterns = [
        /iphone\s*(\d+|[xsxrm]+)/i,
        /(xs|xr|x|11|12|13|14|15|16)\s*(pro|max|plus|mini)?/i,
        /samsung\s*s?(\d+)/i,
        /galaxy\s*s?(\d+)/i,
        /pixel\s*(\d+)/i
    ];

    for (const pattern of devicePatterns) {
        const match = userMessage.match(pattern) || history.slice(-3).join(' ').match(pattern);
        if (match) {
            analysis.deviceMentioned = match[0];
            const deviceCheck = checkDeviceCompatibility(match[0]);
            analysis.deviceCompatible = deviceCheck.compatible;
            analysis.isJVDevice = userMessage.toLowerCase().includes('jv') ||
                                userMessage.toLowerCase().includes('japanese') ||
                                userMessage.toLowerCase().includes('locked') ||
                                userMessage.toLowerCase().includes('sim locked');
            break;
        }
    }

    // Check for name sharing
    const namePatterns = [
        /(?:my name is|i am|name|mera naam|main)\s+([a-zA-Z\s]{2,20})/i,
        /(?:call me|mujhe)\s+([a-zA-Z\s]{2,15})/i
    ];

    for (const pattern of namePatterns) {
        const match = userMessage.match(pattern);
        if (match) {
            analysis.nameShared = match[1].trim();
            // Save name to profile
            if (analysis.nameShared && analysis.nameShared.length > 2) {
                profile.name = analysis.nameShared;
                await saveCustomerName(chatId, analysis.nameShared);
            }
            break;
        }
    }

    // Check for issues/problems
    const issueKeywords = ['error', 'problem', 'issue', 'masla', 'nahi chal', 'not working',
                          'fail', 'stuck', 'help', 'support', 'issue hai', 'problem aa'];
    for (const keyword of issueKeywords) {
        if (userMessage.toLowerCase().includes(keyword)) {
            analysis.hasIssue = true;
            analysis.returningCustomerIssue = userMessage.slice(0, 100);
            break;
        }
    }

    // Check for payment-related
    const paymentKeywords = ['payment', 'screenshot', 'pay', 'done', 'sent', 'bheja', 'transfer'];
    for (const keyword of paymentKeywords) {
        if (userMessage.toLowerCase().includes(keyword)) {
            analysis.needsPaymentVerification = true;
            break;
        }
    }

    // Check for international eSIM mentions
    const internationalKeywords = ['international', 'airalo', 'maya', 'saily', 'global', 'other esim'];
    for (const keyword of internationalKeywords) {
        if (userMessage.toLowerCase().includes(keyword)) {
            analysis.lastTopic = 'international_esim';
            break;
        }
    }

    // Sentiment analysis
    const positiveWords = ['shukria', 'thank', 'best', 'good', 'nice', 'perfect', 'great', 'awesome'];
    const negativeWords = ['bad', 'worst', 'ganda', 'kharab', 'slow', 'bekar', 'issue', 'problem', 'masla'];

    let positiveCount = 0, negativeCount = 0;
    const words = userMessage.toLowerCase().split(/\s+/);
    for (const word of words) {
        if (positiveWords.includes(word)) positiveCount++;
        if (negativeWords.includes(word)) negativeCount++;
    }

    if (negativeCount > positiveCount) analysis.sentiment = 'negative';
    else if (positiveCount > negativeCount) analysis.sentiment = 'positive';

    // Determine what to ask next
    if (analysis.isNewCustomer && !analysis.deviceMentioned) {
        analysis.shouldAskDevice = true;
    }

    if (analysis.isNewCustomer && analysis.deviceMentioned && !profile.name && !analysis.nameShared) {
        analysis.shouldAskName = true;
    }

    if (analysis.isJVDevice && analysis.deviceCompatible) {
        analysis.shouldSuggestTrial = true;
    }

    return analysis;
}

// ════════════════════════════════════════════════════════════════════════════
// 💾 SAVE CUSTOMER NAME TO FIREBASE
// ════════════════════════════════════════════════════════════════════════════
async function saveCustomerName(chatId, name) {
    try {
        const cleanName = name.trim().replace(/[^a-zA-Z\s]/g, '').slice(0, 30);
        if (cleanName.length < 2) return false;

        const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

        // Save to Firebase
        if (DB) {
            await DB.ref(`customers/${userKey}`).update({
                name: cleanName,
                nameUpdatedAt: Date.now()
            });
        }

        // Save to local DB
        if (!localDB.customers) localDB.customers = {};
        if (!localDB.customers[userKey]) localDB.customers[userKey] = {};
        localDB.customers[userKey].name = cleanName;
        localDB.customers[userKey].nameUpdatedAt = Date.now();

        log(`Customer name saved: ${userKey} = ${cleanName}`, 'info');
        return true;
    } catch (e) {
        log('Save customer name error: ' + e.message, 'error');
        return false;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 💾 SAVE USER DEVICE INFO
// ════════════════════════════════════════════════════════════════════════════
async function saveUserDevice(chatId, device, compatible, isJV) {
    try {
        const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

        // Save to Firebase
        if (DB) {
            await DB.ref(`customers/${userKey}`).update({
                device: device,
                deviceCompatible: compatible,
                isJV: isJV,
                deviceUpdatedAt: Date.now()
            });
        }

        // Save to local DB
        if (!localDB.customers) localDB.customers = {};
        if (!localDB.customers[userKey]) localDB.customers[userKey] = {};
        localDB.customers[userKey].device = device;
        localDB.customers[userKey].deviceCompatible = compatible;
        localDB.customers[userKey].isJV = isJV;
        localDB.customers[userKey].deviceUpdatedAt = Date.now();

        log(`Customer device saved: ${userKey} = ${device} (JV: ${isJV})`, 'info');
        return true;
    } catch (e) {
        log('Save user device error: ' + e.message, 'error');
        return false;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 🤖 AI FALLBACK CHAIN — Groq → Gemini 1 → Gemini 2
// ════════════════════════════════════════════════════════════════════════════
async function getAIResponseWithFallback(messages, temperature = 0.7) {
    const errors = [];

    // ATTEMPT 1: Groq AI (Primary)
    try {
        // Check if Groq key is configured
        if (!GROQ_API_KEY || GROQ_API_KEY.includes('YOUR_GROQ') || GROQ_API_KEY.length < 20) {
            throw new Error('Groq API key not configured - set GROQ_API_KEY in config.js');
        }
        if (isGroqEnabled()) {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 500,
                temperature: temperature
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const content = response.data.choices[0].message.content;
            if (content && content.length > 10) {
                log('AI Response: Groq (Primary) ✅', 'info');
                return { success: true, content, source: 'groq' };
            }
        }
    } catch (e) {
        const statusCode = e.response?.status;
        if (statusCode === 401) {
            errors.push(`Groq: Invalid API key (401 Unauthorized) - Check your GROQ_API_KEY in config.js`);
        } else {
            errors.push(`Groq: ${e.message}`);
        }
    }

    // ATTEMPT 2: Gemini AI (First fallback)
    try {
        // Check if GEMINI_API_KEYS is available and has valid keys
        if (!GEMINI_API_KEYS || !Array.isArray(GEMINI_API_KEYS) || GEMINI_API_KEYS.length === 0) {
            throw new Error('Gemini API keys not configured');
        }
        const firstKey = GEMINI_API_KEYS.find(k => k && !k.includes('YOUR_GEMINI'));
        if (!firstKey) {
            throw new Error('No valid Gemini API key found');
        }
        const geminiResponse = await getGeminiResponse(messages, firstKey);
        if (geminiResponse && geminiResponse.length > 10) {
            log('AI Response: Gemini-1 (Fallback 1) ✅', 'info');
            return { success: true, content: geminiResponse, source: 'gemini-1' };
        }
    } catch (e) {
        errors.push(`Gemini-1: ${e.message}`);
    }

    // ATTEMPT 3: Gemini AI (Second fallback with different key)
    try {
        if (!GEMINI_API_KEYS || !Array.isArray(GEMINI_API_KEYS) || GEMINI_API_KEYS.length < 2) {
            throw new Error('Only one Gemini key available');
        }
        const secondKey = GEMINI_API_KEYS.slice(1).find(k => k && !k.includes('YOUR_GEMINI'));
        if (!secondKey) {
            throw new Error('No second valid Gemini API key found');
        }
        const geminiResponse = await getGeminiResponse(messages, secondKey);
        if (geminiResponse && geminiResponse.length > 10) {
            log('AI Response: Gemini-2 (Fallback 2) ✅', 'info');
            return { success: true, content: geminiResponse, source: 'gemini-2' };
        }
    } catch (e) {
        errors.push(`Gemini-2: ${e.message}`);
    }

    // All attempts failed
    log('AI Fallback Chain Failed: ' + errors.join(', '), 'error');
    return { success: false, errors };
}

// Helper: Get response from Gemini
async function getGeminiResponse(messages, apiKey) {
    if (!apiKey || apiKey.includes('YOUR_GEMINI')) {
        throw new Error('Invalid Gemini API key');
    }

    const promptText = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            contents: [{
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500
            }
        },
        { timeout: 15000 }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
    }

    throw new Error('Empty Gemini response');
}

// ════════════════════════════════════════════════════════════════════════════
// 🎯 BUTTON-LIKE NEW CUSTOMER WELCOME
// ════════════════════════════════════════════════════════════════════════════
function getButtonLikeWelcome(isFromAd = false) {
    const baseMessage = `Assalam-o-Alaikum bhai! ❤️ SimFly Pakistan mein *khush amdeed!*`;

    const fromAdAddon = isFromAd
        ? `\n\n*Facebook/Instagram se aye ho?* 👋\nWah bhai! Aapko special discount milega! 🎉`
        : '';

    const deviceOptions = `\n\nAapka device kaunsa hai bhai? 👇

1️⃣ *iPhone XS/XR*
2️⃣ *iPhone 11/12*
3️⃣ *iPhone 13/14*
4️⃣ *iPhone 15/16*
5️⃣ *Samsung S20/S21/S22*
6️⃣ *Pixel 4/5/6/7*
7️⃣ *Koi aur device*
\n*Model number batain taake compatibility check kar sakon!* ✅`;

    return baseMessage + fromAdAddon + deviceOptions;
}

// ════════════════════════════════════════════════════════════════════════════
// 🔄 RETURNING CUSTOMER GREETING
// ════════════════════════════════════════════════════════════════════════════
function getReturningCustomerGreeting(profile) {
    const greetings = [
        `Welcome back bhai! ❤️ ${profile.name ? profile.name : ''} kaise hain?\n\n*Kaunsa error aa raha hai ya koi issue face kar rahe hain?* 🤔\n\nDetail mein batain taake help kar sakon! 🙏`,
        `Wapis aagaye bhai! ❤️ ${profile.name ? profile.name : ''}!\n\n*Kya masla aa raha hai bhai?*\n\nBataein main solve karwata hoon! 👍`,
        `Han bhai ${profile.name || ''}! ❤️ Dobara welcome!\n\n*Konsa issue hai?*\n\n1️⃣ eSIM activate nahi ho rahi?\n2️⃣ Signal nahi aa rahe?\n3️⃣ Data roaming issue?\n4️⃣ Kuch aur?\n\nBataein! 🙏`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
}

// ════════════════════════════════════════════════════════════════════════════
// 💳 JV DEVICE TRIAL SUGGESTION
// ════════════════════════════════════════════════════════════════════════════
function getJVTrialSuggestion(deviceName) {
    return `✅ *${deviceName} pe eSIM work karti hai bhai!* ❤️

*Lekin JV device ke liye special suggestion:* 🤔

Pehle *500MB trial lein - Rs. 130 only* ⚡

✅ *Agar work kare* → 1GB upgrade kar lain
❌ *Agar nahi kare* → Sirf Rs. 130 loss

*Trial lene ke benefits:*
📱 Confirm ho jayega eSIM support hai
💰 Risk free - choti amount pe test
🔥 Full confidence ke saath 1GB lena

*Kya kehte hain bhai? Trial lein?* 👍`;
}

// ════════════════════════════════════════════════════════════════════════════
// 🌍 INTERNATIONAL eSIM EXPLANATION
// ════════════════════════════════════════════════════════════════════════════
function getInternationalESIMExplanation() {
    return `*International eSIMs ka issue samajhain bhai:* ❤️

❌ *Airalo, Maya, Saily jaise international eSIMs Pakistani devices pe work nahi kartay*

*Reason:*
📍 Wo global roaming pe based hain
📍 Pakistan-specific configuration nahi hai
📍 Local networks se properly connect nahi hotay

✅ *SimFly Pakistan ki eSIM:*
📍 Specifically Pakistani Non-PTA devices ke liye configured
📍 Local networks ke saath optimized
📍 Is liye hi work karti hai perfectly!

*Baqi sab bekar, SimFly hi asli kaam!* 💪❤️`;
}

// ============================================
// AUTOMATION SYSTEM
// ============================================
const automationState = {
    dailyReportSent: false,
    lastBackupDate: null,
    abandonedCarts: new Map(),
    conversionAttempts: new Map(),
    userTags: new Map(),
    lastEscalation: new Map()
};

function startDailyReportScheduler() {
    if (!AUTOMATION?.dailyReportTime) return;
    const [hours, minutes] = AUTOMATION.dailyReportTime.split(':');
    const now = new Date();
    const reportTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (reportTime < now) reportTime.setDate(reportTime.getDate() + 1);
    const delay = reportTime - now;
    setTimeout(() => {
        sendDailyReport();
        setInterval(sendDailyReport, 24 * 60 * 60 * 1000);
    }, delay);
}

async function sendDailyReport() {
    if (!ADMIN_NUMBER) return;
    try {
        const stats = await getStats();
        const orders = await getAllOrders();
        const today = new Date().setHours(0, 0, 0, 0);
        const todayOrders = orders.filter(o => new Date(o.createdAt).setHours(0, 0, 0, 0) === today);
        const revenue = todayOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

        const reportMsg = `📈 *DAILY SALES REPORT*

📅 Date: ${new Date().toLocaleDateString()}
💰 Revenue: Rs. ${revenue}
📦 Orders: ${todayOrders.length}
👥 New Users: ${Object.keys(localDB.users || {}).length}
⏳ Pending: ${(await getPendingOrders()).length}
✅ Completed: ${todayOrders.filter(o => o.status === 'completed').length}
❌ Rejected: ${todayOrders.filter(o => o.status === 'rejected').length}

*Plan Breakdown:*
• 500MB: ${todayOrders.filter(o => o.planType === '500MB').length}
• 1GB: ${todayOrders.filter(o => o.planType === '1GB').length}
• 5GB: ${todayOrders.filter(o => o.planType === '5GB').length}

_Kal subha tak sab theek!_ ✅`;

        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(adminChat, reportMsg);
        log('Daily report sent', 'info');
    } catch (e) {
        log('Daily report error: ' + e.message, 'error');
    }
}

function trackAbandonedCart(chatId, planType) {
    if (!AUTOMATION?.abandonedCartEnabled) return;
    automationState.abandonedCarts.set(chatId, { planType, timestamp: Date.now() });
}

function clearAbandonedCart(chatId) {
    automationState.abandonedCarts.delete(chatId);
}

async function checkForEscalation(chatId, messageCount) {
    if (!AUTOMATION?.escalationEnabled) return false;
    const lastEscalation = automationState.lastEscalation.get(chatId) || 0;
    if (messageCount - lastEscalation >= AUTOMATION.escalationAfterAttempts) {
        if (ADMIN_NUMBER) {
            const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
            await client.sendMessage(adminChat, `🚨 *ESCALATION: Customer ${chatId} needs help after ${messageCount} messages*`);
            automationState.lastEscalation.set(chatId, messageCount);
        }
        return true;
    }
    return false;
}

function detectFBCampaign(messageBody) {
    if (!AUTOMATION?.fbTrackingEnabled) return null;
    for (const code of AUTOMATION.fbCampaignCodes) {
        if (messageBody.includes(code)) return code;
    }
    return null;
}

function initializeAutomation() {
    startDailyReportScheduler();

    // Feature 19: Abandoned Cart Recovery - Check every 30 minutes
    setInterval(async () => {
        await checkAbandonedCart();
    }, 30 * 60 * 1000);

    log('🤖 Automation System Ready! (Abandoned cart checker active)', 'info');
}


// ============================================
// FIREBASE SETUP
// ============================================
let admin = null;
let DB = null;

if (isFirebaseEnabled()) {
    try {
        admin = require('firebase-admin');

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: FIREBASE.projectId,
                clientEmail: FIREBASE.clientEmail,
                privateKey: FIREBASE.privateKey
            }),
            databaseURL: FIREBASE.databaseURL
        });

        DB = admin.database();
        console.log('✓ Firebase Realtime Database connected');
    } catch (e) {
        console.error('✗ Firebase setup failed:', e.message);
        DB = null;
    }
}

// Local fallback if Firebase fails
const localDB = {
    conversations: {},
    stats: { totalMessages: 0, totalOrders: 0 },
    users: {},
    orders: []
};

const DATA_DIR = path.join(__dirname, DB_CONFIG.dataDir);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, DB_CONFIG.dbFile);
if (fs.existsSync(DB_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        Object.assign(localDB, data);
    } catch (e) {
        console.log('⚠ Local DB load failed');
    }
}

// Auto-save local fallback
setInterval(() => {
    if (!DB) {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(localDB, null, 2));
        } catch (e) {}
    }
}, DB_CONFIG.autoSaveInterval);

// ============================================
// DATABASE FUNCTIONS (Firebase + Local Fallback)
// ============================================
async function saveMessage(chatId, message) {
    const chatKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        // Firebase
        const ref = DB.ref(`conversations/${chatKey}`);
        const snapshot = await ref.once('value');
        const messages = snapshot.val() || [];
        messages.push(message);
        if (messages.length > DB_CONFIG.maxMessagesPerChat) {
            messages.splice(0, messages.length - DB_CONFIG.maxMessagesPerChat);
        }
        await ref.set(messages);
    } else {
        // Local fallback
        if (!localDB.conversations[chatKey]) localDB.conversations[chatKey] = [];
        localDB.conversations[chatKey].push(message);
        if (localDB.conversations[chatKey].length > DB_CONFIG.maxMessagesPerChat) {
            localDB.conversations[chatKey] = localDB.conversations[chatKey].slice(-DB_CONFIG.maxMessagesPerChat);
        }
    }
}

async function getHistory(chatId) {
    const chatKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        const snapshot = await DB.ref(`conversations/${chatKey}`).once('value');
        return snapshot.val() || [];
    }
    return localDB.conversations[chatKey] || [];
}

async function addOrder(orderData) {
    const order = {
        id: Date.now().toString(36),
        ...orderData,
        createdAt: Date.now(),
        status: 'pending'
    };

    if (DB) {
        await DB.ref(`orders/${order.id}`).set(order);
        const statsRef = DB.ref('stats/totalOrders');
        const snapshot = await statsRef.once('value');
        await statsRef.set((snapshot.val() || 0) + 1);
    } else {
        localDB.orders.push(order);
        localDB.stats.totalOrders++;
    }

    return order;
}

async function getOrders(chatId) {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        const orders = snapshot.val() || {};
        return Object.values(orders).filter(o => o.chatId === chatId);
    }
    return localDB.orders.filter(o => o.chatId === chatId);
}

async function incrementStats(field) {
    if (DB) {
        const ref = DB.ref(`stats/${field}`);
        const snapshot = await ref.once('value');
        await ref.set((snapshot.val() || 0) + 1);
    } else {
        localDB.stats[field]++;
    }
}

async function getStats() {
    if (DB) {
        const snapshot = await DB.ref('stats').once('value');
        return snapshot.val() || { totalMessages: 0, totalOrders: 0 };
    }
    return localDB.stats;
}

async function trackUser(chatId) {
    const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        const ref = DB.ref(`users/${userKey}`);
        const snapshot = await ref.once('value');
        const user = snapshot.val() || { firstSeen: Date.now(), messages: 0 };
        user.messages++;
        user.lastSeen = Date.now();
        await ref.set(user);
    } else {
        if (!localDB.users[userKey]) {
            localDB.users[userKey] = { firstSeen: Date.now(), messages: 0 };
        }
        localDB.users[userKey].messages++;
        localDB.users[userKey].lastSeen = Date.now();
    }
}

async function getUserCount() {
    if (DB) {
        const snapshot = await DB.ref('users').once('value');
        const users = snapshot.val() || {};
        return Object.keys(users).length;
    }
    return Object.keys(localDB.users).length;
}

async function getAllUsers() {
    if (DB) {
        const snapshot = await DB.ref('users').once('value');
        const users = snapshot.val() || {};
        return Object.keys(users).map(key => ({ chatId: key.replace(/_/g, ''), ...users[key] }));
    }
    return Object.keys(localDB.users).map(key => ({ chatId: key.replace(/_/g, ''), ...localDB.users[key] }));
}

async function updateOrderStatus(orderId, status, note = '') {
    if (DB) {
        const ref = DB.ref(`orders/${orderId}`);
        await ref.update({ status, note, updatedAt: Date.now() });
    } else {
        const order = localDB.orders.find(o => o.id === orderId);
        if (order) {
            order.status = status;
            order.note = note;
            order.updatedAt = Date.now();
        }
    }
}

async function getPendingOrders() {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        const orders = Object.values(snapshot.val() || {});
        return orders.filter(o => o.status === 'pending');
    }
    return localDB.orders.filter(o => o.status === 'pending');
}

// ============================================
// 🏢 BUSINESS AUTOMATION SYSTEM v10.0
// ============================================
const BusinessAutomation = {
    // Conversion tracking
    conversions: {
        total: 0,
        today: 0,
        bySource: new Map(), // Track which ads/sources convert
        byPlan: new Map()    // Track which plans sell most
    },

    // Customer journey stages
    customerStages: new Map(), // chatId -> {stage, startedAt, lastActivity}

    // Abandoned cart recovery
    abandonedCarts: new Map(), // chatId -> {planType, price, timestamp}

    // Smart follow-ups
    followUpQueue: [], // Array of follow-up tasks

    // Daily stats reset
    lastResetDate: new Date().toDateString(),

    // Auto-responses for common queries (anti-spam)
    autoResponseCache: new Map(), // chatId -> {lastResponseTime, responseCount}

    // Human handoff triggers
    handoffTriggers: ['angry', 'frustrated', 'refund', 'complaint', 'lawyer', 'police'],

    // Initialize business automation
    init() {
        // Reset daily stats at midnight
        setInterval(() => {
            const today = new Date().toDateString();
            if (today !== this.lastResetDate) {
                this.conversions.today = 0;
                this.lastResetDate = today;
                log('📊 Daily stats reset', 'info');
            }
        }, 60000); // Check every minute

        // Process follow-up queue every 5 minutes
        setInterval(() => this.processFollowUps(), 5 * 60 * 1000);

        log('🏢 Business Automation System initialized', 'info');
    },

    // Track customer stage in funnel
    trackStage(chatId, stage) {
        const existing = this.customerStages.get(chatId) || {};
        this.customerStages.set(chatId, {
            stage,
            startedAt: existing.startedAt || Date.now(),
            lastActivity: Date.now(),
            previousStage: existing.stage
        });
    },

    // Get customer stage
    getStage(chatId) {
        return this.customerStages.get(chatId)?.stage || 'new';
    },

    // Track abandoned cart
    trackAbandonedCart(chatId, planType, price) {
        this.abandonedCarts.set(chatId, {
            planType,
            price,
            timestamp: Date.now()
        });

        // Schedule recovery message in 30 minutes
        setTimeout(() => {
            this.sendCartRecovery(chatId, planType, price);
        }, 30 * 60 * 1000);
    },

    // Send cart recovery message
    async sendCartRecovery(chatId, planType, price) {
        // Check if still abandoned (no purchase since)
        const cart = this.abandonedCarts.get(chatId);
        if (!cart) return; // Already purchased

        // Check if customer has since purchased
        const stage = this.getStage(chatId);
        if (stage === 'purchased' || stage === 'completed') {
            this.abandonedCarts.delete(chatId);
            return;
        }

        const messages = [
            `Bhai, aapne ${planType} plan dekha tha! ❤️\n\nKoi confusion ho toh pooch sakte hain! Main yahan houn help ke liye. 👍`,
            `Bhai, Rs. ${price} ka ${planType} plan abhi bhi available hai! ❤️\n\nAgar aap ready hain toh payment karke screenshot bhejein.\n\nYa koi sawal ho toh pooch lein! 🤔`,
            `Bhai, limited slots hain! ❤️ ${planType} plan ke liye jaldi karein.\n\nKoi masla ho toh batain! Main solve karwata houn! 💪`
        ];

        const message = messages[Math.floor(Math.random() * messages.length)];

        try {
            if (client) {
                await client.sendMessage(chatId, message);
                this.trackStage(chatId, 'recovery_sent');
                log(`Cart recovery sent to ${chatId}`, 'info');
            }
        } catch (e) {
            log(`Cart recovery failed: ${e.message}`, 'error');
        }
    },

    // Track conversion
    trackConversion(chatId, planType, amount, source = 'organic') {
        this.conversions.total++;
        this.conversions.today++;

        // Track by source
        const currentSource = this.conversions.bySource.get(source) || 0;
        this.conversions.bySource.set(source, currentSource + 1);

        // Track by plan
        const currentPlan = this.conversions.byPlan.get(planType) || 0;
        this.conversions.byPlan.set(planType, currentPlan + 1);

        // Remove from abandoned carts
        this.abandonedCarts.delete(chatId);

        // Update stage
        this.trackStage(chatId, 'purchased');

        log(`💰 Conversion: ${planType} - Rs. ${amount} from ${source}`, 'business');
    },

    // Check for spam/abuse (rate limiting per user)
    checkRateLimit(chatId) {
        const now = Date.now();
        const userData = this.autoResponseCache.get(chatId) || { lastResponseTime: 0, responseCount: 0 };

        // Reset count if last response was more than 1 minute ago
        if (now - userData.lastResponseTime > 60000) {
            userData.responseCount = 0;
        }

        userData.responseCount++;
        userData.lastResponseTime = now;
        this.autoResponseCache.set(chatId, userData);

        // If more than 10 messages in 1 minute, slow down
        if (userData.responseCount > 10) {
            return false; // Rate limited
        }
        return true; // OK
    },

    // Check if should handoff to human
    shouldHandoffToHuman(chatId, message, profile) {
        const lowerMsg = message.toLowerCase();

        // Check trigger words
        for (const trigger of this.handoffTriggers) {
            if (lowerMsg.includes(trigger)) {
                return {
                    shouldHandoff: true,
                    reason: `Trigger word detected: ${trigger}`,
                    urgency: 'high'
                };
            }
        }

        // Check for repeated frustration
        if (profile.mood === 'frustrated' && profile.messageCount > 5) {
            return {
                shouldHandoff: true,
                reason: 'Repeated frustration detected',
                urgency: 'medium'
            };
        }

        // Check for complex issues (multiple back-and-forths)
        const stage = this.getStage(chatId);
        if (stage === 'issue_reported' && profile.messageCount > 8) {
            return {
                shouldHandoff: true,
                reason: 'Complex issue requiring human attention',
                urgency: 'medium'
            };
        }

        return { shouldHandoff: false };
    },

    // Process follow-up queue
    async processFollowUps() {
        const now = Date.now();
        const toProcess = this.followUpQueue.filter(item => item.dueTime <= now);

        for (const item of toProcess) {
            try {
                if (client) {
                    await client.sendMessage(item.chatId, item.message);
                    log(`Follow-up sent to ${item.chatId}`, 'info');
                }
            } catch (e) {
                log(`Follow-up failed: ${e.message}`, 'error');
            }
        }

        // Remove processed items
        this.followUpQueue = this.followUpQueue.filter(item => item.dueTime > now);
    },

    // Schedule follow-up
    scheduleFollowUp(chatId, message, delayMinutes) {
        this.followUpQueue.push({
            chatId,
            message,
            dueTime: Date.now() + (delayMinutes * 60 * 1000)
        });
    },

    // Get business stats
    getStats() {
        return {
            totalConversions: this.conversions.total,
            todayConversions: this.conversions.today,
            bySource: Object.fromEntries(this.conversions.bySource),
            byPlan: Object.fromEntries(this.conversions.byPlan),
            activeCustomers: this.customerStages.size,
            abandonedCarts: this.abandonedCarts.size,
            followUpQueue: this.followUpQueue.length
        };
    },

    // Smart delay calculation (human-like response time)
    calculateResponseDelay(messageLength, hasMedia) {
        // Base delay: 1-3 seconds
        let delay = 1000 + Math.random() * 2000;

        // Add delay based on message length (typing time)
        if (messageLength > 100) {
            delay += messageLength * 20; // 20ms per character
        }

        // Add delay if media processing needed
        if (hasMedia) {
            delay += 3000 + Math.random() * 2000; // 3-5 seconds for "analysis"
        }

        // Cap at 10 seconds max
        return Math.min(delay, 10000);
    }
};

// Note: BusinessAutomation.init() moved to after State definition (line ~2950)

// ============================================
// PAYMENT VERIFICATION SYSTEM
// ============================================
const pendingPayments = new Map();

// Track admin verification messages for reply-based commands
const adminVerificationMessages = new Map(); // messageId -> orderData

// Store recent payment screenshots for admin review
const paymentScreenshots = new Map(); // chatId -> {mediaData, timestamp, orderData}

// ============================================
// 🔄 AUTO-FOLLOWUP SYSTEM
// ============================================
const pendingFollowups = new Map(); // chatId -> {lastMessageTime, stage, attempts}
const FOLLOWUP_DELAY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FOLLOWUP_ATTEMPTS = 2;

// Start followup checker
function startFollowupChecker() {
    setInterval(async () => {
        if (!State.followupEnabled || !client || !State.isReady) return;
        await checkAndSendFollowups();
    }, 5 * 60 * 1000); // Check every 5 minutes
    log('Auto-followup system started', 'info');
}

async function checkAndSendFollowups() {
    const now = Date.now();

    for (const [chatId, data] of pendingFollowups) {
        // Skip if already at max attempts
        if (data.attempts >= MAX_FOLLOWUP_ATTEMPTS) {
            pendingFollowups.delete(chatId);
            continue;
        }

        // Check if enough time has passed
        const timeSinceLastMessage = now - data.lastMessageTime;
        if (timeSinceLastMessage < FOLLOWUP_DELAY_MS) continue;

        // Check if user has replied since (get fresh history)
        const history = await getHistory(chatId);
        const lastCustomerMessage = history.filter(m => !m.fromMe).pop();
        if (lastCustomerMessage && lastCustomerMessage.time > data.lastMessageTime) {
            // User has replied, update tracking
            pendingFollowups.delete(chatId);
            continue;
        }

        // Send followup based on stage
        data.attempts++;
        await sendFollowupMessage(chatId, data.stage, data.attempts);

        // Update last message time to prevent immediate re-trigger
        data.lastMessageTime = now;

        log(`Followup #${data.attempts} sent to ${chatId}`, 'info');
    }
}

async function sendFollowupMessage(chatId, stage, attempt) {
    let message = '';

    if (attempt === 1) {
        // Gentle first reminder
        message = `Bhai, koi confusion ho toh pooch sakte hain! 😊\n\nMain yahan houn aapki help ke liye.\n\nKya aap:\n📱 Abhi bhi plan lena chahte hain?\n❓ Koi sawal poochna chahte hain?\n\nBas reply karein!`;
    } else {
        // Second reminder with urgency
        message = `Bhai, main wait kar raha houn! ⏰\n\nAgar aap abhi busy hain toh koi baat nahi, jab time mile tab message karein.\n\nSimFly Pakistan - 24/7 available! 🚀`;
    }

    try {
        await client.sendMessage(chatId, message);
        await saveMessage(chatId, { body: message, fromMe: true, time: Date.now() });
    } catch (e) {
        log('Followup send error: ' + e.message, 'error');
    }
}

function scheduleFollowup(chatId, stage) {
    if (!State.followupEnabled) return;
    pendingFollowups.set(chatId, {
        lastMessageTime: Date.now(),
        stage: stage,
        attempts: 0
    });
    log(`Followup scheduled for ${chatId}`, 'info');
}

function cancelFollowup(chatId) {
    if (pendingFollowups.has(chatId)) {
        pendingFollowups.delete(chatId);
        log(`Followup cancelled for ${chatId}`, 'info');
    }
}

async function verifyPaymentScreenshot(msg, chatId, body) {
    const lowerBody = body.toLowerCase();
    const paymentKeywords = ['payment', 'screenshot', 'pay', 'done', 'send', 'sent', 'bheja', 'transfer', 'rs', 'rs.', 'amount', 'paid'];
    const issueKeywords = ['problem', 'issue', 'masla', 'error', 'nahi', 'fail', 'not working', 'help', 'support'];
    const isPaymentRelated = paymentKeywords.some(k => lowerBody.includes(k));
    const isIssueRelated = issueKeywords.some(k => lowerBody.includes(k));

    if (!isPaymentRelated && !isIssueRelated && !msg.hasMedia) return null;

    const verificationResult = {
        verified: false,
        type: 'unknown', // 'payment', 'issue', 'unknown'
        planType: null,
        amount: null,
        paymentMethod: null,
        confidence: 0,
        geminiAnalysis: null
    };

    // If has media, use Gemini AI to analyze
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
                log(`Analyzing screenshot from ${chatId} with Gemini AI...`, 'info');
                const analysis = await analyzeImageWithGemini(media.data, media.mimetype, chatId, body);
                verificationResult.geminiAnalysis = analysis;

                if (analysis.type === 'payment') {
                    verificationResult.type = 'payment';
                    verificationResult.confidence = analysis.confidence;

                    // Extract amount from Gemini analysis
                    if (analysis.amount) {
                        if (analysis.amount === 130) verificationResult.planType = '500MB';
                        else if (analysis.amount === 400) verificationResult.planType = '1GB';
                        else if (analysis.amount === 1500) verificationResult.planType = '5GB';
                        verificationResult.amount = analysis.amount;
                    }

                    // Extract payment method
                    if (analysis.method) {
                        verificationResult.paymentMethod = analysis.method;
                    }

                    // Mark as verified if confidence is high
                    if (analysis.confidence >= 60) {
                        verificationResult.verified = true;
                    }
                } else if (analysis.type === 'issue') {
                    verificationResult.type = 'issue';
                    verificationResult.confidence = analysis.confidence;
                    verificationResult.issueDescription = analysis.description;
                }
            }
        } catch (e) {
            log('Gemini analysis error: ' + e.message, 'error');
        }
    }

    // Fallback: Detect plan type from message text
    if (!verificationResult.planType) {
        if (lowerBody.includes('500mb') || lowerBody.includes('500 mb') || lowerBody.includes('130')) {
            verificationResult.planType = '500MB';
            verificationResult.amount = 130;
            verificationResult.confidence += 30;
        } else if (lowerBody.includes('1gb') || lowerBody.includes('1 gb') || lowerBody.includes('400')) {
            verificationResult.planType = '1GB';
            verificationResult.amount = 400;
            verificationResult.confidence += 30;
        } else if (lowerBody.includes('5gb') || lowerBody.includes('5 gb') || lowerBody.includes('1500')) {
            verificationResult.planType = '5GB';
            verificationResult.amount = 1500;
            verificationResult.confidence += 30;
        }
    }

    // Fallback: Detect payment method from text
    if (!verificationResult.paymentMethod) {
        if (lowerBody.includes('jazzcash') || lowerBody.includes('jazz')) {
            verificationResult.paymentMethod = 'JazzCash';
            verificationResult.confidence += 20;
        } else if (lowerBody.includes('easypaisa') || lowerBody.includes('easy')) {
            verificationResult.paymentMethod = 'EasyPaisa';
            verificationResult.confidence += 20;
        } else if (lowerBody.includes('sadapay') || lowerBody.includes('sada')) {
            verificationResult.paymentMethod = 'SadaPay';
            verificationResult.confidence += 20;
        }
    }

    // If still no type detected but has media, assume payment
    if (verificationResult.type === 'unknown' && msg.hasMedia && isPaymentRelated) {
        verificationResult.type = 'payment';
        verificationResult.confidence = Math.max(verificationResult.confidence, 50);
    }

    // Save to pending payments
    if (verificationResult.type === 'payment') {
        pendingPayments.set(chatId, {
            ...verificationResult,
            chatId,
            messageId: msg.id?.id,
            timestamp: Date.now(),
            originalMessage: body
        });
    }

    return verificationResult;
}

// ═══════════════════════════════════════════════════════
// 📋 EDITABLE PLAN GUIDES — Admin can customize via commands
// ═══════════════════════════════════════════════════════
async function getPlanDetails(planType) {
    // Get guide config (custom or default)
    const guide = getGuide(planType);
    if (!guide) return null;

    // Plan specs
    const planSpecs = {
        '500MB': { name: '500MB', data: '500MB', price: 130, devices: 1 },
        '1GB': { name: '1GB', data: '1GB', price: 400, devices: 1 },
        '5GB': { name: '5GB', data: '5GB', price: 1500, devices: 4 }
    };

    const specs = planSpecs[planType];
    if (!specs) return null;

    // Replace placeholders in template
    let setupInstructions = guide.template
        .replace(/{{planName}}/g, specs.name)
        .replace(/{{data}}/g, specs.data)
        .replace(/{{price}}/g, specs.price)
        .replace(/{{duration}}/g, '2 Years')
        .replace(/{{devices}}/g, specs.devices)
        .replace(/{{provider}}/g, guide.provider || 'Eskimo')
        .replace(/{{promoCode}}/g, guide.promoCode || 'NOCODE')
        .replace(/{{iosLink}}/g, guide.iosAppLink || '')
        .replace(/{{androidLink}}/g, guide.androidAppLink || '');

    return {
        name: specs.name,
        data: specs.data,
        price: specs.price,
        duration: '2 Years',
        devices: specs.devices,
        qrCode: guide.qrCodeData || `${planType}_QR_CODE`,
        promoCode: guide.promoCode || 'NOCODE',
        esimProvider: guide.provider || 'Eskimo',
        manualSend: guide.manualSend || false,
        setupInstructions
    };
}

async function sendPlanDetailsAfterVerification(chatId, planType) {
    if (!client) {
        log('Cannot send plan details - client not initialized', 'error');
        return;
    }

    const plan = await getPlanDetails(planType);
    if (!plan) return;

    // Special handling for 5GB - Admin must manually send
    if (planType === '5GB') {
        // Notify customer that admin will manually process
        await client.sendMessage(chatId, `✅ *Payment Verified Successfully!*\n\n📦 *Plan:* ${plan.name} (5GB Family Pack)\n💰 *Amount:* Rs. ${plan.price}\n\n⚠️ *5GB Plan Requires Manual Setup*\n\nAdmin aapko jaldi hi eSIM details bhejega.\n\n*Koi masla nahi, aapka order safe hai!* ✅\n\n_Jaldi milte hain!_`);

        // Notify admin to manually send 5GB plan
        if (ADMIN_NUMBER) {
            try {
                const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                await client.sendMessage(adminChat, `🚨 *5GB PLAN - MANUAL ACTION REQUIRED*\n\n👤 Customer: ${chatId}\n📦 Plan: 5GB (4 Devices)\n💰 Amount: Rs. 1500\n\n⚠️ *5GB plan needs manual sending!*\n\n➜ Send promo code manually\n➜ Use: !send-plan ${chatId} 5GB\n\n_Customer ko auto-reply nahi gaya. Manual bhejein!_`);
            } catch (e) {}
        }

        // Save order as pending manual completion
        const orderId = Date.now().toString(36);
        await addOrder({
            chatId,
            type: 'manual_5gb_order',
            planType: plan.name,
            amount: plan.price,
            status: 'pending_manual',
            orderId,
            promoCode: plan.promoCode,
            esimProvider: plan.esimProvider
        });

        log(`5GB Plan - Admin notification sent for ${chatId}`, 'admin');
        return;
    }

    // Auto-send for 500MB and 1GB - ONE SIMPLE BUT DETAILED MESSAGE
    const simpleGuide = `✅ *Payment Verified!*

📦 Plan: ${plan.name}
💰 Price: Rs. ${plan.price}
🎁 Promo Code: ${plan.promoCode}

📲 *Setup Steps:*
1️⃣ Download eSIM app from App Store/Play Store
2️⃣ Sign up → Enter promo code: *${plan.promoCode}*
3️⃣ Settings → Cellular → Add eSIM
4️⃣ Scan QR code OR enter details manually
5️⃣ Enable Data Roaming ✅
6️⃣ Wait 2-5 minutes for activation

❓ Problem? Type "support"

Shukriya! 🙏`;

    await client.sendMessage(chatId, simpleGuide);

    // Save order as completed
    const orderId = Date.now().toString(36);
    await addOrder({
        chatId,
        type: 'verified_order',
        planType: plan.name,
        amount: plan.price,
        status: 'completed',
        orderId,
        promoCode: plan.promoCode,
        esimProvider: plan.esimProvider
    });

    log(`Plan ${plan.name} sent to ${chatId} with promo ${plan.promoCode}`, 'info');
}

// ============================================
// STATE
// ============================================
const State = {
    isReady: false,
    status: 'INITIALIZING',
    qrData: null,
    logs: [],
    startTime: Date.now(),
    processedMessages: new Set(), // Deduplication
    stats: { totalMessages: 0, totalOrders: 0 },
    groq: {
        enabled: isGroqEnabled(),
        status: 'active', // active, cooldown, disabled
        failureCount: 0,
        lastCall: null,
        lastError: null
    },
    botPaused: false, // Admin pause/resume control
    pausedBy: null, // Which admin paused
    pauseReason: null, // Why paused
    userSessions: new Map(), // Track user conversation state
    followupEnabled: true // Auto-followup feature
};

// Initialize guides after State is defined
loadCustomGuides();

// Initialize business automation (now safe to call)
BusinessAutomation.init();

// ============================================
// ADMIN COMMAND SYSTEM (100+ Commands)
// ============================================
const ADMIN_COMMANDS = {
    // 📢 BROADCAST COMMANDS
    '!broadcast': { desc: 'Broadcast message to all users', usage: '!broadcast <message>', category: 'broadcast' },
    '!bc': { desc: 'Short for broadcast', usage: '!bc <message>', category: 'broadcast' },
    '!broadcast-active': { desc: 'Broadcast to active users (last 24h)', usage: '!broadcast-active <message>', category: 'broadcast' },
    '!bc-img': { desc: 'Broadcast with image URL', usage: '!bc-img <url> | <message>', category: 'broadcast' },
    '!announce': { desc: 'Send announcement to all users', usage: '!announce <message>', category: 'broadcast' },
    '!notify': { desc: 'Send notification', usage: '!notify <message>', category: 'broadcast' },
    '!promo': { desc: 'Send promotional message', usage: '!promo <message>', category: 'broadcast' },
    '!reminder': { desc: 'Send reminder to all', usage: '!reminder <message>', category: 'broadcast' },

    // 👤 USER MANAGEMENT
    '!users': { desc: 'List all users', usage: '!users', category: 'users' },
    '!user-count': { desc: 'Get total user count', usage: '!user-count', category: 'users' },
    '!user-info': { desc: 'Get user details', usage: '!user-info <number>', category: 'users' },
    '!user-ban': { desc: 'Ban a user', usage: '!user-ban <number>', category: 'users' },
    '!user-unban': { desc: 'Unban a user', usage: '!user-unban <number>', category: 'users' },
    '!user-delete': { desc: 'Delete user data', usage: '!user-delete <number>', category: 'users' },
    '!active-users': { desc: 'List active users (24h)', usage: '!active-users', category: 'users' },
    '!inactive-users': { desc: 'List inactive users', usage: '!inactive-users', category: 'users' },
    '!user-history': { desc: 'View user chat history', usage: '!user-history <number>', category: 'users' },
    '!user-orders': { desc: 'View user orders', usage: '!user-orders <number>', category: 'users' },
    '!user-msg': { desc: 'Message specific user', usage: '!user-msg <number> | <message>', category: 'users' },
    '!user-stats': { desc: 'User statistics', usage: '!user-stats', category: 'users' },
    '!user-export': { desc: 'Export user list', usage: '!user-export', category: 'users' },
    '!user-import': { desc: 'Import user list', usage: '!user-import <data>', category: 'users' },
    '!user-search': { desc: 'Search users', usage: '!user-search <keyword>', category: 'users' },
    '!user-filter': { desc: 'Filter users by criteria', usage: '!user-filter <criteria>', category: 'users' },
    '!user-tag': { desc: 'Tag a user', usage: '!user-tag <number> <tag>', category: 'users' },
    '!user-untag': { desc: 'Remove tag from user', usage: '!user-untag <number>', category: 'users' },
    '!user-list-tags': { desc: 'List all user tags', usage: '!user-list-tags', category: 'users' },

    // 📊 ORDER MANAGEMENT
    '!orders': { desc: 'List all orders', usage: '!orders', category: 'orders' },
    '!order-count': { desc: 'Get total order count', usage: '!order-count', category: 'orders' },
    '!order-pending': { desc: 'List pending orders', usage: '!order-pending', category: 'orders' },
    '!order-completed': { desc: 'List completed orders', usage: '!order-completed', category: 'orders' },
    '!order-info': { desc: 'Get order details', usage: '!order-info <orderId>', category: 'orders' },
    '!order-status': { desc: 'Update order status', usage: '!order-status <orderId> <status>', category: 'orders' },
    '!order-approve': { desc: 'Approve an order', usage: '!order-approve <orderId>', category: 'orders' },
    '!order-reject': { desc: 'Reject an order', usage: '!order-reject <orderId> <reason>', category: 'orders' },
    '!order-cancel': { desc: 'Cancel an order', usage: '!order-cancel <orderId>', category: 'orders' },
    '!order-refund': { desc: 'Process refund', usage: '!order-refund <orderId>', category: 'orders' },
    '!order-delete': { desc: 'Delete an order', usage: '!order-delete <orderId>', category: 'orders' },
    '!order-search': { desc: 'Search orders', usage: '!order-search <keyword>', category: 'orders' },
    '!order-filter': { desc: 'Filter orders', usage: '!order-filter <criteria>', category: 'orders' },
    '!order-export': { desc: 'Export orders to CSV', usage: '!order-export', category: 'orders' },
    '!order-stats': { desc: 'Order statistics', usage: '!order-stats', category: 'orders' },
    '!order-today': { desc: 'Today\'s orders', usage: '!order-today', category: 'orders' },
    '!order-week': { desc: 'This week\'s orders', usage: '!order-week', category: 'orders' },
    '!order-month': { desc: 'This month\'s orders', usage: '!order-month', category: 'orders' },
    '!order-revenue': { desc: 'Calculate revenue', usage: '!order-revenue', category: 'orders' },

    // 💰 PAYMENT VERIFICATION
    '!approve': { desc: 'Approve payment verification', usage: '!approve <number>', category: 'payments' },
    '!payment-approve': { desc: 'Approve payment (alias)', usage: '!payment-approve <number>', category: 'payments' },
    '!reject': { desc: 'Reject payment verification', usage: '!reject <number> [reason]', category: 'payments' },
    '!payment-reject': { desc: 'Reject payment (alias)', usage: '!payment-reject <number> [reason]', category: 'payments' },
    '!pending': { desc: 'List pending payments', usage: '!pending', category: 'payments' },
    '!payments-pending': { desc: 'List pending payments (alias)', usage: '!payments-pending', category: 'payments' },
    '!check': { desc: 'Check payment details', usage: '!check <number>', category: 'payments' },
    '!payment-check': { desc: 'Check payment details (alias)', usage: '!payment-check <number>', category: 'payments' },
    '!verification-stats': { desc: 'Payment verification statistics', usage: '!verification-stats', category: 'payments' },
    '!vstats': { desc: 'Verification stats (short)', usage: '!vstats', category: 'payments' },

    // 🤖 GEMINI MODEL MANAGEMENT
    '!gemini-models': { desc: 'Show discovered Gemini vision models', usage: '!gemini-models', category: 'ai' },
    '!gemini-refresh': { desc: 'Refresh Gemini model cache', usage: '!gemini-refresh', category: 'ai' },
    '!gemini-test': { desc: 'Test specific Gemini model', usage: '!gemini-test <model-name>', category: 'ai' },

    // 🤖 BOT CONTROLS
    '!status': { desc: 'Show bot status', usage: '!status', category: 'bot' },
    '!restart': { desc: 'Restart the bot', usage: '!restart', category: 'bot' },
    '!stop': { desc: 'PAUSE bot (admin replies)', usage: '!stop [reason]', category: 'bot' },
    '!start': { desc: 'RESUME bot (auto-reply on)', usage: '!start', category: 'bot' },
    '!start-bot': { desc: 'Start the bot', usage: '!start-bot', category: 'bot' },
    '!reload': { desc: 'Reload configuration', usage: '!reload', category: 'bot' },
    '!pause': { desc: 'Pause auto-replies', usage: '!pause [reason]', category: 'bot' },
    '!resume': { desc: 'Resume auto-replies', usage: '!resume', category: 'bot' },
    '!maintenance': { desc: 'Toggle maintenance mode', usage: '!maintenance [on/off]', category: 'bot' },
    '!logs': { desc: 'Show recent logs', usage: '!logs [count]', category: 'bot' },
    '!clear-logs': { desc: 'Clear logs', usage: '!clear-logs', category: 'bot' },
    '!config': { desc: 'Show current config', usage: '!config', category: 'bot' },
    '!config-set': { desc: 'Set config value', usage: '!config-set <key> <value>', category: 'bot' },
    '!uptime': { desc: 'Show bot uptime', usage: '!uptime', category: 'bot' },
    '!ping': { desc: 'Check bot responsiveness', usage: '!ping', category: 'bot' },
    '!version': { desc: 'Show version info', usage: '!version', category: 'bot' },
    '!health': { desc: 'Health check', usage: '!health', category: 'bot' },
    '!stats': { desc: 'Show statistics', usage: '!stats', category: 'bot' },
    '!performance': { desc: 'Show performance metrics', usage: '!performance', category: 'bot' },
    '!backup': { desc: 'Create backup', usage: '!backup', category: 'bot' },
    '!restore': { desc: 'Restore from backup', usage: '!restore <backup-id>', category: 'bot' },

    // 📱 MESSAGING
    '!send': { desc: 'Send message to number', usage: '!send <number> | <message>', category: 'messaging' },
    '!reply': { desc: 'Reply to a user', usage: '!reply <number> | <message>', category: 'messaging' },
    '!template': { desc: 'Send template message', usage: '!template <template-name>', category: 'messaging' },
    '!quick-reply': { desc: 'Send quick reply', usage: '!quick-reply <number> | <id>', category: 'messaging' },
    '!schedule': { desc: 'Schedule a message', usage: '!schedule <time> | <number> | <message>', category: 'messaging' },
    '!cancel-schedule': { desc: 'Cancel scheduled message', usage: '!cancel-schedule <id>', category: 'messaging' },
    '!auto-reply': { desc: 'Toggle auto-reply', usage: '!auto-reply [on/off]', category: 'messaging' },
    '!typing': { desc: 'Toggle typing indicator', usage: '!typing [on/off]', category: 'messaging' },
    '!ai': { desc: 'Toggle AI responses', usage: '!ai [on/off]', category: 'messaging' },
    '!templates': { desc: 'List message templates', usage: '!templates', category: 'messaging' },
    '!template-add': { desc: 'Add template', usage: '!template-add <name> | <content>', category: 'messaging' },
    '!template-del': { desc: 'Delete template', usage: '!template-del <name>', category: 'messaging' },

    // 💎 PLAN MANAGEMENT
    '!plans': { desc: 'List all plans', usage: '!plans', category: 'plans' },
    '!plan-add': { desc: 'Add new plan', usage: '!plan-add <name> | <price> | <data>', category: 'plans' },
    '!plan-edit': { desc: 'Edit plan', usage: '!plan-edit <name> | <field> | <value>', category: 'plans' },
    '!plan-delete': { desc: 'Delete plan', usage: '!plan-delete <name>', category: 'plans' },
    '!plan-enable': { desc: 'Enable plan', usage: '!plan-enable <name>', category: 'plans' },
    '!plan-disable': { desc: 'Disable plan', usage: '!plan-disable <name>', category: 'plans' },
    '!plan-discount': { desc: 'Set plan discount', usage: '!plan-discount <name> | <percent>', category: 'plans' },
    '!plan-price': { desc: 'Update plan price', usage: '!plan-price <name> | <new-price>', category: 'plans' },
    '!promo-code': { desc: 'Create promo code', usage: '!promo-code <code> | <discount>', category: 'plans' },
    '!promo-delete': { desc: 'Delete promo code', usage: '!promo-delete <code>', category: 'plans' },
    '!promo-list': { desc: 'List promo codes', usage: '!promo-list', category: 'plans' },
    '!promo-validate': { desc: 'Validate promo code', usage: '!promo-validate <code>', category: 'plans' },

    // 🧠 HUMAN-LIKE FEATURES
    '!human-mode': { desc: 'Toggle human-like features', usage: '!human-mode [on/off]', category: 'human' },
    '!human-typo': { desc: 'Set typo chance', usage: '!human-typo [0-20]', category: 'human' },
    '!human-emoji': { desc: 'Set emoji frequency', usage: '!human-emoji [0-100]', category: 'human' },
    '!user-profile': { desc: 'View user profile', usage: '!user-profile <number>', category: 'human' },
    '!mood-stats': { desc: 'Show mood distribution', usage: '!mood-stats', category: 'human' },
    '!abandoned-carts': { desc: 'Check abandoned carts', usage: '!abandoned-carts', category: 'human' },

    // 📚 GUIDE MANAGEMENT — Edit eSIM guides
    '!guides': { desc: 'List all guides', usage: '!guides', category: 'guides' },
    '!guide-show': { desc: 'Show guide for plan', usage: '!guide-show <500MB|1GB|5GB>', category: 'guides' },
    '!guide-edit': { desc: 'Edit guide template', usage: '!guide-edit <plan> | <new-template>', category: 'guides' },
    '!guide-promo': { desc: 'Update promo code', usage: '!guide-promo <plan> | <new-code>', category: 'guides' },
    '!guide-provider': { desc: 'Update provider name', usage: '!guide-provider <plan> | <provider>', category: 'guides' },
    '!guide-links': { desc: 'Update app links', usage: '!guide-links <plan> | <ios-link> | <android-link>', category: 'guides' },
    '!guide-reset': { desc: 'Reset guide to default', usage: '!guide-reset <plan>', category: 'guides' },
    '!guide-preview': { desc: 'Preview guide with actual values', usage: '!guide-preview <plan>', category: 'guides' },
    '!guide-send': { desc: 'Manually send guide to user', usage: '!guide-send <number> | <plan>', category: 'guides' },
    '!guide-enable': { desc: 'Enable auto-send for plan', usage: '!guide-enable <plan>', category: 'guides' },
    '!guide-disable': { desc: 'Disable auto-send for plan', usage: '!guide-disable <plan>', category: 'guides' },

    // 💳 PAYMENT MANAGEMENT
    '!payments': { desc: 'List payment methods', usage: '!payments', category: 'payment' },
    '!payment-add': { desc: 'Add payment method', usage: '!payment-add <name> | <number>', category: 'payment' },
    '!payment-remove': { desc: 'Remove payment method', usage: '!payment-remove <name>', category: 'payment' },
    '!payment-update': { desc: 'Update payment method', usage: '!payment-update <name> | <new-number>', category: 'payment' },
    '!payment-verify': { desc: 'Verify a payment', usage: '!payment-verify <orderId>', category: 'payment' },
    '!payment-reject': { desc: 'Reject a payment', usage: '!payment-reject <orderId> <reason>', category: 'payment' },
    '!payment-pending': { desc: 'List pending payments', usage: '!payment-pending', category: 'payment' },
    '!payment-history': { desc: 'Payment history', usage: '!payment-history', category: 'payment' },
    '!payment-refund': { desc: 'Process refund', usage: '!payment-refund <orderId>', category: 'payment' },

    // 📈 ANALYTICS & REPORTS
    '!report': { desc: 'Generate report', usage: '!report [today/week/month]', category: 'analytics' },
    '!analytics': { desc: 'Show analytics', usage: '!analytics', category: 'analytics' },
    '!daily-report': { desc: 'Daily report', usage: '!daily-report', category: 'analytics' },
    '!weekly-report': { desc: 'Weekly report', usage: '!weekly-report', category: 'analytics' },
    '!monthly-report': { desc: 'Monthly report', usage: '!monthly-report', category: 'analytics' },
    '!sales': { desc: 'Sales statistics', usage: '!sales', category: 'analytics' },
    '!revenue': { desc: 'Revenue report', usage: '!revenue', category: 'analytics' },
    '!conversion': { desc: 'Conversion rate', usage: '!conversion', category: 'analytics' },
    '!engagement': { desc: 'User engagement', usage: '!engagement', category: 'analytics' },
    '!trends': { desc: 'Show trends', usage: '!trends', category: 'analytics' },
    '!graph': { desc: 'Generate graph', usage: '!graph <type>', category: 'analytics' },
    '!export-report': { desc: 'Export report', usage: '!export-report <format>', category: 'analytics' },

    // 🔧 DATABASE
    '!db-status': { desc: 'Database status', usage: '!db-status', category: 'database' },
    '!db-backup': { desc: 'Backup database', usage: '!db-backup', category: 'database' },
    '!db-restore': { desc: 'Restore database', usage: '!db-restore <file>', category: 'database' },
    '!db-export': { desc: 'Export database', usage: '!db-export', category: 'database' },
    '!db-import': { desc: 'Import data', usage: '!db-import <data>', category: 'database' },
    '!db-clean': { desc: 'Clean old data', usage: '!db-clean [days]', category: 'database' },
    '!db-optimize': { desc: 'Optimize database', usage: '!db-optimize', category: 'database' },
    '!db-migrate': { desc: 'Migrate data', usage: '!db-migrate <source> <target>', category: 'database' },
    '!db-reset': { desc: 'Reset database', usage: '!db-reset [confirm]', category: 'database' },
    '!db-size': { desc: 'Database size', usage: '!db-size', category: 'database' },
    '!db-stats': { desc: 'Database stats', usage: '!db-stats', category: 'database' },
    '!db-query': { desc: 'Run database query', usage: '!db-query <query>', category: 'database' },

    // 👥 STAFF MANAGEMENT
    '!staff': { desc: 'List staff', usage: '!staff', category: 'staff' },
    '!staff-add': { desc: 'Add staff', usage: '!staff-add <number> | <name> | <role>', category: 'staff' },
    '!staff-remove': { desc: 'Remove staff', usage: '!staff-remove <number>', category: 'staff' },
    '!staff-role': { desc: 'Change staff role', usage: '!staff-role <number> <role>', category: 'staff' },
    '!staff-perms': { desc: 'View staff permissions', usage: '!staff-perms <number>', category: 'staff' },
    '!staff-activity': { desc: 'Staff activity log', usage: '!staff-activity', category: 'staff' },
    '!admins': { desc: 'List admins', usage: '!admins', category: 'staff' },
    '!mod': { desc: 'Add moderator', usage: '!mod <number>', category: 'staff' },
    '!unmod': { desc: 'Remove moderator', usage: '!unmod <number>', category: 'staff' },

    // 🛡️ SECURITY
    '!block': { desc: 'Block a number', usage: '!block <number>', category: 'security' },
    '!unblock': { desc: 'Unblock a number', usage: '!unblock <number>', category: 'security' },
    '!blocked': { desc: 'List blocked numbers', usage: '!blocked', category: 'security' },
    '!spam': { desc: 'Mark as spam', usage: '!spam <number>', category: 'security' },
    '!unspam': { desc: 'Unmark spam', usage: '!unspam <number>', category: 'security' },
    '!rate-limit': { desc: 'Set rate limit', usage: '!rate-limit <number> <limit>', category: 'security' },
    '!whitelist': { desc: 'Whitelist a number', usage: '!whitelist <number>', category: 'security' },
    '!blacklist': { desc: 'Blacklist a number', usage: '!blacklist <number>', category: 'security' },
    '!security-logs': { desc: 'Security logs', usage: '!security-logs', category: 'security' },
    '!audit': { desc: 'Audit trail', usage: '!audit', category: 'security' },

    // 🚪 TEST BOARD / PRIVATE MODE
    '!test-mode': { desc: 'Toggle test mode (whitelist only)', usage: '!test-mode [on/off]', category: 'testboard' },
    '!whitelist-add': { desc: 'Add number to whitelist', usage: '!whitelist-add <number>', category: 'testboard' },
    '!whitelist-remove': { desc: 'Remove from whitelist', usage: '!whitelist-remove <number>', category: 'testboard' },
    '!whitelist-list': { desc: 'Show whitelisted numbers', usage: '!whitelist-list', category: 'testboard' },
    '!whitelist-clear': { desc: 'Clear whitelist', usage: '!whitelist-clear', category: 'testboard' },
    '!shutdown': { desc: 'Gracefully shutdown bot', usage: '!shutdown [reason]', category: 'testboard' },
    '!user-status': { desc: 'Analyze user status/intent', usage: '!user-status <number>', category: 'testboard' },
    '!external-msgs': { desc: 'Show messages from non-whitelisted users', usage: '!external-msgs', category: 'testboard' },

    // ❓ HELP
    '!help': { desc: 'Show help', usage: '!help [category]', category: 'help' },
    '!commands': { desc: 'List all commands', usage: '!commands', category: 'help' },
    '!cmd': { desc: 'Get command help', usage: '!cmd <command>', category: 'help' },
    '!guide': { desc: 'Show usage guide', usage: '!guide', category: 'help' },
    '!tutorial': { desc: 'Show tutorial', usage: '!tutorial', category: 'help' },
    '!admin-help': { desc: 'Admin help', usage: '!admin-help', category: 'help' },
    '!about': { desc: 'About this bot', usage: '!about', category: 'help' }
};

// Default admin numbers (hardcoded + from env)
const DEFAULT_ADMIN_NUMBERS = [
    '923057258561',           // Default admin
    '215414353195190',        // LID format without @lid
    process.env.ADMIN_NUMBER  // From environment
].filter(Boolean);

// Admin state
const AdminState = {
    // Auto-detection properties
    registeredAdmins: new Set(),
    adminChats: new Set(),
    tempAdminChat: null,
    firstTimeAdmin: true,

    // Admin detection function (enhanced with multiple admin support)
    isAdminChat: (chatId) => {
        // Support various chat ID formats:
        // - 923057258561@c.us
        // - [215414353195190@lid]
        // - 215414353195190

        // Extract number from chatId
        const cleanChat = chatId.replace(/[^0-9]/g, '');

        for (const adminNum of DEFAULT_ADMIN_NUMBERS) {
            if (!adminNum || adminNum.length < 10) continue;

            const cleanAdmin = adminNum.replace(/[^0-9]/g, '');

            // Check exact match or contains
            if (cleanChat === cleanAdmin ||
                cleanChat.includes(cleanAdmin) ||
                cleanAdmin.includes(cleanChat)) {
                return true;
            }
        }

        return false;
    },

    // Check if chatId matches any admin
    getAdminInfo: (chatId) => {
        const cleanChat = chatId.replace(/[^0-9]/g, '');
        for (const adminNum of DEFAULT_ADMIN_NUMBERS) {
            if (!adminNum) continue;
            const cleanAdmin = adminNum.replace(/[^0-9]/g, '');
            if (cleanChat === cleanAdmin ||
                cleanChat.includes(cleanAdmin) ||
                cleanAdmin.includes(cleanChat)) {
                return { number: adminNum, chatId };
            }
        }
        return null;
    },

    // Settings
    maintenanceMode: false,
    autoReply: true,
    typingIndicator: true,
    aiEnabled: true
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };

    // Safe access to State - handles initialization order issues
    if (typeof State !== 'undefined' && State && State.logs) {
        State.logs.unshift(entry);
        if (State.logs.length > DB_CONFIG.maxLogs) State.logs.pop();
    }

    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// ADMIN REPLY COMMAND HANDLER
// ============================================
async function handleAdminReplyCommand(msg, chatId, body) {
    try {
        const quotedMsgId = msg.quotedMsg?.id?.id || msg.quotedMsgId;
        if (!quotedMsgId) return false;

        const verificationData = adminVerificationMessages.get(quotedMsgId);
        if (!verificationData) return false;

        const lowerBody = body.toLowerCase().trim();
        const customerChatId = verificationData.chatId;
        const planType = verificationData.planType;

        if (lowerBody === '!approve' || lowerBody === 'approve' || lowerBody === 'yes' || lowerBody === 'verify') {
            await updateOrderStatusByChat(customerChatId, 'completed', 'Payment verified by admin');
            await sendPlanDetailsAfterVerification(customerChatId, planType);
            await msg.reply(`✅ *Payment Approved!*\n\nCustomer: ${customerChatId}\nPlan: ${planType}\n\nPlan sent! 🚀`);
            adminVerificationMessages.delete(quotedMsgId);
            paymentScreenshots.delete(customerChatId);
            log(`Payment approved by reply for ${customerChatId}`, 'admin');
            return true;
        }

        if (lowerBody.startsWith('!reject') || lowerBody.startsWith('reject')) {
            const reason = body.substring(body.indexOf(' ') + 1) || 'Payment rejected';
            await updateOrderStatusByChat(customerChatId, 'rejected', reason);
            await client.sendMessage(customerChatId, `❌ *Payment Update*\n\nBhai, payment verify nahi ho saka.\n\n*Reason:* ${reason}\n\nKoi masla ho toh dubara screenshot bhejain! 📱`);
            await msg.reply(`❌ *Payment Rejected*\n\nCustomer: ${customerChatId}\nReason: ${reason}`);
            adminVerificationMessages.delete(quotedMsgId);
            paymentScreenshots.delete(customerChatId);
            log(`Payment rejected by reply for ${customerChatId}`, 'admin');
            return true;
        }

        if (lowerBody === '!check' || lowerBody === 'check' || lowerBody === 'history') {
            const history = await getHistory(customerChatId);
            const chatText = history.map(m => `${m.fromMe ? 'Bot' : 'Cust'}: ${m.body.slice(0, 100)}`).join('\n');
            await msg.reply(`📋 *CHAT HISTORY*\n\nCustomer: ${customerChatId}\n\n${chatText.slice(-2000)}\n\n---\nUse *!approve* or *!reject [reason]*`);
            return true;
        }

        return false;
    } catch (e) {
        log('Admin reply command error: ' + e.message, 'error');
        return false;
    }
}

async function updateOrderStatusByChat(chatId, status, note) {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        const orders = snapshot.val() || {};
        const orderEntry = Object.entries(orders).find(([id, o]) => o.chatId === chatId && o.status === 'pending_verification');
        if (orderEntry) await DB.ref(`orders/${orderEntry[0]}`).update({ status, note, updatedAt: Date.now() });
    } else {
        const order = localDB.orders.find(o => o.chatId === chatId && o.status === 'pending_verification');
        if (order) { order.status = status; order.note = note; order.updatedAt = Date.now(); }
    }
}

// ============================================
// ADMIN COMMAND HANDLER
// ============================================
async function handleAdminCommand(msg, chatId, body) {
    const parts = body.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    if (!ADMIN_COMMANDS[command]) {
        return null;
    }

    log(`Admin command: ${command}`, 'admin');

    // 📢 BROADCAST COMMANDS
    if (command === '!broadcast' || command === '!bc' || command === '!announce') {
        if (!args) return '❌ Usage: !broadcast <message>';
        return await broadcastMessage(args, 'all');
    }

    if (command === '!broadcast-active') {
        if (!args) return '❌ Usage: !broadcast-active <message>';
        return await broadcastMessage(args, 'active');
    }

    if (command === '!bc-img') {
        const [url, ...msgParts] = args.split('|').map(s => s.trim());
        if (!url) return '❌ Usage: !bc-img <url> | [message]';
        return await broadcastImage(url, msgParts.join(' ') || '', 'all');
    }

    // 👤 USER MANAGEMENT
    if (command === '!users' || command === '!user-count') {
        const count = await getUserCount();
        const users = await getAllUsers();
        return `👥 *USER STATS*\n\n📊 Total Users: ${count}\n📱 Active (24h): ${users.filter(u => Date.now() - u.lastSeen < 86400000).length}\n🆕 New Today: ${users.filter(u => Date.now() - u.firstSeen < 86400000).length}`;
    }

    if (command === '!user-info') {
        if (!args) return '❌ Usage: !user-info <number>';
        const user = await getUserInfo(args);
        return user ? formatUserInfo(user) : '❌ User not found';
    }

    if (command === '!active-users') {
        const users = await getAllUsers();
        const active = users.filter(u => Date.now() - u.lastSeen < 86400000);
        return `📱 *ACTIVE USERS (24h)*\n\n${active.map(u => `• ${u.chatId} - ${u.messages} msgs`).join('\n') || 'No active users'}`;
    }

    if (command === '!user-msg') {
        if (!client) return '❌ Bot not ready. Please wait for WhatsApp connection.';
        const [number, ...messageParts] = args.split('|').map(s => s.trim());
        if (!number || !messageParts.length) return '❌ Usage: !user-msg <number> | <message>';
        const targetChatId = `${number.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(targetChatId, messageParts.join(' '));
        return `✅ Message sent to ${number}`;
    }

    if (command === '!user-ban') {
        if (!args) return '❌ Usage: !user-ban <number>';
        await banUser(args, true);
        return `✅ User ${args} banned`;
    }

    if (command === '!user-unban') {
        if (!args) return '❌ Usage: !user-unban <number>';
        await banUser(args, false);
        return `✅ User ${args} unbanned`;
    }

    // 📊 ORDER MANAGEMENT
    if (command === '!orders') {
        const orders = await getAllOrders();
        return `📦 *ALL ORDERS*\n\n${orders.slice(-20).map(o => `#${o.id.slice(-6)} - ${o.status} - Rs.${o.amount || 'N/A'}`).join('\n') || 'No orders'}`;
    }

    if (command === '!order-pending') {
        const pending = await getPendingOrders();
        return `⏳ *PENDING ORDERS* (${pending.length})\n\n${pending.map(o => `#${o.id.slice(-6)} - ${o.planType || 'N/A'} - ${o.chatId}`).join('\n') || 'No pending orders'}`;
    }

    if (command === '!order-approve') {
        if (!args) return '❌ Usage: !order-approve <orderId>';
        await updateOrderStatus(args, 'completed', 'Approved by admin');
        return `✅ Order #${args} approved`;
    }

    if (command === '!order-reject') {
        const [orderId, ...reasonParts] = args.split(' ');
        if (!orderId) return '❌ Usage: !order-reject <orderId> [reason]';
        await updateOrderStatus(orderId, 'rejected', reasonParts.join(' ') || 'Rejected by admin');
        return `❌ Order #${orderId} rejected`;
    }

    if (command === '!order-status') {
        const [orderId, status] = args.split(' ');
        if (!orderId || !status) return '❌ Usage: !order-status <orderId> <status>';
        await updateOrderStatus(orderId, status, `Status changed to ${status}`);
        return `✅ Order #${orderId} status updated to ${status}`;
    }

    if (command === '!order-stats') {
        const stats = await getStats();
        const pending = await getPendingOrders();
        return `📊 *ORDER STATS*\n\n📦 Total Orders: ${stats.totalOrders}\n⏳ Pending: ${pending.length}\n✅ Completed: ${stats.totalOrders - pending.length}`;
    }

    // 💰 PAYMENT VERIFICATION COMMANDS
    if (command === '!approve' || command === '!payment-approve') {
        const number = args.split(' ')[0];
        if (!number) return '❌ Usage: !approve <number>\n\nExample: !approve 923001234567';

        const targetChatId = `${number.replace(/\D/g, '')}@c.us`;
        const result = await processVerificationDecision(targetChatId, 'approve', '', chatId);

        if (result.success) {
            return `✅ ${result.message}`;
        } else {
            return `❌ ${result.error}\n\nUse !pending to see pending verifications`;
        }
    }

    if (command === '!reject' || command === '!payment-reject') {
        const parts = args.split(' ');
        const number = parts[0];
        const reason = parts.slice(1).join(' ') || 'Screenshot unclear or invalid';

        if (!number) return '❌ Usage: !reject <number> [reason]\n\nExample: !reject 923001234567 screenshot blurry';

        const targetChatId = `${number.replace(/\D/g, '')}@c.us`;
        const result = await processVerificationDecision(targetChatId, 'reject', reason, chatId);

        if (result.success) {
            return `✅ ${result.message}`;
        } else {
            return `❌ ${result.error}`;
        }
    }

    if (command === '!pending' || command === '!payments-pending') {
        const pending = Array.from(PaymentVerificationSystem.queue.entries());
        if (pending.length === 0) {
            return '✅ No pending payment verifications.';
        }

        const list = pending.map(([chatId, item]) => {
            const number = chatId.replace(/\D/g, '').slice(-10);
            const timeAgo = Math.floor((Date.now() - item.timestamp) / 60000);
            return `• ${number} - Rs.${item.analysis.amount || '?'} - ${timeAgo}m ago ${item.analysis.isSuspicious ? '⚠️' : ''}`;
        }).join('\n');

        return `⏳ *PENDING PAYMENTS (${pending.length})*\n\n${list}\n\n*Actions:*\n!approve <number> - Approve\n!reject <number> [reason] - Reject\n!check <number> - View details`;
    }

    if (command === '!check' || command === '!payment-check') {
        const number = args.split(' ')[0];
        if (!number) return '❌ Usage: !check <number>';

        const targetChatId = `${number.replace(/\D/g, '')}@c.us`;
        const queueItem = PaymentVerificationSystem.queue.get(targetChatId);

        if (!queueItem) {
            return `❌ No pending verification found for ${number}`;
        }

        const analysis = queueItem.analysis;
        return `🔍 *PAYMENT DETAILS*\n\n👤 Number: ${number}\n💰 Amount: Rs. ${analysis.amount || 'Unknown'}\n💳 Method: ${analysis.paymentMethod || 'Unknown'}\n🆔 Transaction ID: ${analysis.transactionId || 'N/A'}\n🎯 AI Confidence: ${analysis.confidence}%\n⏱️ Submitted: ${Math.floor((Date.now() - queueItem.timestamp) / 60000)}m ago\n\n${analysis.isSuspicious ? '⚠️ *SUSPICIOUS:* ' + analysis.reasons.join(', ') : '✅ Looks legitimate'}`;
    }

    if (command === '!verification-stats' || command === '!vstats') {
        const stats = getVerificationStats();
        return `📊 *PAYMENT VERIFICATION STATS*\n\n📸 Total Screenshots Today: ${stats.totalScreenshots}\n✅ Verified Payments: ${stats.verifiedPayments}\n❌ Rejected: ${stats.rejectedPayments}\n⏳ Pending Review: ${stats.pendingQueue}\n\n👥 Trusted Customers: ${stats.verifiedCustomers}\n⚠️ Suspicious Activity: ${stats.suspiciousCustomers}`;
    }

    // 💎 PLAN MANAGEMENT
    if (command === '!plans') {
        return `💎 *ESIM PLANS*\n\n${BUSINESS.plans.map(p => `\n${p.icon} *${p.name}*\n   💰 Rs. ${p.price}\n   📊 ${p.data} for ${p.duration}\n   ${p.popular ? '🔥 Most Popular' : ''}`).join('')}`;
    }

    // 🤖 BOT CONTROLS
    if (command === '!status') {
        return `🤖 *BOT STATUS*\n\nStatus: ${State.status}\nReady: ${State.isReady ? '✅' : '❌'}\nUptime: ${formatUptime(Date.now() - State.startTime)}\nMessages: ${State.stats.totalMessages}\nOrders: ${State.stats.totalOrders}\nFirebase: ${isFirebaseEnabled() ? '✅' : '❌'}\nGroq AI: ${isGroqEnabled() ? '✅' : '❌'}`;
    }

    if (command === '!restart') {
        await msg.reply('🔄 Restarting bot...');
        process.exit(0);
    }

    if (command === '!maintenance') {
        AdminState.maintenanceMode = !AdminState.maintenanceMode;
        return `🔧 Maintenance mode: ${AdminState.maintenanceMode ? 'ON' : 'OFF'}`;
    }

    if (command === '!logs') {
        const count = parseInt(args) || 10;
        return `📋 *RECENT LOGS*\n\n${State.logs.slice(0, count).map(l => `[${l.time}] ${l.msg}`).join('\n')}`;
    }

    if (command === '!uptime') {
        return `⏱️ *UPTIME*\n${formatUptime(Date.now() - State.startTime)}`;
    }

    if (command === '!ping') {
        return '🏓 Pong! Bot is responsive ✅';
    }

    if (command === '!version') {
        return '📱 *SimFly OS v8.1*\nMaster Bot with Firebase + Groq AI\nPayment Verification + 100+ Admin Commands';
    }

    if (command === '!ai') {
        if (!args) {
            AdminState.aiEnabled = !AdminState.aiEnabled;
        } else {
            AdminState.aiEnabled = args.toLowerCase() === 'on';
        }
        return `🤖 AI Responses: ${AdminState.aiEnabled ? 'ENABLED' : 'DISABLED'}`;
    }

    // 🤖 GEMINI MODEL MANAGEMENT
    if (command === '!gemini-models') {
        const status = getModelDiscoveryStatus();
        if (status.length === 0) {
            return '🤖 *Gemini Model Discovery*\n\nNo models discovered yet.\n\nFirst screenshot will trigger auto-discovery.\n\nOr use !gemini-refresh to discover now.';
        }

        const models = status.map(s =>
            `🔑 *${s.key}*\n   Model: \`${s.model}\`\n   Status: ${s.tested ? '✅ Tested' : '⏳ Untested'}`
        ).join('\n\n');

        return `🤖 *Gemini Vision Models Discovered*\n\n${models}\n\n*Auto-discovery finds best vision-capable model for each API key.*`;
    }

    if (command === '!gemini-refresh') {
        clearWorkingModelsCache();

        // Trigger discovery for first key
        if (GEMINI_API_KEYS[0]) {
            const firstKey = GEMINI_API_KEYS.find(k => k && k.length > 20 && !k.includes('YOUR_GEMINI'));
            if (firstKey) {
                await msg.reply('🔍 Discovering vision-capable models...');
                const model = await getWorkingVisionModel(firstKey);
                return `✅ Model discovery complete!\n\nFound working model: \`${model}\`\n\n*Next screenshot will use auto-selected model.*`;
            }
        }

        return '❌ No valid Gemini API keys found for testing.';
    }

    if (command === '!gemini-test') {
        if (!args) {
            return '❌ Usage: !gemini-test <model-name>\n\nExample: !gemini-test models/gemini-2.0-flash\n\nOr leave empty to test all discovered models.';
        }

        const apiKey = GEMINI_API_KEYS.find(k => k && k.length > 20 && !k.includes('YOUR_GEMINI'));
        if (!apiKey) {
            return '❌ No valid Gemini API key available for testing.';
        }

        await msg.reply(`🧪 Testing model: \`${args}\`...`);

        const works = await testVisionModel(apiKey, args);

        if (works) {
            // Save to cache
            geminiState.workingModels.set(apiKey, { model: args, tested: true });
            return `✅ Model \`${args}\` is working!\n\nCached for future use.`;
        } else {
            return `❌ Model \`${args}\` failed test.\n\nTry another model or let auto-discovery find one.`;
        }
    }

    if (command === '!typing') {
        if (!args) {
            AdminState.typingIndicator = !AdminState.typingIndicator;
        } else {
            AdminState.typingIndicator = args.toLowerCase() === 'on';
        }
        return `⌨️ Typing Indicator: ${AdminState.typingIndicator ? 'ENABLED' : 'DISABLED'}`;
    }

    // 🔄 FOLLOWUP SYSTEM
    if (command === '!followup-status') {
        const pending = pendingFollowups.size;
        return `🔄 *FOLLOWUP SYSTEM*\n\nStatus: ${State.followupEnabled ? '✅ ENABLED' : '❌ DISABLED'}\nPending Followups: ${pending}\nDelay: 10 minutes\nMax Attempts: ${MAX_FOLLOWUP_ATTEMPTS}`;
    }

    if (command === '!followup-on') {
        State.followupEnabled = true;
        return `🔄 Auto-followup: ✅ ENABLED\n\nBot will automatically send followup messages after 10 minutes of inactivity.`;
    }

    if (command === '!followup-off') {
        State.followupEnabled = false;
        return `🔄 Auto-followup: ❌ DISABLED\n\nNo automatic followup messages will be sent.`;
    }

    if (command === '!followup-pending') {
        const list = Array.from(pendingFollowups.entries()).map(([id, data]) => {
            return `• ${id} - Stage: ${data.stage}, Attempts: ${data.attempts}`;
        }).join('\n') || 'No pending followups';
        return `⏳ *PENDING FOLLOWUPS*\n\n${list}`;
    }

    if (command === '!followup-clear') {
        const count = pendingFollowups.size;
        pendingFollowups.clear();
        return `🗑️ *Followups Cleared*\n\n${count} pending followups removed.`;
    }

    // 📈 ANALYTICS
    if (command === '!stats') {
        const stats = await getStats();
        const users = await getUserCount();
        const pending = await getPendingOrders();
        return `📊 *BOT STATISTICS*\n\n👥 Total Users: ${users}\n💬 Total Messages: ${stats.totalMessages}\n📦 Total Orders: ${stats.totalOrders}\n⏳ Pending Orders: ${pending.length}\n📈 Conversion: ${users > 0 ? ((stats.totalOrders/users)*100).toFixed(1) : 0}%`;
    }

    if (command === '!report' || command === '!daily-report') {
        return await generateReport('today');
    }

    if (command === '!weekly-report') {
        return await generateReport('week');
    }

    if (command === '!monthly-report') {
        return await generateReport('month');
    }

    if (command === '!revenue') {
        const orders = await getAllOrders();
        const revenue = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
        const today = orders.filter(o => Date.now() - o.createdAt < 86400000).reduce((sum, o) => sum + (o.amount || 0), 0);
        return `💰 *REVENUE REPORT*\n\n📊 Total Revenue: Rs. ${revenue}\n📅 Today: Rs. ${today}\n📦 Total Orders: ${orders.length}`;
    }

    if (command === '!sales') {
        return await generateReport('sales');
    }

    // 💳 PAYMENT
    if (command === '!payment-verify') {
        if (!args) return '❌ Usage: !payment-verify <orderId>';
        await updateOrderStatus(args, 'completed', 'Payment verified by admin');
        return `✅ Payment verified for order #${args}`;
    }

    if (command === '!payment-pending') {
        const pending = await getPendingOrders();
        const paymentPending = pending.filter(o => o.type === 'payment_screenshot');
        return `⏳ *PENDING PAYMENTS* (${paymentPending.length})\n\n${paymentPending.map(o => `#${o.id.slice(-6)} - ${o.chatId}`).join('\n') || 'No pending payments'}`;
    }

    // 🔧 DATABASE
    if (command === '!db-status') {
        return `💾 *DATABASE STATUS*\n\nType: ${isFirebaseEnabled() ? 'Firebase Realtime' : 'Local JSON'}\nConnected: ${DB ? '✅' : '❌'}\nUsers: ${await getUserCount()}\nOrders: ${(await getAllOrders()).length}`;
    }

    if (command === '!db-backup') {
        await backupDatabase();
        return '✅ Database backup created';
    }

    if (command === '!db-size') {
        const stats = fs.statSync(DB_FILE);
        return `💾 *DATABASE SIZE*\n\nLocal DB: ${(stats.size / 1024).toFixed(2)} KB\nUsers: ${await getUserCount()}\nOrders: ${(await getAllOrders()).length}`;
    }

    // 🛡️ SECURITY
    if (command === '!blocked') {
        const blocked = await getBlockedUsers();
        return `🚫 *BLOCKED USERS* (${blocked.length})\n\n${blocked.map(u => `• ${u}`).join('\n') || 'No blocked users'}`;
    }

    if (command === '!block') {
        if (!args) return '❌ Usage: !block <number>';
        await blockUser(args, true);
        return `🚫 User ${args} blocked`;
    }

    if (command === '!unblock') {
        if (!args) return '❌ Usage: !unblock <number>';
        await blockUser(args, false);
        return `✅ User ${args} unblocked`;
    }

    if (command === '!security-logs') {
        return `🛡️ *SECURITY LOGS*\n\n${State.logs.filter(l => l.type === 'security').slice(0, 10).map(l => `[${l.time}] ${l.msg}`).join('\n') || 'No security events'}`;
    }

    // ❓ HELP
    if (command === '!help' || command === '!commands') {
        const category = args || 'all';
        return formatHelp(category);
    }

    if (command === '!cmd') {
        if (!args) return '❌ Usage: !cmd <command>';
        const cmd = ADMIN_COMMANDS[args.toLowerCase()];
        return cmd ? `📖 *${args}*\n\n${cmd.desc}\nUsage: ${cmd.usage}\nCategory: ${cmd.category}` : '❌ Command not found';
    }

    if (command === '!admin-help') {
        return `📚 *ADMIN COMMAND CATEGORIES*\n\n📢 Broadcast: !broadcast, !bc, !bc-img\n👤 Users: !users, !user-info, !user-msg\n📊 Orders: !orders, !order-pending, !order-approve\n🤖 Bot: !status, !restart, !maintenance\n💎 Plans: !plans\n📚 Guides: !guides, !guide-show, !guide-promo, !guide-send\n🔒 Test Board: !test-mode, !whitelist-add, !whitelist-list\n🧠 Human Features: !human-mode, !user-profile, !mood-stats\n📈 Analytics: !stats, !report, !revenue\n💳 Payment: !payment-verify, !payment-pending\n🔧 Database: !db-status, !db-backup\n🛡️ Security: !block, !unblock, !blocked\n❓ Help: !help, !cmd\n\nUse !help <category> for details`;
    }

    if (command === '!about') {
        return `🚀 *SimFly Pakistan Bot*\n\nVersion: 8.1 Master Bot\nFeatures:\n• Firebase + Groq AI\n• Payment Verification\n• 100+ Admin Commands\n• Real-time Dashboard\n\nMade with ❤️ for SimFly Pakistan`;
    }

    // ⏸️ PAUSE / RESUME BOT
    if (command === '!stop' || command === '!pause') {
        State.botPaused = true;
        State.pausedBy = chatId;
        State.pauseReason = args || 'Paused by admin';

        // Clear all pending typing timers to cancel in-flight messages
        if (global.typingTimers) {
            const timerCount = Object.keys(global.typingTimers).length;
            for (const chatId in global.typingTimers) {
                clearTimeout(global.typingTimers[chatId]);
                delete global.typingTimers[chatId];
            }
            if (timerCount > 0) {
                log(`Cleared ${timerCount} pending message timer(s) due to pause`, 'admin');
            }
        }

        log(`Bot PAUSED by ${chatId}. Reason: ${State.pauseReason}`, 'admin');
        return `⏸️ *BOT PAUSED*\n\n👤 By: Admin\n📝 Reason: ${State.pauseReason}\n\n✅ Ab admin manually reply karega\n🤖 Auto-replies OFF hain\n\n▶️ Wapas start karne ke liye: !start`;
    }

    if (command === '!start' || command === '!resume') {
        State.botPaused = false;
        State.pausedBy = null;
        State.pauseReason = null;
        log(`Bot RESUMED by ${chatId}`, 'admin');
        return `▶️ *BOT RESUMED*\n\n✅ Auto-replies ON hain\n🤖 Bot ab automatically reply karega\n\n⏸️ Pause karne ke liye: !stop`;
    }

    // 🚪 SHUTDOWN COMMAND
    if (command === '!shutdown') {
        const reason = args || 'Shutdown by admin';
        log(`SHUTDOWN requested by ${chatId}. Reason: ${reason}`, 'admin');
        shutdownRequested = true;

        // Notify admin
        setTimeout(async () => {
            try {
                if (client) {
                    await client.sendMessage(chatId, `🛑 *BOT SHUTTING DOWN*\n\nReason: ${reason}\nTime: ${new Date().toLocaleString()}\n\n_The bot will restart automatically if configured._`);
                    await client.destroy();
                }
                process.exit(0);
            } catch (e) {
                log('Shutdown error: ' + e.message, 'error');
                process.exit(1);
            }
        }, 2000);

        return `🛑 *INITIATING SHUTDOWN*\n\nReason: ${reason}\n\n⏱️ Bot will shut down in 2 seconds...`;
    }

    // 🧠 HUMAN-LIKE FEATURES COMMANDS
    if (command === '!human-mode') {
        if (!args) {
            return `🤖 *HUMAN-LIKE FEATURES*\n\nStatus: ${HUMAN_CONFIG.enabled ? '✅ ON' : '❌ OFF'}\nTypo Chance: ${(HUMAN_CONFIG.typoChance * 100).toFixed(0)}%\nEmoji Frequency: ${(HUMAN_CONFIG.emojiFrequency * 100).toFixed(0)}%\n\nUsage:\n• !human-mode on/off - Toggle features\n• !human-typo 10 - Set typo chance (0-20)\n• !human-emoji 50 - Set emoji frequency (0-100)`;
        }
        const action = args.toLowerCase();
        if (action === 'on') {
            HUMAN_CONFIG.enabled = true;
            return `✅ *Human-like features ENABLED*\n\nBot will now:\n• Add intentional typos\n• Vary typing speed\n• Use casual language\n• Control emoji usage\n• Show thinking status`;
        } else if (action === 'off') {
            HUMAN_CONFIG.enabled = false;
            return `⏸️ *Human-like features DISABLED*\n\nBot will reply in standard mode.`;
        }
        return '❌ Usage: !human-mode [on/off]';
    }

    if (command === '!human-typo') {
        const chance = parseInt(args);
        if (isNaN(chance) || chance < 0 || chance > 20) return '❌ Usage: !human-typo [0-20]';
        HUMAN_CONFIG.typoChance = chance / 100;
        return `✅ Typo chance set to ${chance}%`;
    }

    if (command === '!human-emoji') {
        const freq = parseInt(args);
        if (isNaN(freq) || freq < 0 || freq > 100) return '❌ Usage: !human-emoji [0-100]';
        HUMAN_CONFIG.emojiFrequency = freq / 100;
        return `✅ Emoji frequency set to ${freq}%`;
    }

    if (command === '!user-profile') {
        if (!args) return '❌ Usage: !user-profile <number>';
        const number = args.replace(/\D/g, '');
        const userChatId = `${number}@c.us`;
        const profile = userProfiles.get(userChatId);
        if (!profile) return `❌ No profile found for ${number}`;

        return `👤 *USER PROFILE*\n\n📱 Number: ${number}\n📝 Name: ${profile.name || 'Unknown'}\n📱 Device: ${profile.device || 'Not specified'}\n💰 Purchase Stage: ${profile.purchaseStage}\n💵 Payment Intent: ${profile.paymentIntent}%\n😊 Mood: ${profile.mood}\n📊 Sentiment: ${profile.sentiment}/10\n🚨 Urgency: ${profile.urgency}/10\n🗣️ Language: ${profile.languageStyle}\n💬 Messages: ${profile.messageCount}\n📅 First Seen: ${new Date(profile.firstSeen).toLocaleDateString()}`;
    }

    if (command === '!mood-stats') {
        const moods = {};
        for (const [id, profile] of userProfiles) {
            moods[profile.mood] = (moods[profile.mood] || 0) + 1;
        }
        const stats = Object.entries(moods).map(([mood, count]) => `${mood}: ${count}`).join('\n');
        return `📊 *USER MOOD DISTRIBUTION*\n\n${stats || 'No data yet'}\n\nTotal profiles: ${userProfiles.size}`;
    }

    // 🚪 TEST BOARD / PRIVATE MODE COMMANDS
    if (command === '!test-mode') {
        if (!args) {
            return `🔒 *TEST BOARD MODE*\n\nStatus: ${TEST_BOARD.enabled ? '🔴 PRIVATE (Whitelist Only)' : '🟢 PUBLIC'}\nWhitelist Count: ${TEST_BOARD.whitelist.length}\n\nUsage:\n• !test-mode on - Enable whitelist only\n• !test-mode off - Disable whitelist (public)`;
        }

        const newState = args.toLowerCase() === 'on';
        TEST_BOARD.enabled = newState;

        return `🔒 *TEST MODE ${newState ? 'ENABLED' : 'DISABLED'}*\n\n${newState ? '🔴 Only whitelisted numbers can use bot' : '🟢 Bot is PUBLIC - everyone can use'}\n\nWhitelist: ${TEST_BOARD.whitelist.length} numbers\n\n${newState ? 'Use !whitelist-add <number> to add users' : ''}`;
    }

    if (command === '!whitelist-add') {
        if (!args) return '❌ Usage: !whitelist-add <number>\n\nExample: !whitelist-add 923001234567';
        const number = args.replace(/\D/g, '');
        if (!TEST_BOARD.whitelist.includes(number)) {
            TEST_BOARD.whitelist.push(number);
        }
        return `✅ *WHITELISTED*\n\nNumber: ${number}\nTotal whitelisted: ${TEST_BOARD.whitelist.length}\n\nThis user can now use the bot during test mode.`;
    }

    if (command === '!whitelist-remove') {
        if (!args) return '❌ Usage: !whitelist-remove <number>';
        const number = args.replace(/\D/g, '');
        TEST_BOARD.whitelist = TEST_BOARD.whitelist.filter(n => n !== number);
        return `✅ *REMOVED FROM WHITELIST*\n\nNumber: ${number}\nTotal whitelisted: ${TEST_BOARD.whitelist.length}`;
    }

    if (command === '!whitelist-list') {
        const list = TEST_BOARD.whitelist.map((n, i) => `${i + 1}. ${n}`).join('\n') || 'No whitelisted numbers';
        return `📋 *WHITELISTED NUMBERS* (${TEST_BOARD.whitelist.length})\n\n${list}\n\n${TEST_BOARD.enabled ? '🔴 Test mode ACTIVE - Only these numbers can use bot' : '🟢 Test mode OFF - Bot is public'}`;
    }

    if (command === '!whitelist-clear') {
        const count = TEST_BOARD.whitelist.length;
        TEST_BOARD.whitelist = [];
        return `🗑️ *WHITELIST CLEARED*\n\nRemoved ${count} numbers.\n\nWhitelist is now empty.`;
    }

    if (command === '!user-status') {
        if (!args) return '❌ Usage: !user-status <number>\n\nExample: !user-status 923001234567';
        const number = args.replace(/\D/g, '');
        const userChatId = `${number}@c.us`;
        const status = await analyzeUserStatus(userChatId);
        return `📊 *USER STATUS ANALYSIS*\n\n👤 Number: ${number}\n\n${status}`;
    }

    if (command === '!external-msgs') {
        const msgs = await getExternalMessages();
        if (!msgs || msgs.length === 0) return '📭 No messages from non-whitelisted users';
        const list = msgs.slice(-10).map(m => `👤 ${m.chatId}\n💬 ${m.body.slice(0, 50)}...\n🕐 ${new Date(m.time).toLocaleString()}`).join('\n\n');
        return `📨 *EXTERNAL MESSAGES* (${msgs.length} total)\n\nLast 10 messages:\n\n${list}`;
    }

    // 📚 GUIDE MANAGEMENT
    if (command === '!guides') {
        const guideList = Object.keys(customGuides).map(plan => {
            const g = customGuides[plan];
            return `📱 *${plan}*\n   Promo: ${g.promoCode || 'N/A'}\n   Provider: ${g.provider || 'N/A'}\n   Status: ${g.enabled !== false ? '✅ Enabled' : '❌ Disabled'}`;
        }).join('\n\n');
        return `📚 *CUSTOM GUIDES*\n\n${guideList || 'No custom guides configured'}\n\nUse !guide-show <plan> to view details`;
    }

    if (command === '!guide-show') {
        if (!args) return '❌ Usage: !guide-show <500MB|1GB|5GB>';
        const plan = args.toUpperCase();
        const g = getGuide(plan);
        if (!g) return `❌ Guide not found for ${plan}`;
        return `📱 *${plan} GUIDE CONFIG*\n\n🎁 Promo Code: ${g.promoCode}\n🏢 Provider: ${g.provider}\n📲 iOS Link: ${g.iosAppLink ? g.iosAppLink.substring(0, 40) + '...' : 'Not set'}\n📲 Android: ${g.androidAppLink ? g.androidAppLink.substring(0, 40) + '...' : 'Not set'}\n✅ Enabled: ${g.enabled !== false ? 'Yes' : 'No'}\n\nUse !guide-preview ${plan} to see full guide`;
    }

    if (command === '!guide-preview') {
        if (!args) return '❌ Usage: !guide-preview <500MB|1GB|5GB>';
        const plan = args.toUpperCase();
        const planDetails = await getPlanDetails(plan);
        if (!planDetails) return `❌ Plan not found: ${plan}`;
        return `📱 *${plan} GUIDE PREVIEW*\n\n${planDetails.setupInstructions.substring(0, 1500)}${planDetails.setupInstructions.length > 1500 ? '...' : ''}`;
    }

    if (command === '!guide-promo') {
        const [plan, ...codeParts] = args.split('|').map(s => s.trim());
        if (!plan || !codeParts.length) return '❌ Usage: !guide-promo <plan> | <new-code>';
        const code = codeParts.join(' ');
        updateGuide(plan.toUpperCase(), 'promoCode', code);
        return `✅ Promo code updated for ${plan.toUpperCase()}\n\nNew Code: *${code}*\n\nNext approved order will use this code!`;
    }

    if (command === '!guide-provider') {
        const [plan, provider] = args.split('|').map(s => s.trim());
        if (!plan || !provider) return '❌ Usage: !guide-provider <plan> | <provider-name>';
        updateGuide(plan.toUpperCase(), 'provider', provider);
        return `✅ Provider updated for ${plan.toUpperCase()}\n\nNew Provider: *${provider}*\n\nNext approved order will use this provider!`;
    }

    if (command === '!guide-links') {
        const parts = args.split('|').map(s => s.trim());
        if (parts.length < 3) return '❌ Usage: !guide-links <plan> | <ios-link> | <android-link>';
        const [plan, iosLink, androidLink] = parts;
        updateGuide(plan.toUpperCase(), 'iosAppLink', iosLink);
        updateGuide(plan.toUpperCase(), 'androidAppLink', androidLink);
        return `✅ App links updated for ${plan.toUpperCase()}\n\n📲 iOS: ${iosLink.substring(0, 50)}...\n📲 Android: ${androidLink.substring(0, 50)}...\n\nNext approved order will use these links!`;
    }

    if (command === '!guide-send') {
        const [number, planType] = args.split('|').map(s => s.trim());
        if (!number || !planType) return '❌ Usage: !guide-send <number> | <plan>';
        const customerChatId = `${number.replace(/\D/g, '')}@c.us`;
        await sendPlanDetailsAfterVerification(customerChatId, planType.toUpperCase());
        return `✅ Guide sent to ${number}\n\nPlan: ${planType.toUpperCase()}`;
    }

    if (command === '!guide-enable') {
        if (!args) return '❌ Usage: !guide-enable <500MB|1GB|5GB>';
        updateGuide(args.toUpperCase(), 'enabled', true);
        return `✅ Auto-send ENABLED for ${args.toUpperCase()}\n\nGuide will be sent automatically when admin approves payment.`;
    }

    if (command === '!guide-disable') {
        if (!args) return '❌ Usage: !guide-disable <500MB|1GB|5GB>';
        updateGuide(args.toUpperCase(), 'enabled', false);
        return `⏸️ Auto-send DISABLED for ${args.toUpperCase()}\n\nGuide will NOT be sent automatically. Use !guide-send to send manually.`;
    }

    if (command === '!guide-reset') {
        if (!args) return '❌ Usage: !guide-reset <500MB|1GB|5GB>';
        const plan = args.toUpperCase();
        if (ESIIM_GUIDES[plan]) {
            customGuides[plan] = JSON.parse(JSON.stringify(ESIIM_GUIDES[plan]));
            saveCustomGuides();
            return `✅ Guide reset to DEFAULT for ${plan}\n\nAll changes have been reverted to original configuration.`;
        }
        return `❌ Guide not found for ${plan}`;
    }

    return null;
}

// Helper functions for admin commands
async function broadcastMessage(message, type) {
    if (!client) {
        return '❌ Bot not ready. Please wait for WhatsApp connection.';
    }

    const users = await getAllUsers();
    const targetUsers = type === 'active'
        ? users.filter(u => Date.now() - u.lastSeen < 86400000)
        : users;

    let sent = 0, failed = 0;
    for (const user of targetUsers) {
        try {
            const chatId = user.chatId.includes('@') ? user.chatId : `${user.chatId}@c.us`;
            await client.sendMessage(chatId, `📢 *BROADCAST*\n\n${message}\n\n_This message was sent to all users_`);
            sent++;
            await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (e) {
            failed++;
        }
    }
    return `✅ Broadcast sent!\n\n📊 Target: ${targetUsers.length}\n✓ Sent: ${sent}\n✗ Failed: ${failed}`;
}

async function broadcastImage(url, message, type) {
    return `📸 Broadcast image feature\nURL: ${url}\nMessage: ${message}\n\n(To be implemented with media download)`;
}

async function getUserInfo(number) {
    const users = await getAllUsers();
    return users.find(u => u.chatId.includes(number.replace(/\D/g, '')));
}

function formatUserInfo(user) {
    return `👤 *USER INFO*\n\n📱 Number: ${user.chatId}\n📅 First Seen: ${new Date(user.firstSeen).toLocaleString()}\n🕐 Last Seen: ${new Date(user.lastSeen).toLocaleString()}\n💬 Messages: ${user.messages}\n👤 Status: ${user.banned ? '🚫 Banned' : '✅ Active'}`;
}

async function banUser(number, ban) {
    const userKey = number.replace(/\D/g, '_');
    if (DB) {
        await DB.ref(`users/${userKey}/banned`).set(ban);
    } else {
        if (localDB.users[userKey]) localDB.users[userKey].banned = ban;
    }
}

async function getAllOrders() {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        return Object.values(snapshot.val() || {});
    }
    return localDB.orders;
}

async function backupDatabase() {
    const backupFile = path.join(DATA_DIR, `backup_${Date.now()}.json`);
    const data = DB ? await DB.ref().once('value').then(s => s.val()) : localDB;
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    return backupFile;
}

async function generateReport(period) {
    const orders = await getAllOrders();
    const users = await getUserCount();
    const now = Date.now();
    let periodOrders = orders;

    if (period === 'today') {
        periodOrders = orders.filter(o => now - o.createdAt < 86400000);
    } else if (period === 'week') {
        periodOrders = orders.filter(o => now - o.createdAt < 604800000);
    } else if (period === 'month') {
        periodOrders = orders.filter(o => now - o.createdAt < 2592000000);
    }

    const revenue = periodOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    return `📊 *${period.toUpperCase()} REPORT*\n\n📦 Orders: ${periodOrders.length}\n💰 Revenue: Rs. ${revenue}\n👥 Total Users: ${users}\n✅ Completed: ${periodOrders.filter(o => o.status === 'completed').length}\n⏳ Pending: ${periodOrders.filter(o => o.status === 'pending').length}`;
}

// ═══════════════════════════════════════════════════════
// WHITELIST / TEST BOARD HELPERS
// ═══════════════════════════════════════════════════════
const externalMessages = [];

async function saveExternalMessage(chatId, body) {
    externalMessages.push({
        chatId,
        body,
        time: Date.now()
    });
    // Keep only last 100 messages
    if (externalMessages.length > 100) {
        externalMessages.shift();
    }
}

async function getExternalMessages() {
    return externalMessages;
}

// ═══════════════════════════════════════════════════════
// USER STATUS ANALYSIS — Analyze user intent and history
// ═══════════════════════════════════════════════════════
async function analyzeUserStatus(chatId) {
    try {
        const history = await getHistory(chatId);
        const orders = (await getAllOrders()).filter(o => o.chatId === chatId);
        const userSession = getUserSession(chatId);

        // Analyze message content
        const allMessages = history.map(m => m.body.toLowerCase()).join(' ');
        const hasBought = orders.some(o => o.status === 'completed');
        const pendingOrder = orders.find(o => o.status === 'pending');

        // Intent detection
        let intent = 'unknown';
        if (hasBought) intent = 'purchased';
        else if (pendingOrder) intent = 'payment_pending';
        else if (allMessages.includes('price') || allMessages.includes('plan') || allMessages.includes('kitne')) intent = 'interested';
        else if (allMessages.includes('device') || allMessages.includes('iphone') || allMessages.includes('samsung')) intent = 'checking_device';

        // Plan preference
        let preferredPlan = 'none';
        if (allMessages.includes('5gb')) preferredPlan = '5GB';
        else if (allMessages.includes('1gb')) preferredPlan = '1GB';
        else if (allMessages.includes('500mb')) preferredPlan = '500MB';

        // Device info
        const device = userSession.device || 'Not specified';
        const deviceCompatible = userSession.deviceCompatible !== undefined
            ? (userSession.deviceCompatible ? '✅ Compatible' : '❌ Not Compatible')
            : 'Unknown';

        // Format analysis
        const lastActive = history.length > 0
            ? new Date(history[history.length - 1].time).toLocaleString()
            : 'Never';

        return `📋 *User Analysis*

🎯 *Intent:* ${intent}
💰 *Status:* ${hasBought ? '✅ Already Purchased' : pendingOrder ? '⏳ Payment Pending' : '🤔 Browsing'}
📦 *Preferred Plan:* ${preferredPlan}
📱 *Device:* ${device} (${deviceCompatible})
💬 *Messages:* ${history.length}
📅 *Last Active:* ${lastActive}

📊 *Order History:*
${orders.length > 0 ? orders.map(o => `• ${o.planType || 'Unknown'} - ${o.status} - Rs.${o.amount || 'N/A'}`).join('\n') : 'No orders yet'}

📝 *Recommendations:*
${intent === 'interested' ? '→ User is interested, follow up with plan details' : ''}
${intent === 'checking_device' ? '→ User checking device compatibility' : ''}
${pendingOrder ? '→ Payment verification pending - follow up!' : ''}
${hasBought ? '→ Customer - offer support for activation' : ''}`;
    } catch (e) {
        return `❌ Error analyzing user: ${e.message}`;
    }
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
}

function formatHelp(category) {
    if (category === 'all') {
        return `📚 *AVAILABLE COMMANDS* (${Object.keys(ADMIN_COMMANDS).length} total)\n\n📢 Broadcast: !broadcast, !bc, !bc-img\n👤 Users: !users, !user-info, !active-users\n📊 Orders: !orders, !order-pending, !order-approve\n🤖 Bot: !status, !restart, !logs\n💎 Plans: !plans\n📚 Guides: !guides, !guide-show, !guide-promo, !guide-send\n🔒 Test Board: !test-mode, !whitelist-add, !whitelist-list\n🧠 Human Features: !human-mode, !user-profile, !mood-stats\n📈 Stats: !stats, !report, !revenue\n💳 Payment: !payment-verify, !payment-pending\n🔧 Database: !db-status, !db-backup\n🛡️ Security: !block, !unblock, !blocked\n\nUse !help <category> for more details\nExample: !help broadcast`;
    }

    if (category === 'testboard') {
        return `🔒 *TEST BOARD / PRIVATE MODE COMMANDS*\n\n!test-mode [on/off] - Toggle whitelist mode\n!whitelist-add <number> - Add to whitelist\n!whitelist-remove <number> - Remove from whitelist\n!whitelist-list - Show whitelisted numbers\n!whitelist-clear - Clear all whitelist\n!shutdown [reason] - Gracefully shutdown bot\n!user-status <number> - Analyze user intent\n!external-msgs - View non-whitelist messages\n\n*Test Mode:* Only whitelisted numbers can use bot\n*Public Mode:* Everyone can use bot`;
    }

    if (category === 'guides') {
        return `📚 *GUIDE MANAGEMENT COMMANDS*\n\n!guides - List all guides\n!guide-show <plan> - Show guide config\n!guide-preview <plan> - Preview full guide\n!guide-promo <plan> | <code> - Update promo code\n!guide-provider <plan> | <name> - Update provider\n!guide-links <plan> | <iOS> | <Android> - Update app links\n!guide-send <number> | <plan> - Send guide manually\n!guide-enable <plan> - Enable auto-send\n!guide-disable <plan> - Disable auto-send\n!guide-reset <plan> - Reset to default\n\nExample: !guide-promo 1GB | NEWCODE123`;
    }

    if (category === 'human') {
        return `🧠 *HUMAN-LIKE FEATURES COMMANDS*\n\n!human-mode [on/off] - Toggle human features\n!human-typo [0-20] - Set typo chance %\n!human-emoji [0-100] - Set emoji frequency %\n!user-profile <number> - View user profile\n!mood-stats - View mood distribution\n\n*Features:*\n• Typing speed variation\n• Intentional typos\n• Casual language\n• Emoji control\n• Repeat detection\n• Abandoned cart recovery\n• Mood detection\n• Sentiment analysis`;
    }

    const commands = Object.entries(ADMIN_COMMANDS)
        .filter(([_, cmd]) => cmd.category === category)
        .map(([name, cmd]) => `${name} - ${cmd.desc}`)
        .join('\n');

    return commands || `❌ No commands found in category: ${category}`;
}

async function getBlockedUsers() {
    const users = await getAllUsers();
    return users.filter(u => u.banned).map(u => u.chatId);
}

async function blockUser(number, block) {
    await banUser(number, block);
}

const blockedUsers = new Set();

// Temporary admin session storage
AdminState.tempAdminChat = null;

// ============================================
// KEYWORD MATCHING
// ============================================
function findKeywordResponse(userMessage) {
    const msg = userMessage.toLowerCase();

    for (const [category, data] of Object.entries(KEYWORD_RESPONSES)) {
        for (const keyword of data.keywords) {
            if (msg.includes(keyword.toLowerCase())) {
                // Return random response from available responses
                const responses = data.responses;
                return responses[Math.floor(Math.random() * responses.length)];
            }
        }
    }
    return null;
}

function findFAQResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    for (const [keyword, answer] of Object.entries(BUSINESS.faqs)) {
        if (msg.includes(keyword.toLowerCase())) {
            return answer;
        }
    }
    return null;
}

// ============================================
// 🛡️ ANTI-BAN MEASURES
// ============================================

// Random delay to mimic human typing/response time
function getRandomDelay() {
    // Random delay between 1-4 seconds for realism
    return Math.floor(Math.random() * 3000) + 1000;
}

// Anti-ban message rate limiting
const messageRateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 15; // Max 15 messages per minute per chat

function checkRateLimit(chatId) {
    const now = Date.now();
    const userData = messageRateLimiter.get(chatId) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

    if (now > userData.resetTime) {
        // Reset window
        userData.count = 1;
        userData.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
        userData.count++;
    }

    messageRateLimiter.set(chatId, userData);

    // Clean up old entries every 100 entries
    if (messageRateLimiter.size > 100) {
        const cutoff = now - RATE_LIMIT_WINDOW * 2;
        for (const [id, data] of messageRateLimiter) {
            if (data.resetTime < cutoff) messageRateLimiter.delete(id);
        }
    }

    return userData.count <= MAX_MESSAGES_PER_WINDOW;
}

// ============================================
// 📚 CHAT CONTEXT LOADING
// ============================================

// Get full chat context including recent messages
async function getChatContext(chatId, currentMsg) {
    try {
        // Get history from database
        const dbHistory = await getHistory(chatId);

        // Get WhatsApp chat messages (last 50)
        let waMessages = [];
        try {
            const chat = await currentMsg.getChat();
            if (chat) {
                const messages = await chat.fetchMessages({ limit: 50 });
                waMessages = messages.map(m => ({
                    body: m.body,
                    fromMe: m.fromMe,
                    timestamp: m.timestamp * 1000, // Convert to ms
                    type: m.type
                }));
            }
        } catch (e) {
            log('Error fetching WhatsApp chat history: ' + e.message, 'error');
        }

        // Combine and sort by time
        const combined = [...dbHistory, ...waMessages].sort((a, b) => (a.time || a.timestamp) - (b.time || b.timestamp));

        // Remove duplicates (same body + timestamp)
        const seen = new Set();
        const unique = combined.filter(m => {
            const key = `${m.body}_${m.time || m.timestamp}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Return last 50 unique messages for full context understanding
        return unique.slice(-50);
    } catch (e) {
        log('Error getting chat context: ' + e.message, 'error');
        return [];
    }
}

// ============================================
// 👤 USER SESSION & DEVICE CHECK FLOW
// ============================================

// Device compatibility database
const DEVICE_COMPATIBILITY = {
    // iPhones (iPhone XS and above support eSIM)
    'iphone xs': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone xr': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 11': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 12': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 13': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 14': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 15': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone 16': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone se 2': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },
    'iphone se 3': { compatible: true, type: 'iPhone', note: 'eSIM supported ✅' },

    // Samsung (S20 and above)
    'samsung s20': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },
    'samsung s21': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },
    'samsung s22': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },
    'samsung s23': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },
    'samsung s24': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },
    'samsung z': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' }, // Fold/Flip series
    'samsung note 20': { compatible: true, type: 'Samsung', note: 'eSIM supported ✅' },

    // Google Pixel
    'pixel 4': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },
    'pixel 5': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },
    'pixel 6': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },
    'pixel 7': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },
    'pixel 8': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },
    'pixel 9': { compatible: true, type: 'Pixel', note: 'eSIM supported ✅' },

    // iPhone models that DON'T support eSIM
    'iphone x': { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye' },
    'iphone 8': { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye' },
    'iphone 7': { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye' },
    'iphone 6': { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye' },
    'iphone se 1': { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye' },

    // Other brands
    'xiaomi': { compatible: false, type: 'Other', note: 'eSIM support check karna hoga ❓' },
    'oppo': { compatible: false, type: 'Other', note: 'eSIM support check karna hoga ❓' },
    'vivo': { compatible: false, type: 'Other', note: 'eSIM support check karna hoga ❓' },
    'huawei': { compatible: false, type: 'Other', note: 'eSIM support check karna hoga ❓' },
    'oneplus': { compatible: false, type: 'Other', note: 'eSIM support check karna hoga ❓' },
};

// Check if user is new (first time messaging)
async function isNewUser(chatId) {
    const history = await getHistory(chatId);
    return history.length <= 1; // Only current message or empty
}

// Get user session
function getUserSession(chatId) {
    return State.userSessions.get(chatId) || { state: 'new', step: 0 };
}

// Update user session
function setUserSession(chatId, session) {
    State.userSessions.set(chatId, session);
    // Cleanup old sessions if too many
    if (State.userSessions.size > 500) {
        const firstKey = State.userSessions.keys().next().value;
        State.userSessions.delete(firstKey);
    }
}

// Check device compatibility
function checkDeviceCompatibility(deviceName) {
    const lowerDevice = deviceName.toLowerCase();

    // Check exact matches first
    for (const [device, info] of Object.entries(DEVICE_COMPATIBILITY)) {
        if (lowerDevice.includes(device)) {
            return { ...info, matchedDevice: device };
        }
    }

    // Check partial matches
    if (lowerDevice.includes('iphone')) {
        // Extract model number if present
        const modelMatch = lowerDevice.match(/iphone\s*(\d+)|(\d+)\s*pro|(\d+)\s*plus/i);
        if (modelMatch) {
            const modelNum = parseInt(modelMatch[1] || modelMatch[2] || modelMatch[3]);
            if (modelNum >= 11) {
                return { compatible: true, type: 'iPhone', note: 'eSIM supported ✅', matchedDevice: `iPhone ${modelNum}` };
            } else if (modelNum === 10 || modelNum === 'x') {
                return { compatible: false, type: 'iPhone', note: 'eSIM NOT supported ❌ iPhone XS se upar chahiye', matchedDevice: 'iPhone X' };
            }
        }
        // Check for JV
        if (lowerDevice.includes('jv') || lowerDevice.includes('japanese')) {
            return { compatible: true, type: 'iPhone', note: 'JV iPhone mein eSIM work karti hai ✅ Bas Non-PTA hona chahiye', matchedDevice: 'JV iPhone' };
        }
        return { compatible: null, type: 'iPhone', note: 'iPhone XS se upar ke models mein eSIM work karti hai', matchedDevice: 'iPhone' };
    }

    if (lowerDevice.includes('samsung') || lowerDevice.includes('galaxy')) {
        const sMatch = lowerDevice.match(/s(\d+)/);
        if (sMatch) {
            const sNum = parseInt(sMatch[1]);
            if (sNum >= 20) {
                return { compatible: true, type: 'Samsung', note: 'eSIM supported ✅', matchedDevice: `Samsung S${sNum}` };
            }
        }
        return { compatible: null, type: 'Samsung', note: 'Samsung S20 series se upar mein eSIM supported hai', matchedDevice: 'Samsung' };
    }

    if (lowerDevice.includes('pixel')) {
        const pMatch = lowerDevice.match(/pixel\s*(\d+)/);
        if (pMatch) {
            const pNum = parseInt(pMatch[1]);
            if (pNum >= 4) {
                return { compatible: true, type: 'Pixel', note: 'eSIM supported ✅', matchedDevice: `Pixel ${pNum}` };
            }
        }
        return { compatible: null, type: 'Pixel', note: 'Pixel 4 se upar mein eSIM supported hai', matchedDevice: 'Google Pixel' };
    }

    return { compatible: null, type: 'Unknown', note: 'Device compatibility check karna hoga', matchedDevice: deviceName };
}

// ============================================
// 🤖 AI CHAT ANALYSIS FOR ADMIN
// ============================================
async function analyzeChatWithAI(chatId, chatContext) {
    try {
        const conversationText = chatContext.map(m => {
            const sender = m.fromMe ? 'Bot' : 'Customer';
            return `${sender}: ${m.body.slice(0, 200)}`;
        }).join('\n');

        const analysisPrompt = `Analyze this customer conversation for SimFly Pakistan eSIM sales.

CONVERSATION:
${conversationText.slice(-2000)}

Provide a brief summary (2-3 bullet points) covering:
1. What the customer wants/is asking
2. Device compatibility mentioned
3. Payment status
4. Any concerns or objections

Keep it short and professional.`;

        if (isGroqEnabled()) {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'You are a sales assistant analyzing customer conversations.' },
                    { role: 'user', content: analysisPrompt }
                ],
                max_tokens: 300,
                temperature: 0.5
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            return response.data.choices[0].message.content;
        }
        return generateBasicSummary(chatContext);
    } catch (e) {
        log('AI analysis error: ' + e.message, 'error');
        return generateBasicSummary(chatContext);
    }
}

function generateBasicSummary(chatContext) {
    const customerMessages = chatContext.filter(m => !m.fromMe);
    const botMessages = chatContext.filter(m => m.fromMe);
    const hasDevice = customerMessages.some(m => /iphone|samsung|pixel|xs|xr|11|12|13|14|15|16|s20|s21|s22|s23|s24/i.test(m.body));
    const hasPlan = customerMessages.some(m => /500mb|1gb|5gb|plan|package/i.test(m.body));
    const hasPayment = customerMessages.some(m => /payment|screenshot|pay|sent|jazzcash|easypaisa|sadapay/i.test(m.body));
    return `• Messages: ${customerMessages.length} customer, ${botMessages.length} bot\n• Device mentioned: ${hasDevice ? 'Yes' : 'No'}\n• Plan discussed: ${hasPlan ? 'Yes' : 'No'}\n• Payment reference: ${hasPayment ? 'Yes' : 'No'}`;
}

// ============================================
// GROQ AI RESPONSE GENERATION
// ============================================
// Track API failures for circuit breaker
const GROQ_COOLDOWN_MS = 60000; // 1 minute cooldown after 3 failures
const GROQ_MAX_FAILURES = 3;

async function getGroqResponse(userMessage, chatId, history) {
    // Circuit breaker check
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        const timeSinceLastFailure = Date.now() - (State.groq.lastCall || 0);
        if (timeSinceLastFailure < GROQ_COOLDOWN_MS) {
            log(`Groq in cooldown (${Math.ceil((GROQ_COOLDOWN_MS - timeSinceLastFailure)/1000)}s)`, 'warn');
            State.groq.status = 'cooldown';
            return null;
        }
        // Reset after cooldown
        State.groq.failureCount = 0;
        State.groq.status = 'active';
    }

    // Retry logic
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history.slice(-5).map(h => ({
                    role: h.fromMe ? 'assistant' : 'user',
                    content: h.body
                })),
                { role: 'user', content: userMessage }
            ];

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // Increased timeout
            });

            // Success - reset failure count
            State.groq.lastCall = Date.now();
            if (State.groq.failureCount > 0) {
                State.groq.failureCount = 0;
                State.groq.status = 'active';
                log('Groq API recovered', 'info');
            }

            return response.data.choices[0].message.content;

        } catch (e) {
            lastError = e;
            const statusCode = e.response?.status;
            const errorData = e.response?.data;

            // Log detailed error
            log(`Groq attempt ${attempt + 1}/${maxRetries + 1} failed: ${statusCode} - ${errorData?.error?.message || e.message}`, 'error');

            // Handle specific errors
            if (statusCode === 401) {
                log('Groq API key invalid - disabling AI', 'error');
                return null; // Don't retry auth errors
            }

            if (statusCode === 429) {
                // Rate limit - wait and retry
                const waitTime = (attempt + 1) * 2000; // 2s, 4s
                log(`Rate limited, waiting ${waitTime}ms...`, 'warn');
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }

            if (statusCode >= 500) {
                // Server error - retry
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // Network/timeout errors - retry
            if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || !e.response) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            // Other errors - don't retry
            break;
        }
    }

    // All retries exhausted
    State.groq.failureCount++;
    State.groq.lastCall = Date.now();
    State.groq.lastError = lastError?.message || 'Unknown error';
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        State.groq.status = 'cooldown';
    }
    log(`Groq failed ${State.groq.failureCount} times, switching to templates`, 'error');
    return null;
}

// ============================================
// TEMPLATE-BASED RESPONSE GENERATION
// ============================================
async function getTemplateResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // 1. Check for greetings
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('salam') || msg.includes('hey')) {
        return findKeywordResponse(userMessage) || `Assalam-o-Alaikum bhai! 👋 SimFly Pakistan mein khush amdeed! Main aapki kya madad kar sakta hoon? 😊`;
    }

    // 2. Check keyword responses
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // 3. Context-based responses
    // Check if user mentioned a plan
    if (msg.includes('500mb')) {
        return `500MB plan Rs. 130 mein hai bhai! ⚡ 2 saal ki validity hai.\n\nPayment karne ke liye ready hain? 💳`;
    }
    if (msg.includes('1gb')) {
        return `1GB plan Rs. 400 (Most Popular) 🔥\n\n2 saal ki validity, zabardast deal hai!\n\nLena hai bhai? 📱`;
    }
    if (msg.includes('5gb')) {
        return `5GB plan Rs. 1500 mein hai bhai! 💎 4 devices pe use kar sakte hain.\n\nFamily ke liye perfect hai! 👨‍👩‍👧‍👦\n\nOrder karein?`;
    }

    // Check if asking about payment
    if (msg.includes('pay') || msg.includes('send') || msg.includes('bhejo') || msg.includes('transfer')) {
        return `Payment Methods:\n\n💳 EasyPaisa: ${BUSINESS.payments.easypaisa.number}\n💳 JazzCash: ${BUSINESS.payments.jazzcash.number}\n💳 SadaPay: ${BUSINESS.payments.sadapay.number}\n\nPayment karke screenshot bhej dein bhai! 📱`;
    }

    // Default fallback response
    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?\n\nYa "help" likh dein! 👍`;
}

// ============================================
// MAIN AI RESPONSE FUNCTION (Hybrid)
// ============================================
async function getAIResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // Check for exact keywords first (faster)
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // Get history for context
    const history = await getHistory(chatId);

    // Try Groq if enabled
    if (BOT_CONFIG.useAI && isGroqEnabled()) {
        const groqResponse = await getGroqResponse(userMessage, chatId, history);
        if (groqResponse) return groqResponse;
    }

    // Fallback to templates
    if (BOT_CONFIG.useTemplates) {
        return await getTemplateResponse(userMessage, chatId);
    }

    return `Sorry bhai, main abhi samajh nahi paya. 🤔 Kya aap repeat karein?`;
}

// ============================================
// 🤖 AI RESPONSE WITH FULL CONTEXT - AI FIRST
// ============================================
async function getAIResponseWithContext(userMessage, chatId, chatContext) {
    // 🛡️ ANTI-BAN: Check rate limit first
    if (!checkRateLimit(chatId)) {
        log(`Rate limit hit for ${chatId}, slowing down`, 'warn');
        await new Promise(r => setTimeout(r, 5000));
    }

    // Build full conversation context for AI
    let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (chatContext && chatContext.length > 0) {
        // Add conversation history
        messages.push(...chatContext.slice(-30).map(m => ({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.body
        })));
    }
    // Add current message
    messages.push({ role: 'user', content: userMessage });

    // 🧠 AI FALLBACK CHAIN: Groq → Gemini 1 → Gemini 2
    const aiResponse = await getAIResponseWithFallback(messages, 0.7);

    if (aiResponse.success) {
        log(`AI responded via ${aiResponse.source} for ${chatId}: "${aiResponse.content.substring(0, 50)}..."`, 'info');
        return aiResponse.content;
    }

    // All AI failed — Use template fallback
    log(`All AI services failed for ${chatId}, using template fallback`, 'warn');
    return getTemplateResponse(userMessage);
}

// Template-based fallback response
function getTemplateResponse(userMessage) {
    const msg = userMessage.toLowerCase();

    // Check keyword responses
    for (const [category, data] of Object.entries(KEYWORD_RESPONSES)) {
        if (data.keywords.some(k => msg.includes(k))) {
            const responses = data.responses;
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }

    // Default responses
    const defaults = [
        `Bhai, main samajh gaya! ❤️ SimFly Pakistan mein aapka welcome hai!\n\nKya help chahiye bhai?\n\n📱 Plans dekhne hain?\n💳 Payment methods?\n🛒 Order karna hai?`,
        `Han bhai! ❤️ Main yahan hoon help ke liye.\n\nAapko kya chahiye?\n\n• 500MB Trial - Rs. 130\n• 1GB Plan - Rs. 400\n• 5GB Family - Rs. 1500`,
        `Assalam-o-Alaikum bhai! ❤️\n\nSimFly Pakistan ke eSIM plans:\n\n⚡ 500MB - Rs. 130\n🔥 1GB - Rs. 400 (Most Popular)\n💎 5GB - Rs. 1500\n\nKaunsa plan lena hai bhai? 👍`
    ];

    return defaults[Math.floor(Math.random() * defaults.length)];
}

// Enhanced Groq response with full context
async function getGroqResponseWithContext(userMessage, chatId, conversationHistory) {
    // Circuit breaker check
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        const timeSinceLastFailure = Date.now() - (State.groq.lastCall || 0);
        if (timeSinceLastFailure < GROQ_COOLDOWN_MS) {
            log(`Groq in cooldown (${Math.ceil((GROQ_COOLDOWN_MS - timeSinceLastFailure)/1000)}s)`, 'warn');
            State.groq.status = 'cooldown';
            return null;
        }
        State.groq.failureCount = 0;
        State.groq.status = 'active';
    }

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Build messages with FULL conversation context (last 30 messages for complete understanding)
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory.slice(-30),
                { role: 'user', content: userMessage }
            ];

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 600,
                temperature: 0.8,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            // Success - reset failure count
            State.groq.lastCall = Date.now();
            if (State.groq.failureCount > 0) {
                State.groq.failureCount = 0;
                State.groq.status = 'active';
                log('Groq API recovered', 'info');
            }

            return response.data.choices[0].message.content;

        } catch (e) {
            lastError = e;
            const statusCode = e.response?.status;

            log(`Groq attempt ${attempt + 1}/${maxRetries + 1} failed: ${statusCode || e.message}`, 'error');

            if (statusCode === 401) return null;
            if (statusCode === 429) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                continue;
            }
            if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            break;
        }
    }

    // All retries exhausted
    State.groq.failureCount++;
    State.groq.lastCall = Date.now();
    State.groq.lastError = lastError?.message || 'Unknown error';
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        State.groq.status = 'cooldown';
    }
    return null;
}

// ═══════════════════════════════════════════════════════
// 📊 ANALYZE ALL USER CHATS ON STARTUP
// ═══════════════════════════════════════════════════════
async function analyzeAllUserChats() {
    try {
        log('Analyzing all user chats on startup...', 'info');

        // Get all users
        const users = await getAllUsers();
        const summaries = [];

        for (const user of users) {
            const chatId = user.chatId;
            const history = await getHistory(chatId);

            if (history.length > 0) {
                // Analyze user's conversation
                const messages = history.map(m => m.body);
                const allText = messages.join(' ').toLowerCase();

                // Determine user status
                let status = 'browsing';
                if (allText.includes('payment') || allText.includes('screenshot')) status = 'payment_pending';
                if (allText.includes('buy') || allText.includes('order')) status = 'interested';
                if (allText.includes('device') || allText.includes('iphone')) status = 'checking_device';

                // Check for errors/problems
                const hasErrors = /error|problem|issue|masla|nahi chal/.test(allText);

                // Get preferred plan
                let preferredPlan = 'none';
                if (allText.includes('5gb')) preferredPlan = '5GB';
                else if (allText.includes('1gb')) preferredPlan = '1GB';
                else if (allText.includes('500mb')) preferredPlan = '500MB';

                summaries.push({
                    chatId,
                    messageCount: history.length,
                    status,
                    preferredPlan,
                    hasErrors,
                    lastActive: new Date(history[history.length - 1].time).toLocaleDateString()
                });
            }
        }

        // Send summary to admin
        if (ADMIN_NUMBER && summaries.length > 0) {
            const summaryText = summaries.slice(0, 20).map(s =>
                `👤 ${s.chatId}\n   Status: ${s.status}${s.hasErrors ? ' ⚠️ ERRORS' : ''}\n   Plan: ${s.preferredPlan}\n   Msgs: ${s.messageCount}`
            ).join('\n\n');

            const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
            await client.sendMessage(adminChat, `📊 *USER CHAT ANALYSIS*\n\n${summaryText}\n\n_Total users: ${summaries.length}_`);
            log(`Sent chat analysis to admin: ${summaries.length} users`, 'admin');
        }
    } catch (e) {
        log('Error analyzing user chats: ' + e.message, 'error');
    }
}

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function startWhatsApp() {
    if (client) return;

    log('Starting WhatsApp...');
    State.status = 'INITIALIZING';

    try {
        const authPath = path.join(__dirname, '.wwebjs_auth');
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        let executablePath = null;
        try {
            executablePath = await chromium.executablePath();
        } catch (e) {
            console.log('Chromium executable not found, using default');
        }

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath, clientId: 'simfly' }),
            puppeteer: {
                headless: PUPPETEER_CONFIG.headless,
                executablePath: executablePath || undefined,
                args: PUPPETEER_CONFIG.args
            }
        });

        client.on('qr', (qr) => {
            log('QR Code generated');
            State.status = 'QR';
            State.qrData = qr;
            console.log('\n=== SCAN THIS QR CODE ===\n');
            qrcode.generate(qr, { small: true });
        });

        client.on('authenticated', () => {
            log('Authenticated ✓');
            State.status = 'AUTHENTICATED';
        });

        client.on('ready', () => {
            log('WhatsApp READY! ✓');
            State.isReady = true;
            State.status = 'READY';
            State.qrData = null;

            // Notify admin
            if (ADMIN_NUMBER) {
                setTimeout(async () => {
                    try {
                        const stats = await getStats();
                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `🤖 SimFly Bot ONLINE! ✅\n\n📊 Stats: ${stats.totalMessages || 0} messages, ${stats.totalOrders || 0} orders\n⏱️ Uptime: ${Math.floor((Date.now() - State.startTime) / 1000)}s\n\nReady for customers! 🚀`);
                        log('Admin notified');
                    } catch (e) {
                        log('Failed to notify admin: ' + e.message, 'error');
                    }
                }, 3000);
            }

            // Start auto-followup system
            startFollowupChecker();

            // Initialize complete automation system
            initializeAutomation();

            // Analyze all user chats on startup and create summaries
            setTimeout(async () => {
                await analyzeAllUserChats();
            }, 10000); // Wait 10 seconds after startup
        });

        client.on('disconnected', (reason) => {
            log('Disconnected: ' + reason, 'error');
            State.isReady = false;
            State.status = 'DISCONNECTED';
            client = null;
            setTimeout(startWhatsApp, 5000);
        });

        // MESSAGE HANDLER
        client.on('message_create', async (msg) => {
            // Skip own messages
            if (msg.fromMe) return;

            const chatId = msg.from;
            const body = msg.body;

            // Deduplication: Check if already processed
            const msgId = msg.id?.id || msg.id?._serialized;
            if (msgId && State.processedMessages.has(msgId)) {
                log(`Skipping duplicate: ${msgId.slice(-8)}`);
                return;
            }
            if (msgId) State.processedMessages.add(msgId);

            // Keep set size manageable
            if (State.processedMessages.size > 100) {
                const first = State.processedMessages.values().next().value;
                State.processedMessages.delete(first);
            }

            log(`[${chatId}] ${body.slice(0, 50)}`);

            // Save to database
            await saveMessage(chatId, { body, fromMe: false, time: Date.now() });
            await incrementStats('totalMessages');

            // Track user
            await trackUser(chatId);

            // Skip if not ready
            if (!State.isReady) return;

            // Check for blocked users
            const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');
            if (blockedUsers.has(userKey)) {
                log(`Blocked user message: ${chatId}`, 'security');
                return;
            }

            // ════════════════════════════════════════════════════════════════════════════
            // 👑 AUTO-ADMIN DETECTION SYSTEM v4.0
            // Automatically detects admin by phone number - NO !admin command needed!
            // ════════════════════════════════════════════════════════════════════════════

            // Extract clean number from chatId
            const chatIdClean = chatId.replace(/[^0-9]/g, '');

            // Debug: Log incoming chat ID
            log(`👤 Message from: ${chatId} (clean: ${chatIdClean})`, 'info');

            // Check if message is from admin using multiple methods
            let isFromAdmin = false;

            // Method 1: Check against default admin numbers
            for (const adminNum of DEFAULT_ADMIN_NUMBERS) {
                if (!adminNum) continue;
                const cleanAdmin = adminNum.replace(/[^0-9]/g, '');
                if (chatIdClean === cleanAdmin ||
                    chatIdClean.includes(cleanAdmin) ||
                    cleanAdmin.includes(chatIdClean)) {
                    isFromAdmin = true;
                    log(`✅ Admin matched: ${adminNum}`, 'admin');
                    break;
                }
            }

            // Method 2: Check temp admin
            const isTempAdmin = AdminState.tempAdminChat === chatId;

            // Method 3: Check already registered admins
            if (!isFromAdmin && AdminState.registeredAdmins.has(chatId)) {
                isFromAdmin = true;
            }

            // Debug: Log admin detection result
            if (isFromAdmin) {
                log(`👑 ADMIN DETECTED: ${chatId}`, 'admin');
            }

            // Auto-register admin on first message
            if (isFromAdmin && !AdminState.registeredAdmins.has(chatId)) {
                AdminState.registeredAdmins.add(chatId);
                AdminState.adminChats.add(chatId);
                log(`🎉 Admin auto-registered: ${chatId}`, 'admin');

                // Send welcome message on first admin detection
                if (AdminState.firstTimeAdmin) {
                    AdminState.firstTimeAdmin = false;
                    setTimeout(async () => {
                        try {
                            await msg.reply(
                                `👑 *Welcome Admin!*\n\n` +
                                `You're automatically recognized as admin.\n\n` +
                                `📱 *Quick Commands:*\n` +
                                `!status - Bot status\n` +
                                `!pending - Pending payments\n` +
                                `!vstats - Verification stats\n` +
                                `!help - All commands\n\n` +
                                `Type !help for full command list.`
                            );
                        } catch (e) {
                            log('Admin welcome message failed: ' + e.message, 'error');
                        }
                    }, 1000);
                }
            }

            const isAdmin = isFromAdmin;

            // Handle admin reply commands (for payment verifications)
            if (isAdmin || isTempAdmin) {
                const replyHandled = await handleAdminReplyCommand(msg, chatId, body);
                if (replyHandled) return;
            }

            // Handle admin commands - ANY message starting with ! from admin
            if ((isAdmin || isTempAdmin) && body.startsWith('!')) {
                try {
                    log(`👑 Admin command from ${chatId}: ${body.slice(0, 30)}...`, 'admin');
                    const reply = await handleAdminCommand(msg, chatId, body);
                    if (reply) {
                        await msg.reply(reply);
                    }
                    return;
                } catch (e) {
                    log('Admin command error: ' + e.message, 'error');
                    await msg.reply('❌ Error: ' + e.message);
                    return;
                }
            }

            // 🚫 WHITELIST/PRIVATE MODE CHECK
            // Skip whitelist check for admin
            if (TEST_BOARD.enabled && !isAdmin && !isWhitelisted(chatId)) {
                // Store message for later review
                if (TEST_BOARD.saveExternalMessages) {
                    await saveExternalMessage(chatId, body);
                }
                await msg.reply(TEST_BOARD.message);
                log(`Blocked non-whitelisted user: ${chatId}`, 'security');
                return;
            }

            // Check maintenance mode (only for non-admin users)
            if (AdminState.maintenanceMode && !isAdmin) {
                await msg.reply('🔧 *Maintenance Mode*\n\nBot temporarily under maintenance. Please try again later! 🙏');
                return;
            }

            // ⏸️ CHECK IF BOT IS PAUSED (for non-admin users) - EARLY CHECK
            if (State.botPaused && !isAdmin && !isTempAdmin) {
                log(`Bot PAUSED - ignoring message from ${chatId}`, 'info');
                // Silently ignore - admin will manually reply
                return;
            }

            // ════════════════════════════════════════════════════════════════════════════
            // 🌸 NATURAL CONVERSATION FLOW v2.0 (Non-rushed, Human-like)
            // ════════════════════════════════════════════════════════════════════════════

            // Flow States
            const FLOW_STATES = {
                IDLE: 'idle',
                GREETING: 'greeting',
                GOT_NAME: 'got_name',
                GOT_DEVICE: 'got_device',
                PLAN_SELECTION: 'plan_selection',
                AWAITING_PAYMENT: 'awaiting_payment',
                PAYMENT_SENT: 'payment_sent',
                ORDER_COMPLETE: 'order_complete'
            };

            // Simple in-memory user states (can be moved to Firebase later)
            if (!global.userFlows) global.userFlows = new Map();

            const userFlow = global.userFlows.get(chatId) || { state: FLOW_STATES.IDLE, name: null, device: null, lastActivity: Date.now() };

            // Update activity timestamp
            userFlow.lastActivity = Date.now();

            // Typing debounce - wait 4 seconds before responding
            if (!global.typingTimers) global.typingTimers = {};

            if (global.typingTimers[chatId]) {
                clearTimeout(global.typingTimers[chatId]);
            }

            // Set timer to process message after 4 seconds of no typing
            global.typingTimers[chatId] = setTimeout(async () => {
                delete global.typingTimers[chatId];
                // Double-check pause state before processing
                if (State.botPaused && !isAdmin && !isTempAdmin) {
                    log(`Bot PAUSED - skipping deferred message from ${chatId}`, 'info');
                    return;
                }
                await processNaturalFlow(msg, chatId, body, userFlow, FLOW_STATES);
            }, 4000);

            // Save user flow state
            global.userFlows.set(chatId, userFlow);

            return; // Wait for debounce

            async function processNaturalFlow(msg, chatId, body, userFlow, FLOW_STATES) {
                const lowerBody = body.toLowerCase().trim();
                const isNewUser = userFlow.state === FLOW_STATES.IDLE;

                // Step 1: First message (New customer)
                if (isNewUser) {
                    userFlow.state = FLOW_STATES.GREETING;
                    global.userFlows.set(chatId, userFlow);

                    const greeting = `Hey! 👋 Aap ka naam kya hai aur konsa device use kar rahe hain?`;
                    await msg.reply(greeting);
                    await saveMessage(chatId, { body: greeting, fromMe: true, time: Date.now() });
                    return;
                }

                // Step 2: Got response to greeting (Name + Device usually)
                if (userFlow.state === FLOW_STATES.GREETING) {
                    // Try to extract name and device from message
                    const nameMatch = body.match(/(?:mera naam|my name is|main|i am|naam)\s*([a-zA-Z\s]{2,20})/i);
                    const deviceMatch = body.match(/(?:iphone|samsung|pixel|xiaomi|oppo|vivo|device|phone)\s*(?:xs|xr|11|12|13|14|15|16|[0-9\+\s]+)?/i);

                    if (nameMatch) {
                        userFlow.name = nameMatch[1].trim().split(' ')[0]; // First name only
                    }

                    if (deviceMatch) {
                        userFlow.device = deviceMatch[0].trim();
                        userFlow.state = FLOW_STATES.GOT_DEVICE;

                        // Acknowledge and show plans
                        const ack = userFlow.name
                            ? `Nice ${userFlow.name}! Aur device konsa hai? 📱`
                            : `Aur device konsa hai bhai? 📱`;

                        await msg.reply(ack);
                        await saveMessage(chatId, { body: ack, fromMe: true, time: Date.now() });
                    } else if (userFlow.name) {
                        // Got name but not device yet
                        userFlow.state = FLOW_STATES.GOT_NAME;
                        const askDevice = `Nice ${userFlow.name}! Aur device konsa use kar rahe hain? 📱`;
                        await msg.reply(askDevice);
                        await saveMessage(chatId, { body: askDevice, fromMe: true, time: Date.now() });
                    } else {
                        // Didn't get name or device, ask again
                        const askAgain = `Naam aur device batain bhai? 📱`;
                        await msg.reply(askAgain);
                        await saveMessage(chatId, { body: askAgain, fromMe: true, time: Date.now() });
                    }

                    global.userFlows.set(chatId, userFlow);
                    return;
                }

                // Step 3: Got device, show plans
                if (userFlow.state === FLOW_STATES.GOT_NAME) {
                    const deviceMatch = body.match(/(?:iphone|samsung|pixel|xiaomi|oppo|vivo)\s*(?:xs|xr|11|12|13|14|15|16|[0-9\+\s]+)?/i);
                    if (deviceMatch) {
                        userFlow.device = deviceMatch[0].trim();
                        userFlow.state = FLOW_STATES.GOT_DEVICE;
                    } else {
                        const askDevice = `Device ka naam batain bhai? iPhone, Samsung, etc. 📱`;
                        await msg.reply(askDevice);
                        await saveMessage(chatId, { body: askDevice, fromMe: true, time: Date.now() });
                        return;
                    }
                }

                if (userFlow.state === FLOW_STATES.GOT_DEVICE) {
                    userFlow.state = FLOW_STATES.PLAN_SELECTION;
                    global.userFlows.set(chatId, userFlow);

                    // Show plans
                    const plansMsg = `Bilkul! SimFly ke 3 plans hain ✅

📦 500MB — Rs. 130
📦 1GB — Rs. 400
📦 5GB — Rs. 1500

Sab plans non-PTA phones ke liye perfect hain 🔥
${userFlow.name ? userFlow.name : 'Bhai'}, konsa plan lena chahoge?`;

                    await msg.reply(plansMsg);
                    await saveMessage(chatId, { body: plansMsg, fromMe: true, time: Date.now() });
                    return;
                }

                // Step 4: Plan selection / Questions
                if (userFlow.state === FLOW_STATES.PLAN_SELECTION) {
                    // Check if user selected a plan
                    const planMatch = lowerBody.match(/(500mb|1gb|5gb|500|1\s*gb|5\s*gb)/);
                    const isQuestion = lowerBody.includes('?') || lowerBody.includes('kaise') || lowerBody.includes('kya') || lowerBody.includes('kitne');

                    if (planMatch) {
                        const plan = planMatch[0].includes('500') ? '500MB' : planMatch[0].includes('1') ? '1GB' : '5GB';
                        userFlow.selectedPlan = plan;
                        userFlow.state = FLOW_STATES.AWAITING_PAYMENT;
                        global.userFlows.set(chatId, userFlow);

                        const paymentMsg = `Plan confirm! Ab sirf payment karo 💳

Payment Methods:
• JazzCash: ${BUSINESS.payments.jazzcash.number}
• Easypaisa: ${BUSINESS.payments.easypaisa.number}

Payment ke baad screenshot bhejo, main verify kar lunga ✅`;

                        await msg.reply(paymentMsg);
                        await saveMessage(chatId, { body: paymentMsg, fromMe: true, time: Date.now() });
                        return;
                    }

                    // If question, use AI to answer
                    if (isQuestion) {
                        const context = userFlow.name ? `Customer name: ${userFlow.name}. ` : '';
                        const aiReply = await getAIResponseWithContext(body, chatId, [{ body: context + body, fromMe: false, time: Date.now() }]);
                        await msg.reply(aiReply);
                        await saveMessage(chatId, { body: aiReply, fromMe: true, time: Date.now() });
                        return;
                    }

                    // Generic response for other messages
                    const helpMsg = `Koi sawal ho toh pooch sakte hain! Ya plan select karein:\n\n📦 500MB — Rs. 130\n📦 1GB — Rs. 400\n📦 5GB — Rs. 1500`;
                    await msg.reply(helpMsg);
                    await saveMessage(chatId, { body: helpMsg, fromMe: true, time: Date.now() });
                    return;
                }

                // Step 5: Awaiting payment
                if (userFlow.state === FLOW_STATES.AWAITING_PAYMENT) {
                    // Handle text messages during payment phase
                    const isPaymentMention = lowerBody.includes('payment') || lowerBody.includes('send') || lowerBody.includes('bhej') || lowerBody.includes('done');

                    if (isPaymentMention) {
                        const waitMsg = `Screenshot ka wait kar raha houn bhai! 📱 Jaise hi aaye ga, verify kar ke confirm kar dunga ✅`;
                        await msg.reply(waitMsg);
                        await saveMessage(chatId, { body: waitMsg, fromMe: true, time: Date.now() });
                    } else {
                        // Use AI for other questions
                        const aiReply = await getAIResponseWithContext(body, chatId, await getChatContext(chatId, msg));
                        await msg.reply(aiReply);
                        await saveMessage(chatId, { body: aiReply, fromMe: true, time: Date.now() });
                    }
                    return;
                }

                // Default: Use AI for any other state
                const aiResponse = await getAIResponseWithContext(body, chatId, await getChatContext(chatId, msg));
                await msg.reply(aiResponse);
                await saveMessage(chatId, { body: aiResponse, fromMe: true, time: Date.now() });
            }

            // ═══════════════════════════════════════════════════════
            // 📸 SCREENSHOT DETECTION + PAYMENT VERIFICATION SYSTEM v2.0
            // ═══════════════════════════════════════════════════════
            if (msg.hasMedia) {
                log(`🔍 Processing media from ${chatId}...`, 'info');

                try {
                    const media = await msg.downloadMedia();
                    if (media && media.data) {
                        // Get chat history for context
                        const chatHistory = await getHistory(chatId);

                        // Step 1: Enhanced screenshot analysis
                        const screenshotAnalysis = await analyzeScreenshotEnhanced(
                            media.data,
                            media.mimetype,
                            chatId,
                            body,
                            chatHistory
                        );

                        log(`Screenshot analysis: ${screenshotAnalysis.type} (confidence: ${screenshotAnalysis.confidence}%)`, 'info');

                        // Step 2: Handle based on screenshot type
                        if (screenshotAnalysis.type === SCREENSHOT_TYPES.PAYMENT && screenshotAnalysis.isPayment) {
                            // PAYMENT SCREENSHOT DETECTED

                            // Check if auto-approve (trusted customer + high confidence)
                            if (screenshotAnalysis.autoApprove) {
                                log(`🤖 Auto-approving payment for trusted customer ${chatId}`, 'info');

                                // Notify customer immediately
                                await notifyCustomerAboutPayment(chatId, 'approved');

                                // Send plan guide
                                const planType = screenshotAnalysis.amount === 130 ? '500MB' :
                                                screenshotAnalysis.amount === 400 ? '1GB' :
                                                screenshotAnalysis.amount === 1500 ? '5GB' : null;

                                if (planType) {
                                    setTimeout(async () => {
                                        await sendPlanDetailsAfterVerification(chatId, planType);
                                    }, 2000);
                                }

                                // Notify admin about auto-approval
                                if (ADMIN_NUMBER) {
                                    try {
                                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                                        const number = chatId.replace(/\D/g, '').substring(0, 12);
                                        await client.sendMessage(adminChat,
                                            `✅ *AUTO-APPROVED PAYMENT*\n\n` +
                                            `👤 Customer: ${number}\n` +
                                            `💰 Amount: Rs. ${screenshotAnalysis.amount}\n` +
                                            `🎯 Confidence: ${screenshotAnalysis.confidence}%\n` +
                                            `✨ Trusted customer - Auto approved`
                                        );
                                    } catch (e) {}
                                }

                                return;
                            }

                            // Add to verification queue (manual review required)
                            await addToVerificationQueue(chatId, screenshotAnalysis, media.data, msg.id?.id);

                            // Notify customer
                            await notifyCustomerAboutPayment(chatId, 'pending');

                            // If suspicious, add warning to admin notification
                            if (screenshotAnalysis.isSuspicious) {
                                if (ADMIN_NUMBER) {
                                    try {
                                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                                        await client.sendMessage(adminChat,
                                            `⚠️ *SUSPICIOUS PAYMENT ALERT*\n\n` +
                                            `Customer: ${chatId.replace(/\D/g, '').substring(0, 12)}\n` +
                                            `⚠️ Flags: ${screenshotAnalysis.reasons.join(', ')}\n\n` +
                                            `Review carefully before approving!`
                                        );
                                    } catch (e) {}
                                }
                            }

                            return;

                        } else if (screenshotAnalysis.type === SCREENSHOT_TYPES.ISSUE && screenshotAnalysis.isIssue) {
                            // ISSUE SCREENSHOT
                            await msg.reply(`🆘 *Issue Screenshot Received* ❤️\n\nBhai, screenshot mil gaya! Main analyze kar raha hoon... 🤔\n\n*Problem:* ${screenshotAnalysis.extractedText?.slice(0, 100) || 'Analyzing...'}`);

                            // Notify admin
                            if (ADMIN_NUMBER) {
                                try {
                                    const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                                    await client.sendMessage(adminChat,
                                        `🆘 *ISSUE SCREENSHOT*\n\n` +
                                        `From: ${chatId}\n` +
                                        `Description: ${screenshotAnalysis.extractedText?.slice(0, 200) || 'See image'}\n\n` +
                                        `Customer needs technical support!`
                                    );
                                } catch (e) {}
                            }
                            return;

                        } else if (screenshotAnalysis.type === SCREENSHOT_TYPES.DUPLICATE) {
                            // DUPLICATE SCREENSHOT
                            await msg.reply(`⚠️ *Duplicate Screenshot* ❤️\n\nBhai, yeh screenshot pehle bheja ja chuka hai.\n\nAgar new payment hai toh dubara clear screenshot bhejein! 📱`);
                            return;

                        } else if (screenshotAnalysis.type === SCREENSHOT_TYPES.CHAT) {
                            // CHAT SCREENSHOT (someone else's conversation)
                            await msg.reply(`📸 *Chat Screenshot Received* ❤️\n\nBhai, yeh kisi aur ki conversation lag rahi hai.\n\nAgar aapka issue hai toh khud explain karein, ya apna screenshot bhejein! 👍`);
                            return;

                        } else {
                            // UNKNOWN/RANDOM SCREENSHOT - Don't reply to customer
                            log(`Non-payment screenshot (${screenshotAnalysis.type}) from ${chatId} - only notifying admin`, 'info');

                            // Only notify admin, don't bother customer
                            if (ADMIN_NUMBER && screenshotAnalysis.shouldNotifyAdmin) {
                                try {
                                    const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                                    const number = chatId.replace(/\D/g, '').substring(0, 12);
                                    await client.sendMessage(adminChat,
                                        `📸 *NON-PAYMENT IMAGE*\n\n` +
                                        `From: ${number}\n` +
                                        `Type: ${screenshotAnalysis.type}\n` +
                                        `Confidence: ${screenshotAnalysis.confidence}%\n\n` +
                                        `No action taken - not replying to customer`
                                    );
                                } catch (e) {}
                            }
                            return;
                        }
                    }
                } catch (e) {
                    log('Screenshot analysis error: ' + e.message, 'error');
                }
            }

            // ═══════════════════════════════════════════════════════
            // 🤖 HUMAN-LIKE FEATURES INTEGRATION
            // ═══════════════════════════════════════════════════════

            // Feature 30: Silent Hours Check (skip auto-reply 1AM-7AM)
            if (isSilentHours() && !body.toLowerCase().includes('urgent')) {
                log(`Silent hours - not replying to ${chatId}`, 'info');
                return;
            }

            // Get user profile for personalization
            const profile = getUserProfile(chatId);
            profile.updateMood(body);
            profile.detectLanguageStyle(body);
            profile.messageCount++;
            profile.lastSeen = Date.now();

            // Feature 8: Previous Chat Memory
            const previousContext = await getPreviousContext(chatId, profile);
            if (previousContext && profile.messageCount === 1) {
                await msg.reply(previousContext);
            }

            // Feature 18: Repeat Question Detection
            if (isRepeatQuestion(chatId, body)) {
                await msg.reply(`Bhai, maine pehle bataya tha 😊 ${getLastAnswer(chatId) || 'Agar samajh nahi aaya toh "support" likhein!'}`);
                return;
            }

            // Feature 9: Ask for Name (after 3 messages if not known)
            if (!profile.name && profile.messageCount === HUMAN_CONFIG.nameAskThreshold) {
                await msg.reply('Bhai, aapka naam kya hai? Main apna dost samajhta hoon 😊');
            }

            // Feature 30: Sentiment Auto-Escalation
            if (shouldEscalate(profile) && ADMIN_NUMBER) {
                try {
                    const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                    await client.sendMessage(adminChat, `🚨 *FRUSTRATED USER ALERT*\n\nCustomer: ${chatId}\nMood: ${profile.mood}\nSentiment: ${profile.sentiment}\nMessage: ${body.slice(0, 100)}\n\n_Customer may need immediate attention!_`);
                } catch (e) {}
            }

            // ERROR DETECTION for returning customers
            const errorKeywords = ['error', 'problem', 'issue', 'masla', 'nahi chal', 'not working', 'fail', 'stuck', 'help'];
            const hasError = errorKeywords.some(k => body.toLowerCase().includes(k));

            if (hasError && !isNew && ADMIN_NUMBER) {
                // Returning customer has error - notify admin immediately
                try {
                    const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                    await client.sendMessage(adminChat, `🆘 *RETURNING CUSTOMER ERROR*\n\nCustomer: ${chatId}\nIssue: ${body.slice(0, 150)}\n\n_This customer needs immediate help!_`);
                } catch (e) {}
            }

            // Feature 19: Track Abandoned Cart
            if (profile.purchaseStage === PURCHASE_STAGES.PLAN_VIEW && !profile.abandonedCartTime) {
                profile.abandonedCartTime = Date.now();
            }

            // Check for post-purchase support commands
            const lowerBody = body.toLowerCase();
            if (lowerBody === 'guide' || lowerBody === 'help' || lowerBody === 'activation') {
                const supportMsg = `📱 *eSIM ACTIVATION GUIDE*\n\n*Step 1:* Download Eskimo App\n📲 iOS: apps.apple.com/app/eskimo\n📲 Android: play.google.com/store/apps/eskimo\n\n*Step 2:* Sign up with your number\n\n*Step 3:* Add eSIM\n• Settings → Cellular → Add eSIM\n• Scan QR OR enter manually\n\n*Step 4:* Enable Data Roaming\n• Settings → Cellular → Data Roaming: ON ✅\n\n*Step 5:* Wait 2-5 min for activation\n\n❓ Type "support" for more help`;
                await msg.reply(supportMsg);
                await saveMessage(chatId, { body: supportMsg, fromMe: true, time: Date.now() });
                return;
            }

            if (lowerBody === 'support' || lowerBody === 'problem' || lowerBody === 'issue') {
                const helpMsg = `🆘 *SUPPORT REQUEST*\n\nBhai, kya problem aa rahi hai?\n\n*Common Issues:*\n1️⃣ QR scan nahi ho raha?\n2️⃣ Activation ho raha?\n3️⃣ Data roaming ON hai?\n4️⃣ Signal nahi aa rahe?\n\n*Apna issue batain:*\n• Phone model?\n• Konsa step pe problem hai?\n• Screenshot bhejein agar ho sake\n\n_Admin jaldi reply karega!_`;
                await msg.reply(helpMsg);
                await saveMessage(chatId, { body: helpMsg, fromMe: true, time: Date.now() });

                // Notify admin about support request
                if (ADMIN_NUMBER) {
                    try {
                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `🆘 *SUPPORT REQUEST*\n\nCustomer: ${chatId}\nIssue: ${body}\n\nReply to help!`);
                    } catch (e) {}
                }
                return;
            }

            // ═══════════════════════════════════════════════════════
            // 🔍 DEEP CHAT ANALYSIS — Analyze before replying
            // ═══════════════════════════════════════════════════════
            const history = await getHistory(chatId);
            const chatAnalysis = await analyzeChatBeforeReply(chatId, body, history, profile);

            // ═══════════════════════════════════════════════════════
            // 🎯 NEW CRM FLOW — Smart Customer Handling
            // ═══════════════════════════════════════════════════════

            // 1️⃣ RETURNING CUSTOMER — Ask about error first
            if (chatAnalysis.isReturningCustomer && chatAnalysis.hasIssue) {
                const greeting = getReturningCustomerGreeting(profile);
                await msg.reply(greeting);
                await saveMessage(chatId, { body: greeting, fromMe: true, time: Date.now() });

                // Notify admin about returning customer with issue
                if (ADMIN_NUMBER) {
                    try {
                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `🔄 *RETURNING CUSTOMER*\n\nCustomer: ${chatId}${profile.name ? ` (${profile.name})` : ''}\nIssue: ${chatAnalysis.returningCustomerIssue?.slice(0, 100)}\n\n_Bot asked about their error first_`);
                    } catch (e) {}
                }

                // Still continue to AI for detailed response
            }

            // 2️⃣ NEW CUSTOMER — Button-like welcome with device options
            else if (chatAnalysis.isNewCustomer && profile.messageCount <= 2) {
                // Check if this is from FB/Instagram ad (simple heuristic)
                const isFromAd = body.toLowerCase().includes('ad') ||
                                body.toLowerCase().includes('facebook') ||
                                body.toLowerCase().includes('instagram') ||
                                body.toLowerCase().includes('promo');

                const welcome = getButtonLikeWelcome(isFromAd);
                await msg.reply(welcome);
                await saveMessage(chatId, { body: welcome, fromMe: true, time: Date.now() });

                // Notify admin about new customer
                if (ADMIN_NUMBER) {
                    try {
                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `👋 *NEW CUSTOMER*\n\nFrom: ${chatId}\n${isFromAd ? '📢 *From FB/Instagram Ad*' : 'Organic'}\n\n_First message sent with device options_`);
                    } catch (e) {}
                }

                // Schedule followup
                scheduleFollowup(chatId, 'new_customer');
                return; // Don't send AI response yet, let them reply with device
            }

            // 3️⃣ DEVICE MENTIONED — Check compatibility and suggest trial for JV
            if (chatAnalysis.deviceMentioned && chatAnalysis.deviceCompatible) {
                // Save device to profile
                profile.device = chatAnalysis.deviceMentioned;

                if (chatAnalysis.isJVDevice) {
                    // JV device found — Suggest trial first
                    const trialMessage = getJVTrialSuggestion(chatAnalysis.deviceMentioned);
                    await msg.reply(trialMessage);
                    await saveMessage(chatId, { body: trialMessage, fromMe: true, time: Date.now() });

                    // Save to database
                    await saveUserDevice(chatId, chatAnalysis.deviceMentioned, true, true);

                    // Don't continue to regular flow yet
                    scheduleFollowup(chatId, 'jv_trial_offered');
                    return;
                } else {
                    // Normal device — Acknowledge compatibility
                    const compatMessage = `✅ *${chatAnalysis.deviceMentioned} pe eSIM fully supported hai bhai!* ❤️\n\n*Best plans for you:*\n\n🔥 *1GB - Rs. 400* (Most Popular, 2 years)\n⚡ *500MB - Rs. 130* (Trial, 2 years)\n💎 *5GB - Rs. 1500* (4 devices, 2 years)\n\nKaunsa plan pasand hai bhai? 👍`;
                    await msg.reply(compatMessage);
                    await saveMessage(chatId, { body: compatMessage, fromMe: true, time: Date.now() });

                    // Save to database
                    await saveUserDevice(chatId, chatAnalysis.deviceMentioned, true, false);

                    scheduleFollowup(chatId, 'device_compatible');
                    return;
                }
            }

            // 4️⃣ INTERNATIONAL eSIM MENTIONED
            if (chatAnalysis.lastTopic === 'international_esim' ||
                body.toLowerCase().includes('airalo') ||
                body.toLowerCase().includes('maya') ||
                body.toLowerCase().includes('saily') ||
                body.toLowerCase().includes('other esim')) {
                const explanation = getInternationalESIMExplanation();
                await msg.reply(explanation);
                await saveMessage(chatId, { body: explanation, fromMe: true, time: Date.now() });

                // Then continue to AI for plan recommendation
            }

            // 5️⃣ NAME SHARED — Acknowledge and save
            if (chatAnalysis.nameShared) {
                const nameAck = `*${chatAnalysis.nameShared}*, nice name bhai! ❤️\n\nMain ${chatAnalysis.nameShared} bhai samajh ke help karonga! 👍`;
                await msg.reply(nameAck);
                await saveMessage(chatId, { body: nameAck, fromMe: true, time: Date.now() });
            }

            // 👤 REGULAR MESSAGE HANDLING — Use AI with context
            const isNew = chatAnalysis.isNewCustomer;
            const userSession = getUserSession(chatId);

            // Update session
            if (isNew && userSession.state === 'new') {
                setUserSession(chatId, { state: 'active', step: 1, firstMessage: body });
            }

            // Extract device info if mentioned (for AI context only)
            const deviceCheck = checkDeviceCompatibility(body);
            if (deviceCheck.compatible !== null && userSession.device !== deviceCheck.matchedDevice) {
                setUserSession(chatId, { ...userSession, device: deviceCheck.matchedDevice, deviceCompatible: deviceCheck.compatible });
            }

            // Regular message handling
            try {
                const chat = await msg.getChat();

                // 📚 LOAD FULL CHAT CONTEXT (recent messages)
                const chatContext = await getChatContext(chatId, msg);

                // 🛡️ ANTI-BAN: Random delay before response
                const randomDelay = getRandomDelay();
                if (randomDelay > 0) {
                    await new Promise(r => setTimeout(r, randomDelay));
                }

                // Show typing indicator (human-like behavior)
                if (AdminState.typingIndicator && BOT_CONFIG.showTyping) {
                    await chat.sendStateTyping();
                    // Human-like typing time based on message length
                    const typingTime = Math.min(body.length * 30, 3000);
                    await new Promise(r => setTimeout(r, typingTime));
                }

                // Get AI response with full context
                const reply = await getAIResponseWithContext(body, chatId, chatContext);

                // ═══════════════════════════════════════════════════════
                // 🤖 APPLY HUMAN-LIKE TRANSFORMATIONS
                // ═══════════════════════════════════════════════════════

                // Feature 22: Custom Greeting
                let finalReply = reply;
                const customGreeting = profile.getGreeting();
                if (customGreeting && profile.messageCount <= 2) {
                    finalReply = `${customGreeting}\n\n${reply}`;
                }

                // Feature 5: Add Intentional Typos
                finalReply = addHumanTypos(finalReply, profile);

                // Feature 6: Casual Language
                finalReply = addCasualLanguage(finalReply, profile);

                // Feature 7: Control Emojis
                finalReply = controlEmojis(finalReply);

                // Feature 29: Adapt Tone
                finalReply = adaptTone(profile, finalReply);

                // Feature 4: Message Breakup (send long messages in parts)
                const messageParts = splitMessage(finalReply);

                // 🛡️ ANTI-BAN: Feature 1,2: Random Delay + Typing Variation
                for (let i = 0; i < messageParts.length; i++) {
                    const part = messageParts[i];

                    // Calculate human-like typing time based on message length
                    const baseTime = part.length * HUMAN_CONFIG.baseTypingSpeed;
                    const variation = baseTime * HUMAN_CONFIG.typingVariation * (Math.random() * 2 - 1);
                    const typingTime = Math.max(HUMAN_CONFIG.minDelay, Math.min(HUMAN_CONFIG.maxDelay, baseTime + variation));

                    // Feature 3: Show "thinking" for complex questions
                    if (part.length > 100 || body.includes('?')) {
                        await chat.sendStateTyping();
                    }

                    // Human-like delay
                    await new Promise(r => setTimeout(r, typingTime));

                    // Send message part
                    const sent = await msg.reply(part);

                    // Save bot response
                    if (sent) {
                        await saveMessage(chatId, { body: part, fromMe: true, time: Date.now() });

                        // Feature 18: Remember last answer for repeat detection
                        const history = messageHistory.get(chatId) || [];
                        history.push(part);
                        messageHistory.set(chatId, history);
                    }

                    // Feature 4: Delay between message parts
                    if (i < messageParts.length - 1) {
                        await new Promise(r => setTimeout(r, HUMAN_CONFIG.breakupDelay));
                    }
                }

                // Clear typing indicator
                try {
                    await chat.clearState();
                } catch (e) {}

                // Feature 23: Contextual Follow-ups
                const followup = getContextualFollowup(profile);
                if (followup && Math.random() < 0.3) { // 30% chance
                    setTimeout(async () => {
                        try {
                            await client.sendMessage(chatId, followup);
                        } catch (e) {}
                    }, 30000); // Send after 30 seconds
                }

                // Schedule followup for this user (if not admin)
                if (!isAdmin && !isTempAdmin) {
                    scheduleFollowup(chatId, 'general');
                }

            } catch (e) {
                log('Reply error: ' + e.message, 'error');
            }
        });

        await client.initialize();
        log('Client initialized');

    } catch (error) {
        log('Start error: ' + error.message, 'error');
        setTimeout(startWhatsApp, 10000);
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        status: State.status,
        ready: State.isReady,
        uptime: Date.now() - State.startTime
    });
});

// Status API
app.get('/api/status', async (req, res) => {
    try {
        const stats = await getStats();
        const userCount = await getUserCount();
        const orders = await getOrders('all');

        // Calculate cooldown remaining
        let cooldownRemaining = 0;
        if (State.groq.status === 'cooldown') {
            const elapsed = Date.now() - (State.groq.lastCall || 0);
            cooldownRemaining = Math.max(0, GROQ_COOLDOWN_MS - elapsed);
        }

        res.json({
            status: State.status,
            ready: State.isReady,
            qr: State.qrData,
            stats: stats,
            users: userCount,
            orders: orders.length,
            logs: State.logs.slice(0, 15),
            uptime: Date.now() - State.startTime,
            firebase: isFirebaseEnabled(),
            groq: {
                enabled: isGroqEnabled(),
                status: State.groq.status,
                failures: State.groq.failureCount,
                cooldownRemaining: cooldownRemaining,
                lastError: State.groq.lastError
            },
            botPaused: State.botPaused,
            pausedBy: State.pausedBy,
            pauseReason: State.pauseReason
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get orders API
app.get('/api/orders', async (req, res) => {
    try {
        if (DB) {
            const snapshot = await DB.ref('orders').once('value');
            const orders = Object.values(snapshot.val() || {});
            res.json({ orders: orders.slice(-20), total: orders.length });
        } else {
            res.json({ orders: localDB.orders.slice(-20), total: localDB.orders.length });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Send message via API
app.post('/api/send', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ error: 'Missing number or message' });
    }
    if (!State.isReady) {
        return res.status(503).json({ error: 'Bot not ready' });
    }
    try {
        const chatId = `${number.replace(/\D/g, '')}@c.us`;
        const sent = await client.sendMessage(chatId, message);
        res.json({ success: true, messageId: sent?.id?.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Main dashboard page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${BUSINESS.name} Bot v7.0</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; min-height: 100vh; padding: 20px; }
        .container { max-width: 700px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 0; }
        .logo { font-size: 3rem; }
        .title { font-size: 2rem; font-weight: bold; background: linear-gradient(45deg, #ff6b6b, #feca57); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { color: #888; margin-top: 5px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 16px 0; }
        .status-box { text-align: center; }
        .status-icon { font-size: 3rem; margin-bottom: 10px; }
        .status-title { font-size: 1.3rem; font-weight: 600; }
        .status-text { color: #888; font-size: 0.9rem; margin-top: 5px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; margin: 5px; }
        .badge-green { background: #2ecc71; color: #000; }
        .badge-red { background: #e74c3c; }
        .badge-yellow { background: #f39c12; color: #000; }
        .badge-blue { background: #3498db; }
        .loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .qr-box { background: #fff; border-radius: 12px; padding: 20px; text-align: center; display: none; }
        .qr-box.show { display: block; }
        #qrcode { margin: 0 auto; }
        .success-box { text-align: center; display: none; }
        .success-box.show { display: block; }
        .logs { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; }
        .log-item { padding: 4px 0; color: #aaa; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-item:last-child { border-bottom: none; color: #2ecc71; }
        .log-time { color: #666; margin-right: 8px; }
        .log-error { color: #e74c3c !important; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .stat-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: bold; color: #feca57; }
        .stat-label { font-size: 0.8rem; color: #888; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.8rem; }
        .action-btn { background: linear-gradient(45deg, #ff6b6b, #feca57); border: none; padding: 12px 24px; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; margin: 5px; }
        .action-btn:hover { opacity: 0.9; }
        input[type="text"], input[type="number"] { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; border-radius: 6px; color: #fff; margin: 5px; width: 200px; }
        .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 15px 0; }
        .plan-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; border: 2px solid transparent; }
        .plan-box.popular { border-color: #feca57; }
        .plan-icon { font-size: 2rem; }
        .plan-name { font-weight: bold; margin: 5px 0; }
        .plan-price { color: #feca57; font-size: 1.2rem; }
        .plan-detail { color: #888; font-size: 0.75rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">${BUSINESS.name}</div>
            <div class="subtitle">${BUSINESS.tagline}</div>
            <div style="margin-top: 10px;">
                <span class="badge badge-blue">v8.0 Master Bot</span>
                <span class="badge ${isFirebaseEnabled() ? 'badge-green' : 'badge-yellow'}">${isFirebaseEnabled() ? 'Firebase' : 'Local DB'}</span>
                <span id="groqStatus" class="badge badge-yellow">🤖 AI: Checking...</span>
            </div>
        </div>

        <div class="card">
            <div class="status-box" id="statusBox">
                <div class="status-icon" id="statusIcon">⏳</div>
                <div class="status-title" id="statusTitle">Initializing</div>
                <div class="status-text" id="statusText">Starting WhatsApp...</div>
                <div class="loader" id="loader"></div>
            </div>

            <div class="qr-box" id="qrCard">
                <div style="color: #333; font-weight: bold; margin-bottom: 15px;">📱 Scan with WhatsApp</div>
                <div id="qrcode"></div>
                <div style="color: #666; font-size: 0.85rem; margin-top: 15px;">Settings → Linked Devices → Link a Device</div>
            </div>

            <div class="success-box" id="successCard">
                <div class="status-icon">✅</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #2ecc71;">Connected!</div>
                <div style="color: #888; margin-top: 5px;">Bot is ready for messages</div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">📊 Live Statistics</div>
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-num" id="msgCount">0</div>
                    <div class="stat-label">Messages</div>
                </div>
                <div class="stat-box">
                    <div class="stat-num" id="orderCount">0</div>
                    <div class="stat-label">Orders</div>
                </div>
                <div class="stat-box">
                    <div class="stat-num" id="userCount">0</div>
                    <div class="stat-label">Users</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">💎 eSIM Plans</div>
            <div class="plans">
                <div class="plan-box">
                    <div class="plan-icon">⚡</div>
                    <div class="plan-name">500MB</div>
                    <div class="plan-price">Rs. 130</div>
                    <div class="plan-detail">2 Years Validity</div>
                </div>
                <div class="plan-box popular">
                    <div class="plan-icon">🔥</div>
                    <div class="plan-name">1GB</div>
                    <div class="plan-price">Rs. 400</div>
                    <div class="plan-detail">Most Popular</div>
                </div>
                <div class="plan-box">
                    <div class="plan-icon">💎</div>
                    <div class="plan-name">5GB</div>
                    <div class="plan-price">Rs. 1500</div>
                    <div class="plan-detail">4 Devices</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">📋 Real-time Logs</div>
            <div class="logs" id="logsBox">
                <div class="log-item"><span class="log-time">--:--</span> Waiting...</div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">🛠️ Admin Actions</div>
            <div style="text-align: center;">
                <input type="text" id="sendNumber" placeholder="Phone Number (92300...)" />
                <input type="text" id="sendMessage" placeholder="Message..." />
                <br>
                <button class="action-btn" onclick="sendMessage()">Send Message</button>
                <button class="action-btn" onclick="location.reload()">Refresh Page</button>
            </div>
            <div id="sendResult" style="text-align: center; margin-top: 10px; font-size: 0.85rem;"></div>
        </div>

        <div class="footer">v8.0 Master Bot | Firebase + Groq AI | SimFly Pakistan</div>
    </div>

    <script>
        const els = {
            statusIcon: document.getElementById('statusIcon'),
            statusTitle: document.getElementById('statusTitle'),
            statusText: document.getElementById('statusText'),
            loader: document.getElementById('loader'),
            qrCard: document.getElementById('qrCard'),
            successCard: document.getElementById('successCard'),
            logsBox: document.getElementById('logsBox')
        };

        let currentQR = null;

        function formatTime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
            if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
            return seconds + 's';
        }

        function updateUI(data) {
            document.getElementById('msgCount').textContent = data.stats?.totalMessages || 0;
            document.getElementById('orderCount').textContent = data.stats?.totalOrders || 0;
            document.getElementById('userCount').textContent = data.users || 0;

            // Update Groq status indicator
            if (data.groq) {
                const groqStatusEl = document.getElementById('groqStatus');
                if (groqStatusEl) {
                    if (!data.groq.enabled) {
                        groqStatusEl.textContent = '🤖 AI: OFF';
                        groqStatusEl.className = 'badge badge-red';
                    } else if (data.groq.status === 'cooldown') {
                        const mins = Math.ceil(data.groq.cooldownRemaining / 60000);
                        groqStatusEl.textContent = '\u23f3 AI: Cooldown (' + mins + 'm)';
                        groqStatusEl.className = 'badge badge-yellow';
                    } else if (data.groq.failures > 0) {
                        groqStatusEl.textContent = '\u26a0\ufe0f AI: Warning (' + data.groq.failures + ')';
                        groqStatusEl.className = 'badge badge-yellow';
                    } else {
                        groqStatusEl.textContent = '🟢 AI: Active';
                        groqStatusEl.className = 'badge badge-green';
                    }
                }
            }

            // Update Pause status
            const pauseStatusEl = document.getElementById('pauseStatus');
            if (pauseStatusEl) {
                if (data.botPaused) {
                    pauseStatusEl.textContent = '⏸️ PAUSED';
                    pauseStatusEl.className = 'badge badge-red';
                    pauseStatusEl.style.display = 'inline-block';
                } else {
                    pauseStatusEl.style.display = 'none';
                }
            }

            if (data.logs?.length > 0) {
                els.logsBox.innerHTML = data.logs.map(l =>
                    '<div class="log-item ' + (l.type === 'error' ? 'log-error' : '') + '"><span class="log-time">' + l.time + '</span> ' + l.msg + '</div>'
                ).join('');
            }

            switch(data.status) {
                case 'INITIALIZING':
                    els.statusIcon.textContent = '⏳';
                    els.statusTitle.textContent = 'Initializing';
                    els.statusText.textContent = 'Starting WhatsApp...';
                    els.loader.style.display = 'block';
                    els.qrCard.classList.remove('show');
                    els.successCard.classList.remove('show');
                    break;
                case 'QR':
                    els.statusIcon.textContent = '📱';
                    els.statusTitle.textContent = 'Scan QR Code';
                    els.statusText.textContent = 'Open WhatsApp on phone → Settings → Linked Devices';
                    els.loader.style.display = 'none';
                    if (data.qr && data.qr !== currentQR) {
                        currentQR = data.qr;
                        els.qrCard.classList.add('show');
                        document.getElementById('qrcode').innerHTML = '';
                        new QRCode(document.getElementById('qrcode'), { text: data.qr, width: 200, height: 200 });
                    }
                    break;
                case 'AUTHENTICATED':
                    els.statusIcon.textContent = '🔐';
                    els.statusTitle.textContent = 'Authenticating...';
                    els.qrCard.classList.remove('show');
                    break;
                case 'READY':
                    els.statusIcon.textContent = '✅';
                    els.statusTitle.textContent = 'Connected!';
                    els.statusText.textContent = 'Bot is ready for messages | Uptime: ' + formatTime(data.uptime || 0);
                    els.loader.style.display = 'none';
                    els.qrCard.classList.remove('show');
                    els.successCard.classList.add('show');
                    break;
                case 'DISCONNECTED':
                    els.statusIcon.textContent = '❌';
                    els.statusTitle.textContent = 'Disconnected';
                    els.statusText.textContent = 'Reconnecting...';
                    break;
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status?t=' + Date.now());
                updateUI(await res.json());
            } catch (e) { console.error(e); }
        }

        async function sendMessage() {
            const number = document.getElementById('sendNumber').value;
            const message = document.getElementById('sendMessage').value;
            const resultEl = document.getElementById('sendResult');

            if (!number || !message) {
                resultEl.innerHTML = '<span style="color: #e74c3c;">Enter number and message!</span>';
                return;
            }

            resultEl.innerHTML = '<span style="color: #888;">Sending...</span>';

            try {
                const res = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number, message })
                });
                const data = await res.json();
                if (data.success) {
                    resultEl.innerHTML = '<span style="color: #2ecc71;">✓ Message sent!</span>';
                    document.getElementById('sendMessage').value = '';
                } else {
                    resultEl.innerHTML = '<span style="color: #e74c3c;">✗ ' + (data.error || 'Failed') + '</span>';
                }
            } catch (e) {
                resultEl.innerHTML = '<span style="color: #e74c3c;">✗ Error: ' + e.message + '</span>';
            }
        }

        fetchStatus();
        setInterval(fetchStatus, 2000);
    </script>
</body>
</html>`);
});

// Start server
const server = app.listen(BOT_CONFIG.port, () => {
    log('='.repeat(50));
    log('SimFly OS v8.0 - Firebase + Groq AI Edition');
    log('Port: ' + BOT_CONFIG.port);
    log('Admin: ' + (ADMIN_NUMBER || 'Not set'));
    log('Database: ' + (isFirebaseEnabled() ? 'Firebase Realtime' : 'Local JSON'));
    log('Groq AI: ' + (isGroqEnabled() ? 'Enabled' : 'Disabled'));
    log('='.repeat(50));
    setTimeout(startWhatsApp, 2000);
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

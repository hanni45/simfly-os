/**
 * Startup Sync Service
 * Fetches existing WhatsApp chats and syncs to database silently
 */

const logger = require('../utils/logger');
const { CustomerQueries, ConversationQueries } = require('../database/queries');
const ai = require('./ai');

// Configuration
const BATCH_SIZE = 50; // Process in batches to avoid memory spikes
const MAX_MESSAGES_PER_CHAT = 100; // Limit messages per chat
const MAX_CHATS = 200; // Limit total chats to process

/**
 * Sync all existing WhatsApp chats to database
 * @param {Object} client - WhatsApp client instance
 */
async function syncExistingChats(client) {
  logger.info('🔄 Starting WhatsApp chat history sync...');

  try {
    // Fetch all chats
    const chats = await client.getChats();
    logger.info(`📱 Found ${chats.length} total chats`);

    // Filter only private chats (skip groups)
    const privateChats = chats
      .filter(chat => !chat.isGroup && chat.id._serialized.includes('@c.us'))
      .slice(0, MAX_CHATS);

    logger.info(`📱 Processing ${privateChats.length} private chats`);

    let syncedCustomers = 0;
    let syncedMessages = 0;
    let skippedCustomers = 0;

    for (let i = 0; i < privateChats.length; i += BATCH_SIZE) {
      const batch = privateChats.slice(i, i + BATCH_SIZE);

      for (const chat of batch) {
        try {
          const result = await processChat(client, chat);
          if (result.newCustomer) syncedCustomers++;
          syncedMessages += result.messages;
          if (result.existed) skippedCustomers++;
        } catch (err) {
          logger.error(`Error processing chat ${chat.id._serialized}`, { error: err.message });
        }
      }

      // Small delay between batches to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

      // Log progress
      logger.info(`🔄 Sync progress: ${i + batch.length}/${privateChats.length} chats processed`);
    }

    logger.info('✅ Chat history sync complete', {
      totalChats: privateChats.length,
      newCustomers: syncedCustomers,
      existingCustomers: skippedCustomers,
      totalMessages: syncedMessages
    });

  } catch (err) {
    logger.error('Chat sync failed', { error: err.message });
  }
}

/**
 * Process a single chat - extract messages and save to database
 * @param {Object} client - WhatsApp client
 * @param {Object} chat - WhatsApp chat object
 * @returns {Object} - Sync results
 */
async function processChat(client, chat) {
  const number = chat.id._serialized.replace('@c.us', '');
  const existed = CustomerQueries.get(number);

  // If customer already exists, skip processing messages
  if (existed) {
    return { newCustomer: false, existed: true, messages: 0 };
  }

  // Create customer record
  const contact = await chat.getContact();
  const customer = CustomerQueries.getOrCreate(number, contact.pushname || contact.name);

  // Detect stage based on chat context
  const stage = await detectStageFromChat(chat);
  CustomerQueries.update(number, { stage });

  // Fetch recent messages
  const messages = await chat.fetchMessages({ limit: MAX_MESSAGES_PER_CHAT });
  let messageCount = 0;

  // Process messages (oldest first)
  const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);

  for (const msg of sortedMessages) {
    if (!msg.body || msg.type !== 'chat') continue;

    const role = msg.fromMe ? 'bot' : 'user';
    const intent = role === 'user' ? await ai.detectIntentLocal(msg.body) : 'REPLY';
    const hasImage = msg.hasMedia && msg.type === 'image';

    // Save to conversation history
    ConversationQueries.add(number, role, msg.body, intent, hasImage);
    messageCount++;
  }

  return { newCustomer: true, existed: false, messages: messageCount };
}

/**
 * Detect conversation stage from chat context
 * @param {Object} chat - WhatsApp chat
 * @returns {string} - Detected stage
 */
async function detectStageFromChat(chat) {
  try {
    const messages = await chat.fetchMessages({ limit: 20 });

    // Get last few messages for context
    const recentMessages = messages.slice(-10);
    const allText = recentMessages.map(m => m.body?.toLowerCase() || '').join(' ');

    // Check for payment confirmations
    const hasPaymentSent = recentMessages.some(m =>
      !m.fromMe &&
      (m.body?.includes('screenshot') ||
       m.body?.includes('payment') ||
       m.body?.includes('send kar') ||
       m.body?.includes('kar diya'))
    );

    // Check for delivery
    const hasDelivery = recentMessages.some(m =>
      m.fromMe &&
      (m.body?.includes('promo code') ||
       m.body?.includes('activation') ||
       m.body?.includes('payment verified'))
    );

    // Check for interest
    const hasInterest = recentMessages.some(m =>
      !m.fromMe &&
      (m.body?.includes('plan') ||
       m.body?.includes('lena') ||
       m.body?.includes('price') ||
       m.body?.includes('kitna'))
    );

    // Check for support queries
    const hasSupport = recentMessages.some(m =>
      !m.fromMe &&
      (m.body?.includes('problem') ||
       m.body?.includes('not working') ||
       m.body?.includes('issue') ||
       m.body?.includes('help'))
    );

    // Determine stage based on message patterns
    if (hasDelivery) return 'DELIVERED';
    if (hasPaymentSent) return 'PAYMENT_SENT';
    if (hasSupport) return 'SUPPORT';
    if (hasInterest) return 'INTERESTED';
    if (recentMessages.some(m => m.fromMe)) return 'REPLIED';

    return 'NEW';

  } catch (err) {
    logger.error('Stage detection error', { error: err.message });
    return 'NEW';
  }
}

/**
 * Check if a contact should be recovered (churned customer)
 * @param {string} number - Customer number
 * @param {Array} messages - Recent messages
 * @returns {boolean}
 */
function shouldRecover(number, messages) {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return false;

  const daysSinceLastMessage = (Date.now() - lastMessage.timestamp * 1000) / (1000 * 60 * 60 * 24);

  // If last message was from user and > 7 days ago, mark for recovery
  if (!lastMessage.fromMe && daysSinceLastMessage > 7) {
    return true;
  }

  return false;
}

/**
 * Get summary of synced data for analytics
 * @returns {Object}
 */
function getSyncSummary() {
  const db = require('../database/connection').getConnection();

  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const totalConversations = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
  const stageBreakdown = db.prepare(`
    SELECT stage, COUNT(*) as count FROM customers GROUP BY stage
  `).all();

  return {
    totalCustomers: totalCustomers.count,
    totalConversations: totalConversations.count,
    stageBreakdown
  };
}

module.exports = {
  syncExistingChats,
  getSyncSummary
};

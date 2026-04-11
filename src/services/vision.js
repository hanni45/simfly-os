/"
 * Vision Service - Gemini Integration for Payment Screenshots
 * Memory-optimized with key rotation
 */

const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');

// Load Gemini API keys from environment
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
].filter(Boolean);

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

// Key rotation tracking
let currentKeyIndex = 0;
let keyFailures = new Map();

/**
 * Get next available API key
 */
function getNextKey() {
  if (GEMINI_KEYS.length === 0) return null;

  // Try each key once
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const idx = (currentKeyIndex + i) % GEMINI_KEYS.length;
    const failures = keyFailures.get(idx) || 0;

    if (failures < 3) {
      currentKeyIndex = (idx + 1) % GEMINI_KEYS.length;
      return GEMINI_KEYS[idx];
    }
  }

  // Reset all if all failed
  keyFailures.clear();
  currentKeyIndex = 0;
  return GEMINI_KEYS[0];
}

/**
 * Record key failure
 */
function recordKeyFailure() {
  const idx = (currentKeyIndex - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length;
  keyFailures.set(idx, (keyFailures.get(idx) || 0) + 1);
}

/**
 * Optimize image for API (resize, compress)
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>}
 */
async function optimizeImage(imageBuffer) {
  try {
    return await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch (err) {
    // Return original if processing fails
    return imageBuffer;
  }
}

/**
 * Calculate image hash for duplicate detection
 * @param {Buffer} imageBuffer
 * @returns {string}
 */
function calculateHash(imageBuffer) {
  return crypto.createHash('md5').update(imageBuffer).digest('hex');
}

/**
 * Analyze payment screenshot
 * @param {Buffer} imageBuffer - Raw image data
 * @param {number} expectedAmount - Expected payment amount
 * @returns {Promise<Object>}
 */
async function analyzeScreenshot(imageBuffer, expectedAmount = null) {
  if (GEMINI_KEYS.length === 0) {
    return {
      isPaymentScreenshot: false,
      error: 'VISION_NOT_CONFIGURED',
      confidence: 0
    };
  }

  try {
    // Optimize image first (reduce memory)
    const optimizedBuffer = await optimizeImage(imageBuffer);
    const imageHash = calculateHash(optimizedBuffer);

    // Convert to base64
    const base64Image = optimizedBuffer.toString('base64');

    const prompt = `Analyze this payment screenshot carefully.

Extract the following information:
1. Is this a valid JazzCash, EasyPaisa, or SadaPay payment receipt?
2. What is the exact amount paid?
3. What is the recipient account number shown?
4. What is the transaction status? (Successful/Failed/Pending)
5. What is the transaction timestamp?

Reply ONLY in JSON format:
{
  "is_payment_screenshot": true/false,
  "app": "JazzCash/EasyPaisa/SadaPay/Unknown",
  "amount": number or null,
  "recipient_number": "string or null",
  "status": "Successful/Failed/Pending/Unknown",
  "timestamp": "string or null",
  "suspicious": true/false,
  "confidence": 0.0 to 1.0
}`;

    const apiKey = getNextKey();
    if (!apiKey) {
      throw new Error('No Gemini API keys available');
    }

    const response = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      {
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );

    // Parse response
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      isPaymentScreenshot: result.is_payment_screenshot === true,
      app: result.app || 'Unknown',
      amount: result.amount ? parseInt(result.amount) : null,
      recipientNumber: result.recipient_number || null,
      status: result.status || 'Unknown',
      timestamp: result.timestamp || null,
      suspicious: result.suspicious === true,
      confidence: result.confidence || 0.5,
      hash: imageHash
    };

  } catch (error) {
    recordKeyFailure();
    console.error('Vision analysis error:', error.message);

    return {
      isPaymentScreenshot: false,
      error: 'ANALYSIS_FAILED',
      confidence: 0
    };
  }
}

/**
 * Verify payment against expected values
 * @param {Object} analysis - Vision analysis result
 * @param {number} expectedAmount
 * @param {string} expectedRecipient
 * @returns {Object}
 */
function verifyPayment(analysis, expectedAmount, expectedRecipient) {
  if (!analysis.isPaymentScreenshot) {
    return {
      valid: false,
      reason: 'NOT_PAYMENT_SCREENSHOT',
      message: 'Bhai clear screenshot bhejo — crop karke try karo'
    };
  }

  if (analysis.status !== 'Successful') {
    return {
      valid: false,
      reason: 'PAYMENT_FAILED',
      message: 'Bhai transaction successful nahi — retry karo aur successful screenshot bhejo'
    };
  }

  if (expectedAmount && analysis.amount && analysis.amount !== expectedAmount) {
    if (analysis.amount < expectedAmount) {
      return {
        valid: false,
        reason: 'AMOUNT_MISMATCH',
        message: `Bhai amount kam hai — Rs ${expectedAmount} chahiye, Rs ${analysis.amount} aaya`
      };
    }
    // Overpayment is fine
  }

  if (expectedRecipient && analysis.recipientNumber) {
    // Normalize numbers for comparison
    const normalizedExpected = expectedRecipient.replace(/\D/g, '');
    const normalizedReceived = analysis.recipientNumber.replace(/\D/g, '');

    if (!normalizedReceived.includes(normalizedExpected) &&
        !normalizedExpected.includes(normalizedReceived)) {
      return {
        valid: false,
        reason: 'WRONG_RECIPIENT',
        message: `Bhai galat account pe gayi — humara number ${expectedRecipient} hai`
      };
    }
  }

  if (analysis.suspicious) {
    return {
      valid: false,
      reason: 'SUSPICIOUS',
      message: 'Bhai screenshot check ho raha hai — fresh screenshot bhejo'
    };
  }

  return {
    valid: true,
    reason: null,
    message: 'Payment verified successfully'
  };
}

module.exports = {
  analyzeScreenshot,
  verifyPayment,
  calculateHash,
  isEnabled: () => GEMINI_KEYS.length > 0
};

# 🚀 SimFly OS v4.0

**Master Production Build — July 2026**

> WhatsApp Sales & Support Bot for SimFly Pakistan — eSIM Provider
> 
> *Fly Free, Stay Connected*

---

## 🧠 Core Identity

SimFly OS is a smart, calm, and human-like WhatsApp assistant for SimFly Pakistan.

**Language:** Natural Hinglish (Roman Urdu + English)  
**Tone:** Professional Pakistani sales representative

---

## 📦 Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat Engine** | Groq AI (llama-3.3-70b) — Primary model |
| 📸 **Image Analysis** | Gemini AI with 10-key rotation |
| 🔥 **Firebase Integration** | Real-time database & stock management |
| 💳 **Payment Verification** | Auto-detect & verify payment screenshots |
| 📱 **WhatsApp Web** | Full WhatsApp Web.js integration |
| 🎯 **Smart Responses** | Intent detection & contextual replies |
| 🛒 **Order Management** | Complete order lifecycle tracking |
| 📊 **Admin Dashboard** | Real-time stats, QR system & controls |

---

## 📋 Plans (Strict — Only These)

| Plan | Data | Price | Validity | Delivery |
|------|------|-------|----------|----------|
| 📦 **STARTER** | 500MB | Rs 130 | 2 YEARS | 🤖 Auto |
| 📦 **STANDARD** | 1GB | Rs 350 | 2 YEARS | 🤖 Auto |
| 📦 **PRO** | 5GB | Rs 1,250 | 2 YEARS | 👤 Manual |

---

## 🏢 Business Information

- **Name:** SimFly Pakistan
- **Tagline:** Fly Free, Stay Connected
- **WhatsApp:** +1 7826662232
- **Email:** simflypakistan@gmail.com
- **Website:** [simfly.lovable.app](https://simfly.lovable.app)
- **Compatibility:** [simfly.lovable.app/compatible-devices](https://simfly.lovable.app/compatible-devices)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/hananabdull746/simfly-os.git
cd simfly-os

# Install dependencies
npm install

# Configure environment (see below)
# Edit config.js or set environment variables

# Start the bot
npm start
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these in your hosting platform:

```bash
# 🤖 Groq AI (Primary Chat Model)
# Get API key from: https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here

# 🔑 Gemini AI (10 keys for image analysis rotation)
# Get API keys from: https://makersuite.google.com
GEMINI_API_KEY_1=your_gemini_key_1
GEMINI_API_KEY_2=your_gemini_key_2
GEMINI_API_KEY_3=your_gemini_key_3
GEMINI_API_KEY_4=your_gemini_key_4
GEMINI_API_KEY_5=your_gemini_key_5
GEMINI_API_KEY_6=your_gemini_key_6
GEMINI_API_KEY_7=your_gemini_key_7
GEMINI_API_KEY_8=your_gemini_key_8
GEMINI_API_KEY_9=your_gemini_key_9
GEMINI_API_KEY_10=your_gemini_key_10

# 👤 Admin WhatsApp Number (with country code)
ADMIN_NUMBER=923001234567

# 🔥 Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# 🌐 Application URL (for web dashboard)
APP_URL=https://your-app.railway.app
```

---

## 📱 Device Compatibility

### ✅ Supported Devices

- iPhone XS and above (XS, XR, 11, 12, 13, 14, 15, 16)
- Samsung S20+
- Pixel 3+
- Fold/Flip devices

### ❌ Not Supported

- PTA-approved phones
- Budget Android devices
- iPhone X or below

---

## 💰 Payment Methods

| Method | Number | Account Name |
|--------|--------|--------------|
| JazzCash | 03456754090 | SimFly Pakistan |
| EasyPaisa | 03466544374 | SimFly Pakistan |
| SadaPay | 03116400376 | SimFly Pakistan |

---

## 🤖 Admin Commands

### Order Management
```
/confirm [number] [plan]    - Confirm an order
/orders                      - List all orders
/stock                       - Check current stock
```

### Stock Management
```
/stock 500mb 50             - Update 500MB stock
/stock 1gb 50               - Update 1GB stock
/stock 5gb 50               - Update 5GB stock
```

### Bot Control
```
/pause                       - Pause bot responses
/resume                      - Resume bot responses
/stop                        - Stop bot completely
/status                      - Check bot status
```

---

## 🗄️ Firebase Collections

```javascript
stock: {
  "500mb": number,
  "1gb": number,
  "5gb": number
}

orders: {
  number: string,
  plan: string,
  amount: number,
  status: string,
  timestamp: number
}

customers: {
  number: string,
  lastPlan: string,
  totalOrders: number
}

bot_status: {
  active: boolean,
  paused: boolean
}
```

---

## 🌐 Railway Frontend (QR System)

The bot includes a web dashboard hosted on Railway:

- **QR Code:** Scan to connect WhatsApp
- **Status:** Real-time bot status
- **Auto Refresh:** Every 3-5 seconds

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard with QR code |
| `/health` | GET | Health check |
| `/api/status` | GET | Full system status |
| `/api/orders` | GET | List all orders |
| `/api/send` | POST | Send message via API |

### Send Message Example

```bash
curl -X POST https://your-app.railway.app/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "number": "923001234567",
    "message": "Assalam-o-Alaikum! SimFly Pakistan here."
  }'
```

---

## 🎤 Voice Message System

When user sends voice message:

1. 🎯 **Gemini** transcribes the audio
2. 🧠 **Intent extraction** from transcription
3. 💬 **Groq** generates reply
4. 📱 Clean text reply sent to user

> Note: No mention of AI/transcription to user — natural human-like flow.

---

## 🔄 Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Deploy
railway up
```

### Render

1. Create Web Service
2. Connect GitHub repo
3. Set environment variables
4. Build: `npm install`
5. Start: `npm start`

### Local Development

```bash
npm install
npm start
```

---

## 🧠 AI System Architecture

```
┌─────────────────────────────────────────────┐
│           SimFly OS v4.0                     │
├─────────────────────────────────────────────┤
│  Chat Engine: Groq (llama-3.3-70b)          │
│  Media Processing: Gemini (10-key rotation) │
│  Database: Firebase Realtime                │
│  WhatsApp: whatsapp-web.js                  │
└─────────────────────────────────────────────┘
```

---

## 🎯 Response Intelligence

**Before replying, the bot:**
- Understands user intent
- Analyzes previous context
- Replies ONLY what is needed

**Rules:**
- ✅ Short but complete replies
- ✅ Answer exactly what was asked
- ✅ Ask follow-up only if needed
- ❌ No long paragraphs
- ❌ No multiple messages
- ❌ No info dumps

---

## 📊 Stock System

- ✅ Stock deducted on payment confirmation
- ⛔ Order blocked if stock = 0
- 🔔 Admin alerted if stock < 3

---

## 💸 Refund Rules

### ✅ Allowed
- eSIM not activated
- Wrong delivery
- System issue

### ❌ Not Allowed
- Already used
- Wrong device
- Data finished

---

## 🔐 Security Rules

**Never reveal:**
- Supplier information
- Backend details
- API endpoints
- Admin number
- AI system details

---

## 🧪 Testing Mode

Set in `config.js`:
```javascript
TEST_BOARD: {
  enabled: true,
  whitelist: ['923001234567', '923001234568']
}
```

---

## 📈 Follow-Up System

After 24 hours:
```
Aapka eSIM theek chal raha hai? 😊
```

---

## 🆘 Support

For issues or questions:
- Email: simflypakistan@gmail.com
- WhatsApp: +1 7826662232

---

## 📜 License

MIT License — See [LICENSE](LICENSE) file

---

## 🙏 Credits

**Built for SimFly Pakistan**  
Version 4.0 (Final Production Build — July 2026)

---

<div align="center">
  <h3>SimFly Pakistan</h3>
  <p><em>Fly Free, Stay Connected 🇵🇰</em></p>
</div>

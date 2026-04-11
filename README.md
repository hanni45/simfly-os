# SimFly OS v5.0

## WhatsApp Sales & Support Bot - Firebase + Web Dashboard

SimFly OS is a professional WhatsApp bot for SimFly Pakistan, an eSIM data provider. Built with **Firebase Realtime Database**, memory optimization, clean architecture, and full v5.0 specification compliance.

---

## Features

### Core Features
- **WhatsApp Integration** - Full whatsapp-web.js implementation
- **AI-Powered Conversations** - Groq AI for natural Hinglish responses
- **Vision Analysis** - Gemini AI for payment screenshot verification
- **Firebase Realtime DB** - Cloud database with real-time sync
- **Web Dashboard** - QR code display and status monitoring on Railway
- **Complete Sales Flow** - From greeting to delivery
- **Admin Commands** - Full control system via WhatsApp
- **Follow-up Automation** - Scheduled reminders
- **Stock Management** - Real-time inventory tracking
- **Analytics** - Daily/weekly/monthly reports
- **Startup Sync** - Automatically imports existing WhatsApp chat history

### Memory Optimizations
- Firebase Realtime Database (cloud-based)
- Batched processing for large datasets
- Automatic conversation history trimming
- Garbage collection triggers
- Stream-based image processing
- Puppeteer memory optimization flags

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Initialize Database

```bash
npm run db:init
```

### 4. Start Bot

```bash
npm start
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq AI API key (console.groq.com) |
| `GEMINI_API_KEY_1` | Yes | Gemini API key (makersuite.google.com) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase service account private key |
| `FIREBASE_DATABASE_URL` | Yes | Firebase Realtime Database URL |
| `ADMIN_NUMBER` | Yes | Admin WhatsApp number (e.g., 923001234567) |
| `BOT_MODE` | No | public/test/maintenance (default: public) |

---

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable Realtime Database
4. Go to **Project Settings** > **Service Accounts**
5. Click **Generate New Private Key**
6. Copy the JSON values to your `.env` file:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (replace newlines with `\n`)

---

## Project Structure

```
simfly-os/
├── src/
│   ├── index.js              # Main entry point
│   ├── database/
│   │   ├── connection.js     # Firebase connection
│   │   └── queries.js        # All database queries (async)
│   ├── handlers/
│   │   ├── messageHandler.js # Main message router
│   │   ├── salesFlow.js      # Sales funnel logic
│   │   └── adminCommands.js  # Admin control commands
│   ├── services/
│   │   ├── ai.js             # Groq AI integration
│   │   ├── vision.js         # Gemini vision analysis
│   │   ├── scheduler.js      # Follow-up automation
│   │   ├── startupSync.js    # Chat history sync
│   │   └── webServer.js      # Web dashboard for Railway
│   └── utils/
│       └── logger.js         # Memory-optimized logging
├── scripts/
│   ├── init-db.js            # Database initialization
│   └── stats.js              # Statistics viewer
├── data/                     # Session storage
├── logs/                     # Log files
├── .env                      # Environment variables
└── package.json
```

---

## Web Dashboard

When deployed on Railway:
- **Main URL** - Web dashboard with QR code display
- `/health` - Health check endpoint
- `/api/status` - Bot status API

The QR code automatically appears on the web dashboard when the bot needs authentication.

---

## Commands

### Admin Commands (WhatsApp)

| Command | Description |
|---------|-------------|
| `/orders [status]` | List orders |
| `/confirm [id] [code]` | Confirm order |
| `/stock` | View stock levels |
| `/stock [plan] [qty]` | Update stock |
| `/customer [number]` | View customer profile |
| `/ban [number]` | Ban customer |
| `/stats [today/week/month]` | View statistics |
| `/pause` | Pause bot |
| `/resume` | Resume bot |
| `/help` | Show all commands |

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the bot with web server |
| `npm run db:init` | Initialize database structure |
| `npm run stats` | View statistics |

---

## Plans

| Plan | Data | Price | Validity | Delivery |
|------|------|-------|----------|----------|
| STARTER | 500MB | Rs 130 | 2 Years | Auto (instant) |
| STANDARD | 1GB | Rs 350 | 2 Years | Auto (instant) |
| PRO | 5GB | Rs 1,250 | 2 Years | Manual (few mins) |

---

## Payment Methods

- **JazzCash**: 03456754090
- **EasyPaisa**: 03466544374
- **SadaPay**: 03116400376

---

## Deployment

### Railway (Recommended)

1. Push code to GitHub
2. Create new project on [Railway](https://railway.app)
3. Deploy from GitHub repo
4. Add environment variables in Railway dashboard
5. The web dashboard will be available at the generated URL

### PM2

```bash
npm install -g pm2
npm run pm2:start
```

---

## License

MIT - SimFly Pakistan

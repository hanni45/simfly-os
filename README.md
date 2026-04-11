# SimFly OS v5.0

## WhatsApp Sales & Support Bot - Memory Optimized Production Build

SimFly OS is a professional WhatsApp bot for SimFly Pakistan, an eSIM data provider. Built with memory optimization, clean architecture, and full v5.0 specification compliance.

---

## Features

### Core Features
- **WhatsApp Integration** - Full whatsapp-web.js implementation
- **AI-Powered Conversations** - Groq AI for natural Hinglish responses
- **Vision Analysis** - Gemini AI for payment screenshot verification
- **Complete Sales Flow** - From greeting to delivery
- **Admin Commands** - Full control system
- **Follow-up Automation** - Scheduled reminders
- **Stock Management** - Real-time inventory tracking
- **Analytics** - Daily/weekly/monthly reports
- **Startup Sync** - Automatically imports existing WhatsApp chat history

### Memory Optimizations
- SQLite with WAL mode for concurrency
- Connection pooling
- Batched processing for large datasets
- Automatic conversation history trimming
- Garbage collection triggers
- Stream-based image processing
- Lazy loading of modules

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
| `GROQ_API_KEY` | Yes | Groq AI API key |
| `GEMINI_API_KEY_1` | Yes | Gemini API key for vision |
| `ADMIN_NUMBER` | Yes | Admin WhatsApp number |
| `DB_PATH` | No | Database file path (default: ./data/simfly.db) |
| `BOT_MODE` | No | public/test/maintenance (default: public) |

---

## Project Structure

```
simfly-os/
├── src/
│   ├── index.js              # Main entry point
│   ├── database/
│   │   ├── connection.js     # SQLite connection
│   │   └── queries.js        # All database queries
│   ├── handlers/
│   │   ├── messageHandler.js # Main message router
│   │   ├── salesFlow.js      # Sales funnel logic
│   │   └── adminCommands.js  # Admin control commands
│   ├── services/
│   │   ├── ai.js             # Groq AI integration
│   │   ├── vision.js         # Gemini vision analysis
│   │   ├── scheduler.js      # Follow-up automation
│   │   └── startupSync.js    # Chat history sync
│   └── utils/
│       └── logger.js         # Memory-optimized logging
├── scripts/
│   ├── init-db.js            # Database initialization
│   └── stats.js              # Statistics viewer
├── data/                     # Database files
├── logs/                     # Log files
├── .env                      # Environment variables
└── package.json
```

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
| `npm start` | Start the bot |
| `npm run db:init` | Initialize database |
| `npm run stats` | View statistics |
| `npm run backup` | Create backup |

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

### PM2 (Recommended)

```bash
npm install -g pm2
npm run pm2:start
```

### Docker

```bash
docker build -t simfly-os .
docker run -d --env-file .env simfly-os
```

---

## License

MIT - SimFly Pakistan

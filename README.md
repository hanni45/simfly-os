# SimFly OS v1.0.0

Production-Ready WhatsApp Sales Bot with AI Integration for SimFly Pakistan (eSIM Provider).

## Features

- WhatsApp Business Automation via `whatsapp-web.js`
- AI Sales Assistant powered by Gemini 1.5 Flash
- Multimodal Support (Text, Images, Voice)
- Secure In-Memory Dashboard
- Optimized for Render Free Tier (512MB RAM)

## Deploy to Render

### Step 1: Create Render Account
1. Go to [render.com](https://render.com) and sign up
2. Create a new **Web Service**
3. Connect your GitHub repo or use "Deploy from Git URL"

### Step 2: Set Environment Variables
Add these in Render Dashboard > Service > Environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google Gemini API Key | `AIza...` |
| `ADMIN_NUMBER` | Your WhatsApp number with country code | `923123456789` |
| `RENDER_URL` | Your Render service URL | `https://simfly-os.onrender.com` |

### Step 3: Deploy
Render will automatically build and deploy. Check logs for QR code.

### Step 4: Scan QR Code
1. Open Render Logs
2. Scan the QR code with your WhatsApp (Linked Devices)
3. Bot is now live!

## Local Development

```bash
# Clone and setup
git clone <repo>
cd simfly-os
cp .env.example .env
# Edit .env with your values

# Install dependencies
npm install

# Run locally
npm start
```

## Dashboard Access

After the bot is ready, you'll receive:
- WhatsApp notification with token
- Dashboard URL: `https://your-url.onrender.com/dashboard/[TOKEN]`

## Business Logic

### Pricing Tiers
- **STARTER**: 500MB @ Rs. 130 (2 Years)
- **POPULAR**: 1GB @ Rs. 400 (2 Years)
- **MEGA**: 5GB @ Rs. 1500 (4 Devices)

### Payment Methods
- **Easypaisa**: 03466544374 (Shafqat)
- **JazzCash**: 03456754090 (Shafqat)
- **SadaPay**: 03116400376 (Abdullah Saahi)

## Important Notes

1. **Session**: Render free tier has no persistent disk. Session resets on restart (QR required each restart).
2. **Memory**: Strict 200MB heap limit enforced.
3. **Groups**: Group messages are ignored to save RAM.

## License

MIT - SimFly Pakistan

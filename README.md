# Email Scheduling Assistant

An AI-powered email assistant that watches your inbox and drafts
scheduling replies in your Drafts folder for you to review and send.

## How It Works

1. Nylas forwards each new incoming message to this server's webhook.
2. The classifier filters out emails from you and obvious automated
   senders, then asks an LLM whether the email needs a scheduling reply.
3. For matching messages it reads the full thread, checks your calendar
   for availability, and drafts a first-person reply with 2-3 proposed
   times.
4. The draft lands in your Gmail Drafts folder — you review, edit, send.
5. Default is drafts-only. Set `REPLY_MODE=send` to deliver immediately.

## Setup

### 1. Nylas Account (Email)

Nylas provides a unified API for email across Gmail, Outlook, etc.

1. Sign up at [nylas.com](https://www.nylas.com/)
2. Create an application
3. Connect your email account (or create a dedicated assistant email)
4. Get your API key and Grant ID from the dashboard
5. Set up a webhook pointing to `https://your-server.com/webhook`
   - Subscribe to `message.created` events

### 2. Google Cloud (Calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:3000/oauth/callback` as redirect URI
6. Run the OAuth flow once to get a refresh token:

```bash
# Quick way to get refresh token - visit this URL:
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/callback&response_type=code&scope=https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent

# Exchange the code for tokens:
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=AUTH_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&redirect_uri=http://localhost:3000/oauth/callback&grant_type=authorization_code"
```

### 3. Anthropic API

Get your API key from [console.anthropic.com](https://console.anthropic.com)

### 4. Deploy

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Run in development
npm run dev

# Or build and run in production
npm run build
npm start
```

### 5. Expose Webhook (Development)

Use ngrok or similar to expose your local server:

```bash
ngrok http 3000
```

Then update your Nylas webhook URL to the ngrok URL.

## Usage

Once the webhook is wired up, the assistant runs automatically on every
incoming email. No special action — no need to CC anything. When a
scheduling email arrives, the corresponding draft appears in your
Drafts folder.

## Configuration

| Variable | Description |
|----------|-------------|
| `USER_EMAIL` | Your email address (the inbox Nylas is connected to) |
| `USER_NAME` | Your name (used in the drafted reply) |
| `USER_TIMEZONE` | Your timezone (e.g., `America/New_York`) |
| `REPLY_MODE` | `draft` (default) saves to Drafts; `send` delivers immediately |
| `NYLAS_API_KEY` | Nylas API key |
| `NYLAS_GRANT_ID` | Nylas grant ID for your mailbox |
| `NYLAS_WEBHOOK_SECRET` | Optional, enables webhook signature verification |

## Deployment Options

- **Vercel**: Add `vercel.json`, works great for serverless
- **Railway**: One-click deploy, handles everything
- **Render**: Free tier available
- **AWS Lambda**: Use with API Gateway for webhook

## Limitations

- Currently only proposes times, doesn't automatically book
- Single calendar support (easily extendable)
- No natural language time parsing (relies on explicit dates)

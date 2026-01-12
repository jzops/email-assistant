# Email Scheduling Assistant

An AI-powered email assistant that coordinates meeting times when CC'd on emails.

## How It Works

1. CC `assistant@yourdomain.com` on an email thread about scheduling
2. The assistant reads the thread, understands what's being scheduled
3. Checks your calendar for availability
4. Replies with available time slots
5. Can create calendar events when times are confirmed

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

Simply CC your assistant email on any scheduling-related email:

```
To: client@example.com
CC: assistant@yourdomain.com
Subject: Let's schedule a call

Hi! I'd love to set up a 30-minute call to discuss the project.
What times work for you next week?
```

The assistant will reply with your available slots.

## Configuration

| Variable | Description |
|----------|-------------|
| `ASSISTANT_EMAIL` | The email address of your assistant |
| `USER_NAME` | Your name (used in replies) |
| `USER_TIMEZONE` | Your timezone (e.g., `America/New_York`) |

## Deployment Options

- **Vercel**: Add `vercel.json`, works great for serverless
- **Railway**: One-click deploy, handles everything
- **Render**: Free tier available
- **AWS Lambda**: Use with API Gateway for webhook

## Limitations

- Currently only proposes times, doesn't automatically book
- Single calendar support (easily extendable)
- No natural language time parsing (relies on explicit dates)

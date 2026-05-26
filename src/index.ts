import express from 'express';
import {
  parseWebhookPayload,
  getMessage,
  getThreadMessages,
  sendReply,
  createDraftReply,
  verifyWebhookSignature
} from './email';
import {
  parseSchedulingIntent,
  generateReply,
  shouldAssistantRespond
} from './ai';
import { findAvailableSlots, createCalendarEvent } from './calendar';
import { EmailMessage } from './types';

const app = express();

// Parse JSON body but also keep raw body for signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const PORT = process.env.PORT || 3000;
const ASSISTANT_EMAIL = process.env.ASSISTANT_EMAIL!;
const USER_NAME = process.env.USER_NAME || 'the executive';
const USER_TIMEZONE = process.env.USER_TIMEZONE || 'America/New_York';
const WEBHOOK_SECRET = process.env.NYLAS_WEBHOOK_SECRET;
// 'draft' (default) saves replies to the Drafts folder for review; 'send' delivers immediately.
const REPLY_MODE = (process.env.REPLY_MODE || 'draft').toLowerCase();

// Track processed messages to avoid duplicates
const processedMessages = new Set<string>();

async function handleIncomingEmail(email: EmailMessage): Promise<void> {
  // Avoid processing the same message twice
  if (processedMessages.has(email.id)) {
    console.log(`Skipping already processed message: ${email.id}`);
    return;
  }
  processedMessages.add(email.id);

  // Limit cache size
  if (processedMessages.size > 1000) {
    const firstItem = processedMessages.values().next().value;
    processedMessages.delete(firstItem);
  }

  console.log(`\n--- Processing email ${email.id} ---`);
  console.log(`From:    ${email.from}`);
  console.log(`To:      [${email.to.join(', ')}]`);
  console.log(`Cc:      [${email.cc.join(', ')}]`);
  console.log(`Subject: ${email.subject}`);

  const shouldRespond = await shouldAssistantRespond(email, ASSISTANT_EMAIL);
  if (!shouldRespond) {
    // shouldAssistantRespond logs the specific filter reason
    return;
  }

  console.log('[ok] passes filters; gathering thread context');

  const threadMessages = await getThreadMessages(email.threadId);
  const fullContext = threadMessages
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(m => `From: ${m.from}\n${m.body}`)
    .join('\n---\n');

  const contextEmail = { ...email, body: fullContext };

  const intent = await parseSchedulingIntent(contextEmail);
  console.log('[ok] parsed intent:', JSON.stringify(intent, null, 2));

  if (intent.type === 'unknown') {
    console.log(`[filter] skip ${email.id}: intent classifier returned 'unknown'`);
    return;
  }

  const duration = intent.duration || 30;
  const availableSlots = await findAvailableSlots(7, duration);
  console.log(`[ok] found ${availableSlots.length} available slots over the next 7 days`);

  const replyBody = await generateReply(
    email,
    intent,
    availableSlots,
    USER_TIMEZONE,
    USER_NAME
  );

  console.log('[ok] generated reply:', replyBody.substring(0, 200) + (replyBody.length > 200 ? '...' : ''));

  const delivered = REPLY_MODE === 'send'
    ? await sendReply(email, replyBody)
    : await createDraftReply(email, replyBody);

  if (delivered) {
    console.log(`[ok] ${REPLY_MODE === 'send' ? 'reply sent' : 'draft saved'} for thread ${email.threadId}`);
  } else {
    console.log(`[fail] could not ${REPLY_MODE === 'send' ? 'send reply' : 'create draft'} for thread ${email.threadId}`);
  }
}

// Webhook endpoint for Nylas
app.post('/webhook', async (req, res) => {
  // Verify webhook signature if secret is configured
  if (WEBHOOK_SECRET) {
    const signature = req.headers['x-nylas-signature'] as string;
    if (!signature || !verifyWebhookSignature(signature, (req as any).rawBody, WEBHOOK_SECRET)) {
      console.log('Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }
  }

  // Nylas sends a challenge on webhook registration
  if (req.query.challenge) {
    return res.send(req.query.challenge);
  }

  const payload = req.body;
  console.log('Webhook received:', payload.type);

  // Handle message.created events
  if (payload.type === 'message.created') {
    const email = parseWebhookPayload(payload);
    if (email) {
      // Process async to respond quickly to webhook
      handleIncomingEmail(email).catch(err => {
        console.error('Error processing email:', err);
      });
    }
  }

  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', assistant: ASSISTANT_EMAIL });
});

// Manual trigger for testing (fetch recent emails)
app.post('/check-emails', async (_req, res) => {
  try {
    // This would typically poll for recent emails
    // For now, just confirm the endpoint works
    res.json({ message: 'Email check triggered' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check emails' });
  }
});

// Endpoint to manually test with a specific message ID
app.post('/process/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const email = await getMessage(messageId);

    if (!email) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await handleIncomingEmail(email);
    res.json({ message: 'Processed', email: email.subject });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║       Email Scheduling Assistant              ║
╠═══════════════════════════════════════════════╣
║  Server running on port ${PORT}                  ║
║  Assistant email: ${ASSISTANT_EMAIL?.substring(0, 25) || 'Not configured'}
║  User timezone: ${USER_TIMEZONE}
║  Reply mode: ${REPLY_MODE} (set REPLY_MODE=send to deliver immediately)
╚═══════════════════════════════════════════════╝

Endpoints:
  POST /webhook     - Nylas webhook endpoint
  GET  /health      - Health check
  POST /process/:id - Manually process a message

Waiting for incoming emails...
  `);
});

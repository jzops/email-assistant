import Nylas from 'nylas';
import { EmailMessage } from './types';

// Initialize Nylas
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com'
});

const grantId = process.env.NYLAS_GRANT_ID!;

export function parseWebhookPayload(payload: any): EmailMessage | null {
  try {
    const data = payload.data?.object;
    if (!data) return null;

    // Extract email addresses from Nylas format
    const from = data.from?.[0]?.email || '';
    const to = (data.to || []).map((r: any) => r.email);
    const cc = (data.cc || []).map((r: any) => r.email);

    return {
      id: data.id,
      threadId: data.thread_id,
      from,
      to,
      cc,
      subject: data.subject || '',
      body: data.body || data.snippet || '',
      date: new Date(data.date * 1000)
    };
  } catch (error) {
    console.error('Error parsing webhook payload:', error);
    return null;
  }
}

export async function getMessage(messageId: string): Promise<EmailMessage | null> {
  try {
    const message = await nylas.messages.find({
      identifier: grantId,
      messageId
    });

    const data = message.data;
    const from = data.from?.[0]?.email || '';
    const to = (data.to || []).map((r: any) => r.email);
    const cc = (data.cc || []).map((r: any) => r.email);

    return {
      id: data.id,
      threadId: data.threadId,
      from,
      to,
      cc,
      subject: data.subject || '',
      body: data.body || data.snippet || '',
      date: new Date(data.date! * 1000)
    };
  } catch (error) {
    console.error('Error fetching message:', error);
    return null;
  }
}

export async function getThreadMessages(threadId: string): Promise<EmailMessage[]> {
  try {
    const response = await nylas.messages.list({
      identifier: grantId,
      queryParams: {
        threadId
      }
    });

    return response.data.map(data => ({
      id: data.id,
      threadId: data.threadId,
      from: data.from?.[0]?.email || '',
      to: (data.to || []).map((r: any) => r.email),
      cc: (data.cc || []).map((r: any) => r.email),
      subject: data.subject || '',
      body: data.body || data.snippet || '',
      date: new Date(data.date! * 1000)
    }));
  } catch (error) {
    console.error('Error fetching thread:', error);
    return [];
  }
}

function buildReplyEnvelope(originalMessage: EmailMessage, replyBody: string) {
  // The draft is sent from the user's own account, so strip the user out of
  // the carried-over recipient list to avoid Cc'ing themselves.
  const userEmail = process.env.USER_EMAIL!.toLowerCase();

  const toRecipients = [originalMessage.from];
  const ccRecipients = [
    ...originalMessage.to,
    ...originalMessage.cc
  ].filter(email =>
    email.toLowerCase() !== userEmail &&
    email.toLowerCase() !== originalMessage.from.toLowerCase()
  );

  return {
    subject: originalMessage.subject.startsWith('Re:')
      ? originalMessage.subject
      : `Re: ${originalMessage.subject}`,
    body: replyBody,
    to: toRecipients.map(email => ({ email })),
    cc: ccRecipients.map(email => ({ email })),
    replyToMessageId: originalMessage.id
  };
}

export async function sendReply(
  originalMessage: EmailMessage,
  replyBody: string
): Promise<boolean> {
  try {
    await nylas.messages.send({
      identifier: grantId,
      requestBody: buildReplyEnvelope(originalMessage, replyBody)
    });

    console.log(`Reply sent to thread ${originalMessage.threadId}`);
    return true;
  } catch (error) {
    console.error('Error sending reply:', error);
    return false;
  }
}

export async function createDraftReply(
  originalMessage: EmailMessage,
  replyBody: string
): Promise<boolean> {
  try {
    const draft = await nylas.drafts.create({
      identifier: grantId,
      requestBody: buildReplyEnvelope(originalMessage, replyBody)
    });

    console.log(`Draft created (id=${draft.data.id}) for thread ${originalMessage.threadId}`);
    return true;
  } catch (error) {
    console.error('Error creating draft:', error);
    return false;
  }
}

export function verifyWebhookSignature(
  signature: string,
  body: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');
  return signature === expectedSignature;
}

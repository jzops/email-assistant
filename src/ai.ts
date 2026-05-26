import Anthropic from '@anthropic-ai/sdk';
import { SchedulingIntent, EmailMessage, TimeSlot } from './types';

const anthropic = new Anthropic();

export async function parseSchedulingIntent(email: EmailMessage): Promise<SchedulingIntent> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze this email and extract scheduling intent. Return JSON only.

From: ${email.from}
To: ${email.to.join(', ')}
CC: ${email.cc.join(', ')}
Subject: ${email.subject}
Body:
${email.body}

Return a JSON object with:
- type: "schedule_meeting" | "reschedule" | "cancel" | "confirm" | "unknown"
- participants: array of email addresses involved
- proposedTimes: array of any mentioned times/dates (as ISO strings if specific, or descriptions)
- duration: meeting duration in minutes if mentioned
- subject: what the meeting is about
- constraints: any scheduling constraints mentioned
- timezone: timezone if mentioned

JSON only, no explanation:`
      }
    ]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Strip ```json ... ``` or ``` ... ``` fences the model sometimes adds.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('parseSchedulingIntent: failed to parse JSON from model. Raw text:', text);
    return { type: 'unknown', participants: [] };
  }
}

export async function generateReply(
  email: EmailMessage,
  intent: SchedulingIntent,
  availableSlots: TimeSlot[],
  userTimezone: string,
  userName: string
): Promise<string> {
  const slotsDescription = availableSlots.length > 0
    ? availableSlots.map(slot =>
        `- ${slot.start.toLocaleString('en-US', { timeZone: userTimezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      ).join('\n')
    : 'No available slots found in the requested timeframe.';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an executive assistant for ${userName}. Write a professional, warm email reply to coordinate scheduling.

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Scheduling intent detected: ${intent.type}
${intent.subject ? `Meeting topic: ${intent.subject}` : ''}

${userName}'s available times:
${slotsDescription}

Guidelines:
- Be concise and professional
- If proposing times, offer 2-3 options
- Include timezone (${userTimezone})
- Sign as "${userName}'s assistant"
- Don't use overly formal language
- If no slots available, suggest they propose alternative times

Write ONLY the email body (no subject line):`
      }
    ]
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function shouldAssistantRespond(email: EmailMessage, assistantEmail: string): Promise<boolean> {
  const assistant = assistantEmail.toLowerCase();

  // Don't respond to emails from ourselves
  if (email.from.toLowerCase().includes(assistant)) {
    console.log(`[filter] skip ${email.id}: from is the assistant (${email.from})`);
    return false;
  }

  // Assistant must be a recipient — accept either To: or Cc:.
  const isRecipient =
    email.to.some(addr => addr.toLowerCase().includes(assistant)) ||
    email.cc.some(addr => addr.toLowerCase().includes(assistant));
  if (!isRecipient) {
    console.log(
      `[filter] skip ${email.id}: assistant ${assistant} not in To: [${email.to.join(', ')}] or Cc: [${email.cc.join(', ')}]`
    );
    return false;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `Is this email requesting help with scheduling/coordinating a meeting time? Reply YES or NO only.

Subject: ${email.subject}
Body: ${email.body}

Answer:`
      }
    ]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const isScheduling = text.trim().toUpperCase().startsWith('YES');
  if (!isScheduling) {
    console.log(`[filter] skip ${email.id}: classifier said this isn't a scheduling request (got: "${text.trim()}")`);
  }
  return isScheduling;
}

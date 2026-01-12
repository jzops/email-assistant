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

  try {
    return JSON.parse(text.trim());
  } catch {
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
  // Don't respond to emails from ourselves
  if (email.from.toLowerCase().includes(assistantEmail.toLowerCase())) {
    return false;
  }

  // Must be CC'd (not direct to)
  const isCCd = email.cc.some(cc => cc.toLowerCase().includes(assistantEmail.toLowerCase()));
  if (!isCCd) {
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
  return text.trim().toUpperCase().startsWith('YES');
}

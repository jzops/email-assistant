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
        content: `Draft a reply that ${userName} can review and send. Write in first person as ${userName}.

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Scheduling intent detected: ${intent.type}
${intent.subject ? `Meeting topic: ${intent.subject}` : ''}

Available times:
${slotsDescription}

Guidelines:
- Concise, warm, professional — match how a busy operator writes.
- If proposing times, offer 2-3 options and include the timezone (${userTimezone}).
- If no slots available, ask them to propose alternative times.
- Do NOT add a signature or sign-off — ${userName} will append their own.

Write ONLY the email body (no subject line):`
      }
    ]
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// Senders that are almost always automated/transactional. Skipped before
// calling the LLM to keep classifier cost low.
const AUTOMATED_SENDER_PATTERNS = [
  /(^|[<\s])no[-_.]?reply@/i,
  /(^|[<\s])do[-_.]?not[-_.]?reply@/i,
  /notifications?@/i,
  /notify@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /bounces?@/i,
  /@.*\.mail\.notion\.so/i,
  /@notifications\./i,
  /@mail\.smbdealhunter\./i,
  /@notifications\.vasco\./i,
  /fred@fireflies\.ai/i,
  /gemini-notes@google\.com/i,
  /notifications@mixmax\.com/i,
  /notifications@ashbyhq\.com/i
];

function looksAutomated(fromAddress: string): boolean {
  return AUTOMATED_SENDER_PATTERNS.some(re => re.test(fromAddress));
}

export async function shouldDraftReply(email: EmailMessage, userEmail: string): Promise<boolean> {
  const me = userEmail.toLowerCase();

  if (email.from.toLowerCase().includes(me)) {
    console.log(`[filter] skip ${email.id}: from is the user (${email.from})`);
    return false;
  }

  if (looksAutomated(email.from)) {
    console.log(`[filter] skip ${email.id}: from looks automated (${email.from})`);
    return false;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `Is this email a scheduling or meeting-coordination request that needs a reply proposing or confirming a time? Reply YES or NO only.

Subject: ${email.subject}
Body: ${email.body}

Answer:`
      }
    ]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const isScheduling = text.trim().toUpperCase().startsWith('YES');
  if (!isScheduling) {
    console.log(`[filter] skip ${email.id}: classifier said not a scheduling request (got: "${text.trim()}")`);
  }
  return isScheduling;
}

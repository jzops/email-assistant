export interface SchedulingIntent {
  type: 'schedule_meeting' | 'reschedule' | 'cancel' | 'confirm' | 'unknown';
  participants: string[];
  proposedTimes?: string[];
  duration?: number; // minutes
  subject?: string;
  constraints?: string;
  timezone?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface AvailabilityResult {
  available: boolean;
  conflicts?: string[];
  suggestedSlots?: TimeSlot[];
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  date: Date;
}

export interface AssistantResponse {
  shouldReply: boolean;
  replyBody?: string;
  calendarAction?: {
    type: 'create_event' | 'create_hold' | 'none';
    event?: {
      title: string;
      start: Date;
      end: Date;
      attendees: string[];
    };
  };
}

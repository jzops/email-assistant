import { google } from 'googleapis';
import { addDays, setHours, setMinutes, isWeekend, addMinutes } from 'date-fns';
import { TimeSlot } from './types';

const calendar = google.calendar('v3');

// OAuth2 client - credentials loaded from environment
function getAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return auth;
}

export async function getFreeBusySlots(
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary'
): Promise<{ busy: TimeSlot[] }> {
  const auth = getAuthClient();

  const response = await calendar.freebusy.query({
    auth,
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: calendarId }]
    }
  });

  const busySlots = response.data.calendars?.[calendarId]?.busy || [];

  return {
    busy: busySlots.map(slot => ({
      start: new Date(slot.start!),
      end: new Date(slot.end!)
    }))
  };
}

export async function findAvailableSlots(
  daysAhead: number = 5,
  meetingDuration: number = 30, // minutes
  workingHoursStart: number = 9, // 9 AM
  workingHoursEnd: number = 17, // 5 PM
  calendarId: string = 'primary'
): Promise<TimeSlot[]> {
  const now = new Date();
  const startDate = now;
  const endDate = addDays(now, daysAhead);

  const { busy } = await getFreeBusySlots(startDate, endDate, calendarId);
  const availableSlots: TimeSlot[] = [];

  // Generate potential slots for each working day
  for (let day = 0; day < daysAhead; day++) {
    const currentDay = addDays(now, day);

    // Skip weekends
    if (isWeekend(currentDay)) continue;

    // Generate slots every 30 minutes during working hours
    for (let hour = workingHoursStart; hour < workingHoursEnd; hour++) {
      for (const minute of [0, 30]) {
        const slotStart = setMinutes(setHours(currentDay, hour), minute);
        const slotEnd = addMinutes(slotStart, meetingDuration);

        // Skip if slot end is after working hours
        if (slotEnd.getHours() > workingHoursEnd ||
            (slotEnd.getHours() === workingHoursEnd && slotEnd.getMinutes() > 0)) {
          continue;
        }

        // Skip if slot is in the past
        if (slotStart < now) continue;

        // Check if slot conflicts with any busy period
        const hasConflict = busy.some(busySlot =>
          (slotStart >= busySlot.start && slotStart < busySlot.end) ||
          (slotEnd > busySlot.start && slotEnd <= busySlot.end) ||
          (slotStart <= busySlot.start && slotEnd >= busySlot.end)
        );

        if (!hasConflict) {
          availableSlots.push({ start: slotStart, end: slotEnd });
        }
      }
    }
  }

  // Return first 5 available slots
  return availableSlots.slice(0, 5);
}

export async function createCalendarEvent(
  title: string,
  start: Date,
  end: Date,
  attendees: string[],
  description?: string,
  calendarId: string = 'primary'
): Promise<string> {
  const auth = getAuthClient();

  const response = await calendar.events.insert({
    auth,
    calendarId,
    requestBody: {
      summary: title,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: process.env.USER_TIMEZONE || 'America/New_York'
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: process.env.USER_TIMEZONE || 'America/New_York'
      },
      attendees: attendees.map(email => ({ email })),
      reminders: {
        useDefault: true
      }
    },
    sendUpdates: 'all'
  });

  return response.data.htmlLink || '';
}

export async function createHold(
  title: string,
  start: Date,
  end: Date,
  calendarId: string = 'primary'
): Promise<string> {
  const auth = getAuthClient();

  const response = await calendar.events.insert({
    auth,
    calendarId,
    requestBody: {
      summary: `[HOLD] ${title}`,
      start: {
        dateTime: start.toISOString(),
        timeZone: process.env.USER_TIMEZONE || 'America/New_York'
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: process.env.USER_TIMEZONE || 'America/New_York'
      },
      transparency: 'opaque', // Shows as busy
      visibility: 'private'
    }
  });

  return response.data.id || '';
}

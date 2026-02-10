import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { gateway } from "../gateway/connection";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";
import { automationExec } from "../services/automation.service";

const router = Router();

router.use(authMiddleware);

// ─── Calendar Event Types ──────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location?: string;
  description?: string;
  provider: "google" | "microsoft";
  htmlLink?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function mapGoogleEvent(event: any): CalendarEvent {
  const isAllDay = !!event.start?.date;
  const startStr = event.start?.dateTime || event.start?.date || "";
  const endStr = event.end?.dateTime || event.end?.date || "";
  return {
    id: event.id || "",
    title: event.summary || "(No title)",
    start: startStr,
    end: endStr,
    startTime: isAllDay ? "All day" : formatTime(startStr),
    endTime: isAllDay ? "" : formatTime(endStr),
    allDay: isAllDay,
    location: event.location || undefined,
    description: event.description || undefined,
    provider: "google" as const,
    htmlLink: event.htmlLink || undefined,
  };
}

function mapMicrosoftEvent(event: any): CalendarEvent {
  const startStr = event.start?.dateTime ? event.start.dateTime + "Z" : "";
  const endStr = event.end?.dateTime ? event.end.dateTime + "Z" : "";
  return {
    id: event.id || "",
    title: event.subject || "(No title)",
    start: startStr,
    end: endStr,
    startTime: event.isAllDay ? "All day" : formatTime(startStr),
    endTime: event.isAllDay ? "" : formatTime(endStr),
    allDay: event.isAllDay || false,
    location: event.location?.displayName || undefined,
    description: event.bodyPreview || undefined,
    provider: "microsoft" as const,
    htmlLink: event.webLink || undefined,
  };
}

async function fetchGoogleCalendarEvents(
  userId: string,
  accessToken: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const oauth2Client = await getGoogleApiClient(userId);
  if (!oauth2Client) throw new Error("Google API client not available");

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  return (response.data.items || []).map(mapGoogleEvent);
}

async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start.toISOString());
  url.searchParams.set("endDateTime", end.toISOString());
  url.searchParams.set("$top", "100");
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$select", "id,subject,start,end,isAllDay,location,bodyPreview,webLink");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Microsoft Graph API error: ${response.status} ${errText}`);
  }

  const data: any = await response.json();
  return (data.value || []).map(mapMicrosoftEvent);
}

async function fetchCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const events: CalendarEvent[] = [];

  const googleTokens = await getTokensForProvider(userId, "google");
  if (googleTokens) {
    try {
      const gcal = await fetchGoogleCalendarEvents(userId, googleTokens.accessToken, today, tomorrow);
      events.push(...gcal);
    } catch {}
  }

  const msTokens = await getTokensForProvider(userId, "microsoft");
  if (msTokens) {
    try {
      const mscal = await fetchMicrosoftCalendarEvents(msTokens.accessToken, today, tomorrow);
      events.push(...mscal);
    } catch {}
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return events;
}

// ─── GET /events — List calendar events ──────────────────

router.get("/events", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { start, end } = req.query;

    const startDate = start ? new Date(String(start)) : startOfDay(new Date());
    const endDate = end ? new Date(String(end)) : addDays(startDate, 7);

    const googleTokens = await getTokensForProvider(userId, "google");
    const msTokens = await getTokensForProvider(userId, "microsoft");

    if (!googleTokens && !msTokens) {
      res.json({
        ok: true,
        data: {
          connected: false,
          message: "Connect Google or Microsoft in Connections to view events.",
          events: [],
        },
      });
      return;
    }

    const events: CalendarEvent[] = [];

    if (googleTokens) {
      try {
        const gcalEvents = await fetchGoogleCalendarEvents(userId, googleTokens.accessToken, startDate, endDate);
        events.push(...gcalEvents);
      } catch (err: any) {
        console.error("[Calendar] Google fetch error:", err.message);
      }
    }

    if (msTokens) {
      try {
        const msEvents = await fetchMicrosoftCalendarEvents(msTokens.accessToken, startDate, endDate);
        events.push(...msEvents);
      } catch (err: any) {
        console.error("[Calendar] Microsoft fetch error:", err.message);
      }
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    res.json({
      ok: true,
      data: {
        connected: true,
        providers: { google: !!googleTokens, microsoft: !!msTokens },
        events,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /events — Create a calendar event ──────────────

router.post("/events", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { title, description, start, end, allDay, location, timeZone } = req.body;

    if (!title || !start) {
      res.status(400).json({ ok: false, error: "title and start are required" });
      return;
    }

    const oauth2Client = await getGoogleApiClient(userId);
    if (!oauth2Client) {
      res.status(400).json({ ok: false, error: "Google Calendar not connected" });
      return;
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

    const eventBody: any = {
      summary: title,
      description: description || undefined,
      location: location || undefined,
    };

    if (allDay) {
      eventBody.start = { date: start.split("T")[0] };
      eventBody.end = { date: (end || start).split("T")[0] };
    } else {
      eventBody.start = { dateTime: start, timeZone: tz };
      eventBody.end = { dateTime: end || start, timeZone: tz };
    }

    const result = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventBody,
    });

    res.json({ ok: true, data: mapGoogleEvent(result.data) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /events/:id — Update a calendar event ─────────

router.patch("/events/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const eventId = String(req.params.id);
    const { title, description, start, end, allDay, location, timeZone } = req.body;

    const oauth2Client = await getGoogleApiClient(userId);
    if (!oauth2Client) {
      res.status(400).json({ ok: false, error: "Google Calendar not connected" });
      return;
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

    const patch: any = {};
    if (title !== undefined) patch.summary = title;
    if (description !== undefined) patch.description = description;
    if (location !== undefined) patch.location = location;

    if (start !== undefined) {
      patch.start = allDay ? { date: start.split("T")[0] } : { dateTime: start, timeZone: tz };
    }
    if (end !== undefined) {
      patch.end = allDay ? { date: end.split("T")[0] } : { dateTime: end, timeZone: tz };
    }

    const result = await calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody: patch,
    }) as any;

    res.json({ ok: true, data: mapGoogleEvent(result.data) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /events/:id — Delete a calendar event ────────

router.delete("/events/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const eventId = String(req.params.id);

    const oauth2Client = await getGoogleApiClient(userId);
    if (!oauth2Client) {
      res.status(400).json({ ok: false, error: "Google Calendar not connected" });
      return;
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    await calendar.events.delete({ calendarId: "primary", eventId });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Schedule Preferences ────────────────────────────────

router.get("/preferences", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    let prefs = await prisma.schedulePreferences.findUnique({ where: { userId } });
    if (!prefs) {
      prefs = await prisma.schedulePreferences.create({ data: { userId } });
    }
    res.json({ ok: true, data: prefs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/preferences", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      wakeTime, sleepTime, workStartTime, workEndTime,
      lunchStart, lunchDuration, focusBlockMinutes, breakMinutes,
      travelBuffer, midDayActivity, midDayStart, midDayDuration,
      preferMorning, notes,
    } = req.body;

    const data: any = {};
    if (wakeTime !== undefined) data.wakeTime = wakeTime;
    if (sleepTime !== undefined) data.sleepTime = sleepTime;
    if (workStartTime !== undefined) data.workStartTime = workStartTime;
    if (workEndTime !== undefined) data.workEndTime = workEndTime;
    if (lunchStart !== undefined) data.lunchStart = lunchStart;
    if (lunchDuration !== undefined) data.lunchDuration = lunchDuration;
    if (focusBlockMinutes !== undefined) data.focusBlockMinutes = focusBlockMinutes;
    if (breakMinutes !== undefined) data.breakMinutes = breakMinutes;
    if (travelBuffer !== undefined) data.travelBuffer = travelBuffer;
    if (midDayActivity !== undefined) data.midDayActivity = midDayActivity;
    if (midDayStart !== undefined) data.midDayStart = midDayStart;
    if (midDayDuration !== undefined) data.midDayDuration = midDayDuration;
    if (preferMorning !== undefined) data.preferMorning = preferMorning;
    if (notes !== undefined) data.notes = notes;

    const prefs = await prisma.schedulePreferences.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    res.json({ ok: true, data: prefs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Build AI Agenda ─────────────────────────────────────

router.post("/build-agenda", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const today = new Date();
    const dateStr = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Fetch todos, events, and preferences in parallel
    const [todos, calEvents, prefs] = await Promise.all([
      prisma.todo.findMany({
        where: { userId, completed: false },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      }),
      fetchCalendarEvents(userId),
      prisma.schedulePreferences.findUnique({ where: { userId } }),
    ]);

    const todoList =
      todos.length > 0
        ? todos
            .map((t, i) => {
              const due = t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : "";
              const est = t.estimatedMinutes ? ` [~${t.estimatedMinutes}min]` : "";
              return `${i + 1}. [${t.priority}] ${t.title}${due}${est}`;
            })
            .join("\n")
        : "No pending tasks.";

    const eventsList =
      calEvents.length > 0
        ? calEvents
            .map((e) => {
              const time = e.allDay ? "All day" : `${e.startTime} - ${e.endTime}`;
              return `- ${time}: ${e.title}${e.location ? ` @ ${e.location}` : ""}`;
            })
            .join("\n")
        : "No calendar events.";

    const prefsBlock = prefs
      ? `\nSchedule Preferences:\n` +
        `- Wake: ${prefs.wakeTime}, Sleep: ${prefs.sleepTime}\n` +
        `- Work hours: ${prefs.workStartTime} - ${prefs.workEndTime}\n` +
        `- Lunch: ${prefs.lunchStart} for ${prefs.lunchDuration}min\n` +
        `- Focus blocks: ${prefs.focusBlockMinutes}min with ${prefs.breakMinutes}min breaks\n` +
        `- Travel buffer: ${prefs.travelBuffer}min before/after location events\n` +
        `- Prefer morning for deep work: ${prefs.preferMorning ? "yes" : "no"}\n` +
        (prefs.midDayActivity
          ? `- Mid-day activity: ${prefs.midDayActivity} at ${prefs.midDayStart} for ${prefs.midDayDuration}min\n`
          : "") +
        (prefs.notes ? `- Additional notes: ${prefs.notes}\n` : "")
      : "";

    const systemPrompt = `You are a daily schedule optimizer. Given calendar events (fixed, immovable), tasks (flexible, can be scheduled in gaps), and user preferences, create an optimized daily agenda.

Rules:
1. Calendar events are FIXED — never move them, include them at their exact times
2. Tasks should be fit into available gaps between events
3. Respect user preferences for lunch, breaks, mid-day activity, work hours
4. Add travel buffer before/after events that have locations
5. Prioritize high-priority and due-soon tasks earlier in the day
6. Include short breaks between focus blocks
7. If the user prefers morning for deep work, schedule harder tasks in the morning
8. Include a lunch break at the preferred time
9. Include the mid-day activity if specified

Return a JSON array of agenda items sorted by time:
[{"time":"HH:mm","endTime":"HH:mm","title":"...","type":"event|task|break|lunch|activity","taskId":"uuid-or-null","notes":"optional context"}]

Return ONLY the JSON array, no markdown fences, no explanatory text.`;

    const prompt = `Today is ${dateStr}.\n\nCalendar Events (FIXED — do not move):\n${eventsList}\n\nTasks (flexible — fit into gaps):\n${todoList}\n${prefsBlock}\nCreate my optimized daily agenda as a JSON array.`;

    // Try automationExec first (cheap AI lane), fall back to gateway
    let result: string;
    try {
      result = await automationExec(userId, prompt, { systemPrompt });
    } catch {
      // Fall back to gateway if automation AI not configured
      const gatewayResult = await gateway.send(
        "chat.send",
        {
          sessionKey: "agent:main:main",
          message: prompt,
          thinking: "low",
          deliver: true,
          idempotencyKey: `agenda-${Date.now()}`,
        },
        30000
      );
      result = typeof gatewayResult === "string" ? gatewayResult : JSON.stringify(gatewayResult);
    }

    // Parse the JSON response
    let agenda;
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      agenda = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, return raw text for markdown rendering
      agenda = null;
    }

    res.json({
      ok: true,
      data: {
        agenda,
        raw: agenda ? undefined : result,
        date: dateStr,
        eventCount: calEvents.length,
        taskCount: todos.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

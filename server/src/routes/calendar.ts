import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { gateway } from "../gateway/connection";
import { getTokensForProvider, getGoogleApiClient } from "../services/oauth.service";

const router = Router();

router.use(authMiddleware);

// ─── Build agenda using AI ──────────────────────────────────

router.post("/build-agenda", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get today's todos
    const todos = await prisma.todo.findMany({
      where: { userId, completed: false },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    });

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const todoList =
      todos.length > 0
        ? todos
            .map((t, i) => {
              const due = t.dueDate
                ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})`
                : "";
              return `${i + 1}. [${t.priority}] ${t.title}${due}`;
            })
            .join("\n")
        : "No pending tasks.";

    // Also try to include calendar events in the prompt
    let calendarContext = "";
    const calEvents = await fetchCalendarEvents(userId);
    if (calEvents.length > 0) {
      calendarContext =
        "\n\nHere are my calendar events for today:\n" +
        calEvents
          .map((e) => {
            const time = e.allDay ? "All day" : `${e.startTime} - ${e.endTime}`;
            return `- ${time}: ${e.title}${e.location ? ` (${e.location})` : ""}`;
          })
          .join("\n");
    }

    const prompt = `Today is ${today}. Here are my current tasks:\n\n${todoList}${calendarContext}\n\nPlease create a structured daily agenda for me. Prioritize urgent and high-priority items. Work around my calendar events. Suggest time blocks and breaks. Keep it concise and actionable.`;

    const result = await gateway.send(
      "chat.send",
      {
        sessionKey: "agent:main:main",
        message: prompt,
        thinking: "low",
        deliver: "full",
        idempotencyKey: `agenda-${Date.now()}`,
      },
      60000
    );

    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Calendar events ──────────────────────────────────────

router.get("/events", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { start, end } = req.query;

    // Determine date range (default: today through 7 days)
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

    // Fetch Google Calendar events
    if (googleTokens) {
      try {
        const gcalEvents = await fetchGoogleCalendarEvents(
          userId,
          googleTokens.accessToken,
          startDate,
          endDate
        );
        events.push(...gcalEvents);
      } catch (err: any) {
        console.error("[Calendar] Google fetch error:", err.message);
      }
    }

    // Fetch Microsoft Calendar events
    if (msTokens) {
      try {
        const msEvents = await fetchMicrosoftCalendarEvents(
          msTokens.accessToken,
          startDate,
          endDate
        );
        events.push(...msEvents);
      } catch (err: any) {
        console.error("[Calendar] Microsoft fetch error:", err.message);
      }
    }

    // Sort by start time
    events.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    res.json({
      ok: true,
      data: {
        connected: true,
        providers: {
          google: !!googleTokens,
          microsoft: !!msTokens,
        },
        events,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────

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

async function fetchGoogleCalendarEvents(
  userId: string,
  accessToken: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const oauth2Client = await getGoogleApiClient(userId);
  if (!oauth2Client) {
    throw new Error("Google API client not available");
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  return (response.data.items || []).map((event) => {
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
  });
}

async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const url = new URL(
    "https://graph.microsoft.com/v1.0/me/calendarView"
  );
  url.searchParams.set("startDateTime", start.toISOString());
  url.searchParams.set("endDateTime", end.toISOString());
  url.searchParams.set("$top", "100");
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set(
    "$select",
    "id,subject,start,end,isAllDay,location,bodyPreview,webLink"
  );

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

  return (data.value || []).map((event: any) => {
    const startStr = event.start?.dateTime
      ? event.start.dateTime + "Z"
      : "";
    const endStr = event.end?.dateTime
      ? event.end.dateTime + "Z"
      : "";

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
  });
}

/** Fetch today's events for the agenda builder */
async function fetchCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const events: CalendarEvent[] = [];

  const googleTokens = await getTokensForProvider(userId, "google");
  if (googleTokens) {
    try {
      const gcal = await fetchGoogleCalendarEvents(
        userId,
        googleTokens.accessToken,
        today,
        tomorrow
      );
      events.push(...gcal);
    } catch {}
  }

  const msTokens = await getTokensForProvider(userId, "microsoft");
  if (msTokens) {
    try {
      const mscal = await fetchMicrosoftCalendarEvents(
        msTokens.accessToken,
        today,
        tomorrow
      );
      events.push(...mscal);
    } catch {}
  }

  events.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return events;
}

export default router;

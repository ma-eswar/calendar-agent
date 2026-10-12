import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/* ============================ TYPES ============================ */

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO (UTC)
  endTime: string;   // ISO (UTC)
  location?: string;
  notes?: string;
}

export interface AgentAction {
  type: "created" | "updated" | "deleted";
  event: CalendarEvent;
}

type ToolResult = { ok: boolean; [key: string]: unknown };

const DEFAULT_DURATION_MIN = 60;
const MAX_TOOL_ROUNDS = 15;
const MAX_EVENT_MS = 7 * 24 * 60 * 60 * 1000;

/* ============================ STORAGE ============================ */

const EVENTS_FILE = path.join(process.cwd(), "events.json");

function loadEvents(): CalendarEvent[] {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8"));
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e: any) =>
        e &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        Number.isFinite(Date.parse(e.startTime)) &&
        Number.isFinite(Date.parse(e.endTime))
    );
  } catch {
    return [];
  }
}

let eventsStore: CalendarEvent[] = loadEvents();

function persist(): void {
  const tmp = EVENTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(eventsStore, null, 2));
  fs.renameSync(tmp, EVENTS_FILE);
}

export function getEvents(): CalendarEvent[] {
  return eventsStore;
}

export function deleteEvent(id: string): CalendarEvent | null {
  const target = eventsStore.find(e => e.id === id);
  if (!target) return null;
  eventsStore = eventsStore.filter(e => e.id !== id);
  persist();
  return target;
}

/* ============================ LLM CONFIG ============================ */

export let currentBaseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
export let currentModel = process.env.LLM_MODEL || "qwen/qwen-2.5-coder-32b";

let client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "",
  baseURL: currentBaseUrl
});

export function getStoredApiKey(): string {
  return process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "";
}

export function isConfigured(): boolean {
  return Boolean(getStoredApiKey());
}

export function updateConfig(apiKey: string, model?: string, baseURL?: string): void {
  process.env.LLM_API_KEY = apiKey;
  if (model) {
    process.env.LLM_MODEL = model;
    currentModel = model;
  }
  if (baseURL) {
    process.env.LLM_BASE_URL = baseURL;
    currentBaseUrl = baseURL;
  }
  client = new OpenAI({ apiKey, baseURL: currentBaseUrl });
}

/* ============================ TIME HELPERS ============================ */

export function safeTimeZone(tz?: unknown): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (typeof tz !== "string" || !tz) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** Parse "YYYY-MM-DD[THH:mm[:ss]]". No offset in the string => wall-clock time in `tz`. */
function parseInZone(input: string, tz: string): number {
  const s = input.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s) && s.includes("T")) return new Date(s).getTime();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return NaN;
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let ts = utcGuess - tzOffsetMs(new Date(utcGuess), tz);
  ts = utcGuess - tzOffsetMs(new Date(ts), tz);
  return ts;
}

function ymdInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ms);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function toLocalIso(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(ms);
  const g = (t: string) => parts.find(p => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

function fmtDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(ms);
}

function fmtTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(ms);
}

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

function fmtRange(startMs: number, endMs: number, tz: string): string {
  if (ymdInTz(startMs, tz) === ymdInTz(endMs, tz)) {
    return `${fmtDate(startMs, tz)}, ${fmtTime(startMs, tz)} – ${fmtTime(endMs, tz)}`;
  }
  return `${fmtDate(startMs, tz)}, ${fmtTime(startMs, tz)} → ${fmtDate(endMs, tz)}, ${fmtTime(endMs, tz)}`;
}

/* ============================ CALENDAR LOGIC ============================ */

function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && aE > bS;
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function describe(e: CalendarEvent, tz: string) {
  const s = Date.parse(e.startTime);
  const en = Date.parse(e.endTime);
  return {
    id: e.id,
    title: e.title,
    when: fmtRange(s, en, tz),
    startLocal: toLocalIso(s, tz),
    endLocal: toLocalIso(en, tz),
    location: e.location || null,
    notes: e.notes || null
  };
}

/** Free windows (computed in code, never by the LLM) on one local date. */
function freeWindows(
  dateStr: string,
  durationMin: number,
  tz: string,
  dayStart = "09:00",
  dayEnd = "18:00",
  ignoreId?: string
): { start: number; end: number }[] {
  let from = parseInZone(`${dateStr}T${dayStart}`, tz);
  const to = parseInZone(`${dateStr}T${dayEnd}`, tz);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];

  const now = Date.now();
  if (from < now) from = Math.ceil(now / 900000) * 900000; // next 15-min mark
  const dur = durationMin * 60000;

  const busy = eventsStore
    .filter(e => e.id !== ignoreId)
    .map(e => ({ s: Date.parse(e.startTime), e: Date.parse(e.endTime) }))
    .filter(b => b.e > from && b.s < to)
    .sort((a, b) => a.s - b.s);

  const out: { start: number; end: number }[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.s - cursor >= dur) out.push({ start: cursor, end: b.s });
    cursor = Math.max(cursor, b.e);
  }
  if (to - cursor >= dur) out.push({ start: cursor, end: to });
  return out;
}

function suggestWindows(fromMs: number, durationMin: number, tz: string, ignoreId?: string) {
  const out: { window: string; startLocal: string; endLocal: string }[] = [];
  const first = ymdInTz(Math.max(fromMs, Date.now()), tz);
  for (let i = 0; i < 7 && out.length < 3; i++) {
    for (const w of freeWindows(addDays(first, i), durationMin, tz, "09:00", "20:00", ignoreId)) {
      out.push({
        window: fmtRange(w.start, w.end, tz),
        startLocal: toLocalIso(w.start, tz),
        endLocal: toLocalIso(w.end, tz)
      });
      if (out.length >= 3) break;
    }
  }
  return out;
}

function computeRange(
  startIn: unknown,
  endIn: unknown,
  durIn: unknown,
  tz: string,
  base?: { start: number; end: number }
): { start: number; end: number } | { error: string } {
  let start: number;
  if (typeof startIn === "string" && startIn) {
    start = parseInZone(startIn, tz);
    if (!Number.isFinite(start)) return { error: "startTime is not a valid date/time. Use YYYY-MM-DDTHH:MM:SS." };
  } else if (base) {
    start = base.start;
  } else {
    return { error: "startTime is required." };
  }

  let end: number;
  if (typeof endIn === "string" && endIn) {
    end = parseInZone(endIn, tz);
    if (!Number.isFinite(end)) return { error: "endTime is not a valid date/time. Use YYYY-MM-DDTHH:MM:SS." };
  } else if (Number(durIn) > 0) {
    end = start + Number(durIn) * 60000;
  } else if (base) {
    end = start + (base.end - base.start);
  } else {
    end = start + DEFAULT_DURATION_MIN * 60000;
  }

  if (end <= start) return { error: "End time must be after start time." };
  if (end - start > MAX_EVENT_MS) return { error: "Events longer than 7 days are not supported." };
  return { start, end };
}

/* ============================ TOOLS ============================ */

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_events",
      description: "List events in a date range. Defaults to everything from today onward (max 50).",
      parameters: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "YYYY-MM-DD, inclusive. Optional." },
          toDate: { type: "string", description: "YYYY-MM-DD, inclusive. Optional." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_free_slots",
      description: "Find open time windows on one date. Always use this for availability questions.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          durationMinutes: { type: "number", description: "Minimum length needed. Default 60." },
          dayStart: { type: "string", description: "HH:MM, default 09:00" },
          dayEnd: { type: "string", description: "HH:MM, default 18:00" }
        },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Book a new event. Times are local wall-clock time as YYYY-MM-DDTHH:MM:SS with NO timezone suffix. If endTime is omitted, durationMinutes is used (default 60).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          durationMinutes: { type: "number" },
          location: { type: "string" },
          notes: { type: "string" }
        },
        required: ["title", "startTime"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description:
        "Change an existing event by id (rename, move, resize, set location or notes). Use this instead of creating a new event. Same time format as create_event.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          newTitle: { type: "string" },
          newStartTime: { type: "string" },
          newEndTime: { type: "string" },
          durationMinutes: { type: "number" },
          location: { type: "string", description: "Empty string clears it." },
          notes: { type: "string", description: "Empty string clears it." }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description: "Cancel an event by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"]
      }
    }
  }
];

function runTool(name: string, args: Record<string, any>, tz: string, actions: AgentAction[]): ToolResult {
  const now = Date.now();

  if (name === "list_events") {
    let from = typeof args.fromDate === "string" ? parseInZone(args.fromDate, tz) : NaN;
    if (!Number.isFinite(from)) from = parseInZone(ymdInTz(now, tz), tz);
    let to = typeof args.toDate === "string" ? parseInZone(args.toDate, tz) + 86400000 : Infinity;
    if (!Number.isFinite(to)) to = Infinity;
    const list = eventsStore
      .filter(e => Date.parse(e.endTime) > from && Date.parse(e.startTime) < to)
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
      .slice(0, 50)
      .map(e => describe(e, tz));
    return { ok: true, count: list.length, events: list };
  }

  if (name === "find_free_slots") {
    const date = cleanText(args.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "date must be YYYY-MM-DD." };
    const dur = Number(args.durationMinutes) > 0 ? Number(args.durationMinutes) : DEFAULT_DURATION_MIN;
    const ds = /^\d{2}:\d{2}$/.test(args.dayStart ?? "") ? args.dayStart : "09:00";
    const de = /^\d{2}:\d{2}$/.test(args.dayEnd ?? "") ? args.dayEnd : "18:00";
    const windows = freeWindows(date, dur, tz, ds, de).map(w => ({
      window: fmtRange(w.start, w.end, tz),
      startLocal: toLocalIso(w.start, tz),
      endLocal: toLocalIso(w.end, tz)
    }));
    return {
      ok: true,
      note: windows.length ? undefined : "No open window of that length (past times are excluded).",
      windows
    };
  }

  if (name === "create_event") {
    const title = cleanText(args.title, 120);
    if (!title) return { ok: false, error: "title is required." };

    const range = computeRange(args.startTime, args.endTime, args.durationMinutes, tz);
    if ("error" in range) return { ok: false, error: range.error };

    if (range.start < now - 60_000) {
      return {
        ok: false,
        error: "past",
        message: `That time has already passed. Right now it is ${fmtDate(now, tz)}, ${fmtTime(now, tz)}. Ask for a future time.`
      };
    }

    const dup = eventsStore.find(
      e => e.title.toLowerCase() === title.toLowerCase() && Date.parse(e.startTime) === range.start
    );
    if (dup) {
      return {
        ok: false,
        error: "duplicate",
        message: "This exact event already exists. Do NOT create it again; use update_event if details changed.",
        existing: describe(dup, tz)
      };
    }

    const conflict = eventsStore.find(e => overlaps(range.start, range.end, Date.parse(e.startTime), Date.parse(e.endTime)));
    if (conflict) {
      const sameTitle = conflict.title.toLowerCase() === title.toLowerCase();
      return {
        ok: false,
        error: "conflict",
        message: sameTitle
          ? "An event with this title already overlaps this time. Use update_event with its id to change it."
          : `Overlaps "${conflict.title}".`,
        conflictsWith: describe(conflict, tz),
        suggestions: suggestWindows(range.start, Math.round((range.end - range.start) / 60000), tz)
      };
    }

    const ev: CalendarEvent = {
      id: randomUUID(),
      title,
      startTime: new Date(range.start).toISOString(),
      endTime: new Date(range.end).toISOString()
    };
    const location = cleanText(args.location, 200);
    const notes = cleanText(args.notes, 500);
    if (location) ev.location = location;
    if (notes) ev.notes = notes;

    eventsStore.push(ev);
    persist();
    actions.push({ type: "created", event: ev });
    return { ok: true, event: describe(ev, tz) };
  }

  if (name === "update_event") {
    const target = eventsStore.find(e => e.id === args.id);
    if (!target) return { ok: false, error: "Event ID not found. Use the ids from the event list." };

    const base = { start: Date.parse(target.startTime), end: Date.parse(target.endTime) };
    const timeChange = args.newStartTime || args.newEndTime || Number(args.durationMinutes) > 0;
    let range = base;

    if (timeChange) {
      const r = computeRange(args.newStartTime, args.newEndTime, args.durationMinutes, tz, base);
      if ("error" in r) return { ok: false, error: r.error };
      range = r;
      if (range.start !== base.start && range.start < now - 60_000) {
        return { ok: false, error: "past", message: "That time has already passed. Ask for a future time." };
      }
      const conflict = eventsStore.find(
        e => e.id !== target.id && overlaps(range.start, range.end, Date.parse(e.startTime), Date.parse(e.endTime))
      );
      if (conflict) {
        return {
          ok: false,
          error: "conflict",
          message: `Overlaps "${conflict.title}".`,
          conflictsWith: describe(conflict, tz),
          suggestions: suggestWindows(range.start, Math.round((range.end - range.start) / 60000), tz, target.id)
        };
      }
    }

    if (typeof args.newTitle === "string" && cleanText(args.newTitle, 120)) target.title = cleanText(args.newTitle, 120);
    if (typeof args.location === "string") {
      const v = cleanText(args.location, 200);
      if (v) target.location = v; else delete target.location;
    }
    if (typeof args.notes === "string") {
      const v = cleanText(args.notes, 500);
      if (v) target.notes = v; else delete target.notes;
    }
    target.startTime = new Date(range.start).toISOString();
    target.endTime = new Date(range.end).toISOString();

    persist();
    actions.push({ type: "updated", event: { ...target } });
    return { ok: true, event: describe(target, tz) };
  }

  if (name === "delete_event") {
    const removed = deleteEvent(String(args.id));
    if (!removed) return { ok: false, error: "Event ID not found." };
    actions.push({ type: "deleted", event: removed });
    return { ok: true, deleted: removed.title };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

/* ============================ SYSTEM PROMPT ============================ */

function buildSystemPrompt(tz: string): string {
  const now = Date.now();
  const today = ymdInTz(now, tz);

  const dateTable = Array.from({ length: 14 }, (_, i) => {
    const ymd = addDays(today, i);
    const [y, m, d] = ymd.split("-").map(Number);
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(Date.UTC(y, m - 1, d, 12));
    const tag = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `${wd} ${ymd}${tag}`;
  }).join("\n");

  const horizon = now + 30 * 86400000;
  const upcoming = eventsStore
    .filter(e => Date.parse(e.endTime) > now && Date.parse(e.startTime) < horizon)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, 40)
    .map(e => {
      const extra = [e.location ? `at ${e.location}` : "", e.notes ? `notes: ${e.notes}` : ""].filter(Boolean).join("; ");
      return `- id=${e.id} | ${e.title} | ${fmtRange(Date.parse(e.startTime), Date.parse(e.endTime), tz)}${extra ? " | " + extra : ""}`;
    })
    .join("\n") || "(none)";

  return `You are Calendar Copilot, a calm, precise, and highly capable calendar assistant.

NOW: ${fmtDate(now, tz)}, ${fmtTime(now, tz)} (${today}).
The next 14 days (use this table for "tomorrow", "next Monday", "this Friday"; "next <weekday>" means the first such weekday after today):
${dateTable}

UPCOMING EVENTS (next 30 days):
${upcoming}

HOW TO WORK
1. Follow a fast 2-step flow:
   - Step A: If the title, date, or start time is missing, ask for them.
   - Step B: Once you have the title, date, and time, ask ONE short question: "Any location or notes to add, or shall I book it now?"
   - Step C: Once the user provides notes/location OR says "no / book it", immediately call create_event.
2. If the user provides notes or location in their first message (e.g. "Meeting with Bob at Starbucks at 3 PM"), book it right away with create_event without asking extra questions.
3. If the user says "no", "none", "skip", "nothing", or makes typos like "mmo", treat it as NO notes and NO location. Never save "no" or typos of "no" as notes or venue names!
4. If duration is missing or user says "idk" / "not sure", default to 60 minutes OR 120 minutes according to event type.
5. If numbers like "29 and 30" or "on the 15th" are mentioned, treat them as dates of the current month (e.g. Oct 29 & 30), NOT future day offsets, unless the user specifically says "in X days from now".
6. Ask a question only when essential information (title or date/time) is missing. Ask exactly one short question.
7. To change an existing event (rename, move, add location/notes), use update_event with its id. Never create a duplicate event to modify one.
8. For availability or "find a slot" requests, always call find_free_slots. Never calculate free time yourself.
9. Send times to tools as local wall-clock time, YYYY-MM-DDTHH:MM:SS, with no timezone suffix.
10. If a tool returns error "past", tell the user plainly that the time has passed and suggest the nearest future option.
11. If a tool returns "conflict", name the conflicting event and offer the suggested windows. Do not claim anything was booked.
12. Never say an event was booked, moved, or cancelled unless a tool returned ok:true in this turn. After a successful change, the app displays its own receipt.
13. Keep titles clean, without duration or time words ("90-minute Deep Work session" becomes "Deep Work").

PERSONALITY & BOUNDARIES
- Warm, polite, and concise. You may exchange light greetings, quick pleasantries, and answer questions about your actions naturally.
- Strictly decline unrelated requests (like writing code, general knowledge trivia, or homework) in one friendly sentence, steering back to the calendar (e.g., "I'm only built to manage your schedule, but I can help you block out time for that!").
- Short and clear. Use bold for event titles and bullet points for lists.
- Friendly dates like "Tue, Oct 13, 5:00 PM". Never display raw timezone IDs, ISO strings, tool names, or internal IDs.
- No emoji, no markdown tables.`;
}

/* ============================ CHAT LOOP ============================ */

let chatHistory: OpenAI.ChatCompletionMessageParam[] = [];

export function clearChatHistory(): void {
  chatHistory = [];
}

function cleanOutput(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const split = cleaned.split(/(?:I'll output|I will output|Final response|Here's the response):\s*/i);
  if (split.length > 1) cleaned = split[split.length - 1].trim();
  return cleaned;
}

function receipt(a: AgentAction, tz: string): string {
  const e = a.event;
  const s = Date.parse(e.startTime);
  const en = Date.parse(e.endTime);
  const verb = a.type === "created" ? "Booked" : a.type === "updated" ? "Updated" : "Cancelled";
  const lines = [`**${verb}: ${e.title}**`, `- **When:** ${fmtRange(s, en, tz)} (${fmtDuration(en - s)})`];
  if (e.location) lines.push(`- **Where:** ${e.location}`);
  if (e.notes) lines.push(`- **Notes:** ${e.notes}`);
  return lines.join("\n");
}

export async function chatWithAgent(userMessage: string, timeZone?: string) {
  const tz = safeTimeZone(timeZone);

  const activeMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(tz) },
    ...chatHistory.slice(-10),
    { role: "user", content: userMessage }
  ];

  const actions: AgentAction[] = [];
  let failures = 0;

  const call = () =>
    client.chat.completions.create({
      model: currentModel,
      messages: activeMessages,
      tools,
      temperature: 0.2,
      max_tokens: 700
    });

  let response = await call();
  let message = response.choices[0].message;
  let rounds = 0;

  while (message.tool_calls && message.tool_calls.length > 0 && rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    activeMessages.push(message);

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      let args: Record<string, any> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }

      const result = runTool(toolCall.function.name, args, tz, actions);
      if (!result.ok) failures++;

      activeMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    response = await call();
    message = response.choices[0].message;
  }

  const modelText = cleanOutput(message.content || "");
  let reply: string;

  if (actions.length > 0) {
    // The server writes the confirmation from what was really saved.
    reply = actions.map(a => receipt(a, tz)).join("\n\n");
    if (failures > 0 && modelText) reply += "\n\n" + modelText;
  } else {
    reply = modelText || "I couldn't complete that. Could you rephrase it with a title and a date or time?";
  }

  chatHistory.push({ role: "user", content: userMessage });
  chatHistory.push({ role: "assistant", content: reply });

  return { reply, events: eventsStore, actions };
}
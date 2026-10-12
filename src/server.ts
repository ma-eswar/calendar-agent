import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import OpenAI from "openai";
import {
  chatWithAgent,
  getEvents,
  deleteEvent,
  isConfigured,
  updateConfig,
  getStoredApiKey,
  currentModel,
  currentBaseUrl,
  clearChatHistory
} from "./agent.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1"; // local-only by default
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(HOST);

app.use(express.json({ limit: "100kb" }));

// Block DNS-rebinding and cross-site requests when running locally.
app.use((req, res, next) => {
  if (isLoopback) {
    const host = req.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
      return res.status(403).json({ error: "Forbidden host" });
    }
  }
  const origin = req.headers.origin;
  if (req.method !== "GET" && req.method !== "HEAD" && origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        return res.status(403).json({ error: "Forbidden origin" });
      }
    } catch {
      return res.status(403).json({ error: "Forbidden origin" });
    }
  }
  next();
});

app.use(express.static(path.join(process.cwd(), "public")));

/* ---------- helpers ---------- */

const stripSlash = (u: string) => u.replace(/\/+$/, "");

function normalizeBaseUrl(raw: unknown): string | null {
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "https://api.groq.com/openai/v1";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return value;
  } catch {
    return null;
  }
}

/** The stored key is only reused for the provider URL it was saved with. */
function resolveKey(typedKey: unknown, baseUrl: string): string {
  const typed = typeof typedKey === "string" ? typedKey.trim() : "";
  if (typed) return typed;
  return stripSlash(baseUrl) === stripSlash(currentBaseUrl) ? getStoredApiKey() : "";
}

/* ---------- config ---------- */

app.get("/api/config/status", (_req, res) => {
  res.json({ configured: isConfigured(), model: currentModel, baseUrl: currentBaseUrl });
});

app.post("/api/config/test", async (req, res) => {
  const { apiKey, model, baseUrl } = req.body ?? {};
  const selectedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!selectedBaseUrl) {
    return res.json({ success: false, message: "API Base URL must be a valid http(s) URL." });
  }

  const effectiveKey = resolveKey(apiKey, selectedBaseUrl);
  if (!effectiveKey) {
    return res.json({ success: false, message: "Enter an API key to test this provider." });
  }

  const selectedModel = (typeof model === "string" && model.trim()) || "qwen/qwen-2.5-coder-32b";
  const startTime = Date.now();

  try {
    const testClient = new OpenAI({ apiKey: effectiveKey, baseURL: selectedBaseUrl, timeout: 10000 });
    await testClient.chat.completions.create({
      model: selectedModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5
    });
    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      latencyMs,
      message: `Connected in ${latencyMs}ms. Model "${selectedModel}" responded.`
    });
  } catch (error: any) {
    const status = error.status || error.statusCode || 500;
    let userMsg = error.message || "Connection failed";
    if (status === 401) userMsg = "Invalid API key (401). Please check it.";
    else if (status === 404) userMsg = `Model "${selectedModel}" not found (404). Check the model ID on your account.`;
    else if (status === 429) userMsg = "Rate limit reached (429). The model is temporarily out of quota.";
    return res.json({ success: false, status, latencyMs: Date.now() - startTime, message: userMsg });
  }
});

app.post("/api/config/save", (req, res) => {
  const { apiKey, model, baseUrl } = req.body ?? {};
  const selectedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!selectedBaseUrl) {
    return res.status(400).json({ error: "API Base URL must be a valid http(s) URL." });
  }

  const typedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const effectiveKey = resolveKey(typedKey, selectedBaseUrl);
  if (!effectiveKey) {
    return res.status(400).json({ error: "An API key is required for this provider." });
  }

  const selectedModel = (typeof model === "string" && model.trim()) || "qwen/qwen-2.5-coder-32b";

  // Never let values break out of their .env line.
  if ([effectiveKey, selectedModel, selectedBaseUrl].some(v => /[\r\n]/.test(v))) {
    return res.status(400).json({ error: "Values must not contain line breaks." });
  }

  updateConfig(effectiveKey, selectedModel, selectedBaseUrl);

  const envPath = path.join(process.cwd(), ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  const updateEnvKey = (key: string, val: string) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, () => `${key}=${val}`);
    } else {
      envContent += `\n${key}=${val}`;
    }
  };

  updateEnvKey("PORT", String(port));
  if (typedKey) updateEnvKey("LLM_API_KEY", typedKey);
  updateEnvKey("LLM_BASE_URL", selectedBaseUrl);
  updateEnvKey("LLM_MODEL", selectedModel);

  fs.writeFileSync(envPath, envContent.trim() + "\n", { mode: 0o600 });
  res.json({ success: true, message: "Configuration saved." });
});

/* ---------- events & chat ---------- */

app.get("/api/events", (_req, res) => {
  res.json(getEvents());
});

app.delete("/api/events/:id", (req, res) => {
  const removed = deleteEvent(req.params.id);
  if (!removed) return res.status(404).json({ error: "Event not found" });
  res.json({ success: true, events: getEvents() });
});

app.post("/api/chat/clear", (_req, res) => {
  clearChatHistory();
  res.json({ success: true, message: "Chat history cleared." });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, timeZone } = req.body ?? {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message is too long (max 2000 characters)." });
    }
    const result = await chatWithAgent(message.trim(), timeZone);
    res.json(result);
  } catch (error: any) {
    console.error("Agent error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

app.listen(port, HOST, () => {
  console.log(`Calendar Agent live at: http://${HOST === "::1" ? "[::1]" : HOST}:${port}`);
  if (!isLoopback) {
    console.warn("WARNING: HOST is not loopback. Anyone on your network can read and change your calendar.");
  }
});
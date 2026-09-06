import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT || 5173);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/jsx; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/coach" && req.method === "POST") {
      await handleCoach(req, res);
      return;
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      sendJson(res, { hasGeminiKey: Boolean(process.env.GEMINI_API_KEY), model });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: "Something went wrong on the local server." }, 500);
  }
}).listen(port, () => {
  console.log(`Slice of Life AI is running at http://localhost:${port}`);
});

async function handleCoach(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(
      res,
      {
        error:
          "Gemini is not configured. Add GEMINI_API_KEY to a .env file or set it in your terminal.",
      },
      400,
    );
    return;
  }

  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  const prompt = buildPrompt(payload);
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.75,
        topP: 0.92,
        maxOutputTokens: 1200,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    sendJson(
      res,
      {
        error:
          data?.error?.message ||
          "Gemini did not return a successful response. Check your key and model.",
      },
      response.status,
    );
    return;
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "No coaching text returned.";

  sendJson(res, { text, model });
}

function buildPrompt(payload) {
  return `
You are the AI coach inside a high-performance habit tracker called Slice of Life.
Do not reveal or infer any secrets. Use only the tracker data below.
Be direct, practical, motivating, and concise. Avoid medical claims.

User request:
${payload.message || "Give me today's plan and the biggest fix."}

Tracker summary:
${JSON.stringify(payload.summary || {}, null, 2)}

Recent daily logs:
${JSON.stringify(payload.recentDays || [], null, 2)}

Return:
1. A sharp diagnosis.
2. Three concrete actions for the next 24 hours.
3. One recovery or focus warning.
4. A short line the user can put in today's notes.
`;
}

async function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const full = normalize(join(root, requested));
  if (!full.startsWith(root)) {
    sendText(res, "Forbidden", 403, "text/plain; charset=utf-8");
    return;
  }

  if (!existsSync(full)) {
    sendText(res, "Not found", 404, "text/plain; charset=utf-8");
    return;
  }

  const data = await readFile(full);
  sendText(res, data, 200, mime[extname(full)] || "application/octet-stream");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, data, status = 200) {
  sendText(res, JSON.stringify(data), status, "application/json; charset=utf-8");
}

function sendText(res, data, status = 200, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(data);
}

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

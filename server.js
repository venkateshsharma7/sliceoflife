import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT || 5173);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const mongoUri = process.env.MONGODB_URI;
const mongoDatabase = process.env.MONGODB_DATABASE || "sliceoflife";
let mongoClient;
let mongoPromise;
const scrypt = promisify(scryptCallback);

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

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      await handleRegister(req, res);
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (url.pathname === "/api/auth/session" && req.method === "GET") {
      await handleSession(req, res);
      return;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      await handleLogout(req, res);
      return;
    }

    if (url.pathname === "/api/tracker" && req.method === "GET") {
      await handleTrackerGet(req, res);
      return;
    }

    if (url.pathname === "/api/tracker" && req.method === "PUT") {
      await handleTrackerPut(req, res);
      return;
    }

    if (url.pathname === "/api/coach" && req.method === "POST") {
      await handleCoach(req, res);
      return;
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      sendJson(res, {
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasMongo: Boolean(mongoUri),
        model,
      });
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
  const user = await requireUser(req, res);
  if (!user) return;
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

  const payload = await readJson(req, res);
  if (!payload) return;
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

async function handleRegister(req, res) {
  const payload = await readJson(req, res);
  if (!payload) return;
  const name = String(payload.name || "").trim().slice(0, 60);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (name.length < 2 || !email || password.length < 8) {
    sendJson(res, { error: "Use your name, a valid email, and an 8+ character password." }, 400);
    return;
  }
  const db = await getDatabase();
  if (!db) return sendDatabaseUnavailable(res);
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });
  try {
    const user = { _id: randomBytes(16).toString("hex"), name, email, passwordHash: await hashPassword(password), createdAt: new Date() };
    await users.insertOne(user);
    sendJson(res, await createSession(db, user), 201);
  } catch (error) {
    if (error?.code === 11000) sendJson(res, { error: "An account with this email already exists." }, 409);
    else throw error;
  }
}

async function handleLogin(req, res) {
  const payload = await readJson(req, res);
  if (!payload) return;
  const db = await getDatabase();
  if (!db) return sendDatabaseUnavailable(res);
  const user = await db.collection("users").findOne({ email: normalizeEmail(payload.email) });
  if (!user || !(await verifyPassword(String(payload.password || ""), user.passwordHash))) {
    sendJson(res, { error: "Email or password is incorrect." }, 401);
    return;
  }
  sendJson(res, await createSession(db, user));
}

async function handleSession(req, res) {
  const user = await requireUser(req, res);
  if (user) sendJson(res, { user: publicUser(user) });
}

async function handleLogout(req, res) {
  const db = await getDatabase();
  const token = getBearerToken(req);
  if (db && token) await db.collection("sessions").deleteOne({ tokenHash: hashToken(token) });
  sendJson(res, { ok: true });
}

async function handleTrackerGet(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const db = await getDatabase();
  const record = await db.collection("trackers").findOne({ _id: user._id });
  sendJson(res, { data: record?.data || null, savedAt: record?.updatedAt || null });
}

async function handleTrackerPut(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const payload = await readJson(req, res);
  if (!payload) return;
  if (!payload.data || !Array.isArray(payload.data.days)) {
    sendJson(res, { error: "Tracker data is invalid." }, 400);
    return;
  }
  const db = await getDatabase();
  const updatedAt = new Date();
  await db.collection("trackers").replaceOne({ _id: user._id }, { _id: user._id, data: payload.data, updatedAt }, { upsert: true });
  sendJson(res, { savedAt: updatedAt });
}

async function getDatabase() {
  if (!mongoUri) return null;
  if (!mongoPromise) {
    mongoPromise = import("mongodb")
      .then(({ MongoClient }) => {
        mongoClient = new MongoClient(mongoUri);
        return mongoClient.connect();
      })
      .catch((error) => {
        console.error("Cloud sync is unavailable:", error.message);
        return null;
      });
  }
  const connection = await mongoPromise;
  if (!connection || !mongoClient) return null;
  return mongoClient.db(mongoDatabase);
}

async function requireUser(req, res) {
  const token = getBearerToken(req);
  const db = await getDatabase();
  if (!db) {
    sendDatabaseUnavailable(res);
    return null;
  }
  if (!token) {
    sendJson(res, { error: "Sign in to continue." }, 401);
    return null;
  }
  const session = await db.collection("sessions").findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) {
    sendJson(res, { error: "Your session has ended. Please sign in again." }, 401);
    return null;
  }
  const user = await db.collection("users").findOne({ _id: session.userId });
  if (!user) {
    sendJson(res, { error: "Your account could not be found." }, 401);
    return null;
  }
  return user;
}

async function createSession(db, user) {
  const token = randomBytes(32).toString("base64url");
  await db.collection("sessions").insertOne({
    _id: randomBytes(16).toString("hex"),
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return { token, user: publicUser(user) };
}

function getBearerToken(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [salt, stored] = String(encoded || "").split(":");
  if (!salt || !stored) return false;
  const derived = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(stored, "hex"), derived);
}

async function readJson(req, res) {
  try {
    return JSON.parse((await readBody(req)) || "{}");
  } catch {
    sendJson(res, { error: "Request must contain valid JSON." }, 400);
    return null;
  }
}

function sendDatabaseUnavailable(res) {
  sendJson(res, { error: "Accounts are not available until MongoDB is connected." }, 503);
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

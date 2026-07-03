# Igow'Ia Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy Igow'Ia, a publicly accessible web chatbot (Node.js/Express + vanilla
JS frontend) that answers general questions with strong Discord expertise, powered by Groq's
free API, with an admin panel to toggle maintenance mode and protect the free quota.

**Architecture:** Express backend serves a static vanilla-JS frontend and two JSON APIs:
`/api/chat` (proxies to Groq with a fixed system prompt, enforces maintenance mode and
per-visitor rate limiting) and `/api/admin/*` (code-protected session auth, maintenance toggle,
rate-limit setting, usage counter). All mutable state (maintenance flag, counters, sessions,
rate-limit buckets) lives in a single in-memory module — no database. Deployed to Render's free
tier.

**Tech Stack:** Node.js 18+, Express, `groq-sdk` (model `llama-3.1-8b-instant`), `dotenv`,
`cookie-parser`. Frontend: plain HTML/CSS/JS, no build step, no framework.

## Global Constraints

- Free tier only: Groq API (model `llama-3.1-8b-instant`, chosen for its 14,400 requests/day
  quota vs. 70B's 1,000/day) and Render free web service plan.
- No database — all admin/runtime state (maintenance flag, daily usage counter, rate-limit
  buckets, admin sessions, failed-login tracker) is in-memory in `src/state.js` and resets on
  server restart.
- Secrets (`GROQ_API_KEY`, `ADMIN_CODE`) live only in `.env` (already created, git-ignored,
  never touched by any task below) — tasks add to `.env.example` instead, never `.env`.
- Admin code is never returned by any API response, never logged, never present in any HTML/JS
  served to the browser.
- No automated test suite (explicitly out of scope per spec) — each task ends with a manual
  verification step using an exact command and its expected output instead of a unit test.
- French-language UI copy and system prompt (matches the user's language throughout this
  project).
- Language names in code (variables, functions) are English; user-facing strings are French.

---

### Task 1: Project scaffold and static server

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `.env.example`
- Create: `public/index.html` (placeholder only, replaced in Task 7)

**Interfaces:**
- Produces: an Express app listening on `process.env.PORT || 3000`, serving static files from
  `public/` at the site root.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "igowia",
  "version": "1.0.0",
  "private": true,
  "description": "Igow'Ia - chatbot web gratuit expert Discord",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "groq-sdk": "^0.5.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Create `.env.example`**

```
GROQ_API_KEY=your_groq_api_key_here
ADMIN_CODE=your_admin_code_here
NODE_ENV=development
```

- [ ] **Step 4: Create placeholder `public/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Igow'Ia</title></head>
<body><h1>Igow'Ia arrive bientôt</h1></body>
</html>
```

- [ ] **Step 5: Create `server.js`**

```js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Igow'Ia lancé sur http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Verify the server starts and serves the placeholder page**

Run: `bun server.js &` then `curl -s http://localhost:3000/` then stop the server (`kill %1` or Ctrl+C)
Expected: console prints `Igow'Ia lancé sur http://localhost:3000`, and the curl output contains
`<h1>Igow'Ia arrive bientôt</h1>`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example public/index.html server.js
git commit -m "Scaffold Igow'Ia Express project"
```

---

### Task 2: In-memory state module

**Files:**
- Create: `src/state.js`

**Interfaces:**
- Produces (used by Tasks 4, 5, 6):
  - `isMaintenanceActive(): boolean`
  - `getMaintenanceMessage(): string`
  - `setMaintenance(active: boolean, message?: string): void`
  - `incrementDailyUsage(): void`
  - `getDailyUsage(): number`
  - `getRateLimitMax(): number`
  - `setRateLimitMax(max: number): void`
  - `checkAndIncrementRateLimit(ip: string): boolean`
  - `createAdminSession(): string`
  - `isValidAdminSession(token: string): boolean`
  - `destroyAdminSession(token: string): void`
  - `isLoginBlocked(ip: string): boolean`
  - `recordFailedLogin(ip: string): void`
  - `resetFailedLogin(ip: string): void`

- [ ] **Step 1: Create `src/state.js`**

```js
const crypto = require('crypto');

const DEFAULT_MAINTENANCE_MESSAGE = "Igow'Ia est en maintenance, reviens bientôt !";
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const state = {
  maintenance: { active: false, message: DEFAULT_MAINTENANCE_MESSAGE },
  dailyUsage: { date: todayString(), count: 0 },
  rateLimit: { maxPerHour: 30, visitors: new Map() },
  adminSessions: new Map(),
  loginAttempts: new Map(),
};

function isMaintenanceActive() {
  return state.maintenance.active;
}

function getMaintenanceMessage() {
  return state.maintenance.message;
}

function setMaintenance(active, message) {
  state.maintenance.active = active;
  if (typeof message === 'string' && message.trim().length > 0) {
    state.maintenance.message = message;
  }
}

function rolloverDailyUsageIfNeeded() {
  const today = todayString();
  if (state.dailyUsage.date !== today) {
    state.dailyUsage.date = today;
    state.dailyUsage.count = 0;
  }
}

function incrementDailyUsage() {
  rolloverDailyUsageIfNeeded();
  state.dailyUsage.count += 1;
}

function getDailyUsage() {
  rolloverDailyUsageIfNeeded();
  return state.dailyUsage.count;
}

function getRateLimitMax() {
  return state.rateLimit.maxPerHour;
}

function setRateLimitMax(max) {
  state.rateLimit.maxPerHour = max;
}

function checkAndIncrementRateLimit(ip) {
  const now = Date.now();
  const entry = state.rateLimit.visitors.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    state.rateLimit.visitors.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= state.rateLimit.maxPerHour) {
    return false;
  }
  entry.count += 1;
  return true;
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  state.adminSessions.set(token, Date.now() + SESSION_DURATION_MS);
  return token;
}

function isValidAdminSession(token) {
  const expiry = state.adminSessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    state.adminSessions.delete(token);
    return false;
  }
  return true;
}

function destroyAdminSession(token) {
  state.adminSessions.delete(token);
}

function isLoginBlocked(ip) {
  const entry = state.loginAttempts.get(ip);
  if (!entry) return false;
  return Boolean(entry.blockedUntil && Date.now() < entry.blockedUntil);
}

function recordFailedLogin(ip) {
  const entry = state.loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + LOGIN_BLOCK_DURATION_MS;
    entry.count = 0;
  }
  state.loginAttempts.set(ip, entry);
}

function resetFailedLogin(ip) {
  state.loginAttempts.delete(ip);
}

module.exports = {
  isMaintenanceActive,
  getMaintenanceMessage,
  setMaintenance,
  incrementDailyUsage,
  getDailyUsage,
  getRateLimitMax,
  setRateLimitMax,
  checkAndIncrementRateLimit,
  createAdminSession,
  isValidAdminSession,
  destroyAdminSession,
  isLoginBlocked,
  recordFailedLogin,
  resetFailedLogin,
};
```

- [ ] **Step 2: Verify core behaviors manually**

Run:
```bash
node -e "
const s = require('./src/state.js');
console.log('maintenance off:', s.isMaintenanceActive() === false);
s.setMaintenance(true, 'Test maintenance');
console.log('maintenance on:', s.isMaintenanceActive() === true, s.getMaintenanceMessage() === 'Test maintenance');
s.setRateLimitMax(2);
console.log('rl 1:', s.checkAndIncrementRateLimit('1.2.3.4') === true);
console.log('rl 2:', s.checkAndIncrementRateLimit('1.2.3.4') === true);
console.log('rl 3 (blocked):', s.checkAndIncrementRateLimit('1.2.3.4') === false);
const token = s.createAdminSession();
console.log('session valid:', s.isValidAdminSession(token) === true);
s.destroyAdminSession(token);
console.log('session destroyed:', s.isValidAdminSession(token) === false);
for (let i = 0; i < 5; i++) s.recordFailedLogin('9.9.9.9');
console.log('login blocked after 5 fails:', s.isLoginBlocked('9.9.9.9') === true);
"
```
Expected: every printed line ends with `true`.

- [ ] **Step 3: Commit**

```bash
git add src/state.js
git commit -m "Add in-memory state module for Igow'Ia"
```

---

### Task 3: Groq client wrapper

**Files:**
- Create: `src/groqClient.js`

**Interfaces:**
- Consumes: `process.env.GROQ_API_KEY` (from Task 1's `.env`, already present).
- Produces (used by Task 4): `getChatReply(history: {role: 'user'|'assistant', content: string}[]): Promise<string>`

- [ ] **Step 1: Create `src/groqClient.js`**

```js
const Groq = require('groq-sdk');

const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `Tu es Igow'Ia, un assistant IA généraliste capable de répondre à toute question, sur n'importe quel sujet. Tu as en plus une expertise particulière et fiable sur Discord : son API pour développeurs, la création et l'hébergement de bots, la modération, la configuration de serveurs, les rôles, les permissions, et toutes ses fonctionnalités. Quand une question porte sur Discord, réponds avec précision et détail. Pour le reste, réponds normalement comme un assistant généraliste. Réponds toujours en français, de façon claire, concise et utile.`;

function createGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY manquante dans .env');
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function getChatReply(history) {
  const groq = createGroqClient();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const completion = await groq.chat.completions.create({
    messages,
    model: MODEL,
  });
  return completion.choices[0].message.content;
}

module.exports = { getChatReply, SYSTEM_PROMPT, MODEL };
```

- [ ] **Step 2: Verify with a real Groq call**

Run:
```bash
node -e "
require('dotenv').config();
require('./src/groqClient').getChatReply([{ role: 'user', content: 'Réponds uniquement par le mot OK.' }])
  .then((r) => { console.log('REPLY:', r); })
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
"
```
Expected: prints a line starting with `REPLY:` followed by a short model response (consumes one
request from the real quota — this is intentional, it proves the integration works end to end).

- [ ] **Step 3: Commit**

```bash
git add src/groqClient.js
git commit -m "Add Groq client wrapper with Igow'Ia system prompt"
```

---

### Task 4: Chat API route

**Files:**
- Create: `src/routes/chat.js`
- Modify: `server.js` (mount the router)

**Interfaces:**
- Consumes: `state.isMaintenanceActive`, `state.getMaintenanceMessage`,
  `state.checkAndIncrementRateLimit`, `state.incrementDailyUsage` (Task 2); `getChatReply`
  (Task 3).
- Produces: `POST /api/chat` accepting `{ history: {role, content}[] }`, returning
  `{ reply: string }` on success, or `{ error: string, message: string }` with an appropriate
  HTTP status on failure (`200` for a maintenance response, `429` for rate limit, `400` for a
  missing/empty history, `502` for a Groq failure).

- [ ] **Step 1: Create `src/routes/chat.js`**

```js
const express = require('express');
const state = require('../state');
const { getChatReply } = require('../groqClient');

const router = express.Router();

router.post('/', async (req, res) => {
  if (state.isMaintenanceActive()) {
    return res.json({ error: 'maintenance', message: state.getMaintenanceMessage() });
  }

  const ip = req.ip;
  if (!state.checkAndIncrementRateLimit(ip)) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Trop de messages envoyés. Réessaie dans un moment.',
    });
  }

  const history = Array.isArray(req.body.history) ? req.body.history : [];
  if (history.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'Aucun message fourni.' });
  }

  try {
    const reply = await getChatReply(history);
    state.incrementDailyUsage();
    res.json({ reply });
  } catch (err) {
    console.error('Erreur Groq:', err.message);
    res.status(502).json({
      error: 'groq_error',
      message: "Igow'Ia n'arrive pas à répondre pour le moment. Réessaie plus tard.",
    });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `server.js`**

Add near the top with the other `require`s:
```js
const chatRouter = require('./src/routes/chat');
```

Add after `app.use(express.static(...))`:
```js
app.use('/api/chat', chatRouter);
```

- [ ] **Step 3: Verify end to end**

Run: `bun server.js &`
Run:
```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Réponds uniquement par le mot OK."}]}'
```
Then: `kill %1`
Expected: JSON response like `{"reply":"OK"}` (or a close variant — the model's exact wording
may vary, but the `reply` field must be present and non-empty).

- [ ] **Step 4: Commit**

```bash
git add src/routes/chat.js server.js
git commit -m "Add POST /api/chat route with maintenance and rate-limit checks"
```

---

### Task 5: Admin login/logout/status routes

**Files:**
- Create: `src/routes/admin.js`
- Modify: `server.js` (mount the router)

**Interfaces:**
- Consumes: `state.isLoginBlocked`, `state.recordFailedLogin`, `state.resetFailedLogin`,
  `state.createAdminSession`, `state.isValidAdminSession`, `state.destroyAdminSession`,
  `state.isMaintenanceActive`, `state.getMaintenanceMessage`, `state.getRateLimitMax`,
  `state.getDailyUsage` (all Task 2); `process.env.ADMIN_CODE` (from `.env`, already present).
- Produces (used by Task 6 to extend this router, and by Task 9's frontend):
  - `POST /api/admin/login` body `{ code: string }` → sets `igowia_admin_session` httpOnly
    cookie, returns `{ ok: true }` on success; `401 { error: 'invalid_code' }` or
    `429 { error: 'blocked', message }` on failure.
  - `POST /api/admin/logout` (requires session cookie) → clears cookie, `{ ok: true }`.
  - `GET /api/admin/status` (requires session cookie) → `{ maintenance: boolean,
    maintenanceMessage: string, maxPerHour: number, dailyUsage: number }`.
  - `requireAdminSession` Express middleware defined in this file's module scope, reused
    directly (no export needed) by the routes Task 6 adds to this same file.

- [ ] **Step 1: Create `src/routes/admin.js`**

```js
const express = require('express');
const state = require('../state');

const router = express.Router();
const SESSION_COOKIE = 'igowia_admin_session';

function requireAdminSession(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || !state.isValidAdminSession(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.post('/login', (req, res) => {
  const ip = req.ip;
  if (state.isLoginBlocked(ip)) {
    return res
      .status(429)
      .json({ error: 'blocked', message: 'Trop de tentatives, réessaie plus tard.' });
  }

  const { code } = req.body;
  if (code !== process.env.ADMIN_CODE) {
    state.recordFailedLogin(ip);
    return res.status(401).json({ error: 'invalid_code' });
  }

  state.resetFailedLogin(ip);
  const token = state.createAdminSession();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post('/logout', requireAdminSession, (req, res) => {
  state.destroyAdminSession(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/status', requireAdminSession, (req, res) => {
  res.json({
    maintenance: state.isMaintenanceActive(),
    maintenanceMessage: state.getMaintenanceMessage(),
    maxPerHour: state.getRateLimitMax(),
    dailyUsage: state.getDailyUsage(),
  });
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `server.js`**

Add near the top:
```js
const adminRouter = require('./src/routes/admin');
```

Add after the chat router mount:
```js
app.use('/api/admin', adminRouter);
```

- [ ] **Step 3: Verify login, status, and wrong-code rejection**

Run: `bun server.js &`
Run (replace `789545` with the real value if it differs — check `.env`):
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"789545"}'
echo
curl -s -b cookies.txt http://localhost:3000/api/admin/status
echo
curl -s -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"000000"}'
```
Then: `kill %1` and `rm cookies.txt`
Expected: first call returns `{"ok":true}`; second call returns
`{"maintenance":false,"maintenanceMessage":"Igow'Ia est en maintenance, reviens bientôt !","maxPerHour":30,"dailyUsage":0}`;
third call returns `401` with `{"error":"invalid_code"}`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js server.js
git commit -m "Add admin login/logout/status routes with session cookies"
```

---

### Task 6: Admin maintenance and rate-limit control routes

**Files:**
- Modify: `src/routes/admin.js`

**Interfaces:**
- Consumes: `requireAdminSession` (defined earlier in this same file, Task 5);
  `state.setMaintenance`, `state.setRateLimitMax` (Task 2).
- Produces:
  - `POST /api/admin/maintenance` body `{ active: boolean, message?: string }` (requires
    session) → `{ ok: true }`.
  - `POST /api/admin/rate-limit` body `{ maxPerHour: number }` (requires session) →
    `{ ok: true }` or `400 { error: 'invalid_value' }`.

- [ ] **Step 1: Add the two routes to `src/routes/admin.js`**

Insert before `module.exports = router;`:
```js
router.post('/maintenance', requireAdminSession, (req, res) => {
  const { active, message } = req.body;
  state.setMaintenance(Boolean(active), typeof message === 'string' ? message : undefined);
  res.json({ ok: true });
});

router.post('/rate-limit', requireAdminSession, (req, res) => {
  const { maxPerHour } = req.body;
  const parsed = parseInt(maxPerHour, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return res.status(400).json({ error: 'invalid_value' });
  }
  state.setRateLimitMax(parsed);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verify maintenance mode blocks the chat route**

Run: `bun server.js &`
Run:
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"789545"}' > /dev/null
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/maintenance \
  -H "Content-Type: application/json" -d '{"active":true,"message":"Test maintenance en cours"}'
echo
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" -d '{"history":[{"role":"user","content":"salut"}]}'
echo
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/maintenance \
  -H "Content-Type: application/json" -d '{"active":false}'
```
Then: `kill %1` and `rm cookies.txt`
Expected: first `{"ok":true}`; then the chat call returns
`{"error":"maintenance","message":"Test maintenance en cours"}` (no Groq call made, no quota
consumed); final call returns `{"ok":true}` and turns maintenance back off.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.js
git commit -m "Add admin maintenance toggle and rate-limit setting routes"
```

---

### Task 7: Shared gold/black design system and page shell

**Files:**
- Create: `public/css/style.css`
- Modify: `public/index.html` (replace placeholder with the real header/shell)

**Interfaces:**
- Consumes: `public/assets/logo.png` (already present in the repo — the user's provided logo
  image, black background with a gold "IA"/"IGOW" monogram).
- Produces: CSS custom properties (`--bg`, `--accent-gold`, `--accent-gold-light`, `--text`,
  `--glow`) and utility classes (`.card`) reused by Task 8 (`chat.css`) and Task 9
  (`admin.css`); an `.igowia-logo` header block (`<img>` of the logo) reused verbatim by
  `public/admin.html` in Task 9.

- [ ] **Step 1: Create `public/css/style.css`**

```css
:root {
  --bg: #0a0a0a;
  --bg-alt: #1a1508;
  --accent-gold: #c9a24b;
  --accent-gold-light: #e8cf8a;
  --text: #f0e6d2;
  --text-dim: #a89f8a;
  --glow: 0 0 16px rgba(201, 162, 75, 0.55);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: var(--text);
  background: linear-gradient(120deg, var(--bg), var(--bg-alt), var(--bg));
  background-size: 200% 200%;
  animation: aurora 18s ease infinite;
}

@keyframes aurora {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.igowia-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem 1.2rem;
}

.igowia-logo img {
  height: 72px;
  width: auto;
  border-radius: 6px;
  animation: pulse-glow 3s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 4px var(--accent-gold)); }
  50% { filter: drop-shadow(0 0 14px var(--accent-gold-light)); }
}

.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

button {
  cursor: pointer;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1.2rem;
  background: linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light));
  color: #1a1508;
  font-weight: 600;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: var(--glow);
}

button:active {
  transform: translateY(0);
}
```

- [ ] **Step 2: Replace `public/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Igow'Ia</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/chat.css">
</head>
<body>
  <header class="igowia-logo">
    <img src="/assets/logo.png" alt="Igow'Ia" />
  </header>

  <main id="chat-root"></main>

  <script src="/js/chat.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify visually**

Run: `bun server.js &`
Open `http://localhost:3000/` in a browser.
Then: stop the server
Expected: dark page with a slowly shifting near-black gradient background, and the provided
gold/black Igow'Ia logo shown top-left with a soft pulsing gold glow. (`chat.css` doesn't exist
yet — the browser will 404 on it silently and just apply `style.css`, which is fine at this
stage.)

- [ ] **Step 4: Commit**

```bash
git add public/css/style.css public/index.html
git commit -m "Add Igow'Ia gold/black design system and page shell"
```

---

### Task 8: Chat frontend

**Files:**
- Create: `public/css/chat.css`
- Create: `public/js/chat.js`

**Interfaces:**
- Consumes: `POST /api/chat` (Task 4), `.igowia-logo`/`.card`/CSS variables (Task 7).
- Produces: a working chat UI mounted into `#chat-root` (from Task 7's `index.html`).

- [ ] **Step 1: Create `public/css/chat.css`**

```css
#chat-root {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 90px);
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.msg {
  max-width: 75%;
  padding: 0.7rem 1rem;
  border-radius: 14px;
  line-height: 1.4;
  animation: fade-in-up 0.25s ease;
  white-space: pre-wrap;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg.user {
  align-self: flex-end;
  background: linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light));
  color: #1a1508;
}

.msg.bot {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.msg.error {
  align-self: center;
  background: rgba(220, 60, 60, 0.15);
  border: 1px solid rgba(220, 60, 60, 0.4);
  color: #ffb4b4;
  font-size: 0.9rem;
}

.typing {
  align-self: flex-start;
  display: flex;
  gap: 4px;
  padding: 0.7rem 1rem;
}

.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-dim);
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

#chat-form {
  display: flex;
  gap: 0.6rem;
  padding-top: 0.6rem;
}

#chat-input {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 1rem;
}

#chat-input:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 2: Create `public/js/chat.js`**

```js
(function () {
  const root = document.getElementById('chat-root');
  root.innerHTML = `
    <div id="messages"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Écris un message à Igow'Ia..." autocomplete="off" />
      <button type="submit">Envoyer</button>
    </form>
  `;

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');

  const history = [];

  function addMessage(role, content) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function setInputEnabled(enabled) {
    inputEl.disabled = !enabled;
    formEl.querySelector('button').disabled = !enabled;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';

    const typingEl = showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      typingEl.remove();

      if (data.error === 'maintenance') {
        addMessage('error', data.message);
        setInputEnabled(false);
        return;
      }

      if (data.error) {
        addMessage('error', data.message || "Une erreur est survenue.");
        return;
      }

      addMessage('bot', data.reply);
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      typingEl.remove();
      addMessage('error', "Impossible de contacter Igow'Ia. Vérifie ta connexion.");
    }
  });
})();
```

- [ ] **Step 3: Verify in a browser**

Run: `bun server.js &`
Open `http://localhost:3000/`, type a message (e.g. "Salut, tu es qui ?") and send it.
Then: stop the server
Expected: your message appears as a right-aligned gold bubble, a pulsing typing indicator
appears briefly, then Igow'Ia's real reply appears as a left-aligned bubble mentioning it's a
general assistant with Discord expertise.

- [ ] **Step 4: Commit**

```bash
git add public/css/chat.css public/js/chat.js
git commit -m "Add Igow'Ia chat frontend with typing indicator and animations"
```

---

### Task 9: Admin frontend

**Files:**
- Create: `public/admin.html`
- Create: `public/css/admin.css`
- Create: `public/js/admin.js`

**Interfaces:**
- Consumes: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/status`,
  `POST /api/admin/maintenance`, `POST /api/admin/rate-limit` (Tasks 5–6); `.igowia-logo`/
  `.card`/CSS variables (Task 7).

- [ ] **Step 1: Create `public/css/admin.css`**

```css
#admin-root {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1.5rem;
}

#admin-root .card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

#admin-root label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--text-dim);
}

#admin-root input[type="password"],
#admin-root input[type="number"],
#admin-root textarea {
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 1rem;
  font-family: inherit;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#admin-message {
  font-size: 0.9rem;
  min-height: 1.2rem;
}

#admin-message.error { color: #ffb4b4; }
#admin-message.success { color: #9ef0b0; }
```

- [ ] **Step 2: Create `public/admin.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Igow'Ia — Admin</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/admin.css">
</head>
<body>
  <header class="igowia-logo">
    <img src="/assets/logo.png" alt="Igow'Ia — Admin" />
  </header>

  <main id="admin-root"></main>

  <script src="/js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `public/js/admin.js`**

```js
(function () {
  const root = document.getElementById('admin-root');

  function renderLogin(errorText) {
    root.innerHTML = `
      <div class="card">
        <label>Code admin
          <input id="admin-code" type="password" autocomplete="off" />
        </label>
        <button id="login-btn">Se connecter</button>
        <div id="admin-message" class="${errorText ? 'error' : ''}">${errorText || ''}</div>
      </div>
    `;
    document.getElementById('login-btn').addEventListener('click', async () => {
      const code = document.getElementById('admin-code').value;
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        loadDashboard();
      } else {
        renderLogin(data.message || 'Code incorrect.');
      }
    });
  }

  function renderDashboard(status) {
    root.innerHTML = `
      <div class="card">
        <div class="toggle-row">
          <span>Mode maintenance</span>
          <input id="maintenance-toggle" type="checkbox" ${status.maintenance ? 'checked' : ''} />
        </div>
        <label>Message de maintenance
          <textarea id="maintenance-message" rows="3">${status.maintenanceMessage}</textarea>
        </label>
        <label>Limite de messages / visiteur / heure
          <input id="rate-limit" type="number" min="1" value="${status.maxPerHour}" />
        </label>
        <div>Messages envoyés aujourd'hui : <strong>${status.dailyUsage}</strong> / 14 400</div>
        <button id="save-btn">Enregistrer</button>
        <button id="logout-btn">Se déconnecter</button>
        <div id="admin-message"></div>
      </div>
    `;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const active = document.getElementById('maintenance-toggle').checked;
      const message = document.getElementById('maintenance-message').value;
      const maxPerHour = document.getElementById('rate-limit').value;

      const [maintRes, rateRes] = await Promise.all([
        fetch('/api/admin/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active, message }),
        }),
        fetch('/api/admin/rate-limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxPerHour }),
        }),
      ]);

      const msgEl = document.getElementById('admin-message');
      if (maintRes.ok && rateRes.ok) {
        msgEl.textContent = 'Réglages enregistrés.';
        msgEl.className = 'success';
      } else {
        msgEl.textContent = "Erreur lors de l'enregistrement.";
        msgEl.className = 'error';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      renderLogin();
    });
  }

  async function loadDashboard() {
    const res = await fetch('/api/admin/status');
    if (res.status === 401) {
      renderLogin();
      return;
    }
    const status = await res.json();
    renderDashboard(status);
  }

  loadDashboard();
})();
```

- [ ] **Step 4: Verify in a browser**

Run: `bun server.js &`
Open `http://localhost:3000/admin`. Enter the wrong code once, confirm an error message shows.
Enter the real code from `.env`. Toggle maintenance on, change the message, save. Open
`http://localhost:3000/` in another tab and confirm the chat is blocked with your custom
message. Go back to `/admin`, toggle maintenance off, save. Click "Se déconnecter" and confirm
the login form reappears.
Then: `kill %1`
Expected: all steps behave as described, and the daily usage counter shown matches the number
of real chat messages sent so far in this session.

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/css/admin.css public/js/admin.js
git commit -m "Add Igow'Ia admin panel frontend"
```

---

### Task 10: README and Render deployment config

**Files:**
- Create: `README.md`
- Create: `render.yaml`

**Interfaces:**
- None (documentation and deploy config only).

- [ ] **Step 1: Create `render.yaml`**

```yaml
services:
  - type: web
    name: igowia
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: GROQ_API_KEY
        sync: false
      - key: ADMIN_CODE
        sync: false
      - key: NODE_ENV
        value: production
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Igow'Ia

Chatbot web gratuit, généraliste avec une expertise Discord, propulsé par l'API Groq (modèle
Llama 3.1 8B).

## Configuration

1. Copie `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```
2. Crée une clé API Groq gratuite (aucune carte bancaire requise) :
   - Va sur https://console.groq.com
   - Crée un compte
   - Dans le menu de gauche, clique sur "API Keys" puis "Create API Key"
   - Copie la clé (commence par `gsk_...`) dans `.env`, sur la ligne `GROQ_API_KEY=`
3. Choisis un code admin (une suite de chiffres/lettres de ton choix) et mets-le dans `.env`,
   sur la ligne `ADMIN_CODE=`. Ce code protège la page `/admin` qui permet de mettre le site en
   maintenance.

## Lancer en local

```bash
npm install
npm start
```

- Chat : http://localhost:3000
- Admin : http://localhost:3000/admin

## Déployer gratuitement sur Render

1. Pousse ce projet sur un dépôt GitHub.
2. Crée un compte gratuit sur https://render.com.
3. Clique sur "New" → "Blueprint", puis sélectionne ton dépôt (Render détecte `render.yaml`
   automatiquement).
4. Render te demandera de renseigner `GROQ_API_KEY` et `ADMIN_CODE` (les valeurs de ton `.env`
   local) dans les variables d'environnement du service — elles ne sont jamais lues depuis le
   dépôt Git.
5. Une fois déployé, ton site est accessible via un lien du type
   `https://igowia.onrender.com`.

**Note :** le plan gratuit de Render met le service en veille après une période d'inactivité.
Le premier visiteur après une pause peut attendre ~30 secondes le temps que le service se
réveille.

## Limites du plan gratuit Groq

Le modèle Llama 3.1 8B autorise jusqu'à 14 400 messages par jour, tous visiteurs confondus. Le
nombre de messages du jour est visible dans le panel `/admin`.
```

- [ ] **Step 3: Verify**

Run: `cat render.yaml README.md | head -5`
Expected: no error, both files print their first lines correctly (confirms they were written
without syntax issues in the surrounding shell).

- [ ] **Step 4: Commit**

```bash
git add render.yaml README.md
git commit -m "Add README and Render deployment config"
```

---

### Task 11: Full manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Fresh-start smoke test**

Run: `bun server.js &`
Run each in sequence, observing output:
```bash
curl -s http://localhost:3000/ | grep -o "Igow'Ia"
curl -s http://localhost:3000/admin | grep -o "Admin"
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Explique en une phrase ce qu'"'"'est un rôle Discord."}]}'
```
Expected: first two greps each print one match; the third prints a `reply` mentioning Discord
roles.

- [ ] **Step 2: Rate-limit test**

Run:
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"789545"}' > /dev/null
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":1}'
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"1"}]}' -o /dev/null -w "%{http_code}\n"
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"2"}]}' -o /dev/null -w "%{http_code}\n"
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":30}'
```
Expected: rate-limit set to `{"ok":true}`, first chat call `200`, second chat call `429`
(same IP, over the limit of 1/hour), then the limit is restored to `30`.

- [ ] **Step 3: Brute-force lockout test**

Run:
```bash
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:3000/api/admin/login \
    -H "Content-Type: application/json" -d '{"code":"wrong"}' -o /dev/null -w "%{http_code} "
done
echo
curl -s -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"789545"}'
```
Expected: the five failed attempts print `401` each; the sixth call (correct code) is now
blocked and returns `{"error":"blocked","message":"Trop de tentatives, réessaie plus tard."}`
instead of logging in — confirming the lockout engages even with the right code, until it
expires (15 minutes).

Then: `kill %1` and `rm -f cookies.txt`

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
```
Expected: `nothing to commit, working tree clean` (all prior tasks already committed their own
files — this step is a final confirmation, not a new commit, unless it reveals something
missed).


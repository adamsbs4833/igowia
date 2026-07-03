# Igow'Ia v2 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chat-side polish (starter suggestions, clear button, copy button, Markdown
rendering, typewriter effect, golden particle background, sound effects, editable welcome
message) and admin-side expansion (editable welcome message + tone note, a 7-day usage
history graph, and visibility/unblocking of rate-limited or login-blocked visitor IPs) to the
existing Igow'Ia chatbot.

**Architecture:** All new state (welcome message, tone note, 7-day usage history) lives in the
existing in-memory `src/state.js` module, following the same pattern as the current maintenance
flag. Three new admin-protected routes and one new public route are added. The chat and admin
frontends gain new small, single-purpose vanilla-JS modules (`markdown.js`, `particles.js`,
`sounds.js`) loaded as extra `<script>` tags — no bundler, no new dependencies.

**Tech Stack:** Same as the existing app — Node.js/Express backend, vanilla HTML/CSS/JS
frontend, Groq API (`llama-3.1-8b-instant`), no database.

## Global Constraints

- No database — all new state (welcome message, tone note, 7-day usage history, blocked-IP
  visibility) lives in `src/state.js`'s existing in-memory object and resets on server restart,
  exactly like the current maintenance flag and daily usage counter.
- No new npm/frontend dependencies — Markdown rendering, particle animation, and sound effects
  are all hand-written vanilla JS (no markdown library, no charting library, no audio files).
- Markdown rendering must escape HTML first, then apply a minimal safe subset (bold, italic,
  inline code, fenced code blocks) — no links, no images, no raw HTML passthrough.
- Admin routes reuse the existing `requireAdminSession` middleware from `src/routes/admin.js` —
  never redefine it.
- No automated test suite (same exclusion as the original build) — each task ends with a manual
  verification step using an exact command and its expected output.
- French-language UI copy and system-prompt content; English names in code.
- Dropped from scope entirely (confirmed with the user): changing `ADMIN_CODE` from the admin
  panel. Do not add this in any task.
- Node.js/npm are not installed in the development sandbox — only the Bun runtime is available
  locally. Use `bun` in place of `node`/`npm` for all local verification commands in every task;
  `package.json` and any deployed behavior must remain plain Node-compatible (Render, the real
  deploy target, has real Node.js).

---

### Task 1: State module extensions (welcome message, tone note, usage history, blocked-IP lists)

**Files:**
- Modify: `src/state.js`

**Interfaces:**
- Produces (used by Tasks 2, 3, 4, 5):
  - `getWelcomeMessage(): string`
  - `setWelcomeMessage(message: string): void`
  - `getPersonalityNote(): string`
  - `setPersonalityNote(note: string): void`
  - `getUsageHistory(): { date: string, count: number }[]` (oldest first, max 7 entries,
    includes today's running count as the last entry)
  - `listRateLimitedIps(): { ip: string, count: number }[]`
  - `unblockRateLimit(ip: string): void`
  - `listLoginBlockedIps(): { ip: string, blockedUntil: number }[]`
  - `unblockLogin(ip: string): void`

- [ ] **Step 1: Add the new state fields and functions to `src/state.js`**

Add these constants near the top of the file, alongside the existing constants:

```js
const MAX_HISTORY_DAYS = 7;
const DEFAULT_WELCOME_MESSAGE =
  "Salut ! Je suis Igow'Ia, ton assistant IA généraliste avec une expertise Discord. Pose-moi une question !";
```

Add these fields to the `state` object (alongside `maintenance`, `dailyUsage`, etc.):

```js
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  personalityNote: '',
  usageHistory: [],
```

Modify `rolloverDailyUsageIfNeeded()` to archive the finished day into `usageHistory` before
resetting (replace the existing function body):

```js
function rolloverDailyUsageIfNeeded() {
  const today = todayString();
  if (state.dailyUsage.date !== today) {
    state.usageHistory.push({ date: state.dailyUsage.date, count: state.dailyUsage.count });
    if (state.usageHistory.length > MAX_HISTORY_DAYS) {
      state.usageHistory.shift();
    }
    state.dailyUsage.date = today;
    state.dailyUsage.count = 0;
  }
}
```

Add these new functions (anywhere after `rolloverDailyUsageIfNeeded`, before `module.exports`):

```js
function getWelcomeMessage() {
  return state.welcomeMessage;
}

function setWelcomeMessage(message) {
  if (typeof message === 'string' && message.trim().length > 0) {
    state.welcomeMessage = message;
  }
}

function getPersonalityNote() {
  return state.personalityNote;
}

function setPersonalityNote(note) {
  if (typeof note === 'string') {
    state.personalityNote = note;
  }
}

function getUsageHistory() {
  rolloverDailyUsageIfNeeded();
  const withToday = [...state.usageHistory, { date: state.dailyUsage.date, count: state.dailyUsage.count }];
  return withToday.slice(-MAX_HISTORY_DAYS);
}

function listRateLimitedIps() {
  const now = Date.now();
  const result = [];
  for (const [ip, entry] of state.rateLimit.visitors.entries()) {
    if (now - entry.windowStart <= RATE_LIMIT_WINDOW_MS && entry.count >= state.rateLimit.maxPerHour) {
      result.push({ ip, count: entry.count });
    }
  }
  return result;
}

function unblockRateLimit(ip) {
  state.rateLimit.visitors.delete(ip);
}

function listLoginBlockedIps() {
  const now = Date.now();
  const result = [];
  for (const [ip, entry] of state.loginAttempts.entries()) {
    if (entry.blockedUntil && now < entry.blockedUntil) {
      result.push({ ip, blockedUntil: entry.blockedUntil });
    }
  }
  return result;
}

function unblockLogin(ip) {
  state.loginAttempts.delete(ip);
}
```

Add all nine new functions to `module.exports` (append to the existing object, don't remove any
existing entries):

```js
  getWelcomeMessage,
  setWelcomeMessage,
  getPersonalityNote,
  setPersonalityNote,
  getUsageHistory,
  listRateLimitedIps,
  unblockRateLimit,
  listLoginBlockedIps,
  unblockLogin,
```

- [ ] **Step 2: Verify manually**

Run:
```bash
bun -e "
const s = require('./src/state.js');
console.log('welcome default:', s.getWelcomeMessage().includes(\"Igow'Ia\"));
s.setWelcomeMessage('Coucou !');
console.log('welcome set:', s.getWelcomeMessage() === 'Coucou !');
console.log('tone default empty:', s.getPersonalityNote() === '');
s.setPersonalityNote('Sois familier');
console.log('tone set:', s.getPersonalityNote() === 'Sois familier');
const hist = s.getUsageHistory();
console.log('history has today:', hist.length === 1 && hist[0].count === 0);
s.setRateLimitMax(2);
s.checkAndIncrementRateLimit('5.5.5.5');
console.log('rate-limited list before reaching cap:', s.listRateLimitedIps().length === 0);
s.checkAndIncrementRateLimit('5.5.5.5');
console.log('rate-limited list after reaching cap:', s.listRateLimitedIps().length === 1 && s.listRateLimitedIps()[0].ip === '5.5.5.5');
s.unblockRateLimit('5.5.5.5');
console.log('rate-limit unblocked:', s.listRateLimitedIps().length === 0);
for (let i = 0; i < 5; i++) s.recordFailedLogin('6.6.6.6');
console.log('login blocked list:', s.listLoginBlockedIps().length === 1 && s.listLoginBlockedIps()[0].ip === '6.6.6.6');
s.unblockLogin('6.6.6.6');
console.log('login unblocked:', s.listLoginBlockedIps().length === 0);
"
```
Expected: every printed line ends with `true`.

- [ ] **Step 3: Commit**

```bash
git add src/state.js
git commit -m "Extend state module: welcome message, tone note, usage history, blocked-IP lists"
```

---

### Task 2: Public config endpoint

**Files:**
- Create: `src/routes/config.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `state.getWelcomeMessage()` (Task 1).
- Produces (used by Task 8's frontend): `GET /api/config` → `{ welcomeMessage: string }`, no
  authentication required.

- [ ] **Step 1: Create `src/routes/config.js`**

```js
const express = require('express');
const state = require('../state');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ welcomeMessage: state.getWelcomeMessage() });
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `server.js`**

Add near the other route requires:
```js
const configRouter = require('./src/routes/config');
```

Add near the other route mounts (after `app.use('/api/chat', chatRouter)`, before the admin
router or the malformed-JSON error handler — order relative to `/api/admin` doesn't matter):
```js
app.use('/api/config', configRouter);
```

- [ ] **Step 3: Verify**

Run: `bun server.js &`
Run: `curl -s https://localhost:3000/api/config 2>/dev/null || curl -s http://localhost:3000/api/config`
Then: stop the server
Expected: `{"welcomeMessage":"Salut ! Je suis Igow'Ia, ton assistant IA généraliste avec une expertise Discord. Pose-moi une question !"}`

- [ ] **Step 4: Commit**

```bash
git add src/routes/config.js server.js
git commit -m "Add public GET /api/config endpoint for the welcome message"
```

---

### Task 3: Personality note wired into Groq calls

**Files:**
- Modify: `src/groqClient.js`
- Modify: `src/routes/chat.js`

**Interfaces:**
- Consumes: `state.getPersonalityNote()` (Task 1).
- Produces: `getChatReply(history, personalityNote?: string): Promise<string>` — signature
  change from Task 3 of the original plan (added an optional second parameter; existing callers
  passing only `history` still work since Node defaults the missing argument to `undefined`).

- [ ] **Step 1: Modify `getChatReply` in `src/groqClient.js`**

Replace the existing `getChatReply` function with:

```js
async function getChatReply(history, personalityNote) {
  const groq = createGroqClient();
  const systemContent =
    typeof personalityNote === 'string' && personalityNote.trim().length > 0
      ? `${SYSTEM_PROMPT}\n\n${personalityNote}`
      : SYSTEM_PROMPT;
  const messages = [
    { role: 'system', content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const completion = await groq.chat.completions.create({
    messages,
    model: MODEL,
  });
  return completion.choices[0].message.content;
}
```

- [ ] **Step 2: Pass the tone note through in `src/routes/chat.js`**

Find this line:
```js
    const reply = await getChatReply(history);
```

Replace it with:
```js
    const reply = await getChatReply(history, state.getPersonalityNote());
```

- [ ] **Step 3: Verify with a real Groq call showing the tone note takes effect**

Run: `bun server.js &`
Run (this is a real Groq API call — expected, consumes a small amount of the free quota):
```bash
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Dis bonjour en une phrase."}]}'
```
Expected: a normal French reply (baseline, no tone note active yet — `personalityNote` defaults
to `''`).

Now set a tone note directly via the state module to prove it's actually threaded through (this
is a lower-level check than going through the admin route, which doesn't exist until Task 4):
```bash
bun -e "
require('dotenv').config();
const state = require('./src/state.js');
state.setPersonalityNote('Termine chacune de tes réponses par la phrase exacte : Igow ordonne.');
require('./src/groqClient.js').getChatReply(
  [{ role: 'user', content: 'Dis bonjour en une phrase.' }],
  state.getPersonalityNote()
).then((r) => console.log('REPLY:', r)).catch((e) => { console.error(e.message); process.exit(1); });
"
```
Expected: prints a line starting with `REPLY:` where the reply ends with (or very closely
contains) the phrase "Igow ordonne" — proving the tone note is actually influencing the model's
output, not just being silently accepted.

Then: stop the `bun server.js` process from the first step.

- [ ] **Step 4: Commit**

```bash
git add src/groqClient.js src/routes/chat.js
git commit -m "Apply admin-configurable tone note to the Groq system prompt"
```

---

### Task 4: Admin content route + status extension

**Files:**
- Modify: `src/routes/admin.js`

**Interfaces:**
- Consumes: `state.setWelcomeMessage`, `state.setPersonalityNote`, `state.getWelcomeMessage`,
  `state.getPersonalityNote` (Task 1).
- Produces:
  - `POST /api/admin/content` body `{ welcomeMessage?: string, personalityNote?: string }`
    (requires session) → `{ ok: true }`. Empty/whitespace-only `welcomeMessage` is ignored
    (keeps the previous value, matching `setWelcomeMessage`'s guard); `personalityNote` may be
    set to an empty string on purpose (to clear it).
  - `GET /api/admin/status` (existing route, extended) now also returns `welcomeMessage` and
    `personalityNote` alongside the existing fields, so the admin dashboard can prefill the
    content form in the same call it already makes.

- [ ] **Step 1: Extend the existing `/status` route in `src/routes/admin.js`**

Find:
```js
router.get('/status', requireAdminSession, (req, res) => {
  res.json({
    maintenance: state.isMaintenanceActive(),
    maintenanceMessage: state.getMaintenanceMessage(),
    maxPerHour: state.getRateLimitMax(),
    dailyUsage: state.getDailyUsage(),
  });
});
```

Replace with:
```js
router.get('/status', requireAdminSession, (req, res) => {
  res.json({
    maintenance: state.isMaintenanceActive(),
    maintenanceMessage: state.getMaintenanceMessage(),
    maxPerHour: state.getRateLimitMax(),
    dailyUsage: state.getDailyUsage(),
    welcomeMessage: state.getWelcomeMessage(),
    personalityNote: state.getPersonalityNote(),
  });
});
```

- [ ] **Step 2: Add the `/content` route**

Insert this route anywhere among the other `requireAdminSession`-protected routes, before
`module.exports = router;`:

```js
router.post('/content', requireAdminSession, (req, res) => {
  const { welcomeMessage, personalityNote } = req.body;
  if (typeof welcomeMessage === 'string') {
    state.setWelcomeMessage(welcomeMessage);
  }
  if (typeof personalityNote === 'string') {
    state.setPersonalityNote(personalityNote);
  }
  res.json({ ok: true });
});
```

- [ ] **Step 3: Verify**

Run: `bun server.js &`
Run (replace the admin code with the real value from `.env` — never write the real value into
this plan file or any committed document):
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"<ADMIN_CODE_from_.env>"}' > /dev/null
curl -s -b cookies.txt http://localhost:3000/api/admin/status
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/content \
  -H "Content-Type: application/json" -d '{"welcomeMessage":"Yo !","personalityNote":"Sois direct."}'
curl -s -b cookies.txt http://localhost:3000/api/admin/status
```
Then: stop the server, `rm -f cookies.txt`
Expected: first `/status` call shows the default welcome message and an empty `personalityNote`;
the `/content` call returns `{"ok":true}`; the second `/status` call now shows
`"welcomeMessage":"Yo !"` and `"personalityNote":"Sois direct."`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js
git commit -m "Add admin content route for welcome message and tone note; extend status"
```

---

### Task 5: Admin usage-history and blocked-IP routes

**Files:**
- Modify: `src/routes/admin.js`

**Interfaces:**
- Consumes: `state.getUsageHistory`, `state.listRateLimitedIps`, `state.unblockRateLimit`,
  `state.listLoginBlockedIps`, `state.unblockLogin` (Task 1).
- Produces:
  - `GET /api/admin/usage-history` (requires session) → `{ history: { date, count }[] }`.
  - `GET /api/admin/blocked` (requires session) → `{ rateLimited: { ip, count }[],
    loginBlocked: { ip, blockedUntil }[] }`.
  - `POST /api/admin/unblock` body `{ type: 'rate-limit' | 'login', ip: string }` (requires
    session) → `{ ok: true }`, or `400 { error: 'invalid_type' }` for any other `type` value.

- [ ] **Step 1: Add the three routes to `src/routes/admin.js`**

Insert before `module.exports = router;`:

```js
router.get('/usage-history', requireAdminSession, (req, res) => {
  res.json({ history: state.getUsageHistory() });
});

router.get('/blocked', requireAdminSession, (req, res) => {
  res.json({
    rateLimited: state.listRateLimitedIps(),
    loginBlocked: state.listLoginBlockedIps(),
  });
});

router.post('/unblock', requireAdminSession, (req, res) => {
  const { type, ip } = req.body;
  if (type === 'rate-limit') {
    state.unblockRateLimit(ip);
  } else if (type === 'login') {
    state.unblockLogin(ip);
  } else {
    return res.status(400).json({ error: 'invalid_type' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verify**

Run: `bun server.js &`
Run (replace the admin code with the real value from `.env`):
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"<ADMIN_CODE_from_.env>"}' > /dev/null
curl -s -b cookies.txt http://localhost:3000/api/admin/usage-history
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":1}'
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"un"}]}' -o /dev/null -w "chat1:%{http_code}\n"
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"deux"}]}' -o /dev/null -w "chat2:%{http_code}\n"
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":30}'
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
```
Then: stop the server, `rm -f cookies.txt`
Expected: `usage-history` returns `{"history":[{"date":"...","count":0}]}` (or similar, one entry
for today); `chat1` is `200`, `chat2` is `429` (rate limit of 1/hour now exceeded); the first
`/blocked` call shows one entry in `rateLimited` for `127.0.0.1` (or your local loopback
address) with `count` at least `1`; after restoring the limit to `30`, the second `/blocked`
call still shows the same entry (raising the limit doesn't retroactively unblock — this is
expected, since the fix requires an explicit unblock or a new hour window). To confirm
`unblock` actually clears it, add one more call:
```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/unblock \
  -H "Content-Type: application/json" -d '{"type":"rate-limit","ip":"<the ip shown above>"}'
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
```
Expected: `unblock` returns `{"ok":true}`, and the final `/blocked` call shows an empty
`rateLimited` array.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.js
git commit -m "Add admin usage-history and blocked-IP routes with unblock support"
```

---

### Task 6: Markdown-lite renderer (frontend)

**Files:**
- Create: `public/js/markdown.js`

**Interfaces:**
- Produces (used by Task 8): a global `window.igowiaRenderMarkdown(rawText: string): string`
  function returning safe HTML (input is always HTML-escaped first; only `<strong>`, `<em>`,
  `<code>`, `<pre><code>`, and `<br>` tags are ever introduced).

- [ ] **Step 1: Create `public/js/markdown.js`**

```js
(function () {
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdownLite(rawText) {
    const escaped = escapeHtml(rawText);
    const codeBlocks = [];

    let result = escaped.replace(/```([\s\S]*?)```/g, (match, code) => {
      const index = codeBlocks.length;
      const cleaned = code.replace(/^\n/, '').replace(/\n$/, '');
      codeBlocks.push(`<pre><code>${cleaned}</code></pre>`);
      return `@@CODEBLOCK${index}@@`;
    });

    result = result.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    result = result.replace(/\n/g, '<br>');

    result = result.replace(/@@CODEBLOCK(\d+)@@/g, (match, idx) => codeBlocks[Number(idx)]);

    return result;
  }

  window.igowiaRenderMarkdown = renderMarkdownLite;
  window.igowiaEscapeHtml = escapeHtml;
})();
```

- [ ] **Step 2: Verify the escaping and transforms are correct**

Since this is a browser script attached to `window`, verify it under Bun by stubbing a minimal
`window` global before loading the file:

```bash
bun -e "
global.window = {};
require('./public/js/markdown.js');
const r = window.igowiaRenderMarkdown;
console.log('bold:', r('**salut**') === '<strong>salut</strong>');
console.log('italic:', r('*salut*') === '<em>salut</em>');
console.log('inline code:', r('\`x = 1\`') === '<code>x = 1</code>');
console.log('code block:', r('\`\`\`\nconst a = 1;\n\`\`\`') === '<pre><code>const a = 1;</code></pre>');
console.log('escapes html:', r('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
console.log('code block content not double-processed:', r('\`\`\`\n**not bold**\n\`\`\`') === '<pre><code>**not bold**</code></pre>');
console.log('newline to br:', r('a\nb') === 'a<br>b');
"
```
Expected: every printed line ends with `true`.

- [ ] **Step 3: Commit**

```bash
git add public/js/markdown.js
git commit -m "Add markdown-lite renderer for chat responses"
```

---

### Task 7: Particle background and sound effects (frontend)

**Files:**
- Create: `public/js/particles.js`
- Create: `public/js/sounds.js`

**Interfaces:**
- Produces (used by Task 8): particles.js is self-running (no exported function needed — it
  mounts itself on load); `window.igowiaSounds.playSend(): void` and
  `window.igowiaSounds.playReceive(): void`.

- [ ] **Step 1: Create `public/js/particles.js`**

```js
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'particles-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles(count) {
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 1 + Math.random() * 2,
        speed: 0.1 + Math.random() * 0.3,
        drift: (Math.random() - 0.5) * 0.2,
        alpha: 0.2 + Math.random() * 0.4,
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c9a24b';
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -10) {
        p.y = canvas.height + 10;
        p.x = Math.random() * canvas.width;
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  createParticles(25);
  tick();
})();
```

- [ ] **Step 2: Create `public/js/sounds.js`**

```js
(function () {
  function beep(freq, duration) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      // Web Audio unavailable or blocked by the browser — fail silently, sound is optional
    }
  }

  window.igowiaSounds = {
    playSend: () => beep(440, 0.1),
    playReceive: () => beep(660, 0.15),
  };
})();
```

- [ ] **Step 3: Verify (structural, headless environment)**

Since these files manipulate the DOM/`AudioContext` (browser-only APIs unavailable under Bun),
verify structurally instead of executing them:

```bash
bun server.js &
curl -s -o /dev/null -w "particles.js:%{http_code}\n" http://localhost:3000/js/particles.js
curl -s -o /dev/null -w "sounds.js:%{http_code}\n" http://localhost:3000/js/sounds.js
curl -s http://localhost:3000/js/particles.js | grep -c "requestAnimationFrame"
curl -s http://localhost:3000/js/sounds.js | grep -c "igowiaSounds"
```
Then: stop the server
Expected: both files return `200`; the `requestAnimationFrame` grep count is `1`; the
`igowiaSounds` grep count is at least `1`.

- [ ] **Step 4: Commit**

```bash
git add public/js/particles.js public/js/sounds.js
git commit -m "Add golden particle background and Web Audio sound effects"
```

---

### Task 8: Chat frontend — welcome screen, suggestions, clear/copy buttons, typewriter, wiring

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`
- Modify: `public/css/chat.css`
- Modify: `public/js/chat.js`

**Interfaces:**
- Consumes: `GET /api/config` (Task 2), `window.igowiaRenderMarkdown` (Task 6),
  `window.igowiaSounds` (Task 7), the existing `POST /api/chat` (unchanged request/response
  shape).
- Produces: the full chat UI described in the spec's Part A.

- [ ] **Step 1: Add new script tags to `public/index.html`**

Find:
```html
  <script src="/js/chat.js"></script>
```

Replace with (order matters — these must load before `chat.js`, which calls into them):
```html
  <script src="/js/markdown.js"></script>
  <script src="/js/sounds.js"></script>
  <script src="/js/particles.js"></script>
  <script src="/js/chat.js"></script>
```

- [ ] **Step 2: Stack page content above the particle canvas in `public/css/style.css`**

Add this rule anywhere in the file (the particle canvas is `position: fixed; z-index: 0`,
appended as `document.body`'s first child — everything else needs an explicit stacking context
above it):

```css
header,
main {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 3: Add CSS for the new chat elements to `public/css/chat.css`**

Append to the end of the file:

```css
#chat-header-row {
  display: flex;
  justify-content: flex-end;
  padding: 0 1rem;
}

#clear-chat-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-dim);
  font-size: 0.85rem;
  padding: 0.35rem 0.8rem;
}

#clear-chat-btn:hover {
  box-shadow: none;
  border-color: var(--accent-gold);
  color: var(--accent-gold-light);
}

#welcome-screen {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-dim);
}

#suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: center;
  margin-top: 1rem;
}

.suggestion-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text);
  font-weight: 400;
  font-size: 0.85rem;
  padding: 0.5rem 0.9rem;
}

.suggestion-btn:hover {
  box-shadow: var(--glow);
  border-color: var(--accent-gold);
}

.msg-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 75%;
}

.msg-wrapper.user {
  align-self: flex-end;
}

.msg-wrapper.bot {
  align-self: flex-start;
}

.msg-wrapper .msg {
  max-width: 100%;
}

.copy-btn {
  align-self: flex-end;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.75rem;
  padding: 0.2rem 0.4rem;
  margin-top: 0.2rem;
}

.copy-btn:hover {
  box-shadow: none;
  color: var(--accent-gold-light);
}

.msg pre {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  padding: 0.7rem;
  overflow-x: auto;
  margin: 0.4rem 0;
}

.msg code {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 0.9em;
}
```

- [ ] **Step 4: Rewrite `public/js/chat.js` in full**

Replace the entire file content with:

```js
(function () {
  const root = document.getElementById('chat-root');
  root.innerHTML = `
    <div id="chat-header-row">
      <button id="clear-chat-btn" type="button">Effacer la conversation</button>
    </div>
    <div id="messages"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Écris un message à Igow'Ia..." autocomplete="off" />
      <button type="submit">Envoyer</button>
    </form>
  `;

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const clearBtn = document.getElementById('clear-chat-btn');

  const SUGGESTIONS = [
    'Comment créer un bot Discord ?',
    'Comment configurer les rôles sur mon serveur Discord ?',
    "Explique-moi les intents de l'API Discord",
    'Donne-moi une astuce productivité au hasard',
  ];

  let history = [];
  let requestInFlight = false;
  let welcomeMessage = '';

  function renderWelcomeScreen() {
    messagesEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.id = 'welcome-screen';

    const p = document.createElement('p');
    p.textContent = welcomeMessage;
    wrapper.appendChild(p);

    const suggestionsEl = document.createElement('div');
    suggestionsEl.id = 'suggestions';
    SUGGESTIONS.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        inputEl.value = text;
        formEl.requestSubmit();
      });
      suggestionsEl.appendChild(btn);
    });
    wrapper.appendChild(suggestionsEl);

    messagesEl.appendChild(wrapper);
  }

  function clearWelcomeScreenIfPresent() {
    const existing = document.getElementById('welcome-screen');
    if (existing) existing.remove();
  }

  function addUserMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addErrorMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg error';
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addBotMessageShell() {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper bot';

    const bubble = document.createElement('div');
    bubble.className = 'msg bot';
    wrapper.appendChild(bubble);

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { wrapper, bubble };
  }

  function addCopyButton(wrapper, rawText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copier';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(rawText).then(() => {
        btn.textContent = 'Copié !';
        setTimeout(() => {
          btn.textContent = 'Copier';
        }, 1500);
      });
    });
    wrapper.appendChild(btn);
  }

  function typeWriterReveal(bubble, rawText, onDone) {
    let i = 0;
    const chunkSize = 3;
    function step() {
      i += chunkSize;
      bubble.textContent = rawText.slice(0, i);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (i < rawText.length) {
        setTimeout(step, 12);
      } else {
        onDone();
      }
    }
    step();
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
    formEl.querySelector('button[type="submit"]').disabled = !enabled;
  }

  function resetConversation() {
    history = [];
    renderWelcomeScreen();
  }

  clearBtn.addEventListener('click', resetConversation);

  fetch('/api/config')
    .then((res) => res.json())
    .then((data) => {
      welcomeMessage = data.welcomeMessage || '';
      renderWelcomeScreen();
    })
    .catch(() => {
      welcomeMessage = '';
      renderWelcomeScreen();
    });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (requestInFlight) return;

    const text = inputEl.value.trim();
    if (!text) return;

    clearWelcomeScreenIfPresent();
    addUserMessage(text);
    if (window.igowiaSounds) window.igowiaSounds.playSend();
    history.push({ role: 'user', content: text });
    inputEl.value = '';

    const typingEl = showTyping();
    requestInFlight = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      typingEl.remove();

      if (data.error === 'maintenance') {
        addErrorMessage(data.message);
        setInputEnabled(false);
        return;
      }

      if (data.error) {
        addErrorMessage(data.message || 'Une erreur est survenue.');
        return;
      }

      if (window.igowiaSounds) window.igowiaSounds.playReceive();
      const { wrapper, bubble } = addBotMessageShell();
      typeWriterReveal(bubble, data.reply, () => {
        bubble.innerHTML = window.igowiaRenderMarkdown
          ? window.igowiaRenderMarkdown(data.reply)
          : bubble.textContent;
        addCopyButton(wrapper, data.reply);
      });
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      typingEl.remove();
      addErrorMessage("Impossible de contacter Igow'Ia. Vérifie ta connexion.");
    } finally {
      requestInFlight = false;
    }
  });
})();
```

- [ ] **Step 5: Verify structurally and with a real chat exchange**

Run: `bun server.js &`
```bash
curl -s http://localhost:3000/ | grep -c "particles.js"
curl -s http://localhost:3000/js/chat.js | grep -c "igowiaRenderMarkdown"
curl -s http://localhost:3000/api/config
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Donne-moi un exemple de code JavaScript en une ligne, dans un bloc de code Markdown."}]}'
```
Then: stop the server
Expected: first grep count is `1` (script tag present); second grep count is at least `1`
(chat.js references the markdown renderer); `/api/config` returns the welcome message JSON; the
last call returns a real `{"reply": "..."}` — inspect it manually and confirm the reply likely
contains triple-backtick code fencing (proving there's real content for the frontend's Markdown
renderer to work with, even though this curl call doesn't render it — that happens in a real
browser).

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/css/style.css public/css/chat.css public/js/chat.js
git commit -m "Add welcome screen, suggestions, clear/copy buttons, typewriter effect, and particles/sounds wiring to chat frontend"
```

---

### Task 9: Admin frontend — content fields, usage graph, blocked-IP management

**Files:**
- Modify: `public/css/admin.css`
- Modify: `public/js/admin.js`

**Interfaces:**
- Consumes: `GET /api/admin/status` (extended, Task 4), `POST /api/admin/content` (Task 4),
  `GET /api/admin/usage-history` (Task 5), `GET /api/admin/blocked` (Task 5),
  `POST /api/admin/unblock` (Task 5).

- [ ] **Step 1: Add CSS for the new admin sections to `public/css/admin.css`**

Append to the end of the file:

```css
.usage-graph {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  height: 80px;
  padding: 0.5rem 0;
}

.usage-graph .bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 0.3rem;
}

.usage-graph .bar {
  width: 100%;
  background: linear-gradient(180deg, var(--accent-gold-light), var(--accent-gold));
  border-radius: 4px 4px 0 0;
  min-height: 2px;
}

.usage-graph .bar-label {
  font-size: 0.65rem;
  color: var(--text-dim);
}

.blocked-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 160px;
  overflow-y: auto;
}

.blocked-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

.blocked-row button {
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
}

.section-title {
  font-size: 0.9rem;
  color: var(--text-dim);
  margin: 0.5rem 0 0.2rem;
}
```

- [ ] **Step 2: Rewrite `public/js/admin.js` in full**

Replace the entire file content with:

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

  function renderUsageGraph(history) {
    const max = Math.max(1, ...history.map((h) => h.count));
    const bars = history
      .map((h) => {
        const heightPct = Math.round((h.count / max) * 100);
        const shortDate = h.date.slice(5);
        return `
          <div class="bar-col">
            <div class="bar" style="height:${Math.max(heightPct, 2)}%"></div>
            <div class="bar-label">${escapeHtml(shortDate)}</div>
          </div>
        `;
      })
      .join('');
    return `<div class="usage-graph">${bars}</div>`;
  }

  function renderBlockedList(rateLimited, loginBlocked) {
    const rateRows = rateLimited
      .map(
        (r) => `
        <div class="blocked-row" data-type="rate-limit" data-ip="${r.ip}">
          <span>${r.ip} (${r.count} messages)</span>
          <button type="button" class="unblock-btn">Débloquer</button>
        </div>
      `
      )
      .join('') || '<div class="blocked-row"><span>Aucun</span></div>';

    const loginRows = loginBlocked
      .map(
        (l) => `
        <div class="blocked-row" data-type="login" data-ip="${l.ip}">
          <span>${l.ip}</span>
          <button type="button" class="unblock-btn">Débloquer</button>
        </div>
      `
      )
      .join('') || '<div class="blocked-row"><span>Aucun</span></div>';

    return `
      <div class="section-title">Visiteurs limités (messages/heure)</div>
      <div class="blocked-list" id="rate-limited-list">${rateRows}</div>
      <div class="section-title">Connexions admin bloquées</div>
      <div class="blocked-list" id="login-blocked-list">${loginRows}</div>
    `;
  }

  function attachUnblockHandlers(container) {
    container.querySelectorAll('.unblock-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.blocked-row');
        const type = row.getAttribute('data-type');
        const ip = row.getAttribute('data-ip');
        await fetch('/api/admin/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, ip }),
        });
        loadDashboard();
      });
    });
  }

  async function renderDashboard(status) {
    const [historyRes, blockedRes] = await Promise.all([
      fetch('/api/admin/usage-history').then((r) => r.json()),
      fetch('/api/admin/blocked').then((r) => r.json()),
    ]);

    root.innerHTML = `
      <div class="card">
        <div class="toggle-row">
          <span>Mode maintenance</span>
          <input id="maintenance-toggle" type="checkbox" ${status.maintenance ? 'checked' : ''} />
        </div>
        <label>Message de maintenance
          <textarea id="maintenance-message" rows="3">${escapeHtml(status.maintenanceMessage)}</textarea>
        </label>
        <label>Limite de messages / visiteur / heure
          <input id="rate-limit" type="number" min="1" value="${status.maxPerHour}" />
        </label>
        <div>Messages envoyés aujourd'hui : <strong>${status.dailyUsage}</strong> / 14 400</div>
        <div class="section-title">Historique 7 derniers jours (remis à zéro si le service redémarre)</div>
        ${renderUsageGraph(historyRes.history)}
        <label>Message d'accueil (visiteurs)
          <textarea id="welcome-message" rows="2">${escapeHtml(status.welcomeMessage)}</textarea>
        </label>
        <label>Note de ton / personnalité (ajoutée aux instructions d'Igow'Ia)
          <textarea id="personality-note" rows="2">${escapeHtml(status.personalityNote)}</textarea>
        </label>
        <button id="save-btn">Enregistrer</button>
        <button id="logout-btn">Se déconnecter</button>
        <div id="admin-message"></div>
        ${renderBlockedList(blockedRes.rateLimited, blockedRes.loginBlocked)}
      </div>
    `;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const active = document.getElementById('maintenance-toggle').checked;
      const message = document.getElementById('maintenance-message').value;
      const maxPerHour = document.getElementById('rate-limit').value;
      const welcomeMessage = document.getElementById('welcome-message').value;
      const personalityNote = document.getElementById('personality-note').value;

      const [maintRes, rateRes, contentRes] = await Promise.all([
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
        fetch('/api/admin/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ welcomeMessage, personalityNote }),
        }),
      ]);

      const msgEl = document.getElementById('admin-message');
      if (maintRes.ok && rateRes.ok && contentRes.ok) {
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

    attachUnblockHandlers(document.getElementById('rate-limited-list').parentElement);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

- [ ] **Step 3: Verify**

Run: `bun server.js &`
Run (replace the admin code with the real value from `.env`):
```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"<ADMIN_CODE_from_.env>"}' > /dev/null
curl -s -b cookies.txt http://localhost:3000/api/admin/status
curl -s -b cookies.txt http://localhost:3000/api/admin/usage-history
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
curl -s http://localhost:3000/js/admin.js | grep -c "renderUsageGraph"
curl -s http://localhost:3000/js/admin.js | grep -c "unblock-btn"
```
Then: stop the server, `rm -f cookies.txt`
Expected: `/status` now includes `welcomeMessage` and `personalityNote` fields; `/usage-history`
and `/blocked` both return valid JSON (empty/near-empty is fine at this point); both grep counts
are at least `1`, confirming the new admin.js references the graph and unblock UI.

- [ ] **Step 4: Commit**

```bash
git add public/css/admin.css public/js/admin.js
git commit -m "Add content fields, usage graph, and blocked-IP management to admin panel"
```

---

### Task 10: Full manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Fresh-start smoke test of every new endpoint**

Run: `bun server.js &`
```bash
curl -s http://localhost:3000/api/config
curl -s -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" -d '{"code":"<ADMIN_CODE_from_.env>"}' > /dev/null
curl -s -b cookies.txt http://localhost:3000/api/admin/status
curl -s -b cookies.txt http://localhost:3000/api/admin/usage-history
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
```
Expected: all five calls return valid JSON with no errors, and `/status` includes
`welcomeMessage`/`personalityNote` fields.

- [ ] **Step 2: End-to-end tone note effect through the real admin content route**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/content \
  -H "Content-Type: application/json" \
  -d '{"welcomeMessage":"Yo, prêt à parler Discord ?","personalityNote":"Termine chacune de tes réponses par la phrase exacte : Igow ordonne."}'
curl -s http://localhost:3000/api/config
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Dis bonjour en une phrase."}]}'
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/content \
  -H "Content-Type: application/json" \
  -d '{"welcomeMessage":"Salut ! Je suis Igow'"'"'Ia, ton assistant IA généraliste avec une expertise Discord. Pose-moi une question !","personalityNote":""}'
```
Expected: the content update returns `{"ok":true}`; `/api/config` now reflects
`"Yo, prêt à parler Discord ?"`; the real Groq reply ends with (or closely contains) "Igow
ordonne", proving the full admin-panel-to-Groq-response path works; the final call restores the
defaults.

- [ ] **Step 3: Blocked-IP full cycle**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":1}'
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"1"}]}' -o /dev/null -w "%{http_code}\n"
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"2"}]}' -o /dev/null -w "%{http_code}\n"
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/unblock \
  -H "Content-Type: application/json" -d '{"type":"rate-limit","ip":"127.0.0.1"}'
curl -s -b cookies.txt http://localhost:3000/api/admin/blocked
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/rate-limit \
  -H "Content-Type: application/json" -d '{"maxPerHour":30}'
```
Expected: `200` then `429`; `/blocked` shows one `rateLimited` entry; after `unblock`, the list
is empty; the rate limit is restored to `30`.

- [ ] **Step 4: Frontend structural smoke test**

```bash
curl -s http://localhost:3000/ | grep -o "particles.js\|sounds.js\|markdown.js" | sort -u
curl -s http://localhost:3000/admin | grep -c "igowia-logo"
```
Then: stop the server, `rm -f cookies.txt`
Expected: the first command lists all three script names; the second returns at least `1`.

- [ ] **Step 5: Final commit check**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (all prior tasks already committed their own
files).

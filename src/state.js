const crypto = require('crypto');

const DEFAULT_MAINTENANCE_MESSAGE = "Igow'Ia est en maintenance, reviens bientôt !";
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_HISTORY_DAYS = 7;
const DEFAULT_WELCOME_MESSAGE =
  "Salut ! Je suis Igow'Ia, ton assistant IA généraliste avec une expertise Discord. Pose-moi une question !";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const state = {
  maintenance: { active: false, message: DEFAULT_MAINTENANCE_MESSAGE },
  dailyUsage: { date: todayString(), count: 0 },
  rateLimit: { maxPerHour: 30, visitors: new Map() },
  adminSessions: new Map(),
  loginAttempts: new Map(),
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  personalityNote: '',
  usageHistory: [],
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
    state.usageHistory.push({ date: state.dailyUsage.date, count: state.dailyUsage.count });
    if (state.usageHistory.length > MAX_HISTORY_DAYS) {
      state.usageHistory.shift();
    }
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
  getWelcomeMessage,
  setWelcomeMessage,
  getPersonalityNote,
  setPersonalityNote,
  getUsageHistory,
  listRateLimitedIps,
  unblockRateLimit,
  listLoginBlockedIps,
  unblockLogin,
};

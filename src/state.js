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

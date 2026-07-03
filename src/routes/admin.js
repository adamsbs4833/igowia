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

module.exports = router;

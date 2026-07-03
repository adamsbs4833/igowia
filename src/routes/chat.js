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
